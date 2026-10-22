import type { Action, ActionResult, ItemKey } from '../../src/protocol'
import type { Ownership, Selection } from './selection'
import { parseAction } from '../../src/protocol'

/** Item editor input parsed independently of projected diagnostic values. */
export function parseEditor(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected JSON object')
  return value as Record<string, unknown>
}
/** Action outcome retained for exact command even after viewer changes. */
export interface Outcome {
  /** Original validated command. */
  command: Action
  /** Current observed action state. */
  status: 'pending' | 'accepted' | 'completed' | 'failed' | 'unknown'
  /** Bounded producer success response. */
  result?: ActionResult
  /** Concise transport/backend failure text. */
  error?: string
}
/** Target-bound dialog, invalidated when selection changes. */
export class ActionDraft {
  /** Captured target and viewer epoch. */
  owner: Ownership
  /** Action chosen by user. */
  action: Action['action']
  /** Selected collection for item actions. */
  collection: string
  /** Typed cache/collection key, never reconstructed from preview. */
  key: ItemKey | undefined
  /** User-entered JSON retained after backend failure. */
  text = '{}'
  /** Explicit confirmation for destructive actions. */
  confirmed = false
  /** Capture original authority when dialog opens. */
  constructor(selection: Selection, action: Action['action'], collection = '', key?: ItemKey) {
    this.owner = selection.capture()
    this.action = action
    this.collection = collection
    this.key = key
  }

  /** Validate current ownership before constructing a fresh command. */
  command(selection: Selection, commandId: string, issuedAt: number): Action {
    if (!selection.owns(this.owner) || !this.owner.target)
      throw new Error('Selected target changed')
    const needsItem = ['create-item', 'update-item', 'write-cache-item'].includes(this.action)
    const needsKey = ['update-item', 'delete-item', 'delete-cache-item'].includes(this.action)
    const destructive = ['delete-item', 'delete-cache-item', 'clear-cache', 'clear-history'].includes(this.action)
    if (destructive && !this.confirmed)
      throw new Error('Confirm action')
    return parseAction({
      target: this.owner.target,
      action: this.action,
      commandId,
      issuedAt,
      ...(!['clear-cache', 'clear-history'].includes(this.action) ? { collection: this.collection } : {}),
      ...(needsItem ? { item: parseEditor(this.text) } : {}),
      ...(needsKey ? { key: this.key } : {}),
    })
  }
}
