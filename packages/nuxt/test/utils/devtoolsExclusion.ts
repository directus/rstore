import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from 'vitest'

/** Assert actual missing relay resources rather than merely a disabled option flag. */
export async function assertDevtoolsRoutesAbsent(baseURL: string): Promise<void> {
  for (const route of ['bootstrap.json', '__connection.json', '__mcp']) {
    const response = await fetch(new URL(`/__rstore/${route}`, baseURL))
    expect(response.status, `${route} must not mount`).toBe(404)
    expect(await response.text()).not.toContain('authToken')
  }
}

/** Inspect real generated browser/server bundles for leaked private capture/bootstrap code. */
export async function assertDevtoolsBundleAbsent(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await assertDevtoolsBundleAbsent(path)
    }
    else if (/\.(?:m?js|json)$/.test(entry.name)) {
      const source = await readFile(path, 'utf8')
      expect(source, path).not.toMatch(/rstore:producer-register|rstoreDevtoolsSSR|__RSTORE_DEVTOOLS__/)
    }
  }
}
