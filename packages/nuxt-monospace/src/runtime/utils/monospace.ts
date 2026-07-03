import type { MonospaceRestClient } from '@rstore/monospace'
import { useNuxtApp } from '#imports'

/**
 * Returns the Monospace REST client registered by the rstore Monospace plugin.
 */
export function useMonospace(): MonospaceRestClient {
  const nuxt = useNuxtApp()
  return nuxt.$monospace as MonospaceRestClient
}
