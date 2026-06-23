import type { DrizzlePluginContext } from './context'
import { filterWhere } from '../where'

/** Register cache filtering and ordering hooks. */
export function installCacheHooks(ctx: DrizzlePluginContext, hook: any) {
  hook('cacheFilterFirst', (payload: any) => {
    const where = payload.findOptions?.where ?? payload.findOptions?.params?.where
    if (where) {
      const items = payload.readItemsFromCache()
      payload.setResult(items.find((item: any) => filterWhere(item, where, ctx.dialect)))
    }
  })

  hook('cacheFilterMany', (payload: any) => {
    const where = payload.findOptions?.where ?? payload.findOptions?.params?.where
    const orderBy = payload.findOptions?.params?.orderBy
    if (!where && !orderBy) {
      return
    }

    let items = payload.getResult()
    if (where) {
      items = items.filter((item: any) => filterWhere(item, where, ctx.dialect))
    }
    if (orderBy) {
      items.sort(compareByOrder(orderBy))
    }
    payload.setResult(items)
  })
}

function compareByOrder(orderBy: string[]) {
  return (a: any, b: any) => {
    for (const param of orderBy) {
      const [key, order] = param.split('.')
      if (a[key!] < b[key!]) {
        return order === 'asc' ? -1 : 1
      }
      if (a[key!] > b[key!]) {
        return order === 'asc' ? 1 : -1
      }
    }
    return 0
  }
}
