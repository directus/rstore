<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { codeToHtml } from 'shiki'
import { useData } from 'vitepress'
import { VPButton } from 'vitepress/theme'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import HomePageAiSupportAnimation from './HomePageAiSupportAnimation.vue'
import HomePageAnimationV2 from './HomePageAnimationV2.vue'
import HomePageFeatures from './HomePageFeatures.vue'

const setupCards = [
  {
    title: 'Vue',
    href: '/guide/getting-started#vue',
    eyebrow: 'Vanilla setup',
    description: 'Set up the store yourself and add only the plugins you need.',
    accent: 'A good fit if you want full control and minimal magic.',
    logo: '/vue.svg',
  },
  {
    title: 'Nuxt',
    href: '/guide/getting-started#nuxt',
    eyebrow: 'Filesystem-driven',
    description: 'Auto-load collections and plugins from folders, then use one typed `useStore()` across your app.',
    accent: 'Great when you want Nuxt conventions and quick onboarding.',
    logo: '/nuxt.svg',
  },
  {
    title: 'Nuxt + Drizzle',
    href: '/plugins/nuxt-drizzle',
    eyebrow: 'Auto-generated backend',
    description: 'Generate collections and endpoints from your Drizzle schema with very little manual setup.',
    accent: 'Useful for full-stack teams building on SQL.',
    logo: '/drizzle-logo.png',
  },
]

const coreFeatures = [
  {
    icon: 'lucide:database',
    title: 'Single Source of Truth',
    details: 'One reactive normalized cache keeps your app state in sync.',
  },
  {
    icon: 'lucide:zap',
    title: 'Local-first Cache',
    details: 'Reads happen locally first, so screens stay responsive.',
  },
  {
    icon: 'lucide:rocket',
    title: 'Fast Mutations',
    details: 'Create, update, and delete actions update the UI right away.',
  },
  {
    icon: 'lucide:file-pen-line',
    title: 'Form Handling',
    details: 'Form objects handle values, validation, submit state, and errors.',
  },
  {
    icon: 'lucide:file-search',
    title: 'TypeScript Support',
    details: 'Strong types and autocomplete for queries and mutations.',
  },
  {
    icon: 'lucide:git-merge',
    title: 'Data Federation',
    details: 'Pull data from different sources into one store graph.',
  },
  {
    icon: 'lucide:bell-ring',
    title: 'Live Subscriptions',
    details: 'Connect WebSockets or other realtime sources for live updates.',
  },
  {
    icon: 'lucide:wifi-off',
    title: 'Offline Support',
    details: 'Keep working offline and sync automatically when connection returns.',
  },
  {
    icon: 'lucide:puzzle',
    title: 'Plugin System',
    details: 'Use plugins to connect the store to any data source.',
  },
]

const testimonials = [
  {
    quote: `It's cool.`,
    name: 'Rijk van Zanten',
    image: '/testimonials/rijk.webp',
  },
  {
    quote: `I've used it before.`,
    name: 'Hannes Küttner',
    image: '/testimonials/hannes.jpg',
  },
]

const aiSupportPillars = [
  {
    title: 'Predictable APIs',
    details: 'Collections, queries, forms, and plugins follow the same patterns, so AI output is easier to review.',
  },
  {
    title: 'Clear project structure',
    details: 'Schema conventions give agents enough context to edit multiple files without random guesswork.',
  },
  {
    title: 'Practical AI workflow',
    details: 'Use AI for repetitive setup and migrations while your team keeps architecture decisions in-house.',
  },
]

const docsJumpCards = [
  {
    icon: 'lucide:rocket',
    title: 'Launch in minutes',
    description: 'Start from scratch with short setup steps and copy-paste snippets.',
    href: '/guide/getting-started',
    cta: 'Open setup guide',
  },
  {
    icon: 'lucide:database-zap',
    title: 'Master your data flows',
    description: 'Learn the core query, mutation, form, cache, and realtime patterns.',
    href: '/guide/data/query',
    cta: 'Browse data APIs',
  },
  {
    icon: 'lucide:puzzle',
    title: 'Plug in any backend',
    description: 'Use plugins and hooks to connect REST, WebSockets, SQL pipelines, or custom transports.',
    href: '/guide/plugin/setup',
    cta: 'Open plugin guide',
  },
  {
    icon: 'lucide:route',
    title: 'Upgrade without turbulence',
    description: 'Follow migration notes to upgrade without breaking your pace.',
    href: '/guide/migration/v0_8',
    cta: 'Read migration notes',
  },
]

