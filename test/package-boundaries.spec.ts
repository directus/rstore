import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** Workspace root, independent of the directory invoking Vitest. */
const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * Multiplayer concepts that live in `@rstore/multiplayer` since 0.9. Matched
 * against identifiers only, so comments explaining the boundary stay allowed.
 */
const forbiddenIdentifier = /HLC|tombstone|fieldtimestamps|mergetext/i

/**
 * Files allowed to name them during 0.9, all deleted in 0.10:
 * - deprecated re-exports and option forwarding of `@rstore/core`;
 * - the deprecated cache aliases of `@rstore/vue` and their `@rstore/shared` types;
 * - the LWW type definitions `@rstore/multiplayer` re-exports from `@rstore/shared`.
 */
const allowed = [
  /^packages\/core\/src\/deprecated\//,
  /^packages\/vue\/src\/cache\/deprecatedAliases\.ts$/,
  /^packages\/shared\/src\/types\/deprecatedAliases\.ts$/,
  /^packages\/shared\/src\/types\/crdt\.ts$/,
]

/** Every TypeScript source file below a directory. */
function listSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && /\.ts$/.test(entry.name))
    .map(entry => join(entry.parentPath, entry.name))
}

/** Identifiers of a source file, read with the TypeScript scanner (comments and strings are skipped). */
function readIdentifiers(source: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source)
  const identifiers: string[] = []
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.Identifier) {
      identifiers.push(scanner.getTokenText())
    }
  }
  return identifiers
}

describe('package boundaries', () => {
  it.each(['core', 'shared', 'vue'])('@rstore/%s sources name no multiplayer concept outside the 0.9 deprecation files', (name) => {
    const offenders: string[] = []
    for (const file of listSources(join(root, 'packages', name, 'src'))) {
      const path = relative(root, file).split('\\').join('/')
      if (allowed.some(pattern => pattern.test(path))) {
        continue
      }
      const names = new Set(readIdentifiers(readFileSync(file, 'utf8')).filter(identifier => forbiddenIdentifier.test(identifier)))
      for (const identifier of names) {
        offenders.push(`${path}: ${identifier}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
