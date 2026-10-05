import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupRealtime } from '../src/module/realtime'

const kit = vi.hoisted(() => ({
  templates: [] as Array<{ filename: string, getContents: () => string }>,
}))

vi.mock('@nuxt/kit', () => ({
  addServerHandler: () => {},
  addServerImports: () => {},
  addServerPlugin: () => {},
  addTemplate: (template: { filename: string, getContents: () => string }) => {
    kit.templates.push(template)
    return { dst: `/build/${template.filename}` }
  },
}))

/** Run the realtime setup and return the client plugin imports it registered. */
function setup(ws: Parameters<typeof setupRealtime>[0]['options']['ws']) {
  const imports: string[] = []
  setupRealtime({
    options: { ws },
    nuxt: { options: { nitro: {} } } as any,
    resolve: path => path,
    addPluginImport: (_nuxt, path) => imports.push(path),
  })
  return imports
}

describe('realtime module setup', () => {
  beforeEach(() => {
    kit.templates = []
  })

  it('installs the multiplayer LWW plugin with realtime by default', () => {
    const imports = setup(true)

    expect(imports).toContain('#build/rstore-drizzle-multiplayer-plugin.ts')
    const template = kit.templates.find(t => t.filename === 'rstore-drizzle-multiplayer-plugin.ts')!
    expect(template.getContents()).toContain('createMultiplayerPlugin({ lww: true, formTextMerge: false })')
  })

  it('does not install it with ws.lww: false', () => {
    const imports = setup({ lww: false })

    expect(imports.some(path => path.includes('multiplayer'))).toBe(false)
    expect(kit.templates.some(t => t.filename.includes('multiplayer'))).toBe(false)
  })

  it('installs nothing without realtime', () => {
    expect(setup(false)).toEqual([])
  })
})
