import type { DrizzlePluginContext } from './context'
import SuperJSON from 'superjson'
import { clientIdHeaders } from './context'

/** Register REST mutation hooks. */
export function installMutationHooks(ctx: DrizzlePluginContext, hook: any) {
  hook('createItem', async (payload: any) => {
    const result: any = await ctx.requestFetch(`${ctx.apiPath}/${payload.collection.name}`, {
      method: 'POST',
      body: SuperJSON.stringify(payload.item),
      headers: clientIdHeaders(),
    })
    payload.setResult(result)
  })

  hook('updateItem', async (payload: any) => {
    const result: any = await ctx.requestFetch(`${ctx.apiPath}/${payload.collection.name}/${payload.key}`, {
      method: 'PATCH',
      body: SuperJSON.stringify(stripPrimaryKeys(payload.collection, payload.item)),
      headers: clientIdHeaders(),
    })
    payload.setResult(result)
  })

  hook('deleteItem', async (payload: any) => {
    await ctx.requestFetch(`${ctx.apiPath}/${payload.collection.name}/${payload.key}`, {
      method: 'DELETE',
      headers: clientIdHeaders(),
    })
  })
}

/** Return an item body without primary keys for PATCH requests. */
export function stripPrimaryKeys(collection: any, item: Record<string, any>) {
  const body = { ...item }
  const primaryKeys = collection.meta?.primaryKeys?.length
    ? collection.meta.primaryKeys
    : ['id']
  for (const key of primaryKeys) {
    delete body[key]
  }
  return body
}
