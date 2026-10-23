import type { PruneRun } from './prune'
import { loadPage } from './load'

/** Main-result ordering is independent of superseded transport completion. */
interface MainPublication {
  /** Resolves once this main load settles or a pushed main result lands. */
  promise: Promise<void>
  /** Releases waiting pages without cancelling the underlying transport. */
  release: () => void
}

/** Weak query ownership avoids retaining disposed consumers. */
const publications = new WeakMap<object, MainPublication>()

/** Load the main page while exposing a separate result-publication barrier. */
export function loadMainPageForPublication(ctx: any, forceFetch: boolean, pruneRun?: PruneRun) {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = publications.get(ctx)
  publications.set(ctx, { promise, release })
  // Wake older waiters so they can follow the replacement main load instead.
  previous?.release()
  return loadPage(ctx, ctx.mainPage, forceFetch, pruneRun).finally(release)
}

/** Capture the barrier a push may satisfy before reactive observers replace it. */
export function getMainPagePublicationRelease(ctx: any): (() => void) | undefined {
  return publications.get(ctx)?.release
}

/** Wait for the current main result, following any intervening replacement load. */
export async function waitForMainPagePublication(ctx: any): Promise<void> {
  let publication = publications.get(ctx)
  while (publication) {
    await publication.promise
    const current = publications.get(ctx)
    if (current === publication)
      return
    publication = current
  }
}
