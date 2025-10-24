<script lang="ts" setup>
import { VPButton, VPFeatures } from 'vitepress/theme'
import HomePageAnimation from './HomePageAnimation.vue'
</script>

<template>
  <!-- Hero -->
  <div class="max-w-[1152px] mx-auto flex max-sm:flex-col px-4 max-sm:px-8 items-center gap-4 sm:gap-12">
    <div class="flex flex-col gap-12 py-24 flex-1">
      <!-- Logo -->
      <div class="block max-w-[400px] max-sm:max-w-[200px] max-sm:mx-auto">
        <img src="/LogoTextHorizontalBlack.svg" alt="rstore logo" class="!size-full dark:!hidden">
        <img src="/LogoTextHorizontalWhite.svg" alt="rstore logo" class="!size-full not-dark:!hidden">
      </div>

      <!-- Tag line -->

      <div class="flex flex-col items-start gap-4 max-sm:text-center max-sm:items-center">
        <h1>
          <span class="name clip text-6xl max-sm:text-4xl font-extrabold">
            The Pluggable Data Store
          </span>
        </h1>

        <p class="px-2">
          Data Management for Vue &amp; Nuxt - Fast, Type-Safe, and Offline-Ready.
        </p>
      </div>

      <!-- Actions -->

      <div class="flex justify-start max-sm:justify-center gap-4 px-2">
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
    </div>
    <HomePageAnimation class="flex-none max-sm:mb-12" />
  </div>

  <!-- Features -->

  <VPFeatures
    :features="[
      {
        icon: '🗃️',
        title: 'Single Source of Truth',
        details: 'The reactive normalized cache ensures all components are up-to-date all the time.',
      },
      {
        icon: '⚡',
        title: 'Local-first Cache',
        details: 'Cache reads are computed on the client, easing updates, syncs, offline and realtime.',
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
        icon: '🔗',
        title: 'Data Federation',
        details: 'Combine data from multiple sources into a single unified store.',
      },
      {
        icon: '🔔',
        title: 'Subscriptions',
        details: 'Connect to WebSockets or other real-time data sources for live updates.',
      },
      {
        icon: '📵',
        title: 'Offline',
        details: 'Built-in support for offline-first applications with automatic data synchronization.',
      },
      {
        icon: '🧩',
        title: 'Plugin System',
        details: 'Fetch any data from any source with the very flexible plugin system.',
      },
      // {
      //   icon: { src: '/nuxt.svg' },
      //   title: 'Nuxt Module',
      //   details: 'Handles SSR and integrates with Nuxt Devtools.',
      // },
      // {
      //   icon: { src: '/drizzle-logo.png' },
      //   title: 'Nuxt + Drizzle',
      //   details: 'Handles SSR and integrates with Nuxt Devtools.',
      // },
      // {
      //   icon: { src: '/directus-logo.svg' },
      //   title: 'Nuxt + Directus',
      //   details: 'Handles SSR and integrates with Nuxt Devtools.',
      // },
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
