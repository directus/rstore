// Single model
export default defineItemType<Todo>().model({
  name: 'Todo',
  scopeId: 'main-backend',
  formSchema: {
    create: createValidationSchemas.todos,
    update: updateValidationSchemas.todos,
  },
  meta: {
    path: 'todos',
  },
})
