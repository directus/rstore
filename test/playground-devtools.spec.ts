import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const playgroundApp = join(process.cwd(), 'packages/playground/app')

describe('playground devtools integration', () => {
  it('uses only the official devtools component', async () => {
    const app = await readFile(join(playgroundApp, 'app.vue'), 'utf8')
    const plugin = await readFile(join(playgroundApp, 'rstore/plugins/my-plugin.ts'), 'utf8')

    expect(app).toContain('import { RstoreDevtools } from \'@rstore/devtools\'')
    expect(app).toContain('<RstoreDevtools')
    expect(plugin).not.toContain('useStoreStats')
    await expect(access(join(playgroundApp, 'components/devtools'))).rejects.toThrow()
  })
})
