import { onBeforeUnmount, onMounted, ref } from 'vue'

interface UseIsMobileOptions {
  breakpoint?: number
  initialValue?: boolean
}

export function useIsMobile(options: UseIsMobileOptions = {}) {
  const {
    breakpoint = 768,
    initialValue = false,
  } = options

  const isMobile = ref(initialValue)

  function updateIsMobile() {
    if (typeof window === 'undefined') {
      return
    }
    isMobile.value = window.innerWidth < breakpoint
  }

  onMounted(() => {
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateIsMobile)
  })

  return {
    isMobile,
  }
}