const coreCapabilities = [
  {
    title: 'Reactive queries',
    eyebrow: 'Read from one cache graph',
    description: 'Keep reads close to components, stay reactive, and pass backend params explicitly.',
    filename: 'TodoList.vue',
    language: 'vue',
    icon: 'lucide:search',
    code: `<script setup lang="ts">
const store = useStore()

const { data: todos, loading, refresh } = await store.todos.query(q => q.many({
  filter: item => !item.completed,
  params: {
    completed: false,
  },
}))
<\/script>

<template>
  <TodoList
    :items="todos"
    :loading
    @refresh="refresh()"
  />
</template>`,
  },
  {
    title: 'Optimistic mutations',
    eyebrow: 'Instant updates',
    description: 'Mutations update the normalized cache directly, so the UI updates without extra sync plumbing.',
    filename: 'TodoItem.vue',
    language: 'vue',
    icon: 'lucide:zap',
    code: `<script setup lang="ts">
const props = defineProps<{
  todoId: string
}>()

const store = useStore()
const todo = await store.todos.query(q => q.one(props.todoId))

async function toggle() {
  await todo.value?.$update({
    completed: !todo.value?.completed,
  })
}
<\/script>

<template>
  <button @click="toggle()">
    {{ todo?.completed ? 'Undo' : 'Complete' }}
  </button>
</template>`,
  },
  {
    title: 'Form objects',
    eyebrow: 'Validation and submission state included',
    description: 'Create form state from the store instead of hand-writing loading, validation, and reset logic.',
    filename: 'TodoCreateForm.vue',
    language: 'vue',
    icon: 'lucide:file-pen',
    code: `<script setup lang="ts">
const store = useStore()

const createTodo = store.todos.createForm({
  defaultValues: () => ({
    id: crypto.randomUUID(),
    title: '',
    completed: false,
  }),
})
<\/script>

<template>
  <form @submit.prevent="createTodo.$submit()">
    <input v-model="createTodo.title">
    <button :disabled="createTodo.$loading">
      {{ createTodo.$loading ? 'Saving...' : 'Create todo' }}
    </button>
  </form>
</template>`,
  },
  {
    title: 'Plugin-based transport',
    eyebrow: 'Write generic fetching logic for multiple collections',
    description: 'Move repeated transport logic into plugins so collections and components stay focused on data.',
    filename: 'app/rstore/plugins/api.ts',
    language: 'ts',
    icon: 'lucide:puzzle',
    code: `export default defineRstorePlugin({
  name: 'api',
  category: 'remote',

  setup({ hook }) {
    hook('fetchMany', async (payload) => {
      const result = await $fetch(\`/api/\${payload.collection.name}\`, {
        query: payload.params,
      })
      payload.setResult(result)
    })
  },
})`,
  },
  {
    title: 'Live data',
    eyebrow: 'Realtime and transport-agnostic',
    description: 'Use subscriptions and live queries on top of the same cache, with any streaming transport from WebSockets to server-sent events.',
    filename: 'MessagesPage.vue',
    language: 'vue',
    icon: 'lucide:satellite-dish',
    code: `<script setup lang="ts">
const store = useStore()

const { data: messages } = await store.messages.liveQuery(q => q.many({
  params: {
    roomId: 'room-42',
  },
}))
<\/script>

<template>
  <Chat :messages />
</template>`,
  },
]

const selectedCapabilityIndex = ref(0)
const activeCapability = computed(() => coreCapabilities[selectedCapabilityIndex.value]!)
const activeCapabilityCode = computed(() => activeCapability.value.code.trim())
const highlightedCapabilityHtml = ref('')
const aiSupportSnippet = 'npx skills-npm'
const aiSupportSnippetCopied = ref(false)
let aiSupportCopyTimeout: ReturnType<typeof setTimeout> | undefined
const { isDark } = useData()

