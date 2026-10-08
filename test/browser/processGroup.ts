import { readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'

/** Native process identity used to select only this runner's resources. */
interface LiveProcess {
  /** Kernel process identifier. */
  pid: number
  /** Kernel process group identifier. */
  groupId: number
}

/** Read live Linux processes; exited zombies hold no resources. */
function liveProcesses(): LiveProcess[] {
  const members: LiveProcess[] = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry))
      continue
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8')
      // Process names can contain spaces or parentheses; fields follow the final ')'.
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (fields[0] !== 'Z')
        members.push({ pid: Number(entry), groupId: Number(fields[2]) })
    }
    catch (error) {
      // Processes may exit between directory enumeration and reading their state.
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error
    }
  }
  return members
}

/** List active members of the detached group created by the runner. */
export function activeGroupMembers(groupId: number): number[] {
  return liveProcesses().filter(member => member.groupId === groupId).map(member => member.pid)
}

/** Match an inherited private marker without exposing any other environment values. */
function hasOwnershipToken(pid: number, token: string): boolean {
  try {
    return readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').includes(`RSTORE_BROWSER_RUN_ID=${token}`)
  }
  catch (error) {
    if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw error
    return false
  }
}

/** Include tagged descendants that launched their own groups, as Chromium does. */
export function activeOwnedMembers(groupId: number, token?: string): number[] {
  return liveProcesses().filter(member => member.groupId === groupId || (token && hasOwnershipToken(member.pid, token))).map(member => member.pid)
}

/** Signal only the detached process group created by this runner. */
export function signalProcessGroup(groupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-groupId, signal)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
      throw error
  }
}

/** Signal the original group and positively identified detached descendants. */
function signalOwnedProcesses(groupId: number, signal: NodeJS.Signals, token?: string): void {
  signalProcessGroup(groupId, signal)
  if (!token)
    return
  for (const member of liveProcesses()) {
    if (member.groupId === groupId || !hasOwnershipToken(member.pid, token))
      continue
    try {
      process.kill(member.pid, signal)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
        throw error
    }
  }
}

/** Observe actual descendant exit with a bounded deadline and native scheduling. */
async function waitForGroupExit(groupId: number, timeoutMs: number, token?: string, force = false): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (activeOwnedMembers(groupId, token).length) {
    if (Date.now() >= deadline)
      return false
    // Catch children created during interruption, including a newly detached browser.
    if (force)
      signalOwnedProcesses(groupId, 'SIGKILL', token)
    await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
  return true
}

/** Close owned descendants gracefully, then force exit when a child ignores interruption. */
export async function terminateProcessGroup(groupId: number, signal: NodeJS.Signals = 'SIGTERM', graceMs = 1_500, token?: string): Promise<void> {
  signalOwnedProcesses(groupId, signal, token)
  if (await waitForGroupExit(groupId, graceMs, token))
    return
  signalOwnedProcesses(groupId, 'SIGKILL', token)
  if (!await waitForGroupExit(groupId, 1_500, token, true)) {
    throw new Error(`Browser test process group ${groupId} did not stop; live descendants: ${activeOwnedMembers(groupId, token).join(', ')}.`)
  }
}
