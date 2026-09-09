# rstore Contributing Guide

Welcome! We are really excited that you are interested in contributing to rstore! Before submitting your contribution, please make sure to take a moment and read through the following guide:

## Means of Contributing

Contributing doesn't necessarily mean you need to write code and open Pull Requests. There are many other ways you can help the project!

- Try the [latest version](https://github.com/Akryum/rstore/releases) of rstore and [report bugs](https://github.com/Akryum/rstore/issues/new?assignees=&labels=to+triage&template=bug-report.yml).
- Discuss your ideas with the community on the [discussion board](https://github.com/Akryum/rstore/discussions).
- Answer to other people's questions.
- Report typos or issues of the docs.
- Support us financially on GitHub sponsors:
  - [Guillaume](https://github.com/sponsors/Akryum)
- Do you like rstore? Spread the love on social media!

## Packages

This mono-repo contains the following packages:

| Package | Description |
| ------- | ----------- |
| [@rstore/core](./packages/core) | Core reusable logic |
| [@rstore/shared](./packages/shared) | Common types and utils |
| [@rstore/vue](./packages/vue) | Vue integration |
| [@rstore/nuxt](./packages/nuxt) | Nuxt integration |
| [@rstore/nuxt-drizzle](./packages/nuxt-drizzle) | Nuxt + Drizzle integration |
| [playground](./packages/playground) | Playground app |

## Local dev setup

1. Install dependencies with [pnpm](https://pnpm.io/):

```sh
npm install --global corepack
corepack enable
pnpm i
```

Use Node 26 or newer. Node 25+ no longer ships Corepack, so install it before
enabling the pnpm version pinned in `package.json`.

2. Compile rstore in dev mode:

```sh
pnpm run dev
```

## Running tests

### Linting

We use ESLint to check for code quality and style.

```sh
# Root of the mono-repo
pnpm run lint
```

### Test layers

We use [Vitest](https://vitest.dev/) for everything except the browser suites. The root
`vitest.config.ts` defines four projects:

| Layer | Where | Run it with | Use it for |
| --- | --- | --- | --- |
| `unit` | `packages/*/test/**/*.{spec,test}.ts`, excluding the other projects | `pnpm test --project unit` | Exported algorithms, utilities and standalone API contracts. |
| `integration` | `packages/*/test/integration/**` | `pnpm test --project integration` | Real stores/cache/reactivity with a stateful fake remote; connector suites also exercise HTTP and storage. |
| `nuxt` | `packages/nuxt*/test/**`, except boot and integration files | `pnpm test --project nuxt` | Nuxt runtime and module behaviour without a full boot. |
| `nuxt-boot` | the three `test/basic.test.ts` files | `pnpm test --project nuxt-boot` | The Nuxt module builds and server-renders. |
| e2e | `packages/playground*/e2e/**` | `pnpm test:e2e` | Browser behaviour, SSR and realtime against a running app. |

Run everything with:

```sh
# Root of the mono-repo
pnpm run test
```

For an in-process coverage report, run `pnpm test:coverage`. It reports every
shipped `packages/*/src` tree exercised by the `unit`, `nuxt`, and
`integration` projects, excluding browser playgrounds, generated files and
type-only declarations. Nuxt boot and browser suites start child processes, so
their V8 data is not merged into this report. CI uploads the HTML, LCOV, and
JSON summary as a `coverage-report` artifact; totals are reported for
visibility, not yet used as thresholds.

For developing:

```sh
# Root of the mono-repo
pnpm run test:dev
```

Package `test` and `test:watch` scripts delegate to this root config and set
`RSTORE_TEST_PACKAGE` to their package folder name. The config excludes other
packages, so extra filename arguments narrow discovery within that package.
For example, `pnpm --filter @rstore/connector-toolkit test codegen.test.ts`
runs only that file. Do not run bare Vitest from a
package directory: Vitest 5 does not search parent directories for config, and
the root aliases and project exclusions would be missing.

The Monospace boot fixture shares runtime source aliases from
`test/utils/sourceAliases.ts`. Its Nuxt/Nitro build runs outside Vitest's
resolver and must not bundle the Jiti-backed `dist` stubs created by `pnpm install`.

### Writing an integration test

An integration test wires the actual pieces together: `createStore`, its cache, hooks and Vue reactivity.
Core/Shared/Vue workflows substitute only the external backend with the shared stateful fake remote.
Reach for this layer when a bug could hide
*between* two units — a query option translated into the wrong request, a response the cache stores
in a shape the filter can't read, an optimistic layer that is never rolled back.

Rules of the road:

- No external infrastructure. In-memory SQLite and localhost servers only, so `pnpm test` works on a
  clean checkout with no Docker and no network.
- Reuse the shared store helpers in `test/utils/store/` and the per-package
  `test/integration/utils/` stacks. Import them
  through the `#test-utils` alias, never through a `../../../../test/utils/…` path.
- A fake backend must **not** reuse `@rstore/connector-toolkit`'s filter engine. The client-side
  cache filter runs on that engine, so a fake sharing it could never reveal a server/cache
  divergence. Write the small explicit evaluator instead, and make it throw on operators it does not
  know.
- Fake remote storage, responses, and recorded request values must be deeply detached. Client
  parsing or later edits must never change backend rows or rewrite recorded wire evidence.
  Preserve function-option identity when snapshotting requests; reuse the existing clone dependency.
  Execute held requests from the same captured values, including custom handlers and batch payloads.
  Keep store, collection, response metadata and response callbacks live at the plugin boundary.
- Race tests must reuse the same item key with different field values, not only different result
  memberships. Hold overlapping requests, settle them in reverse order, and check query/cache values
  plus loading, error, and completion state. Include shared deduped consumers and deferred cache writes.
  Assert response metadata for every deduped consumer, including background completion. For shared
  utilities that temporarily change wrapped-item behavior, prove public behavior recovers after errors.
- Retry directly from `catch` or plain `try/await/catch` before asserting the eventual result;
  awaiting a rejection matcher can hide delayed cleanup. Include consumers joining after a background
  query's initial result resolves. Exercise repeated indexed `fetchMore()` calls as well as `refresh()`:
  both can overlap, and deduped page loads must still publish for the newest consumer.
- Both `unit` and `integration` alias Core, Shared, Vue, and connector-toolkit package roots to
  **sources**, so cross-package tests see current code without `pnpm build`. These are exact matches;
  connector-toolkit's public `/vite` entry has a separate source alias. Nuxt projects retain their
  existing build setup. Project exclusions prevent a runtime spec from executing twice.
- Before trusting a replacement, inject a plausible defect in an isolated copy of the current
  working tree and check its behavioral assertion fails. Never inject faults into a shared checkout.
  Do not use `it.fails`, skips, or coverage exclusions to hide a discovered product defect.

### Unit or integration?

A spec stays **unit** when it exercises an exported algorithm, utility or standalone form contract.
Store-backed workflows belong in **integration**, including request dispatch/deduplication, cache
reads after writes, backend rows after mutations and values observed by another query.

- The `packages/core` mutation, query, batch, plugin and store suites moved to
  `packages/core/test/integration/`. The `mockStore` object literal whose `$cache` members were
  `vi.fn()`s is gone, and with it every `expect($cache.addLayer).toHaveBeenCalled()` — an assertion
  that proves a call happened, never that a read sees its result.
- Exported algorithm and utility contracts stay unit: Core HLC/CRDT, collections, fetch-policy,
  marker identity, tombstones and plugin sorting; Shared utilities; standalone Vue form APIs in
  `packages/vue/test/form/`; package-root export and `*.test-d.ts` contracts.
- Store-backed Vue cache/query/form workflows live in `packages/vue/test/integration/{cache,query,forms}/`.
  Form defaults and submit options use the stateful fake remote. Inline collection hooks remain valid
  fixtures where the collection-hook adapter itself is the boundary under test.
- A unit spec may still need a real store — a form resolving a relation from the cache, for one.
  `#test-utils/store/*` is reachable from the `unit` project too, so reach for it rather than for a
  `{ $cache: {} } as any` cast, which silently sends the code under test down its disabled branch.
- A suite deleted as redundant names its replacement file and exact test in
  `plans/22-boundary-parity.md`. Check replacement strength with isolated faults; retain distinct Core
  operation and Vue reactive-consumer contracts even when their test titles sound similar.

### The store test harness

The `packages/{core,shared,vue}` suites share one harness in `test/utils/store/`, next to the
connector helpers in `test/utils/`. Everything under `test/utils/` is reachable from any package as
`#test-utils/…`: the alias is set on the `unit` and `integration` vitest projects and mirrored by
`paths` in `packages/{core,shared,vue}/tsconfig.json` and `tsconfig.integration.json`.

A suite builds one **stack** — a real store, on the real cache, talking to one fake backend:

```ts
import { createVueStack } from '#test-utils/store/vueStack'

const stack = await createVueStack({
  schema: [{ name: 'todos' }],
  data: { todos: [{ id: '1', title: 'One' }] },
})
```

No `disposers` array and no `afterEach`: the stack registers its own teardown with
`onTestFinished`. Build it inside the `it` body, which is where every suite builds one today.

| Helper | What it gives you |
| --- | --- |
| `createVueStack` (`vueStack.ts`) | The real Vue `createStore` on the real cache with a fake backend: `{ store, cache, remote, run, scope, collection, read, readMany, dispose }`. `run` opens live queries in the stack's effect scope; `scope(fn)` opens a child scope that stands in for one component. |
| `createCoreStack` (`coreStack.ts`) | Core operations backed by a real Vue store/cache: `{ store, cache, remote, collection, read, readMany, dispose }`. |
| `withInjectionContext` / `withScope` / `runInTestScope` (`vueApp.ts`) | Real injection or effect scope; `runInTestScope` registers automatic scope teardown for standalone consumers. |
| `mountStoreComponent` (`mountedComponent.ts`) | Actual Vue component setup and unmount through `createRenderer`, with a minimal in-memory host and automatic cleanup. |
| `createTestStore` (`integrationStore.ts`) | Typed real store with automatic cache disposal for direct Cache/collection-hook contracts. Pair queries with `runInTestScope`; prefer `createVueStack` for workflows. |
| `stubWindow` (`windowStub.ts`) | An `EventTarget`-backed `window` with a `localStorage`. Kept out of `vueApp.ts` so the unit-layer specs that use it don't drag `@rstore/vue` sources into their package's `tsc` run. |
| `serializeCacheState` / `hydrate` (`ssr.ts`) | Round-trips a `getState()` payload through the shape Nuxt uses, with a `structuredClone` so two stores can never share a live reference. |

Both factories take the same options, on top of everything their `createStore` accepts
(`isServer`, `batching`, `findDefaults`, …):

| Option | What it does |
| --- | --- |
| `schema` | The collections of the store. |
| `data` | Initial backend rows, keyed by collection name. |
| `keys` | Key field, key function, or one of either per collection. Defaults to `'id'`. |
| `on` | Persistent per-hook deviations from the default CRUD behaviour. |
| `batch` | Registers batch hooks. `true` means `['batchFetch', 'batchMutate']`; off by default, since a batch hook resolves the operations the per-item hooks would have answered. |
| `remote` | `false` registers no remote plugin (what a plugin-ordering suite needs). An existing `FakeRemote` shares one backend between two stores, which is how an SSR boundary is reproduced. |
| `plugins` | Extra plugins, registered after the remote. A function receives the remote. |
| `autoDispose` | `false` to opt out of `onTestFinished` and call `stack.dispose()` yourself. |

`stack.remote` is the scripted backend: `requests()` / `lastRequest()` / `callCount()` per hook
(carrying the resolved `findOptions`), `failNext` / `holdNext` / `respondNext` / `latency` for
failure and race scripting, `rows()` / `seed()` / `getKey()` on the rows, `emit()` for realtime
frames written the way a real connector writes them, and `on(hook, handler | null)` to swap a
handler mid-test.

An `on` handler either replaces the built-in read/write of one hook or wraps it, and keeps the call
log, the failure scripting and the latency that writing a whole `Plugin` by hand throws away:

```ts
const stack = await createVueStack({
  schema,
  data: { articles: [initial] },
  keys: { articles: 'uuid' },
  on: {
    updateItem: ctx => ctx.upsert(applyFormOperations(ctx.rows()[0]!, ctx.payload.formOperations ?? [])),
    // wrap the default rather than replace it
    fetchMany: async ctx => (await ctx.next()).filter((row: any) => !row.archived),
  },
})
```

The dispatch order of one call is fixed, so wrapping is predictable:

1. the call is recorded, then `holdNext` → `latency` → `failNext` apply;
2. the handler runs, or `ctx.next()` when there is none;
3. a `respondNext` responder applies to the value produced — which is why `respondNext` still wins
   over `on`;
4. the value is published, once, and only for the hooks that carry a result.

`ctx.next()` runs the built-in behaviour and returns its value, memoized: however often a handler
calls it, the read or write happens once. Returning `undefined` from a handler on a result-bearing
hook sets `undefined`, i.e. an explicit "not found"; to keep the default, `return ctx.next()`.

Rules:

- A fake backend never imports the code it is meant to check. That is why `matchWhere.ts` uses
  a hand-written evaluator rather than calls into `@rstore/connector-toolkit`, and why key resolution
  comes from the `keys` option rather than from `collection.getKey`.
- Import helpers directly from their owning files; do not add a broad barrel that pulls Vue
  and connector dependencies into unrelated package typechecks.
- Core-level suites run on the **real** cache, not a hand-built double. A double re-implements key
  resolution and layering, so the two can drift while the suite stays green.
- No `vi.mock` on a sibling module. `vi.mock` is for boundaries the process cannot reach
  (`#imports`, `#build/*`), never for `../src/query/peekMany` — mocking one half of a path means the
  other half is never executed.
- A new test names the product line that makes it red. If deleting a line of source cannot fail it,
  it is not worth writing; say which failure mode the `describe` covers in its title.
- Assert observable state: query data, public cache reads, backend rows, requests, and public events.
  Never spy on store/cache methods. Request counts are useful for deduplication and batching contracts;
  callback spies are valid when the callback is the consumer-facing contract.
- Reserve `getState()` shape assertions for transport compatibility. Routine writes, clears, and marker
  reuse must be proved through reads and subsequent requests.
- Keep new/reworked source and test files below 300 lines; share fixtures and document helpers.

### Test boundary and parity rules

- Import each package through its root entry. Same-package source tests may use the source root barrel;
  never import an internal source module from a test or shared test helper.
- Pure exported functions are valid unit-test boundaries. Store behavior must run through a real Store,
  hook pipeline, and Cache implementation.
- Do not assert `_private`, private StoreCore helpers, scheduler queues/timers, generated layer identities, wrapper
  metadata, ownership maps, or form backing fields. Assert resulting data, errors, requests, cache state,
  subscriptions, or lifecycle instead.
- Before deleting or rewriting a test, map its product behavior to a replacement. A mechanism-only test
  may be retired only when its observable effect has explicit coverage.
- Coverage highlights missing paths; it does not prove behavioral parity. Keep a contract map for large
  test rewrites and investigate every unexplained coverage drop.

Vue lifecycles are reachable without a DOM, so do not reach for `jsdom`, `happy-dom` or
`@vue/test-utils`:

| Need | Mechanism |
| --- | --- |
| Injection context (`useStore`, `defineModule`) | `createApp({}).runWithContext()` — `withInjectionContext` |
| Effect ownership and scenario matrices | `effectScope()` + `scope.stop()` — `stack.scope` / `runInTestScope` |
| Actual component setup/unmount and app isolation | Vue `createRenderer()` — `mountStoreComponent` |
| `window` focus events, `localStorage` | `vi.stubGlobal('window', …)` — `stubWindow` |
| SSR half of hydration | `renderToString` from `vue/server-renderer`, which ships with `vue` |

Finally, `packages/{core,shared}/tsconfig.json` exclude
`test/integration` from their own `test:types`: those suites import `@rstore/vue` sources, which
only type-check in their own package context. The root `tsconfig.integration.json` checks them
instead — `pnpm test:types` runs it as `test:types:integration` after the per-package runs — with
`@rstore/*` mapped to package sources, the same way the `unit` and `integration` Vitest projects resolve them.
`packages/vue` type-checks its own integration suites.

### Cache collection contracts

Item GC evicts unreachable cached rows. It removes cache-local row state, wrappers, indexes,
timestamps, and affected page references; it does not create a tombstone. Query pages own their
rows independently, and active optimistic layers pin their base rows until those layers resolve.

Tombstone GC is separate causal-record retention. It removes only old delete records after its
exclusive cutoff, preserving protection from stale writes until then. Client stores may schedule it;
server stores and `tombstoneGc: false` must not install a timer. Test item ownership and tombstone
causality in separate suites.

## Pull Request Guidelines

- Checkout a topic branch from a base branch, e.g. `main`, and merge back against that branch.

- If adding a new feature:

  - Add accompanying test case.
  - Provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log, e.g. `fix: update entities encoding/decoding (fix #3899)`.
  - Provide a detailed description of the bug in the PR. Live demo preferred.
  - Add appropriate test coverage if applicable.

- It's OK to have multiple small commits as you work on the PR - GitHub can automatically squash them before merging.

- Make sure to follow the code style of the project.

- Make sure tests pass!

- Commit messages must follow the [commit message convention](./.github/commit-convention.md) so that changelogs can be automatically generated.<!-- Commit messages are automatically validated before commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)). -->

<!--
- No need to worry about code style as long as you have installed the dev dependencies - modified files are automatically formatted with ESLint on commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)).
-->
