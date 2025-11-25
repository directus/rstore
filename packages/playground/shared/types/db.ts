export interface User {
  id: string
  name: string
  email: string
  avatar: string
  createdAt: Date
}

export interface Bot {
  id: string
  name: string
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

export interface ChatMessage {
  id: string
  userName: string
  userAvatar: string
  text: string
  createdAt: Date
}

export interface DataSource {
  id: string
  name: string
}

export interface DataCollection {
  id: string
  dataSourceId: string
  name: string
}

export interface DataField {
  id: string
  dataCollectionId: string
  name: string
  type: string
  nullable: boolean
}

export interface Book {
  id: string
  title: string
  author: string
  genre: string
  publishedAt: Date
}
