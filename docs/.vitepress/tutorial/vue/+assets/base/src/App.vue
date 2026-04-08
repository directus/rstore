<script setup lang="ts">
import { computed } from 'vue'
import TutorialContent from './components/TutorialContent.vue'
import { tutorialRuntimeBannerState } from './runtimeBanner'

const props = withDefaults(defineProps<{
  showContent?: boolean
}>(), {
  showContent: false,
})

const shellTitle = computed(() => tutorialRuntimeBannerState.status === 'error'
  ? 'Preview unavailable'
  : 'Preparing chapter preview')

const shellDetail = computed(() => tutorialRuntimeBannerState.status === 'error'
  ? 'The runtime hit an error before the chapter UI finished mounting. Check the logs below for details.'
  : 'The root app shell is ready. The chapter component will appear here once the sandbox finishes loading.')
</script>

<template>
  <div class="tutorial-shell">
    <header
      v-if="tutorialRuntimeBannerState.visible"
      class="tutorial-runtime-banner"
      :data-state="tutorialRuntimeBannerState.status"
    >
      <span class="tutorial-runtime-dot" aria-hidden="true" />
      <div class="tutorial-runtime-copy">
        <strong>{{ tutorialRuntimeBannerState.title }}</strong>
        <span>{{ tutorialRuntimeBannerState.detail }}</span>
      </div>
    </header>

    <div class="tutorial-shell-frame">
      <Suspense v-if="props.showContent">
        <TutorialContent />

        <template #fallback>
          <main class="tutorial-app app-shell">
            <section class="hero">
              <div class="hero-head">
                <p class="eyebrow">Preview</p>
                <h1>{{ shellTitle }}</h1>
                <p>{{ shellDetail }}</p>
              </div>
            </section>
          </main>
        </template>
      </Suspense>

      <main v-else class="tutorial-app app-shell">
        <section class="hero">
          <div class="hero-head">
            <p class="eyebrow">Preview</p>
            <h1>{{ shellTitle }}</h1>
            <p>{{ shellDetail }}</p>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
