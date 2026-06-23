import { addImports, addImportsDir, addServerHandler, addServerImports } from '@nuxt/kit'

/** Register generated REST API handlers. */
export function registerApiRoutes(resolve: (path: string) => string, apiPath: string) {
  addServerHandler({
    handler: resolve('./runtime/server/api/_batch.post'),
    route: `${apiPath}/_batch`,
    method: 'post',
  })
  for (const method of ['get', 'post'] as const) {
    addServerHandler({
      handler: resolve(`./runtime/server/api/index.${method}`),
      route: `${apiPath}/:collection`,
      method,
    })
  }
  for (const method of ['get', 'patch', 'delete'] as const) {
    addServerHandler({
      handler: resolve(`./runtime/server/api/[key]/index.${method}`),
      route: `${apiPath}/:collection/:key`,
      method,
    })
  }
}

/** Register runtime imports used by the generated API handlers. */
export function registerRuntimeImports(resolve: (path: string) => string) {
  addImportsDir(resolve('./runtime/utils'))
  addImports([
    'filterWhere',
  ].map(name => ({ name, from: resolve('./runtime/where') })))
  addServerImports([
    'rstoreDrizzleHooks',
    'hooksForTable',
    'allowTables',
  ].map(name => ({ from: resolve('./runtime/server/utils/hooks'), name })))
}
