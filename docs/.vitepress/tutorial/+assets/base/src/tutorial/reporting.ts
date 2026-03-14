import { setTutorialState } from './bridge'

interface TodoLike {
  text: string
}

interface TodoWithAssignee extends TodoLike {
  assignee?: {
    name?: string | null
  } | null
}

function createTodoSummary(todos: readonly TodoLike[]) {
  return {
    listCount: todos.length,
    todoTexts: todos.map(todo => todo.text),
  }
}

export function reportRuntimeStatus(status: {
  storeReady?: boolean
  transportMode?: 'hooks' | 'plugin'
}) {
  setTutorialState(status)
}

export function reportTodoList(todos: readonly TodoLike[]) {
  setTutorialState(createTodoSummary(todos))
}

export function reportMutationState(
  todos: readonly TodoLike[],
  mutation: {
    created: boolean
    toggled: boolean
    deleted: boolean
  },
) {
  setTutorialState({
    ...createTodoSummary(todos),
    mutation: {
      ...mutation,
    },
  })
}

export function reportFormState(form: {
  ready?: boolean
  valid?: boolean
  hasChanges?: boolean
  created?: boolean
  updated?: boolean
  resetWorked?: boolean
}) {
  setTutorialState({
    form: {
      ...form,
    },
  })
}

export function reportRelationState(todos: readonly TodoWithAssignee[]) {
  setTutorialState({
    ...createTodoSummary(todos),
    relations: {
      assigneeNames: todos
        .map(todo => todo.assignee?.name)
        .filter((name): name is string => Boolean(name)),
    },
  })
}

export function reportLiveState(todos: readonly TodoLike[], remoteInsertSeen: boolean) {
  setTutorialState({
    ...createTodoSummary(todos),
    live: {
      total: todos.length,
      remoteInsertSeen,
    },
  })
}

export function reportCacheState(
  count: number,
  cache: Record<string, unknown> = {},
) {
  setTutorialState({
    cache: {
      count,
      ...cache,
    },
  })
}
