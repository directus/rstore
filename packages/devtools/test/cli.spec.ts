import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { runCli } from '../src/cli'
import { cliCredentials, cliPort, stdioOptions } from '../src/cli/options'
import { waitFor } from './utils/relay'

const execute = promisify(execFile)
const binary = fileURLToPath(new URL('../dist/cli/index.mjs', import.meta.url))
const opener = vi.hoisted(() => ({ count: 0 }))

// Only external OS launcher is inert. CAC parsing, host, auth and cleanup stay
// real; count alone records no generated OTP URL or credentials in failures.
vi.mock('devframe/utils/open', () => ({
  open: async () => { opener.count++ },
}))

describe('devtools CLI contracts', () => {
  it.each([
    { flags: [], expected: 0 },
    { flags: ['--open'], expected: 1 },
    { flags: ['--open', '--no-open'], expected: 0 },
  ])('opens OS browser only with explicit request: $flags', async ({ flags, expected }) => {
    opener.count = 0
    const command = await runCli(['node', binary, 'dev', '--port', '0', '--host', '127.0.0.1', ...flags], {})
    onTestFinished(command.close)
    expect(opener.count).toBe(expected)
  })

  it('rejects auth role reuse, unauthenticated stdio and invalid listen addresses', () => {
    expect(() => cliCredentials({ DEVFRAME_MCP_AUTH_TOKEN: 'shared', RSTORE_DEVTOOLS_NODE_AUTH_TOKEN: 'shared' })).toThrow('distinct')
    expect(() => cliCredentials({ RSTORE_DEVTOOLS_NODE_AUTH_TOKEN: 'shared', RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN: 'shared' })).toThrow('distinct')
    expect(() => stdioOptions(undefined, {})).toThrow('--connect')
    expect(() => stdioOptions('http://localhost/', {})).toThrow('RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN')
    expect(() => stdioOptions('http://secret:password@localhost/', { RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN: 'viewer' })).toThrow('without credentials')
    expect(stdioOptions('http://localhost:9999/nested', { RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN: 'viewer' })).toEqual({ baseURL: 'http://localhost:9999/nested/', authToken: 'viewer' })
    expect(cliPort('0')).toBe(0)
    for (const invalid of ['abc', -1, 65536, 1.2])
      expect(() => cliPort(invalid)).toThrow('port')
  })

  // Actual ESM command entry, no handler mocks. A successful empty report or
  // disconnected local stdio registry would violate these process-level oracles.
  it('published entry reports supported commands and rejects deferred build', async () => {
    const help = await execute(process.execPath, [binary, '--help'], { timeout: 10_000 })
    expect(help.stdout).toContain('mcp')
    expect(help.stdout).not.toContain('self-contained static')
    await expect(execute(process.execPath, [binary, 'build'], { timeout: 10_000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('static build reports are unavailable') })
    await expect(execute(process.execPath, [binary, 'mcp'], { timeout: 10_000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('--connect') })
    await expect(execute(process.execPath, [binary, 'dev', '--no-auth'], { timeout: 10_000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('authentication is unsupported') })
    await expect(execute(process.execPath, [binary, 'dev', '--mcp'], { timeout: 10_000, env: { ...process.env, DEVFRAME_MCP_AUTH_TOKEN: '' } })).rejects.toMatchObject({ code: 1 })
  })

  it('published dev hosts inspector at custom base and closes owned listen socket', async () => {
    const child = spawn(process.execPath, [binary, 'dev', '--no-open', '--port', '0', '--host', '127.0.0.1', '--base', '/custom/'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DEVFRAME_MCP_AUTH_TOKEN: undefined },
    })
    const exited = once(child, 'close')
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
        await exited
      }
      finally {
        clearTimeout(forced)
      }
    })
    await waitFor(async () => /RStore Devtools http:\/\/127\.0\.0\.1:\d+\/custom\//.test(stderr), 10_000)
    const baseURL = /RStore Devtools (http:\/\/127\.0\.0\.1:\d+\/custom\/)/.exec(stderr)![1]!
    const inspector = await fetch(baseURL)
    expect(inspector.status).toBe(200)
    expect(inspector.headers.get('content-type')).toContain('text/html')
    expect(await inspector.text()).toContain('id="app"')
    expect((await fetch(new URL('__connection.json', baseURL))).status).toBe(200)
    expect(stderr.match(/HTTP MCP disabled/g)).toHaveLength(1)
    expect(stdout).toBe('')
    child.kill('SIGTERM')
    await exited
    await expect(fetch(baseURL)).rejects.toThrow()
  })
})
