import type { Todo, User } from './types'
import { withItemType } from '@rstore/vue'
import { z } from 'zod'
import { defineTodoRelations } from './relations'

export const TodoCollection = withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  meta: {
    path: 'todos',
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
  meta: {
    path: 'users',
  },
})

const TodoRelations = defineTodoRelations(TodoCollection, UserCollection)

export const schema = [
  TodoCollection,
  UserCollection,
  ...(TodoRelations ? [TodoRelations] : []),
] as const
