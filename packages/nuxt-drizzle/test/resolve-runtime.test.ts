import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { createRuntimeResolver } from '../src/module/resolveRuntime'

// The module entry sits in `src/module/` during development but is bundled flat
// to `dist/module.mjs` — a sibling of `dist/runtime/` — when published. Getting
// this wrong resolves every runtime import outside the package, which breaks the
// published module while every in-repo playground keeps working.

/** Mimics `createResolver(import.meta.url).resolve` for a given base directory. */
function resolverFor(base: string) {
  return (id: string) => path.resolve(base, id)
}

describe('createRuntimeResolver', () => {
  it('resolves against dist/runtime in the published layout', () => {
    const resolve = createRuntimeResolver(
      resolverFor('/pkg/dist'),
      candidate => candidate === '/pkg/dist/runtime',
    )

    expect(resolve('./runtime/server/api/index.get')).toBe('/pkg/dist/runtime/server/api/index.get')
    expect(resolve('./runtime/types.ts')).toBe('/pkg/dist/runtime/types.ts')
  })

  it('resolves one level up in the source layout', () => {
    const resolve = createRuntimeResolver(
      resolverFor('/pkg/src/module'),
      candidate => candidate === '/pkg/src/runtime',
    )

    expect(resolve('./runtime/server/api/index.get')).toBe('/pkg/src/runtime/server/api/index.get')
    expect(resolve('./runtime/types.ts')).toBe('/pkg/src/runtime/types.ts')
  })

  it('resolves the runtime directory itself', () => {
    const resolve = createRuntimeResolver(resolverFor('/pkg/dist'), () => true)

    expect(resolve('./runtime')).toBe('/pkg/dist/runtime')
  })

  it('leaves non-runtime ids to the base resolver', () => {
    const resolve = createRuntimeResolver(resolverFor('/pkg/dist'), () => true)

    expect(resolve('./types')).toBe('/pkg/dist/types')
  })
})
