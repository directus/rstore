import type { Todo } from './types'
import { z } from 'zod'

export default RStoreSchema.withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  hooks: {},
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
