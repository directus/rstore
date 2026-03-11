import { addComponentsDir, addImportsDir, createResolver, defineNuxtModule } from '@nuxt/kit'

export type * from './runtime/types'

export default defineNuxtModule({
  meta: {
    name: 'rstore-nuxt-multiplayer',
    configKey: 'rstoreNuxtUiMultiplayer',
    compatibility: {
      nuxt: '^3.19.2 || >=4.1.2',
    },
  },
  moduleDependencies: {
    '@nuxt/ui': {},
  },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    addImportsDir(resolve('./runtime/composables'))
    addComponentsDir({
      path: resolve('./runtime/components'),
      pathPrefix: false,
    })

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({
        path: resolve('./runtime/types.ts'),
      })
    })
  },
})
