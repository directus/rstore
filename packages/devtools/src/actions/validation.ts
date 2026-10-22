import type { ResolvedCollection } from '@rstore/shared'
import type { Action, JsonValue } from '../protocol'
import { DevtoolsError, isActionJson, parseAction } from '../protocol'

/** Canonical descriptor-safe JSON after authoritative validation; object field order is irrelevant. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>
  if (Array.isArray(value))
    return `[${Array.from({ length: descriptors.length!.value }, (_, index) => canonicalJson(descriptors[String(index)]!.value)).join(',')}]`
  return `{${Object.keys(descriptors).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(descriptors[key]!.value)}`).join(',')}}`
}

/** Detach validated envelope before asynchronous work; caller edits cannot change accepted command. */
export function validateAction(input: unknown): { action: Action, fingerprint: string } {
  try {
    if (!isActionJson(input))
      throw new Error('Invalid JSON envelope')
    // Read only validated data descriptors, then run schema against owned JSON.
    // A transport caller cannot change input or execute getters during schema parsing.
    const fingerprint = canonicalJson(input)
    const parsed = parseAction(JSON.parse(fingerprint))
    if ('item' in parsed && (parsed.item === null || typeof parsed.item !== 'object' || Array.isArray(parsed.item)))
      throw new Error('Item must be a plain JSON object')
    return { action: parsed, fingerprint }
  }
  catch {
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid or over-budget action input' })
  }
}

/** Check declared collection input schema before entering mutation hooks. */
export async function validateCollectionItem(action: Action, collection: ResolvedCollection): Promise<void> {
  if (action.action !== 'create-item' && action.action !== 'update-item')
    return
  const schema = collection.formSchema[action.action === 'create-item' ? 'create' : 'update']
  let result
  try {
    result = await schema['~standard'].validate(action.item)
  }
  catch {
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', target: action.target, commandId: action.commandId, message: 'Collection schema validation failed' })
  }
  if (result.issues?.length)
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', target: action.target, commandId: action.commandId, message: 'Item does not satisfy collection schema' })
  // Schema transforms may return executable/non-JSON values; inspect only original validated input.
  if (!isActionJson(action.item))
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Collection schema produced unsafe action input' })
}

/** Bound safe backend feedback and omit credential-like fragments and stacks. */
export function backendMessage(error: unknown): string {
  try {
    const descriptor = error !== null && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'message') : undefined
    const message = descriptor && 'value' in descriptor && typeof descriptor.value === 'string' ? descriptor.value : 'Store operation failed'
    return message.split('\n')[0]!.replace(/Bearer\s+\S+|(?:token|password|secret)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 512)
  }
  catch { return 'Store operation failed' }
}
