import type { Todo } from './types'
import { memoryBackend } from './backend'

type RemoteTodoListener = (todo: Todo) => void

export function subscribeToRemoteTodos(listener: RemoteTodoListener) {
  return memoryBackend.subscribe('todos', (event) => {
    if (event.type === 'upsert' && event.item) {
      listener(event.item)
    }
  })
}

export function simulateRemoteTodo() {
  return memoryBackend.simulateRemoteTodo()
}
