import type { ReadRequest, Target } from '@rstore/devtools/protocol'
import type { Cache } from '@rstore/shared'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'
import { createStoreCore } from '@rstore/core'
import { createRstoreDevtools } from '@rstore/devtools'
import { READ_METHODS, validateReadResult } from '@rstore/devtools/protocol'
import { createHooks } from '@rstore/shared'

// This consumer deliberately supplies an inspect-only application cache. It
// proves real Core construction/registration without importing Vue's cache;
// cache mutation behavior belongs to the existing real-cache integration suite.
const rows = new Map<string, unknown>([['portable', { id: 'portable', title: 'Outside workspace' }]])
/** Lazy borrowed rows from this application's independent cache. */
function* inspectRows() {
  for (const [key, value] of rows)
    yield { key, value }
}
/** Unsupported application operations fail visibly rather than simulate writes. */
function unsupported(): never {
  throw new Error('Inspection-only application cache')
}
const readers = {
  inspect: () => ({
    collections: [{ name: 'todos', count: rows.size, effectiveCount: rows.size, rows: inspectRows, effectiveRows: inspectRows }],
    layers: () => [],
    metadata: () => ({ owner: 'isolated-consumer' }),
  }),
  getState: () => ({}),
}
const cache = new Proxy(readers, {
  get: (owner, key) => Reflect.get(owner, key) ?? unsupported,
}) as unknown as Cache

/** Exercise installed neutral API with no framework or DOM environment. */
async function main() {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)
  const require = createRequire(import.meta.url)
  for (const dependency of ['vue', 'nuxt', 'vite', '@rstore/vue'])
    assert.throws(() => require.resolve(dependency), { code: 'MODULE_NOT_FOUND' })

  const runtime = createRstoreDevtools({ sessionId: 'packed-node-only' })
  const store = await createStoreCore({
    schema: [{ name: 'todos' }],
    cache,
    hooks: createHooks(),
    syncImmediately: false,
    plugins: [runtime.plugin({ id: 'application', readOnly: true })],
  })
  assert.equal(store.$cache, cache)
  const target: Target = runtime.listStores()[0]!.target
  assert.equal(target.sessionId, 'packed-node-only')
  let inspectedViews = 0
  for (const method of READ_METHODS) {
    if (method === 'rstore:list-sessions' || method === 'rstore:list-stores')
      continue
    const request: ReadRequest = method === 'rstore:get-cache'
      ? { method, target, collection: 'todos' }
      : { method, target }
    const reply = runtime.read(request)
    validateReadResult(method, reply, target)
    inspectedViews++
  }
  assert.equal(inspectedViews, 6)
  const page = runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' }).data
  assert.deepEqual(page.rows.map((row: { key: string | number }) => row.key), ['portable'])
  assert.match(JSON.stringify(page), /Outside workspace/)
  runtime.dispose()
  assert.equal(runtime.listStores().length, 0)
  assert.throws(() => runtime.resolve(target), /Devtools runtime disposed/)
  process.stdout.write('Packed Core-only consumer passed\n')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
