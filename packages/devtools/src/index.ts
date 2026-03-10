import { computed, defineComponent, h } from 'vue'

export function getRstoreDevtoolsSrc(route = '/__rstore') {
  return route.endsWith('/') ? route : `${route}/`
}

export const RstoreDevtools = defineComponent({
  name: 'RstoreDevtools',
  inheritAttrs: false,
  props: {
    src: {
      type: String,
      default: undefined,
    },
    title: {
      type: String,
      default: 'rstore devtools',
    },
  },
  setup(props, { attrs }) {
    const resolvedSrc = computed(() => props.src || getRstoreDevtoolsSrc())

    return () => h('iframe', {
      ...attrs,
      src: resolvedSrc.value,
      title: props.title,
      style: {
        border: '0',
        width: '100%',
        height: '100%',
        background: 'transparent',
        ...(attrs.style as Record<string, string> | undefined),
      },
    })
  },
})

export const RstoreDevtoolsPlugin = {
  install(app: { component: (name: string, component: typeof RstoreDevtools) => void }) {
    app.component(RstoreDevtools.name!, RstoreDevtools)
  },
}

export type {
  RstoreDevtoolsClient,
  RstoreDevtoolsStats,
  StoreHistoryItem,
  StoreSubscriptionItem,
} from './types'
