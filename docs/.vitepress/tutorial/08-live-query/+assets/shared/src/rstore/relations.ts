import { defineRelations } from '@rstore/vue'
import type { TodoCollection, UserCollection } from './schema'

export function defineTodoRelations(todoCollection: typeof TodoCollection, userCollection: typeof UserCollection) {
  return defineRelations(todoCollection, ({ collection }) => ({
    assignee: {
      to: collection(userCollection, {
        on: {
          'User.id': 'Todo.assigneeId',
        },
      }),
    },
  }))
}
