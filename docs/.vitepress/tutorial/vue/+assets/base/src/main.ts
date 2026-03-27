import { createDemoRuntime } from '#demo/runtime'
import { createApp } from 'vue'
import App from './App.vue'
import { setupRstore } from './rstore/index'
import { resetTutorialRuntimeBanner, updateTutorialRuntimeBanner } from './runtimeBanner'
import './style.css'

const demoRuntime = createDemoRuntime()

async function main() {
  const container = document.querySelector<HTMLElement>('#app')

  if (!container) {
    throw new Error('Missing #app container for the tutorial preview.')
  }

  demoRuntime.beforeMount()
  resetTutorialRuntimeBanner()
  updateTutorialRuntimeBanner(
    'booting',
    'Starting tutorial sandbox...',
    'The preview is live even when the chapter UI is still sparse or unfinished.',
  )

  const shellApp = createApp(App, {
    showContent: false,
  })
  shellApp.mount(container)
  let shellMounted = true

  try {
    const app = createApp(App, {
      showContent: true,
    })

    await setupRstore(app)
    shellApp.unmount()
    shellMounted = false
    app.mount(container)

    demoRuntime.afterMount()
    updateTutorialRuntimeBanner(
      'ready',
      'Tutorial sandbox running',
      'This chapter preview is connected. Edit the files and watch the app evolve here.',
    )
  }
  catch (error) {
    console.error(error)
    demoRuntime.reportError(error)
    updateTutorialRuntimeBanner(
      'error',
      'Tutorial sandbox hit an error',
      'Check the tutorial logs below for the failing runtime output.',
    )

    if (!shellMounted) {
      container.innerHTML = ''
      createApp(App, {
        showContent: false,
      }).mount(container)
    }
  }
}

void main()
