import type { Nuxt } from 'nuxt/schema'

declare module '@nuxt/schema' {
  export interface NuxtOptions {
    _rstoreCollectionImports?: Set<string>
    _rstorePluginImports?: Set<string>
  }
}

export function addCollectionImport(nuxt: Nuxt, importPath: string) {
  nuxt.options._rstoreCollectionImports ??= new Set()
  nuxt.options._rstoreCollectionImports.add(importPath)
}

export function addPluginImport(nuxt: Nuxt, importPath: string) {
  nuxt.options._rstorePluginImports ??= new Set()
  nuxt.options._rstorePluginImports.add(importPath)
}
