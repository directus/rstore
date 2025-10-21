<script lang="ts" setup>
import type { JSAnimation } from 'animejs'
import { animate } from 'animejs'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const props = defineProps<{
  motionPath: any
}>()

const emit = defineEmits<{
  finish: []
}>()

const el = useTemplateRef('el')

let animation: JSAnimation

onMounted(() => {
  const duration = Math.random() * 4000 + 10000
  animation = animate(el.value!, {
    ease: 'linear',
    duration,
    ...props.motionPath,
    opacity: [
      { from: 0, to: 1, duration: duration * 0.05 },
      { value: 1, duration: duration * 0.9 },
      { to: 0, duration: duration * 0.05 },
    ],
    onComplete: () => {
      emit('finish')
    },
  })
})

onBeforeUnmount(() => {
  animation?.cancel()
})
</script>

<template>
  <div
    ref="el"
  >
    <div
      class="size-[8px] rounded-full bg-[#00FF62]"
    />
  </div>
</template>
