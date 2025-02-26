import { z } from 'zod'

export const createValidationSchemas = {
  users: z.object({
    name: z.string(),
    email: z.string().email(),
    avatar: z.string(),
  }),
  messages: z.object({
    authorId: z.string(),
    recipientId: z.string(),
    text: z.string(),
  }),
  todos: z.object({
    text: z.string(),
  }),
} as const

export type CreateValidationSchemas = { [T in keyof typeof createValidationSchemas]: z.infer<typeof createValidationSchemas[T]> }

export const updateValidationSchemas = {
  users: z.object({
    name: z.string(),
    email: z.string().email(),
    avatar: z.string(),
  }).partial(),
  messages: z.object({
    text: z.string(),
  }).partial(),
  todos: z.object({
    text: z.string(),
    completed: z.boolean(),
  }).partial(),
} as const

export type UpdateValidationSchemas = { [T in keyof typeof updateValidationSchemas]: z.infer<typeof updateValidationSchemas[T]> }
