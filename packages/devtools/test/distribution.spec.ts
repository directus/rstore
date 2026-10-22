import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, onTestFinished } from 'vitest'
import { waitFor } from './utils/relay'

const execute = promisify(execFile)
// Distribution tests require an actual separately installed tarball. Default
// unit runs never fall back to source aliases or mutate/build shared dist.
const consumer = process.env.RSTORE_DISTRIBUTION_ROOT
const fixture = fileURLToPath(new URL('./fixtures/distribution/neutral-consumer.ts', import.meta.url))
const peersConsumer = process.env.RSTORE_DISTRIBUTION_PEERS_ROOT

/** Show installed declaration diagnostics, which tsc writes to stdout. */
async function compileInstalled(directory: string, source: string, hosts = false) {
  try {
    await execute(process.execPath, [join(directory, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', hosts ? 'ESNext' : 'ES2023', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', hosts ? 'ESNext,DOM' : 'ES2023', '--types', 'node', source], { cwd: directory, timeout: 30_000 })
  }
  catch (error) {
    const failure = error as Error & { stdout?: string }
    throw new Error(failure.stdout || failure.message, { cause: error })
  }
}

describe.skipIf(!consumer)('installed devtools distribution', () => {
  it.skipIf(!peersConsumer)('compiles every optional host entry against installed public declarations', async () => {
    for (const name of ['core', 'vue']) {
      const manifest = JSON.parse(await readFile(join(peersConsumer!, `node_modules/@rstore/${name}/package.json`), 'utf8'))
      expect(manifest.dependencies).not.toHaveProperty('@rstore/devtools')
    }
    const source = fileURLToPath(new URL('./fixtures/distribution/public-entries.ts', import.meta.url))
    const installedFixture = join(peersConsumer!, 'public-entries.ts')
    await copyFile(source, installedFixture)
    await compileInstalled(peersConsumer!, installedFixture, true)
  })

  it('constructs real Core store and reads six views without Vue, Nuxt, Vite or DOM', async () => {
    const installedFixture = join(consumer!, 'neutral-consumer.ts')
    await copyFile(fixture, installedFixture)
    const result = await execute(process.execPath, [installedFixture], { cwd: consumer, timeout: 10_000 })
    expect(result.stdout).toBe('Packed Core-only consumer passed\n')
    // Compile installed public declarations without DOM lib or workspace paths.
    await compileInstalled(consumer!, installedFixture)
  })

  it('ships every export, optional host peers, binary and browser-only assets', async () => {
    const root = join(consumer!, 'node_modules/@rstore/devtools')
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    expect(Object.keys(manifest.exports)).toEqual(['.', './browser', './vue', './node', './vite', './protocol', './package.json'])
    for (const entry of Object.values(manifest.exports)) {
      if (typeof entry === 'string') {
        await access(join(root, entry))
        continue
      }
      const paths = entry as { import: string, types: string }
      await access(join(root, paths.import))
      await access(join(root, paths.types))
    }
    expect(manifest.peerDependenciesMeta).toMatchObject({ vue: { optional: true }, vite: { optional: true } })
    expect(manifest.engines).toEqual({ node: '>=26.0.0' })
    const html = await readFile(join(root, 'dist/client/index.html'), 'utf8')
    const asset = /src="([^"]+\.js)"/.exec(html)![1]!
    const client = await readFile(join(root, 'dist/client', asset), 'utf8')
    for (const forbidden of ['node:child_process', 'node:http', 'DEVFRAME_MCP_AUTH_TOKEN', 'RSTORE_DEVTOOLS_SSR_AUTH_TOKEN', 'createSSRWorker', 'createRstoreDevframeHost'])
      expect(client).not.toContain(forbidden)
    expect(await readFile(join(root, manifest.bin['rstore-devtools']), 'utf8')).toMatch(/^#!\/usr\/bin\/env node\n/)
    const help = await execute(join(consumer!, 'node_modules/.bin/rstore-devtools'), ['--help'], { cwd: consumer, timeout: 10_000 })
    expect(help.stdout).toContain('mcp')
  })

  it('installed executable serves custom-base HTML and its actual packaged JS', async () => {
    const environment = { ...process.env }
    delete environment.DEVFRAME_MCP_AUTH_TOKEN
    const child = spawn(join(consumer!, 'node_modules/.bin/rstore-devtools'), ['dev', '--no-open', '--port', '0', '--host', '127.0.0.1', '--base', '/packed/custom/'], { cwd: consumer, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    const closed = once(child, 'close')
    let stderr = ''
    let stdout = ''
    child.stderr.on('data', (data) => {
      stderr += String(data)
    })
    child.stdout.on('data', (data) => {
      stdout += String(data)
    })
    onTestFinished(async () => {
      if (child.exitCode !== null || child.signalCode !== null)
        return
      child.kill('SIGTERM')
      const forced = setTimeout(() => child.kill('SIGKILL'), 5_000)
      try {
        await closed
      }
      finally {
        clearTimeout(forced)
      }
    })
    await waitFor(async () => /RStore Devtools http:\/\/127\.0\.0\.1:\d+\/packed\/custom\//.test(stderr), 10_000)
    const baseURL = /RStore Devtools (http:\/\/127\.0\.0\.1:\d+\/packed\/custom\/)/.exec(stderr)![1]!
    const response = await fetch(baseURL)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('id="app"')
    const asset = /src="([^"]+\.js)"/.exec(html)![1]!
    const script = await fetch(new URL(asset, baseURL))
    expect(script.status).toBe(200)
    expect(script.headers.get('content-type')).toContain('javascript')
    expect((await script.text()).length).toBeGreaterThan(10_000)
    expect(stdout).toBe('')
    expect(stderr.match(/HTTP MCP disabled/g)).toHaveLength(1)
    child.kill('SIGTERM')
    await closed
    await expect(fetch(baseURL)).rejects.toThrow()
  })
})
