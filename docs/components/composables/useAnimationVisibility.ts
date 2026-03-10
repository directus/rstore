import type { Ref } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface AnimationLoopController {
  start: () => void
  stop: () => void
}

interface UseAnimationVisibilityOptions {
  threshold?: number
}

export function useAnimationVisibility(
  target: Ref<HTMLElement | null>,
  options: UseAnimationVisibilityOptions = {},
) {
  const {
    threshold = 0.05,
  } = options

  const isInViewport = ref(true)
  const isPageVisible = ref(true)
  const shouldAnimate = computed(() => isInViewport.value && isPageVisible.value)

  const rendererLoop = ref<AnimationLoopController | null>(null)
  let visibilityObserver: IntersectionObserver | null = null

  function syncRendererLoopState() {
    const loop = rendererLoop.value
    if (!loop) {
      return
    }

    if (shouldAnimate.value) {
      loop.start()
    }
    else {
      loop.stop()
    }
  }

  function setRendererLoop(loop: AnimationLoopController | null) {
    if (rendererLoop.value === loop) {
      return
    }

    rendererLoop.value = loop
    syncRendererLoopState()
  }

  function updatePageVisibility() {
    if (typeof document === 'undefined') {
      return
    }

    isPageVisible.value = !document.hidden
  }

  function ensureVisibilityObserver() {
    if (typeof window === 'undefined' || !window.IntersectionObserver) {
      return null
    }

    if (!visibilityObserver) {
      visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          isInViewport.value = entry?.isIntersecting ?? false
        },
        {
          threshold,
        },
      )
    }

    return visibilityObserver
  }

  const stopWatchingTarget = watch(
    target,
    (element, previousElement) => {
      const observer = ensureVisibilityObserver()
      if (!observer) {
        return
      }

      if (previousElement) {
        observer.unobserve(previousElement)
      }

      if (element) {
        observer.observe(element)
      }
    },
    {
      immediate: true,
    },
  )

  const stopWatchingAnimationState = watch(shouldAnimate, syncRendererLoopState)

  onMounted(() => {
    updatePageVisibility()
    document.addEventListener('visibilitychange', updatePageVisibility)
  })

  onBeforeUnmount(() => {
    stopWatchingTarget()
    stopWatchingAnimationState()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', updatePageVisibility)
    }
    visibilityObserver?.disconnect()
    visibilityObserver = null
  })

  return {
    isInViewport,
    isPageVisible,
    setRendererLoop,
    shouldAnimate,
  }
}
