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
