<script lang="ts" setup>
const store = useStore()

const { data: sources, refresh } = await store.DataSource.query(q => q.many({
  include: {
    collections: {
      fields: true,
    },
  },
}))

async function generate() {
  await $fetch('/api/db/generate')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-2 p-2">
      <UIcon
        name="lucide:database"
      />

      <h1>Database</h1>

      <UButton
        icon="lucide:refresh-cw"
        label="Refresh"
        size="xs"
        @click="refresh()"
      />
      <UButton
        icon="lucide:sparkles"
        label="Generate"
        size="xs"
        @click="generate()"
      />
    </div>

    <div class="flex-1 min-h-0 flex flex-col overflow-auto">
      <div
        v-for="source of sources"
        :key="source.id"
        class="p-4 border-l border-l-primary rounded-lg"
      >
        <div>
          Source: {{ source.name }} ({{ source.collections.length }} collections)
        </div>

        <div class="pl-4">
          <div
            v-for="collection of source.collections"
            :key="collection.id"
            class="p-1 border border-default border-l-blue-500 rounded-md m-1"
          >
            <div>
              Collection: {{ collection.name }} ({{ collection.fields.length }} fields)
            </div>

            <div class="pl-4">
              <div
                v-for="field of collection.fields"
                :key="field.id"
                class="p-1 border border-default border-l-violet-500 rounded-md m-1"
              >
                Field: {{ field.name }} ({{ field.type }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
