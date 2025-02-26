import { faker } from '@faker-js/faker'

export interface Db {
  todos: Todo[]
  users: User[]
  messages: Message[]
}

export const db: Db = {
  todos: [],
  users: [
    {
      id: 'user1',
      email: 'user1@acme.com',
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      createdAt: new Date(),
    },
    {
      id: 'user1bis',
      email: 'user1@acme.com',
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      createdAt: new Date(),
    },
    {
      id: 'user2',
      email: 'user2@acme.com',
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      createdAt: new Date(),
    },
  ],
  messages: [],
}
