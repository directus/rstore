import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { assertLocalBrowserEnvironment } from './browser/environment'
import { activeGroupMembers, activeOwnedMembers, terminateProcessGroup } from './browser/processGroup'

/** Acquired native processes recorded independently of the cleanup implementation. */
interface ProcessFixture {
  /** Group-leading fixture process. */
  child: ChildProcess
  /** Actual descendant PID published by its spawning parent. */
  descendantPid: number
}

/** Emergency fixture cleanup stays independent of the behavior being checked. */
function killFixtureProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
      throw error
  }
}

/** Release known fixture PIDs even when group enumeration or termination regresses. */
function disposeFixture(fixture: ProcessFixture): void {
  killFixtureProcess(-fixture.child.pid!)
  killFixtureProcess(fixture.descendantPid)
  if (fixture.child.connected)
    fixture.child.disconnect()
}

/** Launch real processes in a private group; neither process creates a browser or UI. */
async function startGroup(ignoreTermination: boolean, token?: string, detachedDescendant = false): Promise<ProcessFixture> {
  const script = `
    const { spawn } = require('node:child_process');
    const ignore = ${ignoreTermination};
    const descendant = spawn(process.execPath, ['-e', \`
      if (${ignoreTermination}) process.on('SIGTERM', () => {});
      process.send('ready');
      setInterval(() => {}, 1000);
    \`], { detached: ${detachedDescendant}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    process.send({ descendant: descendant.pid });
    descendant.once('message', () => process.send({ ready: true }));
    if (ignore) process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
  `
  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    env: { ...process.env, ...(token ? { RSTORE_BROWSER_RUN_ID: token } : {}) },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  let descendantPid: number | undefined
  let readinessTimer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.on('message', (message: any) => {
          if (message.descendant)
            descendantPid = message.descendant
          if (message.ready)
            resolve()
        })
      }),
      once(child, 'exit').then(() => { throw new Error('Process fixture exited before readiness') }),
      new Promise<never>((_resolve, reject) => {
        readinessTimer = setTimeout(() => reject(new Error('Owned process group did not become ready')), 2_000)
      }),
    ])
    if (!descendantPid)
      throw new Error('Process fixture did not publish its descendant PID')
    return { child, descendantPid }
  }
  catch (error) {
    if (child.pid)
      killFixtureProcess(-child.pid)
    if (descendantPid)
      killFixtureProcess(descendantPid)
    if (child.connected)
      child.disconnect()
    throw error
  }
  finally {
    clearTimeout(readinessTimer)
  }
}

describe('private browser runner safety', () => {
  for (const variable of ['PW_TEST_CONNECT_WS_ENDPOINT', 'PW_TEST_CONNECT_HEADERS', 'PW_TEST_CONNECT_EXPOSE_NETWORK']) {
    it(`rejects ${variable} without connecting to an external browser`, () => {
      expect(() => assertLocalBrowserEnvironment({ [variable]: 'configured' })).toThrow(variable)
      expect(() => assertLocalBrowserEnvironment({})).not.toThrow()
    })
  }

  it('rejects remote browser routing through the actual command before opening its server', async () => {
    const artifacts = await mkdtemp(resolve(tmpdir(), 'rstore-runner-guard-'))
    const child = spawn(process.execPath, ['test/browser/run.mjs'], {
      env: { ...process.env, RSTORE_BROWSER_ARTIFACT_DIR: artifacts, PW_TEST_CONNECT_WS_ENDPOINT: 'ws://127.0.0.1:1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let errors = ''
    child.stderr!.on('data', (chunk) => {
      errors += String(chunk)
    })
    let settled = false
    const completion = once(child, 'exit').then(([code]) => {
      settled = true
      return code
    })
    try {
      await expect.poll(() => settled, { timeout: 5_000, message: 'remote routing is rejected before runner startup' }).toBe(true)
      expect(await completion).toBe(1)
      expect(errors).toContain('Browser tests require local Chromium; unset PW_TEST_CONNECT_WS_ENDPOINT.')
    }
    finally {
      if (!settled)
        child.kill('SIGKILL')
      await rm(artifacts, { recursive: true, force: true })
    }
  })

  for (const ignoresTermination of [false, true]) {
    it.skipIf(process.platform !== 'linux')(`closes all owned descendants when termination is ${ignoresTermination ? 'ignored' : 'handled'}`, async () => {
      const fixture = await startGroup(ignoresTermination)
      const groupId = fixture.child.pid!
      try {
        expect(activeGroupMembers(groupId), 'parent and descendant both run in owned group').toHaveLength(2)
        await expect(terminateProcessGroup(groupId, 'SIGTERM', 100), 'owned process cleanup completes within its deadline').resolves.toBeUndefined()
        expect(activeGroupMembers(groupId), 'owned processes release their resources').toEqual([])
      }
      finally {
        // Independent emergency teardown must work even if termination logic regresses.
        disposeFixture(fixture)
      }
    })
  }

  it.skipIf(process.platform !== 'linux')('closes tagged detached descendants and preserves an unrelated process', async () => {
    const token = randomUUID()
    const fixture = await startGroup(true, token, true)
    let unrelated: ProcessFixture | undefined
    try {
      unrelated = await startGroup(false)
      expect(activeOwnedMembers(fixture.child.pid!, token), 'detached descendant inherits runner ownership').toHaveLength(2)
      expect(activeGroupMembers(fixture.child.pid!)).toHaveLength(1)
      await expect(terminateProcessGroup(fixture.child.pid!, 'SIGTERM', 100, token), 'detached process cleanup completes within its deadline').resolves.toBeUndefined()
      expect(activeOwnedMembers(fixture.child.pid!, token), 'detached browser-style processes stop').toEqual([])
      expect(activeGroupMembers(unrelated.child.pid!), 'unrelated processes stay alive').toHaveLength(2)
    }
    finally {
      disposeFixture(fixture)
      if (unrelated)
        disposeFixture(unrelated)
    }
  })
})
