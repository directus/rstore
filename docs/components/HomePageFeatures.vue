<script lang="ts" setup>
import { Icon } from '@iconify/vue'

interface FeatureIconObject {
  src: string
}

interface FeatureItem {
  icon: string | FeatureIconObject
  title: string
  details: string
}

defineProps<{
  features: FeatureItem[]
}>()

function isImageIcon(icon: FeatureItem['icon']): icon is FeatureIconObject {
  return typeof icon !== 'string'
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <article
      v-for="(feature, index) in features"
      :key="feature.title"
      class="reveal-up group relative overflow-hidden rounded-2xl border border-emerald-600/[0.16] bg-white/[0.72] p-5 transition duration-200 hover:-translate-y-1 hover:border-emerald-600/35 hover:shadow-[0_20px_44px_rgba(0,0,0,0.08)] dark:border-emerald-400/20 dark:bg-[#121815]/[0.88]"
      :style="{ animationDelay: `${740 + index * 65}ms` }"
    >
      <div class="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100" style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 48%);" />

      <div class="relative z-10 flex items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-600/[0.16] bg-emerald-500/[0.08] text-xl dark:border-emerald-400/20">
          <img
            v-if="isImageIcon(feature.icon)"
            :src="feature.icon.src"
            :alt="`${feature.title} icon`"
            class="h-6 w-6 object-contain"
          >
          <Icon
            v-else
            :icon="feature.icon"
            class="h-5 w-5 text-emerald-700 dark:text-emerald-300"
          />
        </div>

        <h3 class="!m-0 !text-[1.1rem] !font-extrabold !leading-[1.2] !tracking-[-0.02em] !text-emerald-700 dark:!text-emerald-400">
          {{ feature.title }}
        </h3>
      </div>

      <p class="relative z-10 !mt-3 !mb-0 !leading-7 !text-[var(--vp-c-text-2)]">
        {{ feature.details }}
      </p>
    </article>
  </div>
</template>

<style scoped>
.reveal-up {
  opacity: 0;
  animation: reveal-up 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes reveal-up {
  from {
    opacity: 0;
    transform: translateY(18px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
