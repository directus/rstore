<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Akryum/rstore/blob/main/img/LogoTextHorizontalWhite.png?raw=true" width="400px" height="122px">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/Akryum/rstore/blob/main/img/LogoTextHorizontalBlack.png?raw=true" width="400px" height="122px">
    <img alt="rstore logo" src="https://github.com/Akryum/rstore/blob/main/img/LogoTextHorizontalBlack.png?raw=true" width="400px" height="122px">
  </picture>
</p>

---

<p align="center">
  <a href="https://rstore.akryum.dev">Documentation</a> |
  <a href="https://nightly.akryum.dev/Akryum/rstore">Nightly releases</a> |
  <a href="./CONTRIBUTING.md">Contributing guide</a>
</p>

<p align="center">
  <a href="https://github.com/Akryum/rstore/actions/workflows/ci.yml">
    <img src="https://github.com/Akryum/rstore/actions/workflows/ci.yml/badge.svg" alt="ci">
  </a>
</p>

rstore is a local-first data store for Vue and Nuxt applications.

It gives you a normalized reactive cache, a structured query and mutation API, and plugin-based integration with your own data sources.

## Why rstore

- Normalized reactive cache shared across your app
- Queries and mutations co-located with components
- Plugins for REST, GraphQL, local databases, and custom backends
- Built for local-first, realtime, forms, and offline workflows
- Strong TypeScript support
- Nuxt module with DevTools integration

![Devtools screenshot](./docs/guide/img/nuxt-devtools2.png)

## Start here

- Vue quickstart: <https://rstore.akryum.dev/guide/getting-started#vue>
- Nuxt quickstart: <https://rstore.akryum.dev/guide/getting-started#nuxt>
- Nuxt + Drizzle: <https://rstore.akryum.dev/guide/getting-started#nuxt-drizzle>
- Core concepts: <https://rstore.akryum.dev/guide/learn-more>

## Core workflow

1. Define collections that describe your application data.
2. Add collection hooks or plugins to connect those collections to your backend.
3. Query and mutate data from components through the store.
4. Layer on forms, subscriptions, offline support, and federation as needed.

## Example

```ts
const store = useStore()

const { data: todos, loading } = await store.todos.query(q => q.many())

await store.todos.create({
  id: crypto.randomUUID(),
  title: 'Ship the docs',
  completed: false,
})
```

## Learn more

- Getting started: <https://rstore.akryum.dev/guide/getting-started>
- Collections and schema: <https://rstore.akryum.dev/guide/schema/collection>
- Querying data: <https://rstore.akryum.dev/guide/data/query>
- Mutations and forms: <https://rstore.akryum.dev/guide/data/mutation>
- Plugin system: <https://rstore.akryum.dev/guide/plugin/setup>
