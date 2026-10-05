import { describe, expect, it } from 'vitest'
import { renderServerConfigTemplate, resolveServerModuleOptions } from '../src/options'

/** Evaluate the generated Nitro virtual module the handler entry imports. */
async function loadTemplate(contents: string): Promise<Record<string, unknown>> {
  return { ...await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(contents)}`) }
}

describe('server config template', () => {
  it('emits the defaults', async () => {
    const config = await loadTemplate(renderServerConfigTemplate(resolveServerModuleOptions({})))

    expect(config).toEqual({
      maxRoomSize: 100,
      maxMessageBytes: 16 * 1024,
      rateLimit: { capacity: 60, refillPerSecond: 30 },
      allowedOrigins: undefined,
      collab: null,
    })
  })

  it('emits the module options', async () => {
    const config = await loadTemplate(renderServerConfigTemplate(resolveServerModuleOptions({
      maxRoomSize: 2,
      maxMessageBytes: 512,
      rateLimit: false,
      allowedOrigins: ['https://app.example.com'],
      collab: { maxMessageBytes: 2048, rateLimit: false },
    })))

    expect(config).toEqual({
      maxRoomSize: 2,
      maxMessageBytes: 512,
      rateLimit: null,
      allowedOrigins: ['https://app.example.com'],
      collab: { maxMessageBytes: 2048, rateLimit: null },
    })
  })

  it('emits the collab defaults when collab is enabled', async () => {
    const config = await loadTemplate(renderServerConfigTemplate(resolveServerModuleOptions({ collab: true })))

    expect(config.collab).toEqual({ maxMessageBytes: 1024 * 1024, rateLimit: { capacity: 120, refillPerSecond: 60 } })
  })
})
