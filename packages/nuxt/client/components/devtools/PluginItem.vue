<script lang="ts" setup>
import type { RegisteredPlugin } from '@rstore/shared'

const props = defineProps<{
  plugin: RegisteredPlugin
}>()

const meta = computed(() => {
  let result: any

  if (props.plugin.meta) {
    for (const key in props.plugin.meta) {
      if (['builtin', 'description'].includes(key)) {
        continue
      }

      result ??= {}
      result[key] = props.plugin.meta[key as keyof typeof props.plugin.meta]
    }
  }

  return result
})
</script>

<template>
  <div class="p-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-md flex flex-col gap-1">
    <div class="flex items-center gap-2 text-blue-500">
      <UIcon name="lucide:puzzle" />
      <div>{{ plugin.name }}</div>

      <UBadge
        v-if="plugin.meta?.builtin"
        label="builtin"
        size="sm"
        color="info"
        variant="soft"
        icon="lucide:wrench"
      />
    </div>

    <div v-if="plugin.meta?.description" class="text-xs font-mono border border-default rounded p-2">
      {{ plugin.meta.description }}
    </div>

    <div class="text-xs font-mono border border-default rounded p-2 flex gap-4">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:focus" />
        Scope ID
      </div>
      <div v-if="plugin.scopeId" class="font-bold bg-gray-500/25 rounded px-1">
        {{ plugin.scopeId }}
      </div>
      <div v-else class="italic opacity-50">
        None (handle all models)
      </div>
    </div>

    <div v-if="Object.keys(plugin.hooks).length" class="text-xs font-mono border border-default rounded p-2 flex flex-wrap gap-2">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:cable" />
        Hooks
      </div>

      <div
        v-for="(hooks, name) in plugin.hooks"
        :key="name"
      >
        <UButtonGroup
          size="xs"
        >
          <UButton
            :label="name"
            color="neutral"
            variant="outline"
            class="pointer-events-none bg-transparent"
          />
          <UPopover
            arrow
          >
            <template #default="{ open }">
              <UButton
                :label="String(hooks.length)"
                color="neutral"
                variant="outline"
                :class="{
                  'ring ring-green-500': open,
                }"
              />
            </template>

            <template #content>
              <div class="p-2 max-w-120 max-h-70 overflow-auto space-y-2">
                <div
                  v-for="(hookData, index) in hooks"
                  :key="index"
                  class="text-xs border border-default rounded p-2 flex flex-col gap-2"
                >
                  <CodeSnippet
                    v-if="hookData.options"
                    :code="hookData.options"
                  />

                  <CodeSnippet
                    :code="hookData.callback.toString()"
                    lang="js"
                    class="text-xs max-h-50 overflow-auto"
                  />
                </div>
              </div>
            </template>
          </UPopover>
        </UButtonGroup>
      </div>
    </div>

    <div v-if="meta" class="text-xs font-mono border border-default rounded p-2 flex flex-col gap-1">
      <div class="opacity-75 flex items-center gap-1">
        <UIcon name="lucide:tag" />
        Metadata
      </div>
      <CodeSnippet
        :code="meta"
        class="text-xs max-h-90 overflow-auto"
      />
    </div>
  </div>
</template>
