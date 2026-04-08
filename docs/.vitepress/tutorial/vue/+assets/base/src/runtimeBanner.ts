import { reactive } from 'vue'

export type TutorialRuntimeBannerStatus = 'booting' | 'ready' | 'error'

interface TutorialRuntimeBannerState {
  visible: boolean
  status: TutorialRuntimeBannerStatus
  title: string
  detail: string
}

const defaultBannerState: TutorialRuntimeBannerState = {
  visible: true,
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
    visible: status !== 'ready',
    status,
    title,
    detail,
  })
}
