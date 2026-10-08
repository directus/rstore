import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertLocalBrowserEnvironment } from './environment.ts'
import { terminateProcessGroup } from './processGroup.ts'
import { startServer } from './server.mjs'

assertLocalBrowserEnvironment()

/** Resolve the installed runner without relying on shell PATH or launching a UI. */
const require = createRequire(import.meta.url)
/** Resolve before opening the server so a broken installation cannot leave it running. */
const cli = require.resolve('@playwright/test/cli')
/** Forward test filters and reporters to the shared suite. */
const args = process.argv.slice(2)
/** The browser suite needs a private Linux X display for native focus checks. */
const config = fileURLToPath(new URL('./playwright.config.ts', import.meta.url))

if (process.platform !== 'linux') {
  throw new Error('Native focus tests require Linux with Xvfb; run this suite in Linux CI or a Linux container.')
}

/** Remove desktop routing before xvfb-run creates a new display for its child. */
process.env.BROWSER = 'none'
process.env.RSTORE_BROWSER_ARTIFACT_DIR ??= resolve(tmpdir(), `rstore-browser-${process.pid}`)
/** Chromium creates separate process groups; inherited marker tracks those descendants too. */
const ownershipToken = randomUUID()
const env = { ...process.env, RSTORE_BROWSER_XVFB: '1', RSTORE_BROWSER_RUN_ID: ownershipToken, BROWSER: 'none' }
delete env.DISPLAY
delete env.WAYLAND_DISPLAY
delete env.DBUS_SESSION_BUS_ADDRESS
delete env.XDG_RUNTIME_DIR

/** Own server and display for the full run, including interruption. */
async function run() {
  /** Interruption also applies while Vite is still starting. */
  let interrupted
  /** Wake the main run even when a child ignores its termination signal. */
  let resolveInterruption
  const interruption = new Promise((resolve) => {
    resolveInterruption = resolve
  })
  /** Interruptions trigger bounded process-group cleanup in finally. */
  function stop(signal) {
    interrupted ??= signal
    resolveInterruption({ code: signal === 'SIGINT' ? 130 : 143 })
  }
  /** Named handlers can be removed after the server and child group close. */
  const onInterrupt = () => stop('SIGINT')
  const onTerminate = () => stop('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  let server
  let child
  try {
    // Own Vite directly: detached webServer can escape runner-group shutdown.
    server = await startServer()
    if (interrupted) {
      process.exitCode = interrupted === 'SIGINT' ? 130 : 143
      return
    }
    // Xvfb owns the only display Chromium can use, including explicit headed runs.
    child = spawn('xvfb-run', [
      '-a',
      process.execPath,
      cli,
      'test',
      '--config',
      config,
      ...args,
    ], { env, stdio: 'inherit', detached: true })
    const completion = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => resolve({ code: code ?? 1 }))
    })
    const result = await Promise.race([completion, interruption])
    process.exitCode = result.code
  }
  finally {
    try {
      if (child?.pid)
        await terminateProcessGroup(child.pid, interrupted ?? 'SIGTERM', 1_500, ownershipToken)
    }
    finally {
      await server?.close()
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
    }
  }
}

run().catch((error) => {
  console.error(`Cannot start isolated browser tests: ${error.message}`)
  process.exitCode = 1
})
