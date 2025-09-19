# Module <Badge text="Changed in v0.7" type="warning" />

In most application, there are cases where some specific logic or state is needed. For example, you may want to handle the current user with a specific key and also have special mutations for login or logout.

For this, you can create an rstore module, which is a shared composable that calls `defineModule` with a module name and a setup function.

```ts
// src/composables/auth.ts

import { defineModule } from '@rstore/vue'

export const useAuth = defineModule('auth', ({
  store,
  defineState,
  defineMutation,
  onResolve,
}) => {
  const state = defineState({
    // Create some state here
    currentUserKey: null as string | null,
  })

  return {
    // Expose things here
  }
})
```

::: tip
With the `@rstore/nuxt` module, you can directly use the auto-imported `defineRstoreModule` function instead of `defineModule`.
:::

## Benefits of using modules

- **Encapsulation**: Modules allow you to encapsulate related state, queries and mutations, making your code more organized and easier to maintain.
- **Reusability**: You can create reusable modules that can be shared across different parts of your application or even across different applications.
- **Shared**: rstore modules are automatically shared across all components that use them, so they are only created once.
- **Code-splitting**: You can lazy-load modules when needed, reducing the initial bundle size of your application.
- **SSR**: Modules are automatically SSR compatible, so you don't have to worry about the state being lost during server-side rendering.
- **Async**: You can use async code (see `onResolve` below) to initialize the module.
- **Hybrid promise**: Awaiting a module is optional, all exposed properties are also available directly.
- **Devtools**: You can inspect the module in the rstore devtools (current only available in Nuxt).

![Modules tab in the rstore devtools](./img/devtools-modules.png)

## Comparison with `pinia`

[Pinia](https://pinia.vuejs.org/) is an amazing state management library for Vue.js applications. While both rstore modules and Pinia stores serve the purpose of managing state in a Vue application, there are some key differences between the two:

- **Integration with rstore**: rstore modules are designed to work seamlessly with rstore's data collections and devtools, while Pinia is an external state management library.
- **Private state**: rstore modules allow you to define private state that is not exposed outside the module, while still retaining compatibility with SSR.
- **Hybrid promise**: rstore modules can be awaited for async initialization, but can also be used directly without awaiting, while Pinia stores are synchronous.

## State

Define the state of the module using the `defineState` function from the module setup function. The state is reactive and stored in the rstore cache (which also means it is transferred to the client in SSR).

```ts{4-6}
export const useAuth = defineModule('auth', ({
  defineState,
}) => {
  const state = defineState({
    currentUserKey: null as string | null,
  })
})
```

::: tip
You don't have to expose the state if you want to keep it private to the module. It will be still hydrated in SSR and shared across all components using the module.
:::

## Expose

You must return an object from the module setup function to expose the module properties.

```ts{6-8}
export const useAuth = defineModule('auth', ({
  defineState,
}) => {
  const state = defineState({})

  return {
    // Expose things here
  }
})
```

You can for example expose a query:

```ts
export const useAuth = defineModule('auth', ({
  store,
  defineState,
}) => {
  const state = defineState({
    currentUserKey: null as string | null,
  })

  const currentUser = store.User.query(q => q.first(state.currentUserKey
    ? {
        key: state.currentUserKey,
      }
    : {
        enabled: false,
      }))

  return {
    currentUser,
  }
})
```

You can now use the `useAuth` composable in your components:

```ts
const auth = useAuth()
const { data: currentUser } = auth.currentUser
```

## onResolve

You can use the `onResolve` function from the module setup function to run some code when the module is resolved. This is useful for initializing the module or running some async code.

```ts{33-37}
export const useAuth = defineModule('auth', ({
  store,
  defineState,
  onResolve,
}) => {
  const state = defineState({
    currentUserKey: null as string | null,
  })

  const currentUser = store.User.query(q => q.first({ /* ... */ }))

  const requestFetch = useRequestFetch()

  async function initCurrentUser() {
    try {
      const user = await requestFetch('/api/auth/me')
      if (user) {
        state.currentUserKey = user.id
        store.User.writeItem({
          ...user,
          createdAt: new Date(user.createdAt),
        })
      }
      else {
        state.currentUserKey = null
      }
    }
    catch (e) {
      console.error('Failed to init current user', e)
    }
  }

  onResolve(async () => {
    // Wait for async code to run before
    // the module is considered resolved
    await initCurrentUser()
  })

  return {
    currentUser,
  }
})
```

You can then await the module in your component:

```ts
const auth = await useAuth()

// Current user is fetched already

const { data: currentUser } = auth.currentUser
```

::: tip
Awaiting a module is always optional. You can use the module without awaiting it, but all necessary code might not have run yet. This is a valid use case if you don't use async component setup for example.
:::

## Mutations <Badge text="Changed in v0.7" type="warning" />

You can define mutations using the `defineMutation` function from the module setup function. This is useful for defining actions that modify the state of the module or the store in general.

```ts
export const useAuth = defineModule('auth', ({
  store,
  defineState,
  defineMutation,
  onResolve,
}) => {
  const state = defineState({
    currentUserKey: null as string | null,
  })

  // ...

  const login = defineMutation(async (email: string, password: string) => {
    const result = await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        email,
        password,
      },
    })
    state.currentUserKey = result.userId
  })

  const logout = defineMutation(async () => {
    await $fetch('/api/auth/logout', {
      method: 'POST',
    })
    state.currentUserKey = null
  })

  onResolve(async () => {
    await initCurrentUser()
  })

  return {
    currentUser,
    login,
    logout,
  }
})
```

Mutation comes with automatic loading and error states, that you can access using the `$loading` and `$error` properties:

::: code-group

```vue{8,11-14} [simple]
<script setup lang="ts">
const auth = useAuth()
const email = ref('')
const password = ref('')
</script>

<template>
  <UForm @submit="auth.login(email, password)">
    <UInput v-model="email" label="Email" />
    <UInput v-model="password" label="Password" type="password" />
    <UButton :loading="auth.login.$loading">Login</UButton>
    <UAlert v-if="auth.login.$error" color="error">
      {{ auth.login.$error.message }}
    </UAlert>
  </UForm>
</template>
```

```vue{3,10,13-16} [destructured]
<script setup lang="ts">
const auth = useAuth()
const { call: login, $loading: loginLoading, $error: loadingError } = auth.login

const email = ref('')
const password = ref('')
</script>

<template>
  <UForm @submit="login(null, email, password)">
    <UInput v-model="email" label="Email" />
    <UInput v-model="password" label="Password" type="password" />
    <UButton :loading="loginLoading">Login</UButton>
    <UAlert v-if="loadingError" color="error">
      {{ loadingError.message }}
    </UAlert>
  </UForm>
</template>
```

:::

The mutations are also tracked in the rstore devtools with their loading and error states, and the duration of the last call.
