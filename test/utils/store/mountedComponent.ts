import type { VueStore } from '@rstore/vue'
import { RstorePlugin } from '@rstore/vue'
import { onTestFinished } from 'vitest'
import { createRenderer, defineComponent } from 'vue'

/** Minimal host node; tests observe setup state, never rendering details. */
interface HostNode {
  /** Parent used by Vue when removing the component's root comment. */
  parent: HostNode | null
}

/** Real component setup result and its idempotent unmount boundary. */
export interface MountedComponent<T> {
  /** Value captured synchronously during component setup. */
  result: T
  /** Runs Vue's component and effect teardown. */
  unmount: () => void
}

/**
 * Mounts a renderless component using Vue's real renderer and plugin injection.
 * Only host nodes are substituted: Vue owns setup, effects and unmount hooks.
 */
export function mountStoreComponent<T>(store: VueStore, setup: () => T): MountedComponent<T> {
  const renderer = createRenderer<HostNode, HostNode>({
    createElement: () => ({ parent: null }),
    createText: () => ({ parent: null }),
    createComment: () => ({ parent: null }),
    insert: (node, parent) => { node.parent = parent },
    remove: (node) => { node.parent = null },
    parentNode: node => node.parent,
    nextSibling: () => null,
    patchProp: () => {},
    setText: () => {},
    setElementText: () => {},
  })
  let result!: T
  const app = renderer.createApp(defineComponent({
    setup() {
      result = setup()
      return () => null
    },
  }))
  app.use(RstorePlugin, { store })
  let mounted = false
  /** Unmount once, including automatic teardown after a failed assertion. */
  function unmount() {
    if (mounted) {
      mounted = false
      app.unmount()
    }
  }
  onTestFinished(unmount)
  mounted = true
  app.mount({ parent: null })
  return { result, unmount }
}
