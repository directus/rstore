import type { VueStackOptions } from '#test-utils/store/vueStack'
import type { VueStore } from '@rstore/vue'
import { setupTodos } from '../../utils/live-query'

type TodoSchema = [{ 'name': 'todos', '~item': { id: string, title?: string, group?: string } }]

/** Reuse the real todo harness with typed query and mutation entry points. */
export async function setupExactTodos(options?: Partial<VueStackOptions>) {
  const stack = await setupTodos(options)
  return { ...stack, store: stack.store as VueStore<TodoSchema> }
}
