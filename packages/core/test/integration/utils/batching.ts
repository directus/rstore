import type { CoreStack, CoreStackOptions } from '#test-utils/store/coreStack'
import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'

/** Shared rows for batch dispatch specs. */
export const TWO_TODOS = [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }]

/** Build a deterministic batched stack for dispatch assertions. */
export function batchStack(options: Partial<CoreStackOptions> = {}): Promise<CoreStack> {
  const { schema = [{ name: 'todos' }], ...rest } = options
  return createCoreStack({ batch: true, batching: { delay: 1 }, ...rest, schema })
}

/** Build a local plugin used to observe the hook tiers around a batch. */
export function hookPlugin(name: string, register: (hook: any) => void): Plugin {
  return { name, category: 'local', setup: ({ hook }: any) => register(hook) }
}
