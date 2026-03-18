import { z } from 'zod'
import type { Todo } from './types'

export default RStoreSchema.withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  hooks: {
    fetchFirst: ({ key }) => key ? $fetch(`/api/todos/${key}`) : undefined,
    fetchMany: () => $fetch('/api/todos'),
    create: ({ item }) => $fetch('/api/todos', {
      method: 'POST',
      body: item,
    }),
    update: ({ key, item }) => $fetch(`/api/todos/${key}`, {
      method: 'PATCH',
      body: item,
    }),
    delete: ({ key }) => $fetch(`/api/todos/${key}`, {
      method: 'DELETE',
    }),
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
