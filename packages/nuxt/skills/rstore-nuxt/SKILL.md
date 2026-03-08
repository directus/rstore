---
name: rstore-nuxt
description: Integrate or extend `@rstore/nuxt` in Nuxt apps, layers, or Nuxt modules. Use when configuring `rstore` in `nuxt.config`, scanning collections and plugins from `rstore/` directories, relying on generated `#build` templates, using auto-imported rstore helpers, handling SSR payload cache hydration, or injecting additional collection/plugin imports through `@rstore/nuxt/api`.
---

# Rstore Nuxt

Wire `@rstore/vue` into Nuxt through module scanning, generated templates, SSR hydration, and devtools integration.
Use this skill together with the `@rstore/vue` skill for collection/query/form semantics.

## Documentation map

| Area | Documentation |
| --- | --- |
| Nuxt setup | [https://rstore.akryum.dev/guide/getting-started#nuxt](https://rstore.akryum.dev/guide/getting-started#nuxt) |
| Collections and relations | [https://rstore.akryum.dev/guide/schema/collection](https://rstore.akryum.dev/guide/schema/collection), [https://rstore.akryum.dev/guide/schema/relations](https://rstore.akryum.dev/guide/schema/relations) |
| Query and mutation model | [https://rstore.akryum.dev/guide/data/query](https://rstore.akryum.dev/guide/data/query), [https://rstore.akryum.dev/guide/data/mutation](https://rstore.akryum.dev/guide/data/mutation) |
| Cache and live updates | [https://rstore.akryum.dev/guide/data/cache](https://rstore.akryum.dev/guide/data/cache), [https://rstore.akryum.dev/guide/data/live](https://rstore.akryum.dev/guide/data/live) |
| Plugin extension model | [https://rstore.akryum.dev/guide/plugin/setup](https://rstore.akryum.dev/guide/plugin/setup), [https://rstore.akryum.dev/guide/plugin/hooks](https://rstore.akryum.dev/guide/plugin/hooks) |
| Skill-local API references | [./references/index.md](./references/index.md) |

## Core concepts

| Primitive | Purpose |
| --- | --- |
| `rstore.rstoreDirs` | Per-layer directories scanned for collections and plugins |
| `<rstoreDir>/*.ts` | Collection/relations exports included in generated schema |
| `<rstoreDir>/plugins/*.ts` | Plugin exports included in generated plugin list |
| `#build/$rstore-collection` | Generated schema template from scanned collection files |
| `#build/$rstore-plugins` | Generated plugin exports from scanned plugin files |
| `#build/$restore-options` | Generated options template (`experimentalGarbageCollection`) |
| Runtime plugin layer | Creates store, installs plugin, serializes/hydrates cache, injects `$rstore` |
| `addCollectionImport` / `addPluginImport` | Public extension hooks for other Nuxt modules |

## Quick start

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
  rstore: {
    rstoreDirs: ['rstore'],
  },
})
```

Expected layout:

```text
rstore/
  todos.ts
  users.ts
  plugins/
    remote.ts
```

## Task workflow

1. Register `@rstore/nuxt` in `modules`.
2. Keep collections and plugin files inside configured `rstoreDirs`.
3. Ensure collection files export `default` or named `const` values intended for schema assembly.
4. Use `useStore()` and auto-imports from `#imports` in app code, not ad hoc store singletons.
5. For cross-module extension, call `addCollectionImport` / `addPluginImport` from module setup.
6. Validate generated template output when debugging scan/injection issues.
7. For behavior inside collection APIs (`find*`, `query`, forms, hooks), follow [../../../vue/skills/rstore-vue/SKILL.md](../../../vue/skills/rstore-vue/SKILL.md).

## Rely on the generated runtime

- Auto-imports include `withItemType`, `defineCollection`, `defineRstorePlugin`, `defineRstoreModule`, `useStore`, `RStoreSchema`, plus related types.
- The module generates and uses `#build` templates instead of requiring manual registry wiring.
- The runtime plugin serializes cache state to `nuxtApp.payload.state.$srstore` on render and hydrates on client load.
- In development, a devtools plugin is appended automatically by runtime code.
- `experimentalGarbageCollection` is passed from module options into `createStore`.

## Extending from another Nuxt module

- `addCollectionImport(nuxt, importPath)` appends import sources merged into generated schema.
- `addPluginImport(nuxt, importPath)` appends plugin imports merged into generated plugin list.
- Use these APIs instead of mutating `_rstoreCollectionImports`/`_rstorePluginImports` directly.
- Imported collection modules should export values that are valid store schema entries.

## Guardrails

1. Collection scan warns when files export neither `default` nor named `const`.
2. Files in scanned collection directories should stay export-focused; extra exported helpers can be pulled into schema by `Object.values(...)`.
3. Avoid creating your own second Nuxt-side store instance; runtime plugin owns app store lifecycle.
4. Debug missing data by inspecting generated `#build/$rstore-collection` and `#build/$rstore-plugins`.
5. Devtools route `/__rstore` is module-owned and served/proxied by `setupDevToolsUI`; do not duplicate that wiring in app code.

## References

| Topic | Description | Reference |
| --- | --- | --- |
| API index | Full map of Nuxt API/config references | [api-index](./references/index.md) |
| rstore.rstoreDirs | Collection/plugin scan directory option | [api-rstore-dirs](./references/api-rstore-dirs.md) |
| rstore.experimentalGarbageCollection | Pass-through garbage collection option | [api-experimental-garbage-collection](./references/api-experimental-garbage-collection.md) |
| addCollectionImport | Extend generated collection imports | [api-add-collection-import](./references/api-add-collection-import.md) |
| addPluginImport | Extend generated plugin imports | [api-add-plugin-import](./references/api-add-plugin-import.md) |
| defineRstorePlugin | Nuxt alias for definePlugin | [api-define-rstore-plugin](./references/api-define-rstore-plugin.md) |
| defineRstoreModule | Nuxt alias for defineModule | [api-define-rstore-module](./references/api-define-rstore-module.md) |
| RStoreSchema | Namespaced schema helper object | [api-rstore-schema](./references/api-rstore-schema.md) |
| useStore (#imports) | Nuxt runtime store accessor | [api-use-store](./references/api-use-store.md) |
| SSR cache hydration ($srstore) | Payload cache serialization/hydration | [api-cache-hydration](./references/api-cache-hydration.md) |
| Devtools route (/__rstore) | Custom devtools UI route wiring | [api-devtools-route](./references/api-devtools-route.md) |
| Base @rstore/vue skill | Underlying collection/query/form semantics | [rstore-vue-skill](../../../vue/skills/rstore-vue/SKILL.md) |

## Further reading

- Getting started (Nuxt): [https://rstore.akryum.dev/guide/getting-started#nuxt](https://rstore.akryum.dev/guide/getting-started#nuxt)
- Query docs: [https://rstore.akryum.dev/guide/data/query](https://rstore.akryum.dev/guide/data/query)
- Cache docs: [https://rstore.akryum.dev/guide/data/cache](https://rstore.akryum.dev/guide/data/cache)
- Plugin hook docs: [https://rstore.akryum.dev/guide/plugin/hooks](https://rstore.akryum.dev/guide/plugin/hooks)
