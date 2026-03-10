# `@rstore/devtools`

`@rstore/devtools` ships two things:

- a prebuilt devtools frontend, generated from the Nuxt app in [`app/`](./app)
- a small Vue component that renders that frontend in an `iframe`

The package is meant to be embedded into another app rather than mounted directly by users.

## Package structure

- [`app/`](./app): the Nuxt 4 app that produces the static devtools frontend
- [`src/index.ts`](./src/index.ts): the public Vue component and helpers
- [`src/vite.ts`](./src/vite.ts): Vite plugins that serve or emit the built frontend

## Build output

The Nuxt app is configured in [`nuxt.config.ts`](./nuxt.config.ts) with:

- `ssr: false`
- `app.baseURL = '/__rstore'`
- `nitro.output.publicDir = 'dist/client'`

Running `pnpm --filter @rstore/devtools build` does two things:

1. `unbuild` compiles the package entrypoints in `src/` to `dist/*.mjs`
2. `nuxi generate` builds the Nuxt app into `dist/client`

That means the published package contains:

- `dist/index.mjs` and `dist/index.d.ts`
- `dist/vite.mjs` and `dist/vite.d.ts`
- `dist/client/**`, which is the static app loaded inside the iframe

## Runtime API

The main entry exports:

- `RstoreDevtools`: Vue component that renders an `iframe`
- `RstoreDevtoolsPlugin`: optional Vue plugin that globally registers the component
- `getRstoreDevtoolsSrc(route?)`: helper that normalizes the iframe URL

Basic usage in a Vue app:

```vue
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <RstoreDevtools style="height: 480px" />
</template>
```

By default the component points to `'/__rstore/'`. If you mount the static assets on another route, pass `src` explicitly:

```vue
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <RstoreDevtools src="/internal/devtools/" style="height: 480px" />
</template>
```

## How the Vite integration works

The Vite integration lives in [`src/vite.ts`](./src/vite.ts) and assumes the built frontend already exists in `dist/client`.

It exports three helpers:

- `rstoreDevtools(options)`: dev and preview middleware
- `rstoreDevtoolsBuild(options)`: build-time asset copier
- `rstoreDevtoolsVite(options)`: convenience wrapper that returns both plugins

All helpers accept the same options object:

```ts
function rstoreDevtools(options: { route?: string }) {}
```

The default route is `'/__rstore'`.

### Dev server

`rstoreDevtools()` registers a `sirv` middleware on the Vite dev server:

- `configureServer()` serves `dist/client` in dev
- `configurePreviewServer()` serves the same files in preview

Because `sirv(..., { single: true })` is used, direct navigation to nested frontend routes still resolves to the generated `index.html`.

### Production build

`rstoreDevtoolsBuild()` runs during `vite build`.

It recursively reads every file in `dist/client` and emits them into the host app build under the configured route. With the default route, files end up under:

```text
__rstore/index.html
__rstore/_nuxt/...
```

This is what makes the iframe URL work in a built app without needing a separate static hosting step.

### Combined helper

`rstoreDevtoolsVite()` is just:

```ts
[
  rstoreDevtools(options),
  rstoreDevtoolsBuild(options),
]
```

Use that unless you need to split dev and build behavior manually.

## Vite usage example

```ts
import { rstoreDevtoolsVite } from '@rstore/devtools/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    rstoreDevtoolsVite(),
  ],
})
```

Then render the iframe somewhere in your app:

```vue
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <RstoreDevtools style="width: 100%; height: 100vh" />
</template>
```

## Custom route example

If you want the frontend served from another path, the Vite plugin route and the iframe `src` must match:

```ts
import { rstoreDevtoolsVite } from '@rstore/devtools/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    rstoreDevtoolsVite({ route: '/internal/devtools' }),
  ],
})
```

```vue
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <RstoreDevtools src="/internal/devtools/" style="height: 100vh" />
</template>
```

## Important constraint

The Vite plugin serves and emits the prebuilt files from `dist/client`. If that directory is missing, the host app has nothing to serve or copy.

In practice, this means changes to the Nuxt devtools app require rebuilding `@rstore/devtools` before testing them from another project.
