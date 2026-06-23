<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  view: any
}>()

const showRawCache = computed({
  get: () => props.view.showRawCache,
  set: value => props.view.setShowRawCache(value),
})
const itemSearchKey = computed({
  get: () => props.view.itemSearchKey,
  set: value => props.view.setItemSearchKey(value),
})
const itemSearchTempContent = computed({
  get: () => props.view.itemSearchTempContent,
  set: value => props.view.setItemSearchTempContent(value),
})

/** Clear both the applied and draft item content filters. */
function clearItemContentFilter() {
  props.view.setItemSearchContent('')
  props.view.setItemSearchTempContent('')
}
</script>

<template>
  <Teleport to="#devtools-toolbar" defer>
    <UPopover
      v-if="!view.showRawCache"
      arrow
    >
      <UButton
        icon="lucide:search"
        label="Search items"
        size="xs"
        :variant="view.itemSearchKey || view.itemSearchContent ? 'solid' : 'soft'"
      />

      <template #content>
        <div class="p-2 w-80 flex flex-col gap-4">
          <UFormField label="Search item by Key">
            <UButtonGroup class="w-full" :gap="2">
              <UInputMenu
                v-model="itemSearchKey"
                :items="view.keySearchOptions"
                placeholder="Item Key"
                icon="lucide:search"
                autofocus
                :reset-search-term-on-blur="false"
                class="w-full"
                @update:open="$event ? view.updateKeySearchOptions() : null"
              />
              <UButton
                :disabled="!view.itemSearchKey"
                icon="lucide:x"
                variant="outline"
                color="neutral"
                @click="view.clearItemSearchKey()"
              />
            </UButtonGroup>
          </UFormField>

          <UFormField label="Filter items by data">
            <template #hint>
              <div class="flex items-center gap-1">
                <UButton
                  :disabled="!view.itemSearchTempContent || view.itemSearchTempContent === view.itemSearchContent"
                  icon="lucide:undo-2"
                  size="xs"
                  variant="soft"
                  @click="view.setItemSearchTempContent(view.itemSearchContent)"
                />
                <UButton
                  :disabled="!view.itemSearchTempContent"
                  icon="lucide:x"
                  size="xs"
                  variant="soft"
                  @click="clearItemContentFilter()"
                />
              </div>
            </template>

            <div class="flex flex-col gap-2">
              <UTextarea
                v-model="itemSearchTempContent"
                placeholder="item.isActive && item.age > 18"
                class="w-full font-mono"
                :rows="3"
                :ui="{ base: 'resize-none' }"
                @keyup.ctrl.enter="view.setItemSearchContent(view.itemSearchTempContent)"
                @keyup.meta.enter="view.setItemSearchContent(view.itemSearchTempContent)"
              />
              <UButton
                :disabled="!view.itemSearchTempContent || view.itemSearchTempContent === view.itemSearchContent"
                size="sm"
                icon="lucide:filter"
                block
                @click="view.setItemSearchContent(view.itemSearchTempContent)"
              >
                Apply JavaScript filter
                <div class="flex-1 flex justify-end gap-0.5">
                  <UKbd value="meta" />
                  <UKbd value="enter" />
                </div>
              </UButton>
            </div>
          </UFormField>
        </div>
      </template>
    </UPopover>

    <USwitch
      v-model="showRawCache"
      size="xs"
      label="Raw"
      class="text-xs"
    />
  </Teleport>
</template>
