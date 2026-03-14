export const TUTORIAL_WORKSPACE_ROOT = '/tutorial'
export const TUTORIAL_PREVIEW_PORT = 4173

export function createTutorialServerTracker() {
  const urls = new Map<number, string>()
  const waiters = new Map<number, Array<(url: string) => void>>()

  return {
    markReady(port: number, url: string) {
      urls.set(port, url)

      const resolvers = waiters.get(port)
      if (!resolvers?.length) {
        return
      }

      waiters.delete(port)
      for (const resolve of resolvers) {
        resolve(url)
      }
    },

    getUrl(port: number) {
      return urls.get(port) ?? null
    },

    waitFor(port: number) {
      const existing = urls.get(port)
      if (existing) {
        return Promise.resolve(existing)
      }

      return new Promise<string>((resolve) => {
        const resolvers = waiters.get(port) ?? []
        resolvers.push(resolve)
        waiters.set(port, resolvers)
      })
    },
  }
}
