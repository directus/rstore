import type { DirectusRstoreClient } from '@rstore/directus'
import { useNuxtApp } from '#imports'

/**
 * Returns the Directus SDK client registered by the rstore Directus plugin.
 */
export function useDirectus(): DirectusRstoreClient {
  const nuxt = useNuxtApp()
  return nuxt.$directus as DirectusRstoreClient
}
