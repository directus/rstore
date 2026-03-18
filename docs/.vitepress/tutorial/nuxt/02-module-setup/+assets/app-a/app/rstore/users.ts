import type { User } from './types'

export default RStoreSchema.withItemType<User>().defineCollection({
  name: 'User',
  getKey: item => item.id,
  hooks: {},
})
