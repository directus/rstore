import { createRenderer } from 'vue'

/** Real Vue lifecycle host for tests that do not claim browser presentation. */
export function createLifecycleRenderer() {
  return createRenderer<object, object>({
    patchProp() {},
    insert() {},
    remove() {},
    setText() {},
    setElementText() {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    parentNode: () => null,
    nextSibling: () => null,
  })
}
