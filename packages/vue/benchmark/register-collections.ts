import type { Collection } from '../src'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { addCollection, addCollections, createStore } from '../src'

const rowCount = 5000

async function measure(collectionCount: number, bulk: boolean) {
  let rowVisits = 0
  const store = await createStore({
    plugins: [],
    schema: [{
      name: 'metadata',
      getKey: (item) => {
        rowVisits++
        return item.id
      },
    }],
  })
  try {
    for (let i = 0; i < rowCount; i++) {
      store.metadata.writeItem({ id: String(i), label: `Field ${i}` })
    }
    const collections: Collection[] = Array.from({ length: collectionCount }, (_, i) => ({
      name: `items${i}`,
      relations: { metadata: { to: { metadata: { on: { id: 'metadataId' } } } } },
    }))
    rowVisits = 0
    const start = performance.now()
    if (bulk) {
      addCollections(store, collections)
    }
    else {
      for (const collection of collections) addCollection(store, collection)
    }
    const durationMs = performance.now() - start
    const visits = rowVisits
    assert.equal(visits, rowCount * (bulk ? 1 : collectionCount))

    for (const name of ['items0', `items${collectionCount - 1}`]) {
      const collection = store.$collection(name)
      collection.writeItem({ id: 'test', metadataId: '7' })
      assert.equal(collection.peekFirst('test')?.metadata.label, 'Field 7')
    }
    return { collectionCount, bulk, rowVisits: visits, durationMs }
  }
  finally {
    store.$cache.dispose()
  }
}

async function main() {
  const results = []
  await measure(10, false)
  await measure(10, true)
  for (const collectionCount of [20, 120]) {
    for (let repeat = 0; repeat < 5; repeat++) {
      // Alternate order so one mode does not always get the warmer runtime.
      for (const bulk of repeat % 2 ? [true, false] : [false, true]) {
        results.push(await measure(collectionCount, bulk))
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ rowCount, results }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
