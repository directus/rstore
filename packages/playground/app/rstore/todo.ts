// Single model
export default defineItemType<Todo>().model({
  name: 'Todo',
  formSchema: {
    create: createValidationSchemas.todos,
    update: updateValidationSchemas.todos,
  },
  meta: {
    path: 'todos',
  },
})
