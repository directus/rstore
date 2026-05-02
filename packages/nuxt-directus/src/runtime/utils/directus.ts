import { useNuxtApp } from '#imports'

/**
 * Returns the Directus SDK client registered by the rstore Directus plugin.
 */
export function useDirectus(): any {
  const nuxt = useNuxtApp()
  return nuxt.$directus as any
}
