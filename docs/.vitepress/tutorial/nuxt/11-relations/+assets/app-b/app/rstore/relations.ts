import todoCollection from './todos'
import userCollection from './users'

export default RStoreSchema.defineRelations(todoCollection, ({ collection }) => ({
  assignee: {
    to: collection(userCollection, {
      on: {
        'User.id': 'Todo.assigneeId',
      },
    }),
  },
}))
