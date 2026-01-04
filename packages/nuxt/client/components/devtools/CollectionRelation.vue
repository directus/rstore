<script lang="ts" setup>
import type { NormalizedRelation, ResolvedCollection } from '@rstore/shared'

defineProps<{
  collection: ResolvedCollection
  relationName: string
  relation: NormalizedRelation
}>()
</script>

<template>
  <div class="flex gap-2 items-start">
    <div class="bg-blue-500/25 rounded px-0.5">
      <span>{{ relationName }}</span>
      <span v-if="relation.many">[]</span>
    </div>
    <div>
      <div
        v-for="(target, targetIndex) in relation.to"
        :key="targetIndex"
        class="flex items-center gap-2"
      >
        <div class="flex items-center">
          <div class="relative bottom-px">
            <div v-if="targetIndex === 0" class="h-px w-3.5 border-b -mr-2" />
            <div v-else class="h-4 w-1.5 relative">
              <div class="h-px w-2.25 border-b absolute top-2 -right-2" />
              <div class="w-px h-4 border-r absolute -top-1.75 left-1.25" />
            </div>
          </div>
          <UIcon
            name="tabler:caret-right-filled"
            class="size-[13px] relative bottom-px"
          />
        </div>

        <div
          v-for="([key, value], index) in Object.entries<string>(target.on as Record<string, string>)"
          :key
        >
          <span v-if="index > 0" class="opacity-50 mr-2">&amp;</span>
          <span class="text-purple-500">
            {{ target.collection }}
          </span>
          <span class="opacity-50">.</span>
          <span class="text-purple-500">
            {{ key }}
          </span>
          <span class="opacity-50 mx-1">=</span>
          <span class="text-blue-500">
            {{ collection.name }}
          </span>
          <span class="opacity-50">.</span>
          <span class="text-blue-500">
            {{ value }}
          </span>
        </div>

        <div v-if="target.filter" class="flex items-center gap-1 ml-2">
          <UIcon
            name="lucide:filter"
          />
          <span>Filter:</span>
          <CodeSnippet
            :code="target.filter.toString()"
            lang="js"
            class="text-xs max-h-90 overflow-auto"
          />
        </div>
      </div>
    </div>
  </div>
</template>
