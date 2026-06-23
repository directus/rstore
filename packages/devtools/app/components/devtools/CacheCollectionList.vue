<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue'
import DevtoolsCacheCollectionItem from './CacheCollectionItem.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const props = defineProps<{
  view: any
}>()

const collectionSearchEl = useTemplateRef('collectionSearchEl')
const cacheCollectionSearch = computed({
  get: () => props.view.cacheCollectionSearch,
  set: value => props.view.setCacheCollectionSearch(value),
})
const selectedLayerId = computed({
  get: () => props.view.selectedLayerId,
  set: value => props.view.setSelectedLayerId(value),
})

/** Clear collection search and restore input focus. */
function clearCollectionSearch(view: any) {
  view.setCacheCollectionSearch('')
  collectionSearchEl.value?.inputRef?.focus()
}
</script>

<template>
  <div class="flex flex-col w-1/4 max-w-60 min-h-0">
    <div class="p-1">
      <UButtonGroup size="sm" class="w-full">
        <UInput
          ref="collectionSearchEl"
          v-model="cacheCollectionSearch"
          placeholder="Collections..."
          icon="lucide:search"
          class="w-full"
        >
          <template v-if="cacheCollectionSearch" #trailing>
            <UButton
              icon="lucide:x"
              size="xs"
              variant="link"
              color="neutral"
              @click="clearCollectionSearch(view)"
            />
          </template>
        </UInput>

        <USelectMenu
          v-model="selectedLayerId"
          icon="lucide:layers"
          :items="[
            {
              id: undefined,
              label: 'Base cache state',
              icon: 'lucide:database',
            },
            ...view.layers.map((layer: any) => ({
              id: layer.id,
              label: layer.id,
              icon: 'lucide:layers-2',
              class: layer.skip ? 'text-dimmed' : 'text-yellow-500',
              layer,
            })),
          ]"
          value-key="id"
          label-key="label"
          :placeholder="`${view.layers.length} layer${view.layers.length > 1 ? 's' : ''}`"
          arrow
          :content="{ align: 'end' }"
          :ui="{ content: 'min-w-60 w-min' }"
        >
          <template #item-label="{ item }">
            <template v-if="'layer' in item">
              <span :class="{ 'line-through': item.layer.skip }">
                {{ item.label }}
              </span>
            </template>
          </template>

          <template #item-trailing="{ item }">
            <template v-if="'layer' in item">
              <UBadge
                v-if="item.layer.skip"
                label="Skip"
                icon="lucide:fast-forward"
                color="neutral"
                variant="subtle"
              />
              <UBadge
                v-if="item.layer.optimistic"
                label="Optimistic"
                icon="lucide:hourglass"
                color="info"
                variant="subtle"
              />
            </template>
          </template>
        </USelectMenu>
      </UButtonGroup>
    </div>

    <div class="flex-1 min-h-0">
      <DevtoolsVirtualList
        :items="view.filteredCollections"
        key-field="name"
        :min-item-size="40"
        list-class="p-1"
        item-class="pb-px"
      >
        <template #default="{ item }">
          <DevtoolsCacheCollectionItem
            :collection="item"
            :selected="view.isSelectedCollection(item.name)"
            :state="view.collectionState(item.name)"
            :selected-layer="view.collectionSelectedLayer(item.name)"
            @click="view.selectCollection(item.name)"
          />
        </template>

        <template #empty>
          <div class="p-2 text-xs italic opacity-50 text-center">
            No collections found.
          </div>
        </template>
      </DevtoolsVirtualList>
    </div>
  </div>
</template>
