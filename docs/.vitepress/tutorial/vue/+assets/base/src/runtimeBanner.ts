import { reactive } from 'vue'

export type TutorialRuntimeBannerStatus = 'booting' | 'ready' | 'error'

interface TutorialRuntimeBannerState {
  status: TutorialRuntimeBannerStatus
  title: string
  detail: string
}

const defaultBannerState: TutorialRuntimeBannerState = {
  status: 'booting',
  title: 'Starting tutorial sandbox...',
  detail: 'The preview is live even when the chapter UI is still sparse or unfinished.',
}

export const tutorialRuntimeBannerState = reactive<TutorialRuntimeBannerState>({
  ...defaultBannerState,
})

export function resetTutorialRuntimeBanner() {
  Object.assign(tutorialRuntimeBannerState, defaultBannerState)
}

export function updateTutorialRuntimeBanner(
  status: TutorialRuntimeBannerStatus,
  title: string,
  detail: string,
) {
  Object.assign(tutorialRuntimeBannerState, {
    status,
    title,
    detail,
  })
}
