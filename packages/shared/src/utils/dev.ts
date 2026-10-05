/**
 * Whether this is a production build.
 *
 * `process.env.NODE_ENV` is written literally so bundlers replace it
 * statically; the `try` covers runtimes without `process` (an unbundled
 * browser module), which count as development.
 */
export function isProductionBuild(): boolean {
  try {
    // Importing `node:process` would break browser bundles.
    // eslint-disable-next-line node/prefer-global/process
    return process.env.NODE_ENV === 'production'
  }
  catch {
    return false
  }
}

/** Warning function returned by {@link createWarnOnce}. */
export type WarnOnce = (id: string, message: string) => void

/**
 * Create a dev-only `console.warn` that reports each `id` once.
 *
 * Each call creates an independent memory of reported ids, so a per-store
 * instance warns again for a new store. In production builds it never warns.
 */
export function createWarnOnce(): WarnOnce {
  const reported = new Set<string>()
  return (id, message) => {
    if (reported.has(id) || isProductionBuild()) {
      return
    }
    reported.add(id)
    console.warn(message)
  }
}
