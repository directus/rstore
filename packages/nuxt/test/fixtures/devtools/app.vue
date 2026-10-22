<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
if (import.meta.server) {
  const url = useRequestURL()
  if (url.pathname.startsWith('/ssr/')) {
    const collection = store.$collections.find(collection => collection.name === 'todos')!
    store.$cache.writeItem({ collection, key: 0, item: { id: 0, title: url.pathname } })
    const delay = Math.min(5000, Number(url.searchParams.get('delay') ?? 0))
    if (delay > 0)
      await new Promise(resolve => setTimeout(resolve, delay))
    if (url.pathname === '/ssr/error') {
      throw createError({ statusCode: 500, statusMessage: 'SSR fixture failure', data: {
        headers: { authorization: 'SSR_HEADER_SECRET' },
        request: { url: '/ssr/error?token=SSR_QUERY_SECRET' },
        payload: 'SSR_PAYLOAD_SECRET',
      } })
    }
  }
}
</script>

<template>
  <div>{{ store ? 'store-ready' : 'store-missing' }}</div>
</template>
