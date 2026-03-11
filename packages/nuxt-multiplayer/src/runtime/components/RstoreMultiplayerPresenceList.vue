<script lang="ts" setup>
import type { MaybeRefOrGetter } from 'vue'
import type { MultiplayerPeer, MultiplayerUser } from '../types'
import { computed, toValue } from 'vue'

const props = withDefaults(defineProps<{
  user: MultiplayerUser
  peers: MaybeRefOrGetter<MultiplayerPeer[]>
  emptyLabel?: string
  showField?: boolean
}>(), {
  emptyLabel: 'No other people connected yet.',
  showField: true,
})

const safePeers = computed(() => {
  const peers = toValue(props.peers) ?? []
  return peers.filter((peer): peer is MultiplayerPeer => !!peer && typeof peer.id === 'string')
})
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <div class="flex items-center gap-1">
      <div
        class="w-3 h-3 rounded-full border-2"
        :style="{ backgroundColor: user.color,
                  borderColor: user.color }"
      />
      <span class="text-xs font-medium">{{ user.name }} (you)</span>
    </div>

    <div
      v-for="peer in safePeers"
      :key="peer.id"
      class="flex items-center gap-1"
    >
      <div
        class="w-3 h-3 rounded-full border-2"
        :style="{ backgroundColor: peer.color,
                  borderColor: peer.color }"
      />
      <span class="text-xs font-medium">{{ peer.name }}</span>
      <span v-if="showField && peer.field" class="text-xs opacity-50">(editing {{ peer.field }})</span>
    </div>

    <div v-if="safePeers.length === 0" class="text-xs opacity-40 ml-2">
      {{ emptyLabel }}
    </div>
  </div>
</template>
