# Devtools

`@rstore/devtools` lets you embed the rstore Devtools UI in any app.

It provides:

- a prebuilt frontend served from a static route (default: `/__rstore`)
- a `RstoreDevtools` Vue component (iframe wrapper)
- a `rstoreDevtoolsVite()` plugin for Vite-based builds (including Nuxt)

## Vite

### 1. Install

::: code-group

```sh [npm]
npm i @rstore/devtools
```

```sh [pnpm]
pnpm i @rstore/devtools
```

:::

### 2. Register the Vite plugin

```ts [vite.config.ts]
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

### 3. Render the panel

```vue
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <RstoreDevtools style="width: 100%; height: 480px" />
</template>
```

## Nuxt

### With `@rstore/nuxt`

If you already use `@rstore/nuxt`, the Nuxt module wires the rstore tab in Nuxt DevTools and serves the iframe route.
To embed the same UI directly in your app, only add the component:

```vue [app/app.vue]
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <ClientOnly>
    <RstoreDevtools style="width: 100%; height: 480px" />
  </ClientOnly>
</template>
```

### Without `@rstore/nuxt`

If you want the embedded UI in a Nuxt app that does not use `@rstore/nuxt`, add the Vite plugin manually:

```ts [nuxt.config.ts]
import { rstoreDevtoolsVite } from '@rstore/devtools/vite'

export default defineNuxtConfig({
  vite: {
    plugins: [
      rstoreDevtoolsVite(),
    ],
  },
})
```

Then render `<RstoreDevtools />` in your layout or page.

## Custom route

If you serve the frontend from another route, the Vite plugin route and component `src` must match:

```ts [vite.config.ts]
import { rstoreDevtoolsVite } from '@rstore/devtools/vite'

export default defineConfig({
  plugins: [
    rstoreDevtoolsVite({ route: '/internal/devtools' }),
  ],
})
```

```vue
<script setup lang="ts">
import { RstoreDevtools } from '@rstore/devtools'
</script>

<template>
  <RstoreDevtools src="/internal/devtools/" style="width: 100%; height: 480px" />
</template>
```
