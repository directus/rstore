---
name: rstore-nuxt-drizzle
description: "Use when the goal is exposing Drizzle-backed data through rstore in Nuxt: generate collections and API routes from schema, add a new Drizzle table to the rstore API, fix `Collection \"<name>\" is not allowed` errors, fetch/filter/paginate data, support create/update/delete flows, enable realtime or offline sync, and enforce table-level server access rules with `allowTables`; pair with `rstore-nuxt` for Nuxt integration and `rstore-vue` for collection/query/form behavior."
---

# Rstore Nuxt Drizzle

Generate rstore collections and API/runtime behavior from Drizzle schema metadata, then add realtime/offline and hook-based server controls as needed.
Use this skill with the `@rstore/nuxt` skill for Nuxt module/runtime behavior and with the `@rstore/vue` skill for underlying collection/query/form semantics.

## Documentation map

| Area | Documentation |
| --- | --- |
| Nuxt + Drizzle plugin overview | [https://rstore.akryum.dev/plugins/nuxt-drizzle](https://rstore.akryum.dev/plugins/nuxt-drizzle) |
| Query and filter model | [https://rstore.akryum.dev/guide/data/query](https://rstore.akryum.dev/guide/data/query) |
| Relations behavior | [https://rstore.akryum.dev/guide/schema/relations](https://rstore.akryum.dev/guide/schema/relations) |
| Realtime subscriptions | [https://rstore.akryum.dev/guide/data/live](https://rstore.akryum.dev/guide/data/live) |
| Offline behavior | [https://rstore.akryum.dev/guide/data/offline](https://rstore.akryum.dev/guide/data/offline) |
| Plugin hooks and extension points | [https://rstore.akryum.dev/guide/plugin/hooks](https://rstore.akryum.dev/guide/plugin/hooks) |
| Related package skills | `rstore-nuxt` skill (`@rstore/nuxt`), `rstore-vue` skill (`@rstore/vue`) |
| Skill-local API references | [./references/index.md](./references/index.md) |

## Core concepts

| Primitive | Purpose |
| --- | --- |
| `rstoreDrizzle.drizzleConfigPath` | Locates Drizzle config file loaded by the module |
| `drizzleConfig.schema` | Must be a single importable schema file path |
| `drizzleImport` | Defines server-side drizzle getter import used by generated handlers |
| `#build/$rstore-drizzle-collections` | Generated collections with inferred keys, meta, and relations |
| `apiPath` | Base REST route for generated CRUD handlers |
| `ws` | Enables websocket realtime handler and client plugin |
| `offline` | Enables offline sync plugins and sync config template values |
| `rstoreDrizzleHooks` / `hooksForTable` / `allowTables` | Server extension and access-control APIs |

## Quick start

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    drizzleImport: {
      name: 'useDrizzle',
      from: '~~/server/utils/drizzle',
    },
    apiPath: '/api/rstore',
  },
})
```

Also provide the server import the module expects by default:

```ts
// server/utils/drizzle.ts
export function useDrizzle() {
  // return your drizzle instance
}
```

## Task workflow

1. Confirm `drizzle.config.ts` exists and exports a config with string `schema`.
2. Configure `drizzleImport` if not using `~~/server/utils/drizzle` with `useDrizzle`.
3. Let the module generate collections and handlers; avoid parallel manual CRUD layers.
4. Query through rstore collection APIs using `findOptions.where` and supported drizzle params.
5. Enable `ws` and/or `offline` only when required by product behavior.
6. Add server-side restrictions/transforms via hook APIs (`hooksForTable`, `allowTables`, `rstoreDrizzleHooks`).
7. When adding a new Drizzle table to a project that already calls `allowTables`, register the new table in the same `allowTables([...])` list — once initialized the allow-list is permanent and unlisted tables throw `Collection "<name>" is not allowed.`.
8. For Nuxt module/runtime integration behavior, use the `rstore-nuxt` skill.
9. For non-drizzle-specific store/query/form behavior, use the `rstore-vue` skill.

## Query and cache conventions

- Prefer `findOptions.where` over the deprecated `params.where`.
- Use `findOptions.include` for relation loading; relation include objects support `where`, `orderBy`, `columns`, `limit`, and nested `include`.
- Use `params.limit`, `offset`, `columns`, `orderBy`, and `keys` to shape Drizzle-backed queries.
- Use `params.with` only as a low-level Drizzle override; when both are provided, `params.with` takes precedence over `findOptions.include`.
- Query params and request bodies are serialized with `SuperJSON`, so keep them serializable.
- The runtime plugin parses `createdAt` and `updatedAt` string values into `Date` objects through collection defaults.
- `fetchRelations` translates included relations into follow-up equality queries against the generated target collections.
- Cache filtering for `findFirst` and `findMany` reuses the same `where` and `orderBy` semantics client-side.

## Realtime and offline behavior

- `ws: true` (or object form) enables websocket handler registration and client subscription plugin wiring.
- Realtime subscriptions are keyed by collection, key, and `where`; exact filter shape impacts topic reuse.
- On websocket reconnect, the runtime re-sends active subscriptions and triggers `realtimeReconnectEventHook`, which makes `liveQuery` refresh.
- `offline` enables offline plugin generation and sync config wiring.
- Offline sync expects stable keys and usable `updatedAt` comparison values.
- `offline.serializeDateValue` exists for non-default date comparison serialization.

## Server extension points

- Use `hooksForTable(table, hooks)` to scope API hooks to a specific Drizzle table.
- Use `rstoreDrizzleHooks.hook(...)` when the extension needs to work across multiple tables.
- `*.before` hooks can call `transformQuery(({ where, extras }) => ...)` to add constraints before execution.
- Use `allowTables([...])` to deny access to unlisted generated collections.
- Use the `realtime.filter` hook to reject websocket updates for a peer when row-level rules apply.

## Guardrails

1. If drizzle config is missing, module setup is skipped after warning.
2. Non-string `schema` in drizzle config throws.
3. Multi-field relations/references are not supported by current relation inference and throw.
4. Renaming schema exports renames generated collection names.
5. Composite keys serialize as `value1::value2`; mismatches here cause lookup/update issues.
6. `params.where` is deprecated; use `findOptions.where`.
7. `allowTables` flips the default from "all tables exposed" to "deny by default". After the first call, every new Drizzle table you add to the schema must also be added to `allowTables` — otherwise endpoints throw `Collection "<name>" is not allowed.` at runtime.

## References

| Topic | Description | Reference |
| --- | --- | --- |
| API index | Full map of Nuxt-Drizzle API/config references | [api-index](./references/index.md) |
| rstoreDrizzle.drizzleConfigPath | Drizzle config lookup path | [api-drizzle-config-path](./references/api-drizzle-config-path.md) |
| rstoreDrizzle.drizzleImport | Server drizzle getter import contract | [api-drizzle-import](./references/api-drizzle-import.md) |
| rstoreDrizzle.apiPath | Generated REST base path | [api-api-path](./references/api-api-path.md) |
| rstoreDrizzle.ws | Enable websocket realtime integration | [api-ws](./references/api-ws.md) |
| rstoreDrizzle.ws.apiPath | Override websocket endpoint path | [api-ws-api-path](./references/api-ws-api-path.md) |
| rstoreDrizzle.offline | Enable offline sync integration | [api-offline](./references/api-offline.md) |
| rstoreDrizzle.offline.serializeDateValue | Customize offline sync date serialization | [api-offline-serialize-date-value](./references/api-offline-serialize-date-value.md) |
| findOptions.include | Primary relation include option | [api-find-options-include](./references/api-find-options-include.md) |
| findOptions.where | Primary drizzle filter option | [api-find-options-where](./references/api-find-options-where.md) |
| params.where (deprecated) | Legacy filter location | [api-params-where](./references/api-params-where.md) |
| params.limit | Limit rows in list queries | [api-params-limit](./references/api-params-limit.md) |
| params.offset | Offset rows in list queries | [api-params-offset](./references/api-params-offset.md) |
| params.with | Low-level Drizzle relation override | [api-params-with](./references/api-params-with.md) |
| params.columns | Selected column projection | [api-params-columns](./references/api-params-columns.md) |
| params.orderBy | Sort order format and behavior | [api-params-order-by](./references/api-params-order-by.md) |
| params.keys | Key-constrained list fetches | [api-params-keys](./references/api-params-keys.md) |
| filterWhere | Local cache condition evaluator | [api-filter-where](./references/api-filter-where.md) |
| rstoreDrizzleHooks | Global server/realtime hook bus | [api-rstore-drizzle-hooks](./references/api-rstore-drizzle-hooks.md) |
| hooksForTable | Table-scoped hook registration helper | [api-hooks-for-table](./references/api-hooks-for-table.md) |
| allowTables | Collection allow-list access control | [api-allow-tables](./references/api-allow-tables.md) |
| publishRstoreDrizzleRealtimeUpdate | Publish manual realtime updates for direct Drizzle writes | [api-publish-rstore-drizzle-realtime-update](./references/api-publish-rstore-drizzle-realtime-update.md) |
| Base @rstore/nuxt skill | Nuxt module/runtime integration semantics | `rstore-nuxt` skill |
| Base @rstore/vue skill | Underlying collection/query/form semantics | `rstore-vue` skill |

## Further reading

- Nuxt + Drizzle docs: [https://rstore.akryum.dev/plugins/nuxt-drizzle](https://rstore.akryum.dev/plugins/nuxt-drizzle)
- Query docs: [https://rstore.akryum.dev/guide/data/query](https://rstore.akryum.dev/guide/data/query)
- Live docs: [https://rstore.akryum.dev/guide/data/live](https://rstore.akryum.dev/guide/data/live)
- Offline docs: [https://rstore.akryum.dev/guide/data/offline](https://rstore.akryum.dev/guide/data/offline)
- @rstore/nuxt skill: `rstore-nuxt`
- @rstore/vue skill: `rstore-vue`
