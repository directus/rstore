import { createApp } from 'vue'
import App from './App.vue'
import { setupRstore } from './rstore/index'
import { createDemoRuntime } from '#demo/runtime'
import './style.css'

const demoRuntime = createDemoRuntime()

async function main() {
  demoRuntime.beforeMount()

  const app = createApp(App)
  await setupRstore(app)
  app.mount('#app')

  demoRuntime.afterMount()
}

main().catch((error) => {
  console.error(error)
  demoRuntime.reportError(error)
})
