export default withItemType<Book>().defineCollection({
  name: 'Book',
  scopeId: 'main-backend',
  meta: {
    path: 'books',
  },
})
