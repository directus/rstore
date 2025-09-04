<script lang="ts" setup>
import FrameworkBadge from './FrameworkBadge.vue';

type FrameworkKey = 'vue' | 'nuxt'

defineProps<{
  frameworks: Partial<Record<FrameworkKey, boolean>>
}>()

const logos = {
  vue: '/vue.svg',
  nuxt: '/nuxt.svg',
}

const name = {
  vue: 'Vue',
  nuxt: 'Nuxt',
}
</script>

<template>
  <div class="flex items-center my-2 *:not-first:rounded-l-none *:not-last:rounded-r-none *:not-last:border-r-0">
    <FrameworkBadge
      v-for="(enabled, key) in frameworks"
      :key
      :logo="logos[key]"
      :name="name[key] ?? key"
      :ignored="!enabled"
    />
  </div>
</template>
