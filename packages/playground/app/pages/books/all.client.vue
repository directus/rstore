<script lang="ts" setup>
import type { Column } from '@tanstack/vue-table'
import { UButton, UDropdownMenu } from '#components'

const store = useStore()

const sorting = ref<Array<{ id: string, desc: boolean }>>([])

await store.Author.query(q => q.many())

const { data: books, loading } = await store.Book.query(q => q.many({
  sort: sorting.value[0],
}))

const totalCount = computed(() => books.value?.length ?? 0)

function getHeader(column: Column<any>, label: string) {
  const isSorted = column.getIsSorted()

  return h(
    // @ts-expect-error ???
    UDropdownMenu,
    {
      'content': {
        align: 'start',
      },
      'aria-label': 'Actions dropdown',
      'items': [
        {
          label: 'Asc',
          type: 'checkbox',
          icon: 'i-lucide-arrow-up-narrow-wide',
          checked: isSorted === 'asc',
          onSelect: () => {
            if (isSorted === 'asc') {
              column.clearSorting()
            }
            else {
              column.toggleSorting(false)
            }
          },
        },
        {
          label: 'Desc',
          icon: 'i-lucide-arrow-down-wide-narrow',
          type: 'checkbox',
          checked: isSorted === 'desc',
          onSelect: () => {
            if (isSorted === 'desc') {
              column.clearSorting()
            }
            else {
              column.toggleSorting(true)
            }
          },
        },
      ],
    },
    () =>
      h(UButton, {
        'color': 'neutral',
        'variant': 'ghost',
        label,
        'icon': isSorted
          ? isSorted === 'asc'
            ? 'i-lucide-arrow-up-narrow-wide'
            : 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
        'class': '-mx-2.5 data-[state=open]:bg-elevated',
        'aria-label': `Sort by ${isSorted === 'asc' ? 'descending' : 'ascending'}`,
      }),
  )
}
</script>

<template>
  <div class="flex flex-col p-4 h-full">
    <UTable
      v-model:sorting="sorting"
      :data="books"
      :columns="[
        {
          accessorKey: 'id',
          header: ({ column }) => getHeader(column, 'ID'),
        },
        {
          accessorKey: 'title',
          header: ({ column }) => getHeader(column, 'Title'),
        },
        {
          accessorKey: 'authorId',
          header: ({ column }) => getHeader(column, 'Author'),
          cell: ({ row }) => row.original.author?.name || 'Unknown',
        },
        {
          accessorKey: 'genre',
          header: ({ column }) => getHeader(column, 'Genre'),
        },
      ]"
      :loading
      :sorting-options="{
        enableMultiSort: false,
      }"
      class="flex-[1_1_0] min-h-0"
    />
    <nav class="flex items-center justify-between pt-2">
      <div>Total count: {{ totalCount }}</div>
    </nav>
  </div>
</template>
