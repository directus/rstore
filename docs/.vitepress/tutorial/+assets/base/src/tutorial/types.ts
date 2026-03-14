export interface User {
  id: string
  name: string
}

export interface Todo {
  id: string
  text: string
  completed: boolean
  assigneeId: string | null
}

export interface TodoEvent {
  type: 'upsert' | 'delete'
  item?: Todo
  key?: string
}
