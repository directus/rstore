export interface User {
  id: string
  name: string
  email: string
  avatar: string
  createdAt: Date
}

export interface Message {
  id: string
  authorId: string
  recipientId: string
  text: string
  createdAt: Date
  updatedAt?: Date
}

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
  updatedAt?: Date
}
