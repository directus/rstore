<script lang="ts" setup>
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'

type VirtualListClass = string | Record<string, boolean> | Array<string | Record<string, boolean>>

withDefaults(defineProps<{
  items: any[]
  keyField?: string
  minItemSize?: number
  buffer?: number
  prerender?: number
  listClass?: VirtualListClass
  itemClass?: VirtualListClass
}>(), {
  keyField: 'id',
  minItemSize: 48,
  buffer: 200,
  prerender: 6,
  listClass: '',
  itemClass: '',
})

defineSlots<{
  before?: () => any
  default?: (props: { item: any, index: number, active: boolean }) => any
  empty?: () => any
  after?: () => any
}>()
</script>

<template>
  <DynamicScroller
    class="h-full w-full"
    :items="items"
    :key-field="keyField"
    :min-item-size="minItemSize"
    :buffer="buffer"
    :prerender="prerender"
    :list-class="listClass"
  >
    <template #before>
      <slot name="before" />
    </template>

    <template #default="{ item, index, active }">
      <DynamicScrollerItem
        :item="item"
        :active="active"
        :index="index"
        :watch-data="true"
        :size-dependencies="[item]"
      >
        <div class="w-full" :class="itemClass">
          <slot
            :item="item"
            :index="index"
            :active="active"
          />
        </div>
      </DynamicScrollerItem>
    </template>

    <template #empty>
      <slot name="empty" />
    </template>

    <template #after>
      <slot name="after" />
    </template>
  </DynamicScroller>
</template>
