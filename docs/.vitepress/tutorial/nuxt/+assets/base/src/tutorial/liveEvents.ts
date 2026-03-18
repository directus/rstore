import type { Todo } from './types'

type RemoteTodoListener = (todo: Todo) => void

const listeners = new Set<RemoteTodoListener>()

export function subscribeToRemoteTodos(listener: RemoteTodoListener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function simulateRemoteTodo() {
  const todo: Todo = {
    id: crypto.randomUUID(),
    text: `Remote todo ${String(Date.now()).slice(-4)}`,
    completed: false,
    assigneeId: 'user-2',
  }

  for (const listener of listeners) {
    listener(todo)
  }

  return todo
}
