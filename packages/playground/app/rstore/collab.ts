export default withItemType<CollabDocument>().defineCollection({
  name: 'CollabDocument',
  scopeId: 'main-backend',
  formSchema: {
    create: createValidationSchemas.collabDocuments,
    update: updateValidationSchemas.collabDocuments,
  },
  meta: {
    path: 'collabDocuments',
    websocketTopic: 'collab-documents',
  },
})