const shikiThemes = {
  dark: 'one-dark-pro',
  light: 'one-light',
} as const

watch([selectedCapabilityIndex, isDark], async (_, __, onCleanup) => {
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })

  try {
    const html = await codeToHtml(activeCapabilityCode.value, {
      lang: activeCapability.value.language === 'ts' ? 'ts' : 'vue',
      theme: isDark.value ? shikiThemes.dark : shikiThemes.light,
    })

    if (!cancelled) {
      highlightedCapabilityHtml.value = html
    }
  }
  catch {
    if (!cancelled) {
      highlightedCapabilityHtml.value = ''
    }
  }
}, { immediate: true })

async function copyAiSupportSnippet() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return
  }

  try {
    await navigator.clipboard.writeText(aiSupportSnippet)
    aiSupportSnippetCopied.value = true

    if (aiSupportCopyTimeout) {
      clearTimeout(aiSupportCopyTimeout)
    }

    aiSupportCopyTimeout = setTimeout(() => {
      aiSupportSnippetCopied.value = false
    }, 1800)
  }
  catch {
    aiSupportSnippetCopied.value = false
  }
}

onBeforeUnmount(() => {
  if (aiSupportCopyTimeout) {
    clearTimeout(aiSupportCopyTimeout)
  }
})
</script>

