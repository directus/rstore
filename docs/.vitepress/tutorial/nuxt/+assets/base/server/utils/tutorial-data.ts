import type { Todo, User } from '../../app/rstore/types'

const initialUsers: User[] = [
  { id: 'user-1', name: 'Ada Lovelace' },
  { id: 'user-2', name: 'Linus Torvalds' },
  { id: 'user-3', name: 'Grace Hopper' },
]

const initialTodos: Todo[] = [
  {
    id: 'todo-1',
    text: 'Draft the collection hooks',
    completed: false,
    assigneeId: 'user-1',
  },
  {
    id: 'todo-2',
    text: 'Render the normalized list',
    completed: true,
    assigneeId: 'user-2',
  },
  {
    id: 'todo-3',
    text: 'Wire realtime cache updates',
    completed: false,
    assigneeId: 'user-3',
  },
]

const state = globalThis as typeof globalThis & {
  __RSTORE_TUTORIAL_SERVER_STATE__?: {
    users: User[]
    todos: Todo[]
  }
}

function createInitialState() {
  return {
    users: structuredClone(initialUsers),
    todos: structuredClone(initialTodos),
  }
}

function getState() {
  state.__RSTORE_TUTORIAL_SERVER_STATE__ ??= createInitialState()
  return state.__RSTORE_TUTORIAL_SERVER_STATE__
}

export function listUsers() {
  return structuredClone(getState().users)
}

export function getUser(id: string) {
  return structuredClone(getState().users.find(item => item.id === id))
}

export function listTodos() {
  return structuredClone(getState().todos)
}

export function getTodo(id: string) {
  return structuredClone(getState().todos.find(item => item.id === id))
}

export function createTodo(input: Partial<Todo>) {
  const todo: Todo = {
    id: crypto.randomUUID(),
    text: String(input.text ?? '').trim() || 'Untitled todo',
    completed: Boolean(input.completed),
    assigneeId: input.assigneeId ?? getState().users[0]?.id ?? null,
  }

  getState().todos.unshift(todo)
  return structuredClone(todo)
}

export function updateTodo(id: string, patch: Partial<Todo>) {
  const todo = getState().todos.find(item => item.id === id)

  if (!todo) {
    throw createError({
      statusCode: 404,
      statusMessage: `Todo "${id}" was not found.`,
    })
  }

  Object.assign(todo, patch)
  return structuredClone(todo)
}

export function deleteTodo(id: string) {
  const index = getState().todos.findIndex(item => item.id === id)

  if (index !== -1) {
    getState().todos.splice(index, 1)
  }

  return { ok: true }
}
