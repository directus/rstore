import type { createDirectus } from '@directus/sdk'
import { useNuxtApp } from 'nuxt/app'

export function useDirectus(): ReturnType<typeof createDirectus> {
  const nuxt = useNuxtApp()
  return nuxt.$directus as any
}
