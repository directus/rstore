<script lang="ts" setup>
import type { Module, ResolvedModule } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'

const pros = defineProps<{
  module: ResolvedModule<Module, object>
}>()

const exposed = computed(() => {
  return pickNonSpecialProps(pros.module) as Record<string, any>
})
</script>

<template>
  <div class="p-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-md flex flex-col gap-1">
    <div class="flex items-center gap-2 text-blue-500">
      <UIcon name="lucide:circuit-board" />
      <div>{{ module.$module }}</div>
    </div>

    <div class="text-xs font-mono border border-default rounded p-2 flex flex-col gap-1">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:database" />
        State
      </div>
      <CodeSnippet
        :code="module.$state"
        class="text-xs max-h-90 overflow-auto"
      />
    </div>

    <div v-if="Object.keys(exposed).length" class="text-xs font-mono border border-default rounded p-2 flex flex-col gap-1 overflow-auto">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:arrow-right-left" />
        Exposed
      </div>
      <div
        v-for="(value, key) in exposed"
        :key
        class="flex items-center gap-2 my-1 text-gray-500"
      >
        <div class="text-(--ui-text)">
          {{ key }}
        </div>

        <!-- Mutation -->
        <template v-if="value?.__brand === 'rstore-module-mutation'">
          <UBadge
            label="Mutation"
            size="sm"
            color="info"
            variant="soft"
          />

          <UBadge
            icon="lucide:refresh-cw"
            :label="`Loading: ${value.$loading}`"
            :color="value.$loading ? 'info' : 'neutral'"
            size="sm"
            variant="soft"
          />

          <UBadge
            :icon="value.$error ? 'lucide:alert-triangle' : 'lucide:check-circle'"
            :label="`Error: ${value.$error}`"
            :color="value.$error ? 'error' : 'success'"
            size="sm"
            variant="soft"
          />

          <UBadge
            icon="lucide:hourglass"
            :label="`Time: ${formatDuration(value.$time)}`"
            color="neutral"
            size="sm"
            variant="soft"
          />
        </template>

        <!-- Query -->
        <template v-else-if="value?.data && value?.loading && value?.error">
          <UBadge
            label="Query"
            size="sm"
            color="info"
            variant="soft"
          />

          <UBadge
            icon="lucide:refresh-cw"
            :label="`Loading: ${value.loading.value}`"
            :color="value.loading.value ? 'info' : 'neutral'"
            size="sm"
            variant="soft"
          />

          <UBadge
            :icon="value.error.value ? 'lucide:alert-triangle' : 'lucide:check-circle'"
            :label="`Error: ${value.error.value}`"
            :color="value.error.value ? 'error' : 'success'"
            size="sm"
            variant="soft"
          />

          <DevtoolsResultPopover :result="value.data.value" />
        </template>

        <!-- Ref -->
        <template v-else-if="value && 'value' in value">
          <DevtoolsResultPopover :result="value.value" />
        </template>

        <!-- Function -->
        <template v-else-if="typeof value === 'function'">
          <UBadge
            label="Function"
            size="sm"
            color="info"
            variant="soft"
          />
        </template>
      </div>
    </div>
  </div>
</template>
