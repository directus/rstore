import { faker } from '@faker-js/faker'

export interface Db {
  todos: Todo[]
  users: User[]
  bots: Bot[]
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
    {
      id: 'user3',
      email: 'user3@acme.com',
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      createdAt: new Date(),
    },
  ],
  bots: [
    {
      id: 'bot1',
      name: 'DataBot',
      createdAt: new Date(),
    },
  ],
  messages: [
    {
      id: 'message1',
      authorId: 'user1',
      recipientId: 'user2',
      text: faker.lorem.paragraph(),
      createdAt: new Date(),
    },
    {
      id: 'message2',
      authorId: 'user2',
      recipientId: 'user1',
      text: faker.lorem.paragraph(),
      createdAt: new Date(),
    },
    {
      id: 'message3',
      authorId: 'bot1',
      recipientId: 'user1',
      text: faker.lorem.paragraph(),
      createdAt: new Date(),
    },
    {
      id: 'message4',
      authorId: 'user2',
      recipientId: 'user3',
      text: faker.lorem.paragraph(),
      createdAt: new Date(),
    },
  ],
}
