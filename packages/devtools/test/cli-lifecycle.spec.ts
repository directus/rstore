import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { startRelay, waitFor } from './utils/relay'

/** Actual source CLI child with isolated loader cache and bounded teardown. */
async function command(args: string[], environment: Record<string, string> = {}) {
  const cache = await mkdtemp(join(tmpdir(), 'rstore-cli-source-'))
  onTestFinished(() => rm(cache, { recursive: true, force: true }))
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/source-cli.mjs', import.meta.url)), ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...environment, BROWSER: 'none', RSTORE_CLI_TEST_CACHE: cache, DEVFRAME_MCP_AUTH_TOKEN: undefined },
  })
  const exited = once(child, 'close')
  let output = ''
  let diagnostics = ''
  child.stdout.on('data', (bytes) => {
    output += String(bytes)
  })
  child.stderr.on('data', (bytes) => {
    diagnostics += String(bytes)
  })
  onTestFinished(async () => {
    if (child.exitCode !== null || child.signalCode !== null)
      return
    child.kill('SIGTERM')
    const forced = setTimeout(() => child.kill('SIGKILL'), 3000)
    try {
      await exited
    }
    finally {
      clearTimeout(forced)
    }
  })
  return {
    child,
    exited,
    output: () => output,
    diagnostics: () => diagnostics,
    /** Surface child startup failures without echoing credentials or URLs. */
    assertRunning() {
      if (child.exitCode !== null)
        throw new Error(`CLI child exited ${child.exitCode}: ${diagnostics.replace(/https?:\/\/\S+/g, '[address]').slice(-1200)}`)
    },
  }
}

// Boundary: actual CAC command, official MCP stdio, real authenticated relay.
// Closing stdin must release remote socket and terminate naturally, unlike SDK
// transport.close(), which can hide leaks by forcibly killing child process.
it('stdio EOF releases connected relay and exits naturally', async () => {
  const host = await startRelay()
  onTestFinished(host.close)
  const bridge = await command(['mcp', '--connect', host.baseURL], { RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN: host.viewerToken })
  bridge.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'eof-proof', version: '1' } } })}\n`)
  await waitFor(async () => {
    bridge.assertRunning()
    return bridge.output().includes('"id":1')
  }, 10_000)
  const initialized = JSON.parse(bridge.output().split('\n').find(line => line.includes('"id":1'))!)
  expect(initialized).toMatchObject({ id: 1, result: { protocolVersion: '2024-11-05', serverInfo: { name: expect.any(String) } } })
  expect(initialized.error).toBeUndefined()
  bridge.child.stdin.end()
  await waitFor(async () => bridge.child.exitCode !== null, 2000)
  expect(await bridge.exited).toEqual([0, null])
}, 15_000)

// Default CAC flag must bind IPv4 clients used by published producer examples.
it('default dev host serves IPv4 discovery without explicit host flag', async () => {
  const host = await command(['dev', '--no-open', '--port', '0', '--base', '/ipv4-proof/'])
  await waitFor(async () => {
    host.assertRunning()
    return /RStore Devtools http:\/\/\S+\/ipv4-proof\//.test(host.diagnostics())
  }, 10_000)
  const address = /RStore Devtools (http:\/\/\S+)/.exec(host.diagnostics())![1]!
  const discovery = new URL('__connection.json', address)
  discovery.hostname = '127.0.0.1'
  expect((await fetch(discovery)).status).toBe(200)
  host.child.kill('SIGTERM')
  expect(await host.exited).toEqual([0, null])
}, 15_000)
