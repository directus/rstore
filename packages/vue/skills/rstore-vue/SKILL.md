---
name: rstore-vue
description: Use when the goal is handling app data in Vue with `@rstore/vue`: fetch items/lists, keep queries reactive or live, create/update/delete records with forms, manage cache consistency, and debug store/query/subscription behavior across collections.
---

# Rstore Vue

Build typed, cache-first Vue data flows with `@rstore/vue`, including core engine and shared contract behavior.

## Documentation map

| Area | Documentation |
| --- | --- |
| Getting started | [https://rstore.akryum.dev/guide/getting-started#vue](https://rstore.akryum.dev/guide/getting-started#vue) |
| Collection schema | [https://rstore.akryum.dev/guide/schema/collection](https://rstore.akryum.dev/guide/schema/collection) |
| Relations | [https://rstore.akryum.dev/guide/schema/relations](https://rstore.akryum.dev/guide/schema/relations) |
| Query and live query | [https://rstore.akryum.dev/guide/data/query](https://rstore.akryum.dev/guide/data/query), [https://rstore.akryum.dev/guide/data/live](https://rstore.akryum.dev/guide/data/live) |
| Mutations and forms | [https://rstore.akryum.dev/guide/data/mutation](https://rstore.akryum.dev/guide/data/mutation), [https://rstore.akryum.dev/guide/data/form](https://rstore.akryum.dev/guide/data/form) |
| Cache and modules | [https://rstore.akryum.dev/guide/data/cache](https://rstore.akryum.dev/guide/data/cache), [https://rstore.akryum.dev/guide/data/module](https://rstore.akryum.dev/guide/data/module) |
| Plugin setup and hooks | [https://rstore.akryum.dev/guide/plugin/setup](https://rstore.akryum.dev/guide/plugin/setup), [https://rstore.akryum.dev/guide/plugin/hooks](https://rstore.akryum.dev/guide/plugin/hooks) |
| Collaboration plugin (Yjs) | [https://rstore.akryum.dev/plugins/yjs](https://rstore.akryum.dev/plugins/yjs) |
| Skill-local API references | [./references/index.md](./references/index.md) |

## Core concepts

| Primitive | Purpose |
| --- | --- |
| `withItemType(...).defineCollection(...)` | Defines a typed collection contract before using it in components |
| `defineRelations(...)` | Defines normalized cross-collection relations once |
| `addCollectionRelations(store, relations)` | Adds relation blocks after store creation when schema is composed dynamically |
| `createStore({ schema, plugins, ... })` | Builds store core, cache, hook system, and per-collection API proxies |
| `RstorePlugin` / `setActiveStore` | Injects store into Vue or non-component/test contexts |
| `store.<collection>` and `store.$collection(name)` | Entry point for read/write/query/form operations |
| `query` / `liveQuery` | Reactive queries with loading/error/meta/pagination semantics |
| `realtimeReconnectEventHook` | Shared reconnect signal used by realtime transports; `liveQuery` refreshes when it fires |
| `useQueryTracking` | Tracks query membership and filters dirty cached items in reactive flows |
| `createForm` / `updateForm` / `createFormObject` | Mutation and validation workflow with submit/reset/change tracking |
| `definePlugin({ ... })` | Extends fetch/cache/mutation/subscribe/sync behavior via hooks |
| `defineModule(name, cb)` | Creates store-scoped reusable logic with per-store caching |
| `@rstore/core` primitives | Backing implementation for collection/schema, find/peek/mutation/subscription behavior |
| `@rstore/shared` types + hooks | Cross-package contracts for options, meta, payloads, and utilities |

## Quick start

```ts
import { createStore, RstorePlugin, withItemType } from '@rstore/vue'

export const todos = withItemType<Todo>().defineCollection({
  name: 'todos',
})

const store = await createStore({
  schema: [todos],
  plugins: [],
})

app.use(RstorePlugin, { store })
```

## Task workflow

1. Define collections and relations first.
2. Create a store with `createStore({ schema, plugins })`.
3. Install `RstorePlugin` in app code or set `setActiveStore(store)` in tests/non-injection contexts.
4. Use collection APIs (`find*`, `query`, `liveQuery`) instead of custom fetch refs.
5. Use `createForm`/`updateForm` for mutation UIs and `createFormObject` for custom flows.
6. Move transport/data-source behavior into `definePlugin` hooks, not component-level code.
7. When behavior is unclear, check docs and skill references first; if docs are incomplete or wrong, fix docs before updating this skill.

## Query and form guidance

| API | Use it for |
| --- | --- |
| `peekFirst` / `peekMany` | Cache-only reads for computed/reactive derivations |
| `findFirst` / `findMany` | One-shot async reads without long-lived query refs |
| `query` | Reactive ref-based queries (`data`, `loading`, `error`, `refresh`) |
| `liveQuery` | Query + subscription lifecycle for realtime adapters |
| `fetchMore` | Adds page results to sparse `pages` and merged `data` |
| `createForm` / `updateForm` | Preferred mutation UX; `updateForm` can prefetch item and send changed fields only |
| `createFormObject` | Lower-level custom form builder with schema validation and hooks |

Notes:

- `createFormObject` supports `validateOnSubmit`, `transformData`, `resetOnSuccess`, `$changedProps`, and `$valid`.
- Form objects expose `$opLog` for undo/redo and optimized form operations.
- Use `$rebase`, `$conflicts`, and `$resolveConflict` for collaborative editing flows.
- `$save()` and `$onSaved()` are deprecated compatibility aliases. Prefer `$submit()` and `$onSuccess()`.

## Modules and plugins

- `defineModule(name, cb)` caches module instances in `store.$modulesCache`.
- `defineModule` requires injection context or an explicit/active store.
- `definePlugin({ name, category, scopeId?, setup })` is the extension point for fetch/cache/mutation/subscription/sync hooks.
- `realtimeReconnectEventHook` should be triggered by realtime plugins only after transport recovery; `liveQuery` refreshes automatically when it fires.
- `addCollectionDefaults(...)` is the right place for shared field parsing/default behavior.
- Keep plugin behavior keyed by store/scope instead of global mutable state.

## Guardrails

1. Calling `useStore()` without installation/active store throws.
2. `defineModule` outside setup without an available store throws.
3. Query `no-cache` and `cache-*` behaviors differ materially; align changes with the documented query fetch-policy behavior.
4. `experimentalGarbageCollection` affects query tracking behavior; use only with explicit coverage.
5. Dynamic `store.$collection(name)` calls throw for unknown collection names.
6. Avoid duplicating entity state outside store cache unless intentionally divergent.

## References

| Topic | Description | Reference |
| --- | --- | --- |
| API index | Full map of all API-element references | [api-index](./references/index.md) |
| withItemType | Typed collection builder entry point | [api-with-item-type](./references/api-with-item-type.md) |
| defineCollection | Untyped collection declaration helper | [api-define-collection](./references/api-define-collection.md) |
| defineRelations | Relation declaration helper | [api-define-relations](./references/api-define-relations.md) |
| addCollectionRelations | Add relation blocks after store creation | [api-add-collection-relations](./references/api-add-collection-relations.md) |
| createStore | Create store instance and lifecycle | [api-create-store](./references/api-create-store.md) |
| addCollection | Register a collection dynamically | [api-add-collection](./references/api-add-collection.md) |
| removeCollection | Unregister a collection dynamically | [api-remove-collection](./references/api-remove-collection.md) |
| RstorePlugin | Vue app plugin installation | [api-rstore-plugin](./references/api-rstore-plugin.md) |
| useStore | Injected/active store access | [api-use-store](./references/api-use-store.md) |
| setActiveStore | Explicit active store binding | [api-set-active-store](./references/api-set-active-store.md) |
| definePlugin | Store plugin authoring API | [api-define-plugin](./references/api-define-plugin.md) |
| defineModule | Store-scoped module authoring API | [api-define-module](./references/api-define-module.md) |
| createFormObject | Low-level form object API | [api-create-form-object](./references/api-create-form-object.md) |
| createFormObjectWithChangeDetection | Deprecated alias for createFormObject | [api-create-form-object-with-change-detection](./references/api-create-form-object-with-change-detection.md) |
| optimizeOpLog | Utility to optimize form operation logs | [api-optimize-op-log](./references/api-optimize-op-log.md) |
| useQueryTracking | Query membership/dirty-item tracking | [api-use-query-tracking](./references/api-use-query-tracking.md) |
| store.$wrapMutation | Wrap custom mutations in store mutation lifecycle | [api-wrap-mutation](./references/api-wrap-mutation.md) |
| peekFirst | Cache-only first-item read | [api-peek-first](./references/api-peek-first.md) |
| findFirst | Async first-item read | [api-find-first](./references/api-find-first.md) |
| peekMany | Cache-only list read | [api-peek-many](./references/api-peek-many.md) |
| findMany | Async list read | [api-find-many](./references/api-find-many.md) |
| query | Reactive query object API | [api-query](./references/api-query.md) |
| liveQuery | Query + subscription lifecycle | [api-live-query](./references/api-live-query.md) |
| realtimeReconnectEventHook | Shared reconnect event hook for realtime transports | [api-realtime-reconnect-event-hook](./references/api-realtime-reconnect-event-hook.md) |
| subscribe | Subscription API for updates | [api-subscribe](./references/api-subscribe.md) |
| create | Single-item create mutation | [api-create](./references/api-create.md) |
| createMany | Batch create mutation | [api-create-many](./references/api-create-many.md) |
| createForm | Create-form mutation helper | [api-create-form](./references/api-create-form.md) |
| update | Single-item update mutation | [api-update](./references/api-update.md) |
| updateMany | Batch update mutation | [api-update-many](./references/api-update-many.md) |
| updateForm | Update-form mutation helper | [api-update-form](./references/api-update-form.md) |
| delete | Single-item delete mutation | [api-delete](./references/api-delete.md) |
| deleteMany | Batch delete mutation | [api-delete-many](./references/api-delete-many.md) |
| writeItem | Write/override item in cache | [api-write-item](./references/api-write-item.md) |
| clearItem | Remove item from cache view | [api-clear-item](./references/api-clear-item.md) |

## Further reading

- Guide index: [https://rstore.akryum.dev/guide/learn-more](https://rstore.akryum.dev/guide/learn-more)
- Query docs: [https://rstore.akryum.dev/guide/data/query](https://rstore.akryum.dev/guide/data/query)
- Mutation docs: [https://rstore.akryum.dev/guide/data/mutation](https://rstore.akryum.dev/guide/data/mutation)
- Form docs: [https://rstore.akryum.dev/guide/data/form](https://rstore.akryum.dev/guide/data/form)
- Plugin hook docs: [https://rstore.akryum.dev/guide/plugin/hooks](https://rstore.akryum.dev/guide/plugin/hooks)
- Yjs plugin docs: [https://rstore.akryum.dev/plugins/yjs](https://rstore.akryum.dev/plugins/yjs)
