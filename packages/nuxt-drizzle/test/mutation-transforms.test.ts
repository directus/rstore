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

  return {
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
            returning: async () => [{ id: 1, tenantId: 'tenant-a', title: 'after' }],
          }
        },
      }),
    }),
    delete: () => ({
      where: async (predicate: any) => {
        deletePredicates.push(predicate)
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
    await drizzleUpdate({
      event: {} as any,
      collection: 'todos',
      key: '1',
      params: {},
      query: {},
      body: { title: 'after' },
    })
  }
  else {
    await drizzleDelete({
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
})
