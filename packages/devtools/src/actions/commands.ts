import { DevtoolsError } from '../protocol'

/** One retained command outcome; pending work cannot be evicted. */
interface CommandRecord {
  /** Canonical validated input. */
  fingerprint: string
  /** Replay expiry based on original issue time. */
  expiresAt: number
  /** Settled operations may expire; pending effects remain protected. */
  settled: boolean
  /** Shared effect/outcome promise. */
  outcome: Promise<unknown>
}

/** Bounded per-registration replay protection, with an explicit clock for algorithm tests. */
export class CommandLedger {
  /** Retained commands belonging to one exact registration. */
  private readonly records = new Map<string, CommandRecord>()
  /** Construct a five-minute ledger, default maximum 1,000 outcomes. */
  constructor(private readonly now: () => number = Date.now, private readonly capacity = 1000) {}

  /** Reserve before dispatch; identical replay shares effects, conflicting reuse rejects. */
  run<T>(commandId: string, issuedAt: number, fingerprint: string, dispatch: () => Promise<T>): Promise<T> {
    const now = this.now()
    if (issuedAt < now - 300000 || issuedAt > now + 30000)
      throw new DevtoolsError({ code: 'COMMAND_EXPIRED', commandId, message: 'Command expired or issued too far in future' })
    for (const [id, record] of this.records) {
      if (record.settled && record.expiresAt < now)
        this.records.delete(id)
    }
    const previous = this.records.get(commandId)
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new DevtoolsError({ code: 'COMMAND_CONFLICT', commandId, message: 'Command ID already belongs to different input' })
      return previous.outcome as Promise<T>
    }
    if (this.records.size >= this.capacity)
      throw new DevtoolsError({ code: 'CAPACITY', commandId, message: 'Command replay capacity reached' })
    const record: CommandRecord = { fingerprint, expiresAt: issuedAt + 300000, settled: false, outcome: Promise.resolve() }
    // Defer application entry until record is published, preventing synchronous reentrant duplication.
    record.outcome = Promise.resolve().then(dispatch).then(
      (result) => {
        record.settled = true
        return result
      },
      (error) => {
        record.settled = true
        throw error
      },
    )
    this.records.set(commandId, record)
    return record.outcome as Promise<T>
  }
}
