/** Register the browser reconnect listener that triggers a sync. */
export function installReconnectHook(hook: any) {
  hook('init', ({ store }: any) => {
    window.addEventListener('online', async () => {
      await store.$sync()
    })
  })
}
