// Single collection
export default withItemType<Todo>().defineCollection({
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
