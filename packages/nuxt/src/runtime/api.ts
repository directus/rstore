import type { Nuxt } from 'nuxt/schema'

declare module '@nuxt/schema' {
  export interface NuxtOptions {
    _rstoreModelImports?: Set<string>
    _rstorePluginImports?: Set<string>
  }
}

export function addModelImport(nuxt: Nuxt, importPath: string) {
  nuxt.options._rstoreModelImports ??= new Set()
  nuxt.options._rstoreModelImports.add(importPath)
}

export function addPluginImport(nuxt: Nuxt, importPath: string) {
  nuxt.options._rstorePluginImports ??= new Set()
  nuxt.options._rstorePluginImports.add(importPath)
}
