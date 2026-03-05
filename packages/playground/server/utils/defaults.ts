type DefaultValues = {
  [TKey in keyof Db]: Partial<Db[TKey][number]>
}

export const defaultValues = {
  users: {},
  bots: {},
  messages: {},
  todos: {
    completed: false,
  },
  collabDocuments: {
    status: 'draft' as const,
  },
} as const satisfies DefaultValues
