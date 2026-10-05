import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { pageDir } from './globalSetup'

/** E5 runs: 200 for the gate (`RSTORE_OT_IME_RUNS`), fewer by default. */
const runs = Number(process.env.RSTORE_OT_IME_RUNS ?? 20)

/** IME input steps (romaji to kana), committed as the last step. */
const COMPOSITIONS = [
  ['k', 'か', 'かn', 'かな'],
  ['n', 'に', 'にh', 'にほ', 'にほn', 'にほん'],
  ['t', 'て', 'てs', 'てす', 'てすt', 'てすと'],
]

/** Count of each character of `text` in `content`. */
function count(content: string, char: string): number {
  return content.split(char).length - 1
}

test('IME composition with a concurrent remote typist in the same paragraph loses and duplicates nothing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error.stack ?? error)))
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  await page.goto(`file://${join(pageDir, 'index.html')}`)
  await page.waitForFunction(() => 'collab' in window)
  const cdp = await page.context().newCDPSession(page)
  const failures: string[] = []
  let compositions = 0
  let remoteWhileComposing = 0
  for (let run = 0; run < runs; run++) {
    await page.evaluate(seed => window.collab.reset(seed), run + 1)
    await page.evaluate(() => window.collab.session().focusA())
    const steps = COMPOSITIONS[run % COMPOSITIONS.length]!
    const committed = steps.at(-1)!
    // Remote typist: distinct ASCII characters, typed while A composes.
    const typed = 'XYZW'.slice(0, 2 + (run % 3))
    const typing = page.evaluate(([chars]) => window.collab.session().typeInB(chars!, 15), [typed])
    for (const text of steps) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
      await page.waitForTimeout(10 + (run % 4) * 5)
    }
    await cdp.send('Input.insertText', { text: committed })
    await typing
    await page.evaluate(() => window.collab.session().settled())
    expect(errors).toEqual([])
    const docs = await page.evaluate(() => window.collab.session().docs())
    const text = docs.textA
    compositions += docs.stats.compositions
    remoteWhileComposing += docs.stats.remoteWhileComposing
    const problems = [
      JSON.stringify(docs.a) !== JSON.stringify(docs.server) && 'editor A differs from the server',
      JSON.stringify(docs.b) !== JSON.stringify(docs.server) && 'editor B differs from the server',
      ...[...committed].filter(char => count(text, char) !== count(committed, char)).map(char => `"${char}" x${count(text, char)}`),
      ...[...typed].filter(char => count(text, char) !== 1).map(char => `"${char}" x${count(text, char)}`),
      count(text, 'hello world'.replace(/\s/g, '')) > 1 && 'base text duplicated',
    ].filter(Boolean)
    if (problems.length) {
      failures.push(`run ${run}: ${problems.join(', ')} → ${text}`)
    }
  }
  if (process.env.RSTORE_OT_IME_REPORT) {
    appendFileSync(process.env.RSTORE_OT_IME_REPORT, `${JSON.stringify({ runs, failures: failures.length, compositions, remoteWhileComposing, samples: failures.slice(0, 5) })}\n`)
  }
  expect(failures).toEqual([])
  // The runs really composed, and remote edits really arrived mid-composition.
  expect(compositions).toBe(runs)
  expect(remoteWhileComposing).toBeGreaterThan(0)
})
