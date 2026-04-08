import { createApp } from 'vue'
import App from './App.vue'
import { setupRstore } from './rstore/index'
import { registerTutorialSmokeActions } from './tutorial/actions'
import { memoryBackend } from './tutorial/backend'
import { initTutorialBridge, resetTutorialState, setTutorialState } from './tutorial/bridge'
import './style.css'

function updateRuntimeBanner(state: 'booting' | 'ready' | 'error', title: string, detail: string) {
  const banner = document.querySelector<HTMLElement>('#tutorial-runtime-banner')
  if (!banner)
    return

  banner.hidden = state === 'ready'
  banner.dataset.state = state
  banner.querySelector<HTMLElement>('[data-role="title"]')!.textContent = title
  banner.querySelector<HTMLElement>('[data-role="detail"]')!.textContent = detail
}

async function main() {
  initTutorialBridge()
  resetTutorialState({
    booted: false,
    storeReady: false,
  })
  updateRuntimeBanner('booting', 'Starting tutorial sandbox…', 'The preview is live even when the chapter UI is still sparse or unfinished.')

  memoryBackend.reset()
  registerTutorialSmokeActions()

  const app = createApp(App)
  await setupRstore(app)
  app.mount('#app')

  setTutorialState({
    booted: true,
    storeReady: true,
  })
  updateRuntimeBanner('ready', 'Tutorial sandbox running', 'This chapter preview is connected. Edit the files and watch the app evolve here.')
}

main().catch((error) => {
  console.error(error)
  initTutorialBridge()
  resetTutorialState({
    booted: false,
    storeReady: false,
    lastError: error instanceof Error ? error.message : String(error),
  })
  updateRuntimeBanner('error', 'Tutorial sandbox hit an error', 'Check the tutorial logs below for the failing runtime output.')
})
