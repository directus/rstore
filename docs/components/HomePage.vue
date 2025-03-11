<script lang="ts" setup>
import { useElementSize } from '@vueuse/core'
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
import VPFeatures from 'vitepress/dist/client/theme-default/components/VPFeatures.vue'
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

    <div class="flex flex-col items-center py-12 gap-4 relative">
      <div class="p-12 rounded-full bg-radial from-(--vp-c-bg) via-(--vp-c-bg) via-30% to-transparent">
        <div class="block size-[400px]">
          <img src="/LogoTextHorizontalBlack.svg" alt="rstore logo" class="!size-full dark:!hidden">
          <img src="/LogoTextHorizontalWhite.svg" alt="rstore logo" class="!size-full not-dark:!hidden">
        </div>
      </div>
    </div>
  </div>

  <!-- Directus powered by rstore -->
  <div class="flex flex-col items-center gap-4 -mt-24">
    <div class="relative group">
      <div class="absolute bottom-[calc(100%-2px)] h-32 w-1 bg-gradient-to-b from-transparent to-[#b175eb] left-11.5">
        <div
          v-for="i in 6"
          :key="i"
          class="absolute top-0 left-0 w-full h-full animate-pipe-down"
          :style="{
            animationDelay: `-${i * 0.5}s`,
          }"
        >
          <div class="absolute top-0 size-1 bg-(--c-brand) dark:shadow-[0_0_12px_var(--vp-c-brand-1),0_0_4px_var(--vp-c-brand-1)]" />
        </div>
      </div>
      <div
        v-for="i in 3"
        :key="i"
        class="absolute border-5 border-[#b175eb] rounded-full blur-xs inset-0 animate-grow-fade transition-all duration-300 ease-in-out group-hover:scale-120"
        :style="{
          animationDelay: `-${i}s`,
        }"
      />
      <a href="https://directus.io" target="_blank" class="block relative transition-all duration-300 ease-in-out group-hover:scale-150">
        <img src="/directus-logo.svg" alt="directus logo" class="size-24 rounded-full">
      </a>

      <div class="pointer-events-none absolute -inset-8 opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-in-out">
        <div class="text-center bg-[#b175eb] size-full rounded-full flex flex-col items-center justify-center p-4 leading-none text-black tracking-tight">
          <img src="/directus-black.svg" alt="directus logo" class="size-10 mb-2">
          <div><b class="text-xl">Directus Next</b></div>
          <div>is powered by<br><b>rstore</b>!</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tag line -->

  <div class="mt-24 mb-12 flex flex-col items-center gap-4">
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
        icon: '🔌',
        title: 'Plugin System',
        details: 'Fetch any data from any source with the very flexible plugin system.',
      },
      {
        icon: '📍',
        title: 'Colocated Queries',
        details: 'Write queries and mutations right inside the components that need them.',
      },
      {
        icon: '✒️',
        title: 'Form Handling',
        details: 'Create form objects to handle data, validation, submitting, error and more.',
      },
      {
        icon: '💫',
        title: 'Scale Up & Down',
        details: 'Use rstore for small prototypes or big enterprise apps. It scales with your needs.',
      },
      {
        icon: '🔍',
        title: 'TypeScript Support',
        details: 'Enjoy full type safety and autocomplete for your queries and mutations.',
      },
      {
        icon: { src: '/nuxt.svg' },
        title: 'Nuxt Module',
        details: 'Handles SSR and integrates with Nuxt Devtools.',
      },
    ]"
    class="VPHomeFeatures"
  />

  <div class="text-center flex flex-col m-12 gap-2 items-center">
    <VPButton
      href="https://github.com/sponsors/Akryum"
      target="_blank"
      theme="sponsor"
      text="❤️ Become a sponsor!"
    />

    <img src="https://akryum.netlify.app/sponsors.svg" alt="Sponsors list" class="w-300">
  </div>
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
