import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/style.css'

/** Ordinary Vue/Vite inspector bootstrap, producer ownership lives outside this SPA. */
const app = createApp(App)
app.use(createPinia())
app.mount('#app')
/** Release framework scopes and inspector channel during hot replacement. */
if (import.meta.hot)
  import.meta.hot.dispose(() => app.unmount())
