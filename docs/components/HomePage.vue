<script lang="ts" setup>
import { useElementSize } from '@vueuse/core'
import { VPButton, VPFeatures } from 'vitepress/theme'
import { ref, useTemplateRef, watch } from 'vue'

const heroEl = useTemplateRef('hero')

const { width, height } = useElementSize(heroEl)

const dotSize = 20
const dotRows = ref(0)
const dotColumns = ref(0)

watch(() => [width.value, height.value], ([w, h]) => {
  if (w > 0 && h > 0) {
    dotColumns.value = Math.ceil(w / dotSize)
    dotRows.value = Math.ceil(h / dotSize)
  }
}, { immediate: true })

function distance(x: number, y: number) {
  const posX = x * dotSize
  const posY = y * dotSize
  const centerX = width.value / 2
  const centerY = height.value / 2
  return Math.sqrt(
    (centerX - posX) ** 2
    + (centerY - posY) ** 2,
  )
}

const heroHover = ref(false)
</script>

<template>
  <div
    ref="hero"
    class="relative"
    @mouseenter="heroHover = true"
    @mouseleave="heroHover = false"
  >
    <div class="absolute inset-0 overflow-hidden">
      <!-- Animated dots -->
      <div
        v-for="y in dotRows"
        :key="y"
        class="flex dark:drop-shadow-[0_0_4px_var(--vp-c-brand-1)]"
      >
        <div
          v-for="x in dotColumns" :key="x" class="size-1 m-2 bg-(--c-brand) flex-none animate-pulse relative -left-0.5"
          :style="{
            animationDelay: (y * dotColumns + x) % 4 < 3 ? `${distance(x, y) / 300}s` : `-${Math.random() * 2}s`,
            animationDuration: (y * dotColumns + x) % 4 < 3 ? `2s` : `${Math.random() * 0.4 + 0.8}s`,
          }"
        />
      </div>

      <!-- Vertical gradient -->
      <div class="absolute inset-0 bg-gradient-to-b from-(--vp-c-bg) via-transparent to-(--vp-c-bg)" />
    </div>

    <!-- Logo -->

    <div class="flex flex-col items-center py-2 gap-4 relative">
      <div class="p-12 rounded-full bg-radial from-(--vp-c-bg) via-(--vp-c-bg) via-30% to-transparent">
        <div class="block size-[400px]">
          <img src="/LogoTextHorizontalBlack.svg" alt="rstore logo" class="!size-full dark:!hidden">
          <img src="/LogoTextHorizontalWhite.svg" alt="rstore logo" class="!size-full not-dark:!hidden">
        </div>
      </div>
    </div>
  </div>

  <!-- Tag line -->

  <div class="mb-12 flex flex-col items-center gap-4">
    <h1 class="text-center">
      <span class="name clip text-6xl font-extrabold">
        The Reactive Data Store
      </span>
    </h1>

    <p class="text-center">
      Finest Data Management for any Vue app
    </p>
  </div>

  <!-- Actions -->

  <div class="flex justify-center gap-4 my-12">
    <VPButton
      href="/guide/getting-started"
      text="Get Started ➜"
    />
    <VPButton
      theme="alt"
      href="/guide/learn-more"
      text="Why rstore?"
    />
  </div>

  <!-- Features -->

  <VPFeatures
    :features="[
      {
        icon: '🪲',
        title: 'Squashed Bugs',
        details: 'The reactive normalized cache ensures all components are up-to-date all the time.',
      },
      {
        icon: '⚡',
        title: 'Local-first Cache',
        details: 'Cache reads are computed on the client, enabling offline and realtime apps.',
      },
      {
        icon: '🚀',
        title: 'Optimistic Mutations',
        details: `Creating, updating and deleting data instantly updates your UI and doesn't wait for the server.`,
      },
      {
        icon: '✒️',
        title: 'Form Handling',
        details: 'Create form objects to handle data, validation, submitting, error and more.',
      },
      {
        icon: '🔍',
        title: 'TypeScript Support',
        details: 'Enjoy full type safety and autocomplete for your queries and mutations.',
      },
      {
        icon: '💫',
        title: 'Scale Up & Down',
        details: 'Use rstore for small prototypes or big enterprise apps. It scales with your needs.',
      },
      {
        icon: '🔌',
        title: 'Plugin System',
        details: 'Fetch any data from any source with the very flexible plugin system.',
      },
      {
        icon: { src: '/nuxt.svg' },
        title: 'Nuxt Module',
        details: 'Handles SSR and integrates with Nuxt Devtools.',
      },
    ]"
    class="VPHomeFeatures"
  />
</template>

<style scoped>
.name,
.text {
  width: fit-content;
  max-width: 392px;
  letter-spacing: -0.4px;
  white-space: pre-wrap;
}

.VPHero.has-image .name,
.VPHero.has-image .text {
  margin: 0 auto;
}

.name {
  color: var(--vp-home-hero-name-color);
}

.clip {
  background: var(--vp-home-hero-name-background);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: var(--vp-home-hero-name-color);
}
</style>
