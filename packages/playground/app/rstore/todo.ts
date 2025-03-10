// Single model
export default defineItemType<Todo>().model({
  name: 'Todo',
  schema: {
    create: createValidationSchemas.todos,
    update: updateValidationSchemas.todos,
  },
  meta: {
    path: 'todos',
  },
} as const)
