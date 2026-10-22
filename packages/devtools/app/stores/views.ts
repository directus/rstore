import type { ViewName } from '../../src/protocol'

/** All six public inspector views, in stable navigation order. */
export const views: ViewName[] = ['collections', 'cache', 'history', 'subscriptions', 'modules', 'plugins']
/** Cache pagination and filter state, reset when collection or filter changes. */
export class CacheQuery {
  /** Selected collection name. */
  collection = ''
  /** Key substring filter evaluated before server pagination. */
  keySearch = ''
  /** Content filter evaluated before server pagination. */
  contentSearch = ''
  /** Effective/committed cache view. */
  view: 'effective' | 'committed' = 'effective'
  /** Optional cache-owned layer selection. */
  layerId: string | undefined
  /** Page start in filtered results. */
  offset = 0
  /** Bounded requested page size. */
  limit = 100
  /** Select collection and clear old page ownership. */
  select(collection: string): void {
    this.collection = collection
    this.offset = 0
    this.layerId = undefined
  }

  /** Change filters and return to first filtered page. */
  filter(keySearch: string, contentSearch: string): void {
    this.keySearch = keySearch
    this.contentSearch = contentSearch
    this.offset = 0
  }

  /** Serialize validated producer request parameters. */
  parameters(): Record<string, unknown> {
    return { collection: this.collection, keySearch: this.keySearch, contentSearch: this.contentSearch, view: this.view, ...(this.layerId ? { layerId: this.layerId } : {}), page: { offset: this.offset, limit: this.limit } }
  }
}
