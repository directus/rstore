<script lang="ts" setup>
import type { CollabPeer } from '~~/app/composables/collabSync'
import { getTextCursorLayout, getTextSelectionLayouts } from '~~/app/utils/textCursor'

const props = defineProps<{
  container: HTMLElement | null
  target: HTMLInputElement | HTMLTextAreaElement | null
  peers: CollabPeer[]
  field: string
}>()

const renderVersion = ref(0)

function refresh() {
  renderVersion.value++
}

watch(
  () => [props.container, props.target] as const,
  ([container, target], _previous, onCleanup) => {
    if (!container || !target) {
      return
    }

    const onScroll = () => refresh()
    target.addEventListener('scroll', onScroll, { passive: true })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(refresh)
      resizeObserver.observe(container)
      resizeObserver.observe(target)
    }

    onCleanup(() => {
      target.removeEventListener('scroll', onScroll)
      resizeObserver?.disconnect()
    })
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('resize', refresh)
})

onUnmounted(() => {
  window.removeEventListener('resize', refresh)
})

const cursors = computed(() => {
  // eslint-disable-next-line ts/no-unused-expressions
  renderVersion.value

  const container = props.container
  const target = props.target
  if (!container || !target) {
    return []
  }

  return props.peers.flatMap((peer) => {
    if (peer.field !== props.field || !peer.cursor) {
      return []
    }

    const selectionStart = Math.min(peer.cursor.start, peer.cursor.end)
    const selectionEnd = Math.max(peer.cursor.start, peer.cursor.end)
    const cursorIndex = peer.cursor.direction === 'backward'
      ? peer.cursor.start
      : peer.cursor.end
    const layout = getTextCursorLayout(container, target, cursorIndex)
    const selectionRects = getTextSelectionLayouts(container, target, selectionStart, selectionEnd)
      .filter(rect => rect.visible)
    const selectionText = selectionEnd > selectionStart
      ? target.value.slice(selectionStart, selectionEnd)
      : ''
    const anchor = layout?.visible
      ? layout
      : selectionRects.length > 0
        ? {
            left: selectionRects[selectionRects.length - 1]!.left + selectionRects[selectionRects.length - 1]!.width,
            top: selectionRects[selectionRects.length - 1]!.top,
            height: selectionRects[selectionRects.length - 1]!.height,
            visible: true,
          }
        : null

    if (!anchor && selectionRects.length === 0) {
      return []
    }

    return [{
      userId: peer.userId,
      userName: peer.userName,
      userColor: peer.userColor,
      selectionLength: selectionEnd - selectionStart,
      selectionRects,
      selectionText: selectionText.length > 160
        ? `${selectionText.slice(0, 160)}...`
        : selectionText,
      caret: layout?.visible ? layout : null,
      anchor,
    }]
  })
})
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <div
      v-for="cursor in cursors"
      :key="cursor.userId"
      class="absolute inset-0"
    >
      <div
        v-for="(selectionRect, index) in cursor.selectionRects"
        :key="`${cursor.userId}:${index}`"
        class="absolute rounded-[3px]"
        :style="{
          left: `${selectionRect.left}px`,
          top: `${selectionRect.top}px`,
          width: `${selectionRect.width}px`,
          height: `${selectionRect.height}px`,
          backgroundColor: `${cursor.userColor}30`,
        }"
      />
      <div
        v-if="cursor.anchor"
        class="absolute"
        :style="{
          left: `${cursor.anchor.left}px`,
          top: `${cursor.anchor.top}px`,
        }"
      >
        <UTooltip
          :arrow="false"
          :content="{ side: 'top',
                      sideOffset: 8 }"
          :ui="{ content: 'pointer-events-none max-w-72 h-auto' }"
        >
          <template #content>
            <div class="flex items-center gap-1">
              <div
                class="size-2 rounded-full"
                :style="{
                  backgroundColor: cursor.userColor,
                }"
              />
              <span class="text-xs font-semibold">{{ cursor.userName }}</span>
            </div>
          </template>

          <div
            class="relative pointer-events-auto"
          >
            <div
              v-if="cursor.caret"
              class="absolute left-0 top-0 h-full w-0.5 rounded-full shadow-sm"
              :style="{
                height: `${cursor.caret.height}px`,
                backgroundColor: cursor.userColor,
              }"
            />
            <div
              class="absolute left-0 top-0 h-2 w-2 rounded-full -translate-x-[3px]"
              :style="{
                backgroundColor: cursor.userColor,
                opacity: cursor.caret ? 1 : 0,
              }"
            />
          </div>
        </UTooltip>
      </div>
    </div>
  </div>
</template>
