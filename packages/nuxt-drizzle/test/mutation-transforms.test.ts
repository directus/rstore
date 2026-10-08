import type { RstoreDrizzleItemPatchAfterHookPayload } from '../src/runtime/server/utils/hooks'
import { and, eq } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: undefined as any,
  todos: undefined as any,
}))

vi.mock('$rstore-drizzle-server-utils.js', async () => {
  const { integer, sqliteTable, text } = await import('drizzle-orm/sqlite-core')
  const todos = sqliteTable('todos', {
    id: integer('id').primaryKey(),
    tenantId: text('tenant_id'),
    title: text('title'),
  })
  state.todos = todos

  return {
    dialect: 'sqlite',
    tables: { todos },
    collectionMetas: { todos: { table: 'todos', primaryKeys: ['id'] } },
    collectionRelations: { todos: {} },
    useDrizzles: { default: () => state.db },
  }
})

const { drizzleDelete, drizzleUpdate } = await import('../src/runtime/server/utils/operations')
const { rstoreDrizzleHooks } = await import('../src/runtime/server/utils/hooks')
const { applyTransforms } = await import('../src/runtime/server/utils/operations/shared')

const sqliteDialect = new SQLiteSyncDialect()

/** Records every predicate used to read a mutation pre-image and to write it. */
function createMutationDb() {
  const preImagePredicates: any[] = []
  const updatePredicates: any[] = []
  const deletePredicates: any[] = []
  const write = {
    /** Signals that the adapter reached the DB write rather than a setup hook. */
    entered: false,
    /** External DB reply held by completion scenarios. */
    completion: Promise.resolve(),
  }

  return {
    write,
    preImagePredicates,
    updatePredicates,
    deletePredicates,
    query: {
      todos: {
        findFirst: async ({ where }: { where: any }) => {
          preImagePredicates.push(where)
          return { id: 1, tenantId: 'tenant-a', title: 'before' }
        },
      },
    },
    update: () => ({
      set: () => ({
        where: (predicate: any) => {
          updatePredicates.push(predicate)
          return {
            returning: async () => {
              write.entered = true
              await write.completion
              return [{ id: 1, tenantId: 'tenant-a', title: 'after' }]
            },
          }
        },
      }),
    }),
    delete: () => ({
      where: async (predicate: any) => {
        deletePredicates.push(predicate)
        write.entered = true
        await write.completion
      },
    }),
  }
}

/** Compiles a Drizzle predicate to the SQL statement and bindings it would use. */
function compilePredicate(predicate: any) {
  return sqliteDialect.sqlToQuery(predicate)
}

/** Calls one keyed mutation using the shared fake database. */
async function runMutation(operation: 'update' | 'delete') {
  if (operation === 'update') {
    return drizzleUpdate({
      event: {} as any,
      collection: 'todos',
      key: '1',
      params: {},
      query: {},
      body: { title: 'after' },
    })
  }
  else {
    return drizzleDelete({
      event: {} as any,
      collection: 'todos',
      key: '1',
      params: {},
      query: {},
    })
  }
}

beforeEach(() => {
  state.db = createMutationDb()
})

afterEach(() => {
  ;(rstoreDrizzleHooks as any)._hooks = {}
})

describe('mutation transforms', () => {
  it('ignores extras when no accumulator is supplied', () => {
    const ignoredExtras = Object.defineProperty({}, 'mustNotRead', {
      enumerable: true,
      get: () => {
        throw new Error('mutation extras must remain ignored')
      },
    })
    const predicates: any[] = []

    applyTransforms([(builder) => {
      builder.where(eq(state.todos.tenantId, 'tenant-a'))
      builder.extras(ignoredExtras)
    }], predicates)

    expect(compilePredicate(predicates[0]).params).toEqual(['tenant-a'])
  })

  it.each([
    ['update', 'item.patch.before', 'updatePredicates'],
    ['delete', 'item.delete.before', 'deletePredicates'],
  ] as const)('%s scopes pre-image and write predicates', async (operation, hookName, writeField) => {
    rstoreDrizzleHooks.hook(hookName, ({ transformQuery }) => {
      transformQuery(builder => builder.where(eq(state.todos.tenantId, 'tenant-a')))
    })

    await runMutation(operation)

    const expectedPredicate = compilePredicate(and(
      eq(state.todos.id, 1),
      eq(state.todos.tenantId, 'tenant-a'),
    ))
    expect(state.db.preImagePredicates.map(compilePredicate)).toEqual([expectedPredicate])
    expect(state.db[writeField].map(compilePredicate)).toEqual([expectedPredicate])
  })

  it.each([
    ['update', 'item.patch.after'],
    ['delete', 'item.delete.after'],
  ] as const)('%s publishes its pre-image and result only after the DB write completes', async (operation, hookName) => {
    const completion = Promise.withResolvers<void>()
    state.db.write.completion = completion.promise
    const published: unknown[] = []
    rstoreDrizzleHooks.hook(hookName, (payload: RstoreDrizzleItemPatchAfterHookPayload<any>) => {
      const snapshot: Record<string, unknown> = { result: structuredClone(payload.result) }
      if ('previousRecord' in payload) {
        snapshot.previousRecord = structuredClone(payload.previousRecord)
      }
      published.push(snapshot)
      payload.setResult({ id: 1, title: 'hook result' })
    })
    let settled = false
    const pending = runMutation(operation)
    void pending.then(
      () => { settled = true },
      () => { settled = true },
    )
    try {
      await expect.poll(() => state.db.write.entered, { timeout: 500, message: 'mutation reaches held DB write' }).toBe(true)
      expect(published).toEqual([])
      expect(settled).toBe(false)
    }
    finally {
      // Always release external work, including when a premature hook assertion fails.
      completion.resolve()
      await expect.poll(() => settled, { timeout: 500, message: 'mutation completes after DB reply' }).toBe(true)
      await pending
    }

    expect(published).toEqual(operation === 'update'
      ? [{
          result: { id: 1, tenantId: 'tenant-a', title: 'after' },
          previousRecord: { id: 1, tenantId: 'tenant-a', title: 'before' },
        }]
      : [{ result: { id: 1, tenantId: 'tenant-a', title: 'before' } }])
    expect(await pending).toEqual({ id: 1, title: 'hook result' })
  })
})
