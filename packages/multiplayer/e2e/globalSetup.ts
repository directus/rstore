import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** Where the bundled test page goes (outside the repository). */
export const pageDir = join(tmpdir(), 'rstore-multiplayer-e2e')

const source = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

/** Bundles the test page against the package sources. */
export default async function globalSetup() {
  mkdirSync(pageDir, { recursive: true })
  await build({
    entryPoints: [source('e2e/page/main.ts')],
    bundle: true,
    // A classic script: Chromium refuses module scripts from file:// pages.
    format: 'iife',
    outfile: join(pageDir, 'main.js'),
    alias: {
      '@rstore/multiplayer/ot': source('src/ot/index.ts'),
      '@rstore/multiplayer/server': source('src/server/index.ts'),
      '@rstore/multiplayer/prosemirror': source('src/prosemirror/index.ts'),
      '@rstore/shared': source('../shared/src/index.ts'),
    },
    logLevel: 'warning',
  })
  writeFileSync(join(pageDir, 'index.html'), `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>.ProseMirror { border: 1px solid #888; min-height: 2em; white-space: pre-wrap; }</style>
<div id="a"></div>
<div id="b"></div>
<script src="./main.js"></script>
`)
}
