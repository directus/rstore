<script lang="ts" setup>
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { svg } from 'animejs'
import { onMounted, shallowRef, useTemplateRef } from 'vue'
import HomePageAnimationItem from './HomePageAnimationItem.vue'

const motionPath1 = useTemplateRef('motionPath1')
const motionPath2 = useTemplateRef('motionPath2')

const motionPath1Animation = shallowRef<any>()
const motionPath2Animation = shallowRef<any>()

onMounted(() => {
  motionPath1Animation.value = svg.createMotionPath(motionPath1.value!.querySelector('#path69')!)
  motionPath2Animation.value = svg.createMotionPath(motionPath2.value!.querySelector('#path70')!)
})

interface Ball {
  id: string
}

const balls1 = shallowRef<Ball[]>([])
const balls2 = shallowRef<Ball[]>([])

function addBall() {
  const id = crypto.randomUUID()
  const listRef = Math.random() < 0.5
    ? balls1
    : balls2
  listRef.value = [
    ...listRef.value,
    { id },
  ]
}

function removeBall(listIndex: number, id: string) {
  const listRef = listIndex === 0 ? balls1 : balls2
  listRef.value = listRef.value.filter(ball => ball.id !== id)
}

const docVisibility = useDocumentVisibility()

useIntervalFn(() => {
  if (docVisibility.value === 'visible') {
    addBall()
  }
}, 500)
</script>

<template>
  <div class="relative">
    <img
      src="/animation-back.svg"
    >
    <div
      class="absolute -top-[54px] left-[29px]"
    >
      <svg
        id="motion-path1"
        ref="motionPath1"
        width="265.79565"
        height="359.42303"
        viewBox="0 0 265.79565 359.42303"
        version="1.1"
        class="opacity-0"
      >
        <defs
          id="defs1"
        />
        <g
          id="layer1"
          transform="translate(-536.09419,-160.58418)"
        >
          <path
            id="path69"
            style="fill:none;fill-opacity:1;stroke:blue;stroke-width:0.529001;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1;paint-order:normal"
            d="m 596.1371,160.84869 v 149.53917 c 0,4.414 3.31173,7.47695 7.4723,7.47695 h 59.77841 c 4.65944,0 7.4723,-2.8146 7.4723,-7.47695 v -29.90784 c 0,-4.88621 2.93114,-7.47695 7.4723,-7.47695 h 37.36151 c 4.65796,0 7.4723,2.16865 7.4723,7.47695 v 29.90784 33.64631 l -14.94461,3.73848 c -2.98615,-9.76699 -7.10621,-19.75011 7.47231,-26.16936 l 74.723,26.16936 11.20845,-22.43088 -37.3615,-11.21543 c 0,0 -11.0467,9.53031 -11.20845,33.64631 v 89.7235 c 0,9.96927 -4.98155,14.95392 -14.9446,14.95392 h -59.77841 c -9.96305,0 -14.9446,-4.98465 -14.9446,-14.95392 V 392.6344 c 0,-4.97407 -2.50133,-7.47696 -7.4723,-7.47696 h -22.4169 c 0,19.93857 -9.96306,29.90784 -29.88921,29.90784 -14.9446,0 -24.90765,-9.96927 -29.8892,-29.90784 H 543.831 c -4.24461,0 -7.4723,2.41281 -7.4723,7.47696 v 67.29263 3.73847 h 89.66761 c 6.0619,0.11438 9.02481,1.75716 11.20845,3.73848 18.68075,16.94999 18.68075,52.33871 18.68075,52.33871"
          />
        </g>
      </svg>
      <!-- Balls -->
      <HomePageAnimationItem
        v-for="ball in balls1"
        :key="ball.id"
        :motion-path="motionPath1Animation"
        class="absolute -top-[4px] -left-[4px]"
        @finish="removeBall(0, ball.id)"
      />
    </div>
    <div class="absolute -top-[32px] left-[29px]">
      <svg
        id="motion-path2"
        ref="motionPath2"
        width="247.11493"
        height="336.99213"
        viewBox="0 0 247.11493 336.99213"
        version="1.1"
        class="opacity-0"
      >
        <defs
          id="defs1"
        />
        <g
          id="layer1"
          transform="translate(-536.09418,-183.01506)"
        >
          <path
            id="path70"
            style="fill:none;fill-opacity:1;stroke:red;stroke-width:0.529001;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1;paint-order:normal"
            d="m 782.94462,183.27956 v 134.58525 33.64632 l -27.32602,-35.12225 -22.4046,31.38377 -39.93699,-18.6924 c 0,0 59.94016,-5.4236 59.77841,18.6924 v 89.7235 c 0,9.96927 -4.98155,14.95392 -14.9446,14.95392 h -59.77841 c -9.96305,0 -14.9446,-4.98465 -14.9446,-14.95392 V 392.6344 c 0,-4.97407 -2.50133,-7.47696 -7.4723,-7.47696 h -22.4169 c 0,19.93857 -9.96306,29.90784 -29.88921,29.90784 -14.9446,0 -24.90765,-9.96927 -29.8892,-29.90784 H 543.831 c -4.24461,0 -7.4723,2.41281 -7.4723,7.47696 v 67.29263 3.73847 h 89.66761 c 6.0619,0.11438 9.02481,1.75716 11.20845,3.73848 18.68075,16.94999 18.68075,52.33871 18.68075,52.33871"
          />
        </g>
      </svg>
      <!-- Balls -->
      <HomePageAnimationItem
        v-for="ball in balls2"
        :key="ball.id"
        :motion-path="motionPath2Animation"
        class="absolute -top-[4px] -left-[4px]"
        @finish="removeBall(1, ball.id)"
      />
    </div>
    <img
      src="/animation-wheel.svg"
      class="absolute top-[141px] left-[66px] animate-spin-slow duration-[60s]"
    >
    <img
      src="/animation-front.svg"
      class="absolute top-0 left-0 object-contain"
    >
    <div class="size-[7px] absolute bg-[#00FF62] rounded-full top-[107px] left-[282.5px] shadow-[0_0_8px_var(--tw-shadow-color)] shadow-[#00FF62] animate-pulse-zoom" />
    <div class="size-[7px] absolute bg-[#00FF62] rounded-full top-[122px] left-[282.5px] shadow-[0_0_8px_var(--tw-shadow-color)] shadow-[#00FF62] animate-pulse-zoom [animation-delay:1500ms]" />
    <img
      src="/akryum-logo.svg"
      class="size-4 absolute top-[196px] left-[203px] shadow animate-pulse"
    >
  </div>
</template>
