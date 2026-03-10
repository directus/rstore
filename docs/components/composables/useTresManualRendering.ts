import type { Ref } from 'vue'
import { onBeforeUnmount, ref, watch } from 'vue'

interface ManualRenderContext {
  advance: () => void
}

export function useTresManualRendering(shouldRender: Ref<boolean>) {
  const advanceFrame = ref<(() => void) | null>(null)
  let animationFrameId: number | null = null

  function cancelScheduledFrame() {
    if (animationFrameId === null || typeof window === 'undefined') {
      animationFrameId = null
      return
    }

    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  function renderFrame() {
    animationFrameId = null
    advanceFrame.value?.()

    if (!shouldRender.value || typeof window === 'undefined') {
      return
    }

    animationFrameId = window.requestAnimationFrame(renderFrame)
  }

  function syncRenderLoop() {
    cancelScheduledFrame()

    if (!shouldRender.value || !advanceFrame.value || typeof window === 'undefined') {
      return
    }

    advanceFrame.value()
    animationFrameId = window.requestAnimationFrame(renderFrame)
  }

  function setManualRenderContext(context: ManualRenderContext | null) {
    advanceFrame.value = context?.advance ?? null
    syncRenderLoop()
  }

  watch(shouldRender, syncRenderLoop, {
    immediate: true,
  })

  onBeforeUnmount(() => {
    cancelScheduledFrame()
    advanceFrame.value = null
  })

  return {
    setManualRenderContext,
  }
}
