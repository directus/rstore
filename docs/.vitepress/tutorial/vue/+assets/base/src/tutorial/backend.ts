import type { Todo, TodoEvent, User } from './types'

type CollectionPath = 'todos' | 'users'
type MutableCollectionPath = 'todos'

interface MemoryBackend {
  reset: () => void
  list: ((path: 'todos') => Todo[]) & ((path: 'users') => User[])
  get: ((path: 'todos', key: string) => Todo | undefined) & ((path: 'users', key: string) => User | undefined)
  createTodo: (input: Partial<Todo>) => Todo
  updateTodo: (key: string, patch: Partial<Todo>) => Todo
  deleteTodo: (key: string) => void
  create: (path: MutableCollectionPath, input: Partial<Todo>) => Todo
  update: (path: MutableCollectionPath, key: string, input: Partial<Todo>) => Todo
  delete: (path: MutableCollectionPath, key: string) => void
  subscribe: ((path: 'todos', subscriber: (event: TodoEvent) => void) => () => void) & ((path: 'users', subscriber: (event: TodoEvent) => void) => () => void)
  simulateRemoteTodo: () => Todo
}

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

const state = {
  users: [] as User[],
  todos: [] as Todo[],
}

const todoSubscribers = new Set<(event: TodoEvent) => void>()

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function getCollection(path: 'todos'): Todo[]
function getCollection(path: 'users'): User[]
function getCollection(path: CollectionPath) {
  return path === 'users' ? state.users : state.todos
}

function emitTodo(event: TodoEvent) {
  const payload = clone(event)
  for (const subscriber of todoSubscribers) {
    subscriber(payload)
  }
}

function list(path: 'todos'): Todo[]
function list(path: 'users'): User[]
function list(path: CollectionPath) {
  return clone(getCollection(path))
}

function get(path: 'todos', key: string): Todo | undefined
function get(path: 'users', key: string): User | undefined
function get(path: CollectionPath, key: string) {
  return clone(getCollection(path).find(item => item.id === key))
}

export const memoryBackend: MemoryBackend = {
  reset() {
    state.users = clone(initialUsers)
    state.todos = clone(initialTodos)
  },
  list,
  get,

  createTodo(input: Partial<Todo>) {
    const todo: Todo = {
      id: crypto.randomUUID(),
      text: String(input.text ?? '').trim() || 'Untitled todo',
      completed: Boolean(input.completed),
      assigneeId: input.assigneeId ?? state.users[0]?.id ?? null,
    }

    state.todos.unshift(todo)
    emitTodo({
      type: 'upsert',
      item: todo,
    })

    return clone(todo)
  },

  updateTodo(key: string, patch: Partial<Todo>) {
    const todo = state.todos.find(item => item.id === key)

    if (!todo) {
      throw new Error(`Todo "${key}" was not found.`)
    }

    Object.assign(todo, patch)
    emitTodo({
      type: 'upsert',
      item: todo,
    })

    return clone(todo)
  },

  deleteTodo(key: string) {
    const index = state.todos.findIndex(item => item.id === key)

    if (index === -1) {
      return
    }

    state.todos.splice(index, 1)
    emitTodo({
      type: 'delete',
      key,
    })
  },

  create(path: MutableCollectionPath, input: Partial<Todo>) {
    if (path !== 'todos') {
      throw new Error('Only todos are mutable in this tutorial.')
    }

    return this.createTodo(input)
  },

  update(path: MutableCollectionPath, key: string, input: Partial<Todo>) {
    if (path !== 'todos') {
      throw new Error('Only todos are mutable in this tutorial.')
    }

    return this.updateTodo(key, input)
  },

  delete(path: MutableCollectionPath, key: string) {
    if (path !== 'todos') {
      throw new Error('Only todos are mutable in this tutorial.')
    }

    this.deleteTodo(key)
  },

  subscribe(path: CollectionPath, subscriber: (event: TodoEvent) => void) {
    if (path !== 'todos') {
      return () => {}
    }

    todoSubscribers.add(subscriber)

    return () => {
      todoSubscribers.delete(subscriber)
    }
  },

  simulateRemoteTodo() {
    const todo: Todo = {
      id: crypto.randomUUID(),
      text: `Remote todo ${String(state.todos.length + 1)}`,
      completed: false,
      assigneeId: state.users[1]?.id ?? null,
    }

    state.todos.unshift(todo)
    emitTodo({
      type: 'upsert',
      item: todo,
    })

    return clone(todo)
  },
}

memoryBackend.reset()
