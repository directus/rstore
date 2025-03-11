---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Reactive Data Store"
  # text: "Reactive store"
  tagline: That handles all your data needs
  image:
    light: /LogoTextHorizontalBlack.svg
    dark: /LogoTextHorizontalWhite.svg
    alt: rstore logo
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: Learn more
      link: /guide/learn-more

# features:
#   - title:
#     details: Lorem ipsum dolor sit amet, consectetur adipiscing elit
#   - title: Feature B
#     details: Lorem ipsum dolor sit amet, consectetur adipiscing elit
#   - title: Feature C
#     details: Lorem ipsum dolor sit amet, consectetur adipiscing elit
---

<script setup>
import VPFeatures from 'vitepress/dist/client/theme-default/components/VPFeatures.vue'
</script>

<div class="flex flex-col items-center m-16 gap-4">
  <!-- <picture class="size-[120px]">
    <source media="(prefers-color-scheme: dark)" srcset="/directus.svg">
    <source media="(prefers-color-scheme: light)" srcset="/directus-dark.svg">
    <img src="/directus-dark.svg" alt="directus logo" class="w-full">
  </picture> -->
  <div class="relative">
    <div class="absolute bottom-full h-50 w-1 bg-gradient-to-b from-transparent via-30% via-transparent to-[#9068f2] left-15.5">
      <div class="absolute inset-0 animate-pipe-down">
        <div class="absolute top-0 size-1 bg-black dark:bg-white rounded-full"></div>
      </div>
      <div class="absolute inset-0 animate-pipe-down" style="animation-delay: -0.5s;">
        <div class="absolute top-0 size-1 bg-black dark:bg-white rounded-full"></div>
      </div>
      <div class="absolute inset-0 animate-pipe-down" style="animation-delay: -1s;">
        <div class="absolute top-0 size-1 bg-black dark:bg-white rounded-full"></div>
      </div>
      <div class="absolute inset-0 animate-pipe-down" style="animation-delay: -1.5s;">
        <div class="absolute top-0 size-1 bg-black dark:bg-white rounded-full"></div>
      </div>
      <div class="absolute inset-0 animate-pipe-down" style="animation-delay: -2s;">
        <div class="absolute top-0 size-1 bg-black dark:bg-white rounded-full"></div>
      </div>
      <div class="absolute inset-0 animate-pipe-down" style="animation-delay: -2.5s;">
        <div class="absolute top-0 size-1 bg-black dark:bg-white rounded-full"></div>
      </div>
    </div>
    <div class="absolute border-12 border-[#9068f2] rounded-full inset-0 blur-sm animate-grow-fade"></div>
    <div class="absolute border-12 border-[#9068f2] rounded-full inset-0 blur-sm animate-grow-fade" style="animation-delay: -1s;"></div>
    <div class="absolute border-12 border-[#9068f2] rounded-full inset-0 blur-sm animate-grow-fade" style="animation-delay: -2s;"></div>
    <a href="https://directus.io" target="_blank" class="block relative">
      <img src="/directus-logo-stacked.png" alt="directus logo" class="size-32 rounded-full">
    </a>
  </div>

  <div class="italic relative z-10 text-[#9068f2] text-sm backdrop-blur-sm px-4 py-2 rounded-full">
    powered by rstore
  </div>

</div>

<!-- Features -->

<VPFeatures
  :features="[
    {
      icon: '🪲',
      title: 'Squashed Bugs',
      details: 'The reactive normalized cache ensure all components are up-to-date all the time.'
    },
    {
      icon: '⚡',
      title: 'Local-first Cache',
      details: 'Cache reads are computed on the client, enabling offline and realtime apps.'
    },
    {
      icon: '🔌',
      title: 'Plugin System',
      details: 'Fetch any data from any source with the very flexible plugin system.'
    },
    {
      icon: '📍',
      title: 'Colocated Queries',
      details: 'Write queries and mutations right inside the components that need them.'
    },
    {
      icon: '✒️',
      title: 'Form Handling',
      details: 'Create form objects to handle data, validation, submitting, error and more.'
    },
    {
      icon: '💫',
      title: 'Scale Up & Down',
      details: 'Use rstore for small prototypes or big enterprise apps. It scales with your needs.'
    },
    {
      icon: '🔍',
      title: 'TypeScript Support',
      details: 'Enjoy full type safety and autocomplete for your queries and mutations.'
    },
    {
      icon: { src: '/nuxt.svg' },
      title: 'Nuxt Module',
      details: 'Handles SSR and integrates with Nuxt Devtools.'
    },
  ]"
  class="VPHomeFeatures"
/>

<div class="text-center flex flex-col m-12 gap-2 items-center">

# Sponsors

[💚 Become a sponsor!](https://github.com/sponsors/Akryum)

![sponsors](https://akryum.netlify.app/sponsors.svg)

</div>
