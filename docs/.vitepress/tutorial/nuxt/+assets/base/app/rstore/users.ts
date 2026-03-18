import type { User } from './types'

export default RStoreSchema.withItemType<User>().defineCollection({
  name: 'User',
  getKey: item => item.id,
  hooks: {
    fetchFirst: ({ key }) => key ? $fetch(`/api/users/${key}`) : undefined,
    fetchMany: () => $fetch('/api/users'),
  },
})
