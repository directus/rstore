import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { uniqueText } from './utils'

type DirectusCase = 'queries' | 'cacheOperators' | 'bulkMutations' | 'singleton' | 'relations'

declare global {
  interface Window {
    /**
     * Browser-only Directus adapter test harness.
     */
    __rstoreDirectusE2E?: {
      run: (caseName: DirectusCase, prefix: string) => Promise<Record<string, unknown>>
    }
  }
}

/**
 * Runs one Directus adapter harness case in the browser.
 */
async function runDirectusCase<T extends Record<string, unknown>>(
  page: Page,
  caseName: DirectusCase,
): Promise<T> {
  await page.goto('/__directus-e2e')
  await page.waitForFunction(() => Boolean(window.__rstoreDirectusE2E?.run))

  const prefix = uniqueText(`playwright-directus-${caseName}`)
  return await page.evaluate(
    async ({ caseName, prefix }) => window.__rstoreDirectusE2E.run(caseName, prefix),
    { caseName, prefix },
  ) as T
}

test('covers Directus item query options', async ({ page }) => {
  const result = await runDirectusCase<{
    ok: boolean
    projectedKeys: string[]
    keyTitle: string
    filteredTitles: string[]
    searchedTitles: string[]
    sortedTitles: string[]
    limitedTitles: string[]
    offsetTitles: string[]
    pageTitles: string[]
    pageIndexTitles: string[]
    paramsTitles: string[]
  }>(page, 'queries')

  expect(result.ok).toBe(true)
  expect(result.projectedKeys.sort()).toEqual(['id', 'title'])
  expect(result.keyTitle).toContain('-query-a')
  expect(result.filteredTitles).toEqual([expect.stringContaining('-query-b')])
  expect(result.searchedTitles).toEqual([expect.stringContaining('-query-c')])
  expect(result.sortedTitles).toEqual([
    expect.stringContaining('-query-c'),
    expect.stringContaining('-query-b'),
    expect.stringContaining('-query-a'),
  ])
  expect(result.limitedTitles).toHaveLength(2)
  expect(result.offsetTitles).toEqual([expect.stringContaining('-query-b')])
  expect(result.pageTitles).toEqual([expect.stringContaining('-query-b')])
  expect(result.pageIndexTitles).toEqual([expect.stringContaining('-query-c')])
  expect(result.paramsTitles).toEqual([expect.stringContaining('-query-a')])
})

test('covers cache-side Directus filters and fetch fallback', async ({ page }) => {
  const result = await runDirectusCase<{
    ok: boolean
    eqTitles: string[]
    neqTitles: string[]
    rangeTitles: string[]
    nullTitles: string[]
    textTitles: string[]
    logicalTitles: string[]
    searchTitle: string
  }>(page, 'cacheOperators')

  expect(result.ok).toBe(true)
  expect(result.eqTitles).toEqual([expect.stringContaining('-cache-a')])
  expect(result.neqTitles).toEqual([
    expect.stringContaining('-cache-b'),
    expect.stringContaining('-cache-c'),
  ])
  expect(result.rangeTitles).toEqual([
    expect.stringContaining('-cache-b'),
    expect.stringContaining('-cache-c'),
  ])
  expect(result.nullTitles).toEqual([expect.stringContaining('-cache-c')])
  expect(result.textTitles).toEqual([expect.stringContaining('-cache-b')])
  expect(result.logicalTitles).toEqual([expect.stringContaining('-cache-b')])
  expect(result.searchTitle).toContain('-cache-search')
})

test('covers Directus bulk mutations and primary-key stripping', async ({ page }) => {
  const result = await runDirectusCase<{
    ok: boolean
    createdCount: number
    updatedTitles: string[]
    remainingBulkCount: number
    strippedKeyTitle: string
    strippedWrongKeyExists: boolean
  }>(page, 'bulkMutations')

  expect(result.ok).toBe(true)
  expect(result.createdCount).toBe(3)
  expect(result.updatedTitles).toEqual([
    expect.stringContaining('-bulk-a-updated'),
    expect.stringContaining('-bulk-b-updated'),
  ])
  expect(result.remainingBulkCount).toBe(0)
  expect(result.strippedKeyTitle).toContain('-bulk-strip-updated')
  expect(result.strippedWrongKeyExists).toBe(false)
})

test('covers Directus singleton reads and updates', async ({ page }) => {
  const result = await runDirectusCase<{
    ok: boolean
    key: string
    foundManyCount: number
    siteName: string
  }>(page, 'singleton')

  expect(result.ok).toBe(true)
  expect(result.key).toBe('singleton')
  expect(result.foundManyCount).toBe(1)
  expect(result.siteName).toContain('playwright-directus-singleton')
})

test('covers generated Directus relation includes', async ({ page }) => {
  const result = await runDirectusCase<{
    ok: boolean
    projectName: string
    includedTitles: string[]
    filteredRelationTitles: string[]
  }>(page, 'relations')

  expect(result.ok).toBe(true)
  expect(result.projectName).toContain('playwright-directus-relations')
  expect(result.includedTitles).toEqual([
    expect.stringContaining('-relation-a'),
    expect.stringContaining('-relation-b'),
  ])
  expect(result.filteredRelationTitles).toEqual([expect.stringContaining('-relation-a')])
})
