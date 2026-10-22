<script setup lang="ts">
import type { CachePage, CollectionSummary, HistoryPage, ModuleSummary, PluginSummary, SubscriptionSummary } from '../../../src/protocol'
import { computed } from 'vue'
import { useInspector } from '../../stores/connection'
import PreviewValue from '../preview/PreviewValue.vue'
/** Single detached view owner, all producer data is read through validated transport. */
const { state } = useInspector()
/** Public collections and supported operation capabilities. */
const collections = computed(() => state.reply?.data as CollectionSummary[] ?? [])
/** Filtered cache result, preserving typed addresses and authoritative counts. */
const cache = computed(() => state.reply?.data as CachePage | undefined)
/** Stable history sequence page. */
const history = computed(() => state.reply?.data as HistoryPage | undefined)
/** Actual recorded realtime subscriptions. */
const subscriptions = computed(() => state.reply?.data as SubscriptionSummary[] ?? [])
/** Read-only module metadata. */
const modules = computed(() => state.reply?.data as ModuleSummary[] ?? [])
/** Public plugin descriptors without executable functions. */
const plugins = computed(() => state.reply?.data as PluginSummary[] ?? [])
/** Availability and policy of cache writes. */
const cacheWrites = computed(() => !state.actionDisabled && state.store?.capabilities.cacheWrites)
/** Update declarative filters before requesting page. */
function filter(event: Event, field: 'keySearch' | 'contentSearch'): void {
  const value = (event.target as HTMLInputElement).value
  state.cache.filter(field === 'keySearch' ? value : state.cache.keySearch, field === 'contentSearch' ? value : state.cache.contentSearch)
  void state.refresh()
}
/** Pagination offset is always relative to current filtered producer result. */
function page(offset: number): void {
  state.cache.offset = Math.max(0, offset)
  void state.refresh()
}
/** Select public collection before applying cached query parameters. */
function collection(event: Event): void {
  state.cache.select((event.target as HTMLSelectElement).value)
  void state.refresh()
}
/** Epoch-millisecond display, payload dates use tagged renderer separately. */
function time(value: number): string {
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div v-if="state.readError" class="view-error" role="alert">
    {{ state.readError }}
  </div>
  <div v-if="state.reply?.unavailable" class="empty-state">
    {{ state.reply.unavailable }}
  </div>
  <div v-else-if="!state.selection.target" class="empty-state">
    {{ state.selection.unavailable ? 'Selected store unavailable' : state.session?.kind === 'ssr' ? 'No captured stores' : 'No store selected' }}
  </div>
  <div v-else-if="state.view === 'collections'" class="view-list">
    <article v-for="item in collections" :key="item.name" class="data-card">
      <header><h2>{{ item.name }}</h2><span v-if="item.virtual" class="badge">Virtual</span><span v-if="item.count !== undefined">{{ item.count }} cached</span></header>
      <PreviewValue :value="item.relations" />
      <div class="item-actions">
        <button
          v-if="item.actions.includes('create-item')" :disabled="!!state.actionDisabled" :title="state.actionDisabled"
          @click="state.open('create-item', item.name)"
        >
          Create item
        </button>
        <button
          v-if="item.actions.includes('update-item')" :disabled="!!state.actionDisabled" :title="state.actionDisabled"
          @click="state.open('update-item', item.name)"
        >
          Update item
        </button>
        <button
          v-if="item.actions.includes('delete-item')" :disabled="!!state.actionDisabled" :title="state.actionDisabled"
          @click="state.open('delete-item', item.name)"
        >
          Delete item
        </button>
      </div>
    </article>
    <div v-if="state.reply && !collections.length" class="empty-state">
      No collections
    </div>
  </div>
  <section v-else-if="state.view === 'cache'">
    <div class="toolbar">
      <select aria-label="Cache collection" :value="state.cache.collection" @change="collection">
        <option v-for="item in state.collections" :key="item.name" :value="item.name">
          {{ item.name }}
        </option>
      </select>
      <input :value="state.cache.keySearch" aria-label="Search cache keys" placeholder="Search keys" @change="filter($event, 'keySearch')">
      <input :value="state.cache.contentSearch" aria-label="Search cache content" placeholder="Search content" @change="filter($event, 'contentSearch')">
      <select v-model="state.cache.view" aria-label="Cache view" @change="state.refresh()">
        <option value="effective">
          Effective
        </option><option value="committed">
          Committed
        </option>
      </select>
      <button
        :disabled="!cacheWrites || !state.cache.collection" :title="state.actionDisabled"
        @click="state.open('write-cache-item', state.cache.collection)"
      >
        Write item
      </button>
      <button :disabled="!cacheWrites" :title="state.actionDisabled" @click="state.open('clear-cache')">
        Clear cache
      </button>
    </div>
    <template v-if="cache">
      <div class="page-status">
        <span>{{ cache.total }} cached · {{ cache.matchingTotal === null ? 'Matching total unknown' : `${cache.matchingTotal} matching` }}</span>
        <span v-if="cache.scanTruncated" class="badge">Incomplete search</span>
        <button :disabled="cache.offset === 0 || state.loading" @click="page(cache.offset - cache.limit)">
          Previous
        </button>
        <button
          :disabled="state.loading || (cache.matchingTotal !== null ? cache.offset + cache.rows.length >= cache.matchingTotal : cache.rows.length < cache.limit)"
          @click="page(cache.offset + cache.limit)"
        >
          Next
        </button>
      </div>
      <article v-for="row in cache.rows" :key="`${typeof row.key}:${row.key}`" class="data-card">
        <header><h2><code>{{ typeof row.key }}: {{ JSON.stringify(row.key) }}</code></h2></header>
        <PreviewValue :value="row.value" />
        <div class="item-actions">
          <button :disabled="!cacheWrites" :title="state.actionDisabled" @click="state.open('delete-cache-item', state.cache.collection, row.key)">
            Delete cached item
          </button>
          <button
            v-if="state.collections.find(item => item.name === state.cache.collection)?.actions.includes('update-item')"
            :disabled="!!state.actionDisabled" @click="state.open('update-item', state.cache.collection, row.key)"
          >
            Update item
          </button>
          <button
            v-if="state.collections.find(item => item.name === state.cache.collection)?.actions.includes('delete-item')"
            :disabled="!!state.actionDisabled" @click="state.open('delete-item', state.cache.collection, row.key)"
          >
            Delete item
          </button>
        </div>
      </article>
      <div v-if="!cache.rows.length" class="empty-state">
        No cached items
      </div>
      <details v-if="cache.layers?.length" class="data-card">
        <summary>Cache layers · {{ cache.layers.length }}</summary>
        <article v-for="layer in cache.layers" :key="layer.id">
          <h3>{{ layer.id }}</h3>
          <p>
            {{ layer.collection }} · {{ layer.count ?? 'Unknown' }} items
            <span v-if="layer.optimistic"> · Optimistic</span><span v-if="layer.skip"> · Skipped</span>
          </p>
          <button @click="state.cache.layerId = layer.id; state.cache.offset = 0; state.refresh()">
            Inspect layer
          </button>
          <PreviewValue v-if="layer.deletedKeys !== undefined" :value="layer.deletedKeys" />
        </article>
        <button v-if="state.cache.layerId" @click="state.cache.layerId = undefined; state.refresh()">
          All effective layers
        </button>
      </details>
    </template>
  </section>
  <section v-else-if="state.view === 'history'">
    <div class="toolbar">
      <button :disabled="!!state.actionDisabled" :title="state.actionDisabled" @click="state.open('clear-history')">
        Clear history
      </button>
      <span v-if="history">{{ history.droppedCount }} dropped</span>
      <button
        :disabled="!history?.entries.length || history.entries[0]!.sequence === history.oldestSequence"
        @click="state.refresh({ beforeSequence: history?.entries[0]?.sequence })"
      >
        Older
      </button>
      <button
        :disabled="!history?.entries.length || history.entries[history.entries.length - 1]!.sequence + 1 >= history.nextSequence"
        @click="state.refresh({ afterSequence: history?.entries[history.entries.length - 1]?.sequence })"
      >
        Newer
      </button>
      <button @click="state.refresh()">
        Latest
      </button>
    </div>
    <article v-for="entry in history?.entries" :key="entry.sequence" class="data-card">
      <header><h2>{{ entry.operation }}</h2><span>{{ entry.phase }}</span><code>#{{ entry.sequence }}</code><time>{{ time(entry.time) }}</time></header>
      <p v-if="entry.collection">
        {{ entry.collection }}<code v-if="entry.key !== undefined"> · {{ JSON.stringify(entry.key) }}</code>
      </p>
      <details v-if="entry.arguments !== undefined">
        <summary>Input</summary><PreviewValue :value="entry.arguments" />
      </details>
      <details v-if="entry.result !== undefined">
        <summary>Result</summary><PreviewValue :value="entry.result" />
      </details>
      <details v-if="entry.error !== undefined" open>
        <summary>Error</summary><PreviewValue :value="entry.error" />
      </details>
    </article>
    <div v-if="history && !history.entries.length" class="empty-state">
      No history
    </div>
  </section>
  <section v-else-if="state.view === 'subscriptions'" class="view-list">
    <article v-for="item in subscriptions" :key="item.id" class="data-card">
      <header><h2>{{ item.collection }}</h2><code>{{ item.id }}</code><time>{{ time(item.startedAt) }}</time></header>
      <p v-if="item.key !== undefined">
        Key {{ JSON.stringify(item.key) }}
      </p>
      <PreviewValue v-if="item.findOptions !== undefined" :value="item.findOptions" />
    </article>
    <div v-if="state.reply && !subscriptions.length" class="empty-state">
      No subscriptions
    </div>
  </section>
  <section v-else-if="state.view === 'modules'" class="view-list">
    <article v-for="item in modules" :key="item.name" class="data-card">
      <h2>{{ item.name }}</h2><PreviewValue :value="item.value" />
    </article>
    <div v-if="state.reply && !modules.length" class="empty-state">
      No modules
    </div>
  </section>
  <section v-else-if="state.view === 'plugins'" class="view-list">
    <article v-for="item in plugins" :key="item.name" class="data-card">
      <header><h2>{{ item.name }}</h2><span v-if="item.category">{{ item.category }}</span></header>
      <PreviewValue v-if="item.metadata !== undefined" :value="item.metadata" />
    </article>
    <div v-if="state.reply && !plugins.length" class="empty-state">
      No plugins
    </div>
  </section>
  <p v-if="state.reply?.truncated" class="badge">
    Truncated preview
  </p>
</template>
