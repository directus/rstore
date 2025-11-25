<script lang="ts" setup>
import type { Column } from '@tanstack/vue-table'
import { UButton, UDropdownMenu } from '#components'

const store = useStore()

const sorting = ref<Array<{ id: string, desc: boolean }>>([])

const { pages, meta, fetchMore } = await store.Book.query(q => q.many({
  pageIndex: 0,
  pageSize: 20,
  sort: sorting.value[0],
}))

const pageIndex = ref(0)

const totalCount = computed(() => meta.value.totalCount ?? 0)

const currentPage = computed(() => pages.value[pageIndex.value] ?? fetchMore({
  pageIndex: pageIndex.value,
}).page)

const pageNumber = computed({
  get: () => pageIndex.value + 1,
  set: (value: number) => {
    pageIndex.value = value - 1
  },
})

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
      :data="currentPage.data"
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
          accessorKey: 'author',
          header: ({ column }) => getHeader(column, 'Author'),
        },
        {
          accessorKey: 'genre',
          header: ({ column }) => getHeader(column, 'Genre'),
        },
      ]"
      :loading="currentPage.loading"
      :sorting-options="{
        enableMultiSort: false,
      }"
      class="flex-[1_1_0] min-h-0"
    />
    <nav class="flex items-center justify-between pt-2">
      <UPagination
        v-model:page="pageNumber"
        :items-per-page="20"
        :total="totalCount"
      />
      <div>Total count: {{ totalCount }}</div>
    </nav>
  </div>
</template>
