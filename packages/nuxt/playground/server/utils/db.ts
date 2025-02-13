import { faker } from '@faker-js/faker'

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

export interface Db {
  users: User[]
  messages: Message[]
}

export const db: Db = {
  users: [
    {
      id: 'user1',
      email: 'user1@acme.com',
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      createdAt: new Date(),
    },
    {
      id: 'user2',
      email: faker.internet.email(),
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      createdAt: new Date(),
    },
  ],
  messages: [],
}
