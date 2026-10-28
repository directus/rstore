import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const playgroundApp = join(process.cwd(), 'packages/playground/app')

describe('playground devtools integration', () => {
  it('uses only the official devtools inspector', async () => {
    const app = await readFile(join(playgroundApp, 'app.vue'), 'utf8')
    const plugin = await readFile(join(playgroundApp, 'rstore/plugins/my-plugin.ts'), 'utf8')

    // The Nuxt module serves the Devframe inspector; the playground embeds it.
    expect(app).toContain('src="/__rstore/"')
    expect(app).not.toContain('@rstore/devtools')
    expect(plugin).not.toContain('useStoreStats')
    await expect(access(join(playgroundApp, 'components/devtools'))).rejects.toThrow()
  })
})
