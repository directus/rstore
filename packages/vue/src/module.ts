import { defineModule as _defineModule } from '@rstore/core'
import { createSharedComposable } from '@vueuse/core'

export const defineModule: typeof _defineModule = ((...args) => createSharedComposable(_defineModule(...args))) as typeof _defineModule
