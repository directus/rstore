import type { FormFieldMergePayload } from '@rstore/shared'
import { mergeText } from '../text/index.js'

/**
 * Form field merger for concurrent text edits: merges when the base, local
 * and remote values are strings and the three-way text merge has no
 * overlapping edits; otherwise leaves the field to the next merger (or a
 * conflict).
 *
 * `createMultiplayerPlugin()` registers it on the `formFieldMerge` hook. Pass
 * it as the `fieldMerge` option of a standalone `createFormObject()`.
 */
export function textFieldMerger(payload: FormFieldMergePayload): void {
  const { base, local, remote } = payload
  if (typeof base !== 'string' || typeof local !== 'string' || typeof remote !== 'string') {
    return
  }
  const result = mergeText(base, local, remote)
  if (result.conflicts.length === 0) {
    payload.setMerged(result.merged)
  }
}
