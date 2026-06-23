/**
 * Generate a short random identifier for a clock.
 */
export function createNodeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}
