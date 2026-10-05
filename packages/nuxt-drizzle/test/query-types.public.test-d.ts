import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'
import type { QueryManyOptions, VueStore } from '@rstore/vue'
import '../src/runtime/types.ts'

interface HoldsCollection extends Collection<{ id: string, status: string }> {
  name: 'holds'
}

type HoldsSchema = StoreSchema<[HoldsCollection]>
type HoldsQueryOptions = QueryManyOptions<HoldsCollection, CollectionDefaults, HoldsSchema>

declare const store: VueStore<HoldsSchema, CollectionDefaults>

const options = {
  where: { operator: 'eq', field: 'status', value: 'held' },
} satisfies HoldsQueryOptions

store.holds.liveQuery(query => query.many(options))
