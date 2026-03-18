import { createDemoRuntime } from '#demo/runtime'

const demoRuntime = createDemoRuntime()

export default defineNuxtPlugin(() => {
  demoRuntime.start()

  onNuxtReady(() => {
    demoRuntime.markReady(() => useStore())
  })
})
