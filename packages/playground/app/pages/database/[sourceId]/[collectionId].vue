<script lang="ts" setup>
const route = useRoute()
const store = useStore()
const { data: collection } = await store.DataCollection.query(q => q.first({
  key: String(route.params.collectionId),
  fetchPolicy: 'cache-and-fetch',
}))
</script>

<template>
  <div v-if="collection" class="flex flex-col">
    <div>
      <div class="p-4">
        {{ collection.name }}
      </div>
    </div>

    <UTable
      :data="collection.fields"
      :columns="[
        {
          accessorKey: 'id',
          header: 'ID',
        },
        {
          accessorKey: 'name',
          header: 'Name',
        },
        {
          accessorKey: 'type',
          header: 'Type',
        },
        {
          accessorKey: 'nullable',
          header: 'Nullable',
        },
      ]"
      class="flex-1 min-h-0"
    >
      <template #nullable-cell="{ row }">
        <USwitch
          :model-value="row.original.nullable"
          :label="row.original.nullable ? 'Yes' : 'No'"
          @update:model-value="value => row.original.$update({ nullable: value })"
        />
      </template>
    </UTable>
  </div>
</template>
