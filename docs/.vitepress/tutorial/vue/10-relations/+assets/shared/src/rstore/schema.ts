import { z } from 'zod'
import { withItemType } from '@rstore/vue'
import { defineTodoRelations } from './relations'
import { memoryBackend } from './backend'
import type { Todo, User } from './types'

export const TodoCollection = withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  hooks: {
    fetchFirst: ({ key }) => key ? memoryBackend.get('todos', String(key)) : undefined,
    fetchMany: () => memoryBackend.list('todos'),
    create: ({ item }) => memoryBackend.createTodo(item),
    update: ({ key, item }) => memoryBackend.updateTodo(String(key), item),
    delete: ({ key }) => memoryBackend.deleteTodo(String(key)),
  },
  formSchema: {
      create: z.object({
        text: z.string().min(1),
        assigneeId: z.string().nullable().optional(),
      }),
      update: z.object({
        text: z.string().min(1),
        completed: z.boolean(),
        assigneeId: z.string().nullable().optional(),
      }).partial(),
    },
})

export const UserCollection = withItemType<User>().defineCollection({
  name: 'User',
  getKey: item => item.id,
  hooks: {
    fetchFirst: ({ key }) => key ? memoryBackend.get('users', String(key)) : undefined,
    fetchMany: () => memoryBackend.list('users'),
  },
})

const TodoRelations = defineTodoRelations(TodoCollection, UserCollection)

export const schema = [
  TodoCollection,
  UserCollection,
  ...(TodoRelations ? [TodoRelations] : []),
] as const
