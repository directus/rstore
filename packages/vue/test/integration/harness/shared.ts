import type { StoreSchema } from '@rstore/shared'

/** Minimal schema shared by the harness integration slices. */
export const harnessSchema: StoreSchema = [{ name: 'todos' }]

/** Stable backend rows used by fake-remote harness tests. */
export function harnessTodos() {
  return {
    todos: [
      { id: '1', title: 'One', done: false },
      { id: '2', title: 'Two', done: false },
    ],
  }
}
