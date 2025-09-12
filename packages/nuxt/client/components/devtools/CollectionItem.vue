<script lang="ts" setup>
import type { CollectionRelation, ResolvedCollection } from '@rstore/shared'

const props = defineProps<{
  item: ResolvedCollection
}>()

const cache = useStoreCache()

const cacheCount = computed(() => Object.keys((cache.value as any)[props.item.name] ?? {}).length)
</script>

<template>
  <div class="p-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-md flex flex-col gap-1">
    <div class="flex items-center gap-1">
      <UIcon
        name="lucide:box"
        class="text-blue-500"
      />
      <div class="flex-1 min-w-0 truncate text-blue-500">
        {{ item.name }}
      </div>

      <UPopover
        arrow
      >
        <template #default="{ open }">
          <UBadge
            :label="cacheCount || '0'"
            variant="subtle"
            :color="cacheCount ? 'primary' : 'neutral'"
            icon="lucide:database"
            :class="{
              'ring ring-green-500': open,
              'font-bold': cacheCount > 0,
            }"
          />
        </template>

        <template #content>
          <CodeSnippet
            :code="(cache as any)[props.item.name] ?? {}"
            class="text-xs p-2 max-w-120 max-h-90 overflow-auto"
          />
        </template>
      </UPopover>
    </div>

    <div class="text-xs font-mono border border-default rounded p-2 flex gap-4">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:focus" />
        Scope ID
      </div>
      <div v-if="item.scopeId" class="font-bold bg-gray-500/25 rounded px-1">
        {{ item.scopeId }}
      </div>
      <div v-else class="italic opacity-50">
        None (handled by all plugins)
      </div>
    </div>

    <div v-if="Object.keys(item.relations).length" class="text-xs font-mono border border-default rounded p-2 flex flex-col gap-1">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:link" />
        Relations
      </div>
      <DevtoolsCollectionRelation
        v-for="(relation, key) in item.relations as Record<string, CollectionRelation>"
        :key
        :collection="item"
        :relation-name="key"
        :relation
      />
    </div>

    <div v-if="item.computed && Object.keys(item.computed).length" class="text-xs font-mono border border-default rounded p-2 flex flex-col gap-1">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:square-function" />
        Computed fields
      </div>
      <div
        v-for="(computed, key) in item.computed"
        :key="key"
        class="flex gap-1 items-start"
      >
        <div class="bg-blue-500/25 rounded px-0.5">
          {{ key }}
        </div>
        <CodeSnippet
          :code="computed.toString()"
          lang="js"
          class="text-xs max-h-90 overflow-auto"
        />
      </div>
    </div>

    <div v-if="item.meta" class="text-xs font-mono border border-default rounded p-2 flex flex-col gap-1">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:tag" />
        Metadata
      </div>
      <CodeSnippet
        :code="item.meta"
        class="text-xs max-h-90 overflow-auto"
      />
    </div>

    <div v-if="Object.keys(item.hooks ?? {}).length" class="text-xs font-mono border border-default rounded p-2 flex flex-wrap gap-2">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:cable" />
        Hooks
      </div>

      <template
        v-for="(fn, name) in item.hooks!"
        :key="name"
      >
        <UPopover
          v-if="fn"
          arrow
        >
          <template #default="{ open }">
            <UButton
              :label="name"
              color="neutral"
              variant="outline"
              size="xs"
              class="bg-transparent"
              :class="{
                'ring ring-green-500': open,
              }"
            />
          </template>

          <template #content>
            <div class="p-2 max-w-120">
              <CodeSnippet
                :code="fn.toString()"
                lang="js"
                class="text-xs max-h-70 overflow-auto"
              />
            </div>
          </template>
        </UPopover>
      </template>
    </div>
  </div>
</template>