<template>
  <section class="homepage relative overflow-hidden py-4 !pb-32 sm:py-8">
    <div
      class="pointer-events-none absolute inset-0"
      style="background: radial-gradient(circle at 12% 8%, rgb(0 255 98 / 0.22), transparent 28%), radial-gradient(circle at 85% 12%, rgb(0 177 132 / 0.2), transparent 24%), linear-gradient(180deg, rgb(7 12 10 / 0.02), transparent 26%);"
    />
    <div
      class="pointer-events-none absolute inset-0"
      style="background-image: linear-gradient(rgb(0 164 69 / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(0 164 69 / 0.08) 1px, transparent 1px); background-size: 46px 46px; mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.72), transparent 88%);"
    />

    <div class="pointer-events-none absolute left-[-5rem] top-16 h-72 w-72 rounded-full bg-emerald-400/35 opacity-[0.55] blur-[80px] animate-drift-a" />
    <div class="pointer-events-none absolute right-[-3rem] top-40 h-64 w-64 rounded-full bg-teal-400/30 opacity-[0.55] blur-[80px] animate-drift-b" />

    <div class="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 sm:gap-8">
      <section class="relative grid gap-8 overflow-hidden rounded-[32px] border border-emerald-600/[0.15] bg-white/[0.82] p-5 shadow-[0_26px_80px_rgba(5,24,11,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,580px)] lg:p-8 dark:border-emerald-400/15 dark:bg-[linear-gradient(145deg,rgba(18,23,21,0.98),rgba(9,13,11,0.96))] dark:shadow-[0_30px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 38%);"
        />

        <div class="relative z-10 flex flex-col justify-center gap-5 p-2 lg:p-6">
          <div class="reveal-up font-mono text-xs tracking-[0.18em] text-emerald-600 dark:text-emerald-400" style="animation-delay: 40ms;">
            A PRACTICAL DATA LAYER FOR VUE AND NUXT
          </div>

          <h1 class="reveal-up m-0 max-w-[13ch] text-[clamp(2rem,7vw,4.5rem)] font-black leading-[0.95] tracking-[-0.06em] text-balance lg:max-w-[15ch]" style="animation-delay: 110ms;">
            Build fast, data-heavy UIs
            <span class="inline-block bg-[linear-gradient(115deg,var(--vp-c-brand-1),#00b184_62%,#89ffd3)] bg-clip-text text-transparent pb-2">without wrestling state management.</span>
          </h1>

          <p class="reveal-up m-0 max-w-[60ch] text-[1.08rem] leading-7 text-[var(--vp-c-text-2)]" style="animation-delay: 180ms;">
            rstore gives you a local-first normalized cache, typed query and mutation APIs,
            and plugin-based transport so realtime, offline, and multi-source apps are simpler to build.
          </p>

          <div class="reveal-up flex flex-col flex-wrap gap-3 pt-1 sm:flex-row" style="animation-delay: 250ms;">
            <div class="reveal-up" style="animation-delay: 300ms;">
              <VPButton
                href="/guide/getting-started"
                text="Get Started"
              />
            </div>
            <div class="reveal-up" style="animation-delay: 360ms;">
              <VPButton
                theme="alt"
                href="/guide/learn-more"
                text="See How It Works"
              />
            </div>
          </div>
        </div>

        <div class="reveal-up relative flex min-h-full items-center justify-center p-2 lg:p-6" style="animation-delay: 220ms;">
          <div class="animate-float-a absolute left-0 top-4 z-20 min-w-[8.2rem] rounded-2xl border border-emerald-600/[0.18] bg-white/[0.84] px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-emerald-400/20 dark:bg-[#101412]/90 max-lg:hidden">
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--vp-c-text-2)]">
              normalized cache
            </div>
            <div class="text-lg font-bold text-[var(--vp-c-text-1)]">
              local-first
            </div>
          </div>

          <div class="animate-float-b absolute bottom-24 right-0 z-20 min-w-[8.2rem] rounded-2xl border border-emerald-600/[0.18] bg-white/[0.84] px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-emerald-400/20 dark:bg-[#101412]/90 max-lg:hidden">
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--vp-c-text-2)]">
              flexible transport
            </div>
            <div class="text-lg font-bold text-[var(--vp-c-text-1)]">
              plugins
            </div>
          </div>

          <div class="animate-float-c absolute bottom-4 right-4 z-20 min-w-[8.2rem] rounded-2xl border border-emerald-600/[0.18] bg-white/[0.84] px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-emerald-400/20 dark:bg-[#101412]/90 max-lg:hidden md:bottom-auto md:right-[-1rem] md:top-18">
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--vp-c-text-2)]">
              ui state
            </div>
            <div class="text-lg font-bold text-[var(--vp-c-text-1)]">
              reactive
            </div>
          </div>

          <div class="reveal-up relative w-full min-h-[360px] overflow-hidden rounded-2xl border border-emerald-600/[0.15] bg-[radial-gradient(circle_at_top,rgba(0,255,98,0.18),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.04),transparent_30%),linear-gradient(160deg,rgba(244,255,247,0.96),rgba(235,244,239,0.76))] dark:border-emerald-400/20 dark:bg-[radial-gradient(circle_at_top,rgba(0,255,98,0.12),transparent_32%),linear-gradient(160deg,rgba(16,21,19,0.98),rgba(8,12,10,0.96))] md:min-h-[480px] lg:min-h-[540px]" style="animation-delay: 480ms;">
            <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,164,69,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,164,69,0.08)_1px,transparent_1px)] bg-[length:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_85%)]" />
            <HomePageAnimationV2 class="z-10" />
          </div>
        </div>
      </section>

      <section class="relative overflow-hidden rounded-[28px] border border-emerald-600/[0.15] bg-white/[0.78] p-5 shadow-[0_26px_80px_rgba(5,24,11,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl sm:p-7 dark:border-emerald-400/15 dark:bg-[linear-gradient(145deg,rgba(18,23,21,0.98),rgba(9,13,11,0.96))] dark:shadow-[0_30px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 38%);"
        />

        <div class="relative z-10 mb-5 flex flex-col gap-2">
          <div class="reveal-up font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400" style="animation-delay: 590ms;">
            CORE FEATURES
          </div>
          <h2 class="reveal-up m-0 text-balance text-[clamp(1.85rem,3vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.04em]" style="animation-delay: 660ms;">
            What you get out of the box.
          </h2>
        </div>

        <HomePageFeatures
          :features="coreFeatures"
          class="relative z-10"
        />
      </section>

      <section class="relative overflow-hidden rounded-[28px] border border-emerald-600/[0.15] bg-white/[0.78] p-5 shadow-[0_26px_80px_rgba(5,24,11,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl sm:p-7 dark:border-emerald-400/15 dark:bg-[linear-gradient(145deg,rgba(18,23,21,0.98),rgba(9,13,11,0.96))] dark:shadow-[0_30px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] flex gap-12">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 38%);"
        />

        <div class="relative z-10 mb-5 flex flex-col gap-2">
          <div class="reveal-up font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400" style="animation-delay: 590ms;">
            TESTIMONIAL
          </div>
          <h2 class="reveal-up m-0 text-balance text-[clamp(1.85rem,3vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.04em]" style="animation-delay: 660ms;">
            What people are saying.
          </h2>
        </div>

        <article
          v-for="(testimonial, index) in testimonials"
          :key="testimonial.name"
          class="reveal-up relative z-10 overflow-hidden rounded-[24px] border border-emerald-600/[0.16] bg-white/[0.72] p-6 dark:border-emerald-400/20 dark:bg-[#121815]/[0.88]"
          :style="{ animationDelay: `${740 + index * 65}ms` }"
        >
          <div class="pointer-events-none absolute inset-0" style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 48%);" />

          <div class="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="max-w-[42rem]">
              <p class="m-0 text-[clamp(1.2rem,3vw,2rem)] font-black leading-[1.05] tracking-[-0.04em] text-[var(--vp-c-text-1)]">
                "{{ testimonial.quote }}"
              </p>
              <p class="mb-0 mt-4 font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                {{ testimonial.name }}
              </p>
            </div>

            <img
              :src="testimonial.image"
              :alt="testimonial.name"
              class="h-24 w-24 shrink-0 rounded-full border border-emerald-600/[0.16] object-cover shadow-[0_18px_40px_rgba(0,0,0,0.12)] dark:border-emerald-400/20"
            >
          </div>
        </article>
      </section>

      <section class="relative overflow-hidden rounded-[28px] border border-emerald-600/[0.15] bg-white/[0.78] p-5 shadow-[0_26px_80px_rgba(5,24,11,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl sm:p-7 dark:border-emerald-400/15 dark:bg-[linear-gradient(145deg,rgba(18,23,21,0.98),rgba(9,13,11,0.96))] dark:shadow-[0_30px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 38%);"
        />

        <div class="relative z-10 mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div class="font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              PICK YOUR STACK
            </div>
            <h2 class="m-0 text-balance text-[clamp(1.85rem,3vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
              Pick the setup that matches how your team works.
            </h2>
          </div>
          <a href="/guide/getting-started" class="font-bold text-emerald-600 hover:underline dark:text-emerald-400 flex items-center gap-1">
            Read setup options
            <Icon icon="lucide:arrow-right" />
          </a>
        </div>

        <div class="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <a
            v-for="(card, index) in setupCards"
            :key="card.title"
            :href="card.href"
            class="reveal-up group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-emerald-600/[0.16] bg-white/[0.72] p-5 transition duration-200 hover:-translate-y-1 hover:border-emerald-600/35 hover:shadow-[0_20px_44px_rgba(0,0,0,0.08)] dark:border-emerald-400/20 dark:bg-[#121815]/[0.88]"
            :style="{ animationDelay: `${260 + index * 90}ms` }"
          >
            <div class="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100" style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 48%);" />

            <div class="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div class="font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                  {{ card.eyebrow }}
                </div>
                <h3 class="m-0 text-[1.55rem] font-extrabold leading-tight tracking-[-0.03em]">
                  {{ card.title }}
                </h3>
              </div>

              <img
                :src="card.logo"
                :alt="`${card.title} logo`"
                class="h-11 w-11 shrink-0 object-contain"
              >
            </div>

            <p class="relative z-10 m-0 leading-7 text-[var(--vp-c-text-2)]">
              {{ card.description }}
            </p>

            <div class="relative z-10 border-t border-emerald-600/[0.14] pt-1 text-sm leading-6 text-[var(--vp-c-text-2)] dark:border-emerald-400/20">
              {{ card.accent }}
            </div>

            <div class="relative z-10 mt-auto font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              View setup
              <Icon icon="lucide:arrow-right" />
            </div>
          </a>
        </div>
      </section>

      <section class="relative overflow-hidden rounded-[28px] border border-emerald-600/[0.15] bg-white/[0.78] p-5 pb-8 shadow-[0_26px_80px_rgba(5,24,11,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl sm:p-7 dark:border-emerald-400/15 dark:bg-[linear-gradient(145deg,rgba(18,23,21,0.98),rgba(9,13,11,0.96))] dark:shadow-[0_30px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 38%);"
        />

        <div class="relative z-10 mb-5 flex flex-col gap-2">
          <div class="font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            CORE CAPABILITIES
          </div>
          <h2 class="m-0 text-balance text-[clamp(1.85rem,3vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
            Common data problems, handled with small, reusable APIs.
          </h2>
        </div>

        <div class="relative z-10 grid gap-4 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div class="flex flex-col gap-3" role="tablist" aria-label="Core capabilities">
            <button
              v-for="(card, index) in coreCapabilities"
              :key="card.title"
              type="button"
              class="reveal-up w-full overflow-hidden rounded-2xl border border-emerald-600/[0.16] bg-white/[0.72] p-5 text-left transition duration-200 dark:border-emerald-400/20 dark:bg-[#121815]/[0.88]"
              :class="index === selectedCapabilityIndex
                ? 'translate-x-1 border-emerald-600/35 bg-emerald-500/10 shadow-[0_20px_44px_rgba(0,0,0,0.08)] dark:border-emerald-300/35 dark:bg-emerald-500/10'
                : 'hover:translate-x-1 hover:border-emerald-600/30 hover:shadow-[0_20px_44px_rgba(0,0,0,0.08)]'"
              :style="{ animationDelay: `${320 + index * 60}ms` }"
              :aria-selected="index === selectedCapabilityIndex"
              @click="selectedCapabilityIndex = index"
              @mouseenter="selectedCapabilityIndex = index"
            >
              <div class="flex gap-4">
                <div class="pt-1 text-emerald-600 dark:text-emerald-400">
                  <Icon :icon="card.icon" />
                </div>
                <div class="flex flex-col gap-2">
                  <div class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                    {{ card.eyebrow }}
                  </div>
                  <h3 class="m-0 text-xl font-extrabold leading-tight tracking-[-0.03em]">
                    {{ card.title }}
                  </h3>
                </div>
              </div>
            </button>
          </div>

          <article class="reveal-up overflow-hidden rounded-2xl border border-emerald-600/[0.16] bg-[linear-gradient(160deg,rgba(255,255,255,0.74),rgba(243,248,245,0.7))] p-5 dark:border-emerald-400/20 dark:bg-[linear-gradient(160deg,rgba(18,23,21,0.99),rgba(9,13,11,0.97))] min-h-210" style="animation-delay: 420ms;">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                  {{ activeCapability.eyebrow }}
                </div>
                <h3 class="m-0 mt-1 text-[1.8rem] font-extrabold leading-[1.02] tracking-[-0.04em]">
                  {{ activeCapability.title }}
                </h3>
              </div>

              <div class="flex flex-wrap items-center gap-2 sm:justify-end font-mono text-sm text-(--vp-c-text-2)">
                <Icon icon="lucide:file" />
                <span>{{ activeCapability.filename }}</span>
              </div>
            </div>

            <p class="mb-4 mt-0 leading-7 text-[var(--vp-c-text-2)]">
              {{ activeCapability.description }}
            </p>

            <div class="overflow-hidden rounded-[20px] border border-emerald-600/20 bg-[linear-gradient(180deg,rgb(10,20,15),rgb(7,13,10))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_32px_rgba(0,0,0,0.18)]">
              <div class="flex gap-2 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <span class="h-2.5 w-2.5 rounded-full bg-[#ff7a7a]" />
                <span class="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
                <span class="h-2.5 w-2.5 rounded-full bg-[#00ff62]" />
              </div>

              <div
                v-if="highlightedCapabilityHtml"
                class="homepage-shiki overflow-auto [&_.line]:block [&_.line]:px-1 [&_.line]:sm:px-1.5 [&_.shiki]:!m-0 [&_.shiki]:!bg-transparent [&_.shiki]:min-w-max [&_.shiki]:!px-2 [&_.shiki]:!py-4 [&_.shiki]:text-sm [&_.shiki]:leading-none"
                v-html="highlightedCapabilityHtml"
              />
              <pre
                v-else
                class="m-0 overflow-auto whitespace-pre px-4 py-4 font-mono text-sm leading-7 text-[#d7fbe8]"
              ><code>{{ activeCapabilityCode }}</code></pre>
            </div>
          </article>
        </div>
      </section>

      <section class="relative overflow-hidden rounded-[28px] border border-cyan-400/30 bg-[linear-gradient(160deg,rgba(5,15,38,0.96),rgba(2,8,25,0.99))] p-5 text-slate-100 shadow-[0_28px_90px_rgba(0,5,17,0.6),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-7">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: radial-gradient(circle at 12% 14%, rgb(0 221 255 / 0.2), transparent 35%), radial-gradient(circle at 82% 22%, rgb(0 255 159 / 0.16), transparent 36%), linear-gradient(180deg, rgb(255 255 255 / 0.04), transparent 44%);"
        />
        <div
          class="pointer-events-none absolute inset-0 opacity-45"
          style="background-image: radial-gradient(circle, rgb(196 246 255 / 0.42) 1px, transparent 1px); background-size: 26px 26px; mask-image: radial-gradient(circle at 50% 36%, black, transparent 82%);"
        />

        <div class="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,560px)] xl:items-center">
          <div>
            <div class="font-mono text-xs uppercase tracking-[0.18em] text-cyan-200 flex items-center gap-2">
              AI SUPPORT
              <span class="rounded-full bg-teal-400/80 px-2 pt-0.5 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-teal-900">
                Experimental
              </span>
            </div>
            <h2 class="m-0 mt-2 text-balance text-[clamp(1.9rem,3.1vw,2.7rem)] font-extrabold leading-[1.04] tracking-[-0.04em] text-white">
              AI tools can work with your rstore codebase without guessing.
            </h2>
            <p class="mb-0 mt-4 max-w-[65ch] leading-7 text-slate-300">
              rstore includes skill packs that help AI tools understand your data model and project conventions,
              so generated changes are easier to trust.
            </p>

            <div class="mt-5 max-w-[420px] overflow-hidden rounded-2xl border border-cyan-200/25 bg-[linear-gradient(180deg,rgba(7,20,44,0.94),rgba(2,8,22,0.98))] shadow-[0_14px_36px_rgba(0,0,0,0.35)]">
              <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div class="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-cyan-200">
                  Terminal
                </div>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-cyan-200/40 bg-white/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-white/20"
                  :aria-label="aiSupportSnippetCopied ? 'Command copied' : 'Copy command'"
                  @click="copyAiSupportSnippet"
                >
                  <Icon :icon="aiSupportSnippetCopied ? 'lucide:check' : 'lucide:copy'" />
                  {{ aiSupportSnippetCopied ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="m-0 overflow-x-auto px-4 py-3 text-sm leading-6 text-cyan-100"><code>{{ aiSupportSnippet }}</code></pre>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-3">
              <article
                v-for="(pillar, index) in aiSupportPillars"
                :key="pillar.title"
                class="reveal-up rounded-2xl border border-cyan-200/25 bg-white/[0.05] p-4 backdrop-blur-sm"
                :style="{ animationDelay: `${420 + index * 90}ms` }"
              >
                <h3 class="m-0 text-base font-bold tracking-[-0.02em] text-cyan-100">
                  {{ pillar.title }}
                </h3>
                <p class="mb-0 mt-2 text-sm leading-6 text-slate-300">
                  {{ pillar.details }}
                </p>
              </article>
            </div>
          </div>

          <div class="relative flex min-h-[360px] items-center justify-center md:min-h-[586px]">
            <div class="absolute inset-0 overflow-hidden rounded-2xl border border-cyan-200/30 bg-[linear-gradient(180deg,rgba(0,9,24,0.85),rgba(1,4,14,0.95))]">
              <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,224,255,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(148,224,255,0.11)_1px,transparent_1px)] bg-[length:30px_30px] [mask-image:radial-gradient(circle_at_center,black,transparent_84%)]" />
              <HomePageAiSupportAnimation class="z-10" />
            </div>
          </div>
        </div>
      </section>

      <section class="relative overflow-hidden rounded-[28px] border border-emerald-600/[0.15] bg-white/[0.78] p-5 shadow-[0_26px_80px_rgba(5,24,11,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl sm:p-7 dark:border-emerald-400/15 dark:bg-[linear-gradient(145deg,rgba(18,23,21,0.98),rgba(9,13,11,0.96))] dark:shadow-[0_30px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          class="pointer-events-none absolute inset-0"
          style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 38%);"
        />

        <div class="relative z-10 mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="max-w-[72ch]">
            <div class="font-mono text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              NAVIGATION BEACON
            </div>
            <h2 class="m-0 mt-1 text-balance text-[clamp(1.85rem,3vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
              Pick a docs path and get moving.
            </h2>
            <p class="mb-0 mt-3 text-[1.02rem] leading-7 text-[var(--vp-c-text-2)]">
              Start with setup, go deeper into architecture, or jump straight to API details.
            </p>
          </div>

          <VPButton
            href="/guide/getting-started"
            text="Open Docs"
          />
        </div>

        <div class="relative z-10 grid gap-4 sm:grid-cols-2">
          <a
            v-for="(card, index) in docsJumpCards"
            :key="card.title"
            :href="card.href"
            class="reveal-up group relative overflow-hidden rounded-2xl border border-emerald-600/[0.16] bg-white/[0.74] p-5 transition duration-200 hover:-translate-y-1 hover:border-emerald-600/35 hover:shadow-[0_20px_44px_rgba(0,0,0,0.08)] dark:border-emerald-400/20 dark:bg-[#121815]/[0.88]"
            :style="{ animationDelay: `${250 + index * 80}ms` }"
          >
            <div class="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100" style="background: linear-gradient(135deg, rgb(0 255 98 / 0.08), transparent 48%);" />

            <div class="relative z-10 flex items-start gap-4">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-600/25 bg-emerald-500/[0.09] text-emerald-600 dark:border-emerald-400/25 dark:text-emerald-300">
                <Icon :icon="card.icon" class="h-5 w-5" />
              </div>
              <div>
                <h3 class="m-0 text-xl font-extrabold tracking-[-0.03em]">
                  {{ card.title }}
                </h3>
                <p class="mb-0 mt-2 leading-7 text-[var(--vp-c-text-2)]">
                  {{ card.description }}
                </p>
                <div class="mt-3 inline-flex items-center gap-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {{ card.cta }}
                  <Icon icon="lucide:arrow-right" />
                </div>
              </div>
            </div>
          </a>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.reveal-up {
  opacity: 0;
  animation: reveal-up 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.animate-drift-a {
  animation: drift 11s ease-in-out infinite alternate;
}

.animate-drift-b {
  animation: drift 14s ease-in-out infinite alternate-reverse;
}

.animate-float-a {
  animation: float 7s ease-in-out infinite;
}

.animate-float-b {
  animation: float 9s ease-in-out infinite reverse;
}

.animate-float-c {
  animation: float 8s ease-in-out infinite;
}

:deep(.VPButton.brand),
:deep(.VPButton.alt) {
  border-radius: 999px;
  padding-inline: 1.2rem;
}

:deep(.VPButton.brand) {
  box-shadow: 0 16px 36px rgb(0 164 69 / 0.2);
}

@media (max-width: 760px) {
  :deep(.VPButton.brand),
  :deep(.VPButton.alt) {
    justify-content: center;
    width: 100%;
  }
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

@keyframes drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }

  to {
    transform: translate3d(1.2rem, 1.6rem, 0) scale(1.08);
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-8px);
  }
}
</style>
