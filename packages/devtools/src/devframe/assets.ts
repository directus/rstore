import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

/** Self-resolve package root because Node/Vite entry bundles live in different folders. */
export function packagedClientDirectory(): string {
  return resolve(dirname(createRequire(import.meta.url).resolve('@rstore/devtools/package.json')), 'dist/client')
}

/** Manifest version follows package release independently from bundled entry location. */
export function packagedVersion(): string {
  return createRequire(import.meta.url)('@rstore/devtools/package.json').version
}
