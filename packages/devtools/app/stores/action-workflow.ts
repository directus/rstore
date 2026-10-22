import type { ActionResult } from '../../src/protocol'
import type { Outcome } from './actions'
import type { Inspector } from './connection'
import * as v from 'valibot'
import { ActionResultSchema } from '../../src/protocol'
import { errorMessage, withDeadline } from './requests'
import { sameTarget } from './selection'

/** Submit one explicit command, retaining outcomes while fencing viewer feedback. */
export async function submitInspector(state: Inspector): Promise<void> {
  if (!state.transport || !state.draft || state.actionDisabled || state.outcome?.status === 'pending')
    return
  const draft = state.draft
  const owner = draft.owner
  const command = draft.command(state.selection, crypto.randomUUID(), Date.now())
  if (state.outcomes.length >= 50) {
    const settled = state.outcomes.findIndex(record => record.status !== 'pending' && record.status !== 'unknown')
    if (settled < 0)
      throw new Error('Unresolved command history full')
    state.outcomes.splice(settled, 1)
  }
  const outcome: Outcome = { command, status: 'pending' }
  state.outcomes.push(outcome)
  state.outcome = outcome
  try {
    const result: ActionResult = v.parse(ActionResultSchema, await withDeadline(state.transport.action(command), 30_000))
    if (!sameTarget(result.target, command.target) || result.commandId !== command.commandId)
      throw new Error('Action reply identity mismatch')
    outcome.status = result.status
    outcome.result = result
    recordOutcome(state, outcome)
    if (state.selection.owns(owner)) {
      state.outcome = { ...outcome }
      state.draft = null
      if (result.status === 'completed')
        await state.refresh()
    }
  }
  catch (error) {
    outcome.error = errorMessage(error)
    const failure = error as { code?: string, details?: { code?: string } }
    const code = failure.details?.code ?? failure.code
    outcome.status = code && code !== 'UNKNOWN_OUTCOME' ? 'failed' : 'unknown'
    recordOutcome(state, outcome)
    if (state.selection.owns(owner))
      state.outcome = { ...outcome }
  }
}

/** Replace retained record without showing stale feedback in another selected target. */
function recordOutcome(state: Inspector, outcome: Outcome): void {
  const index = state.outcomes.findIndex(record => record.command.commandId === outcome.command.commandId)
  if (index >= 0)
    state.outcomes[index] = { ...outcome }
}
