<script lang="ts" setup>
import { useCacheView } from '../../composables/cache-view'
import CodeSnippet from '../CodeSnippet.vue'
import CacheCollectionList from './CacheCollectionList.vue'
import CacheItemList from './CacheItemList.vue'
import CacheToolbar from './CacheToolbar.vue'

const view = useCacheView()
</script>

<template>
  <div class="h-full min-h-0">
    <CodeSnippet
      v-if="view.showRawCache"
      :code="view.cache"
      class="text-xs p-2"
    />

    <div
      v-else
      class="flex items-stretch h-full min-h-0"
    >
      <CacheCollectionList :view="view" />
      <CacheItemList :view="view" />
    </div>

    <CacheToolbar :view="view" />
  </div>
</template>
