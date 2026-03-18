import { createApp } from 'vue'
import App from './App.vue'
import { setupRstore } from './rstore/index'
import { registerTutorialSmokeActions } from './tutorial/actions'
import { memoryBackend } from './tutorial/backend'
import { initTutorialBridge, resetTutorialState, setTutorialState } from './tutorial/bridge'
import './style.css'

async function main() {
  initTutorialBridge()
  resetTutorialState({
    booted: false,
    storeReady: false,
  })

  memoryBackend.reset()
  registerTutorialSmokeActions()

  const app = createApp(App)
  await setupRstore(app)
  app.mount('#app')

  setTutorialState({
    booted: true,
    storeReady: true,
  })
}

main().catch((error) => {
  console.error(error)
  initTutorialBridge()
  resetTutorialState({
    booted: false,
    storeReady: false,
    lastError: error instanceof Error ? error.message : String(error),
  })
})
