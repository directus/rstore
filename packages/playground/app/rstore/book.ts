export const Book = RStoreSchema.withItemType<Book>().defineCollection({
  name: 'Book',
  scopeId: 'main-backend',
  meta: {
    path: 'books',
  },
})

export const Author = RStoreSchema.withItemType<Author>().defineCollection({
  name: 'Author',
  scopeId: 'main-backend',
  meta: {
    path: 'authors',
  },
})

export const BookRelations = RStoreSchema.defineRelations(Book, ({ collection }) => ({
  author: {
    to: collection(Author, [{
      on: {
        'Author.id': 'Book.authorId',
      },
    }]),
  },
}))
