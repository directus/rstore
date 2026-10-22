<script setup lang="ts">
import type { PreviewValue } from '../../../src/protocol'
import { computed } from 'vue'

/** Detached tagged preview, application objects never appear in recursive renderer. */
const props = withDefaults(defineProps<{ value: PreviewValue, depth?: number }>(), { depth: 0 })
/** Scalar display preserves JSON escaping through Vue text interpolation. */
const scalar = computed(() => props.value === null
  ? 'null'
  : typeof props.value === 'string' ? JSON.stringify(props.value) : String(props.value))
/** Narrow detached composite union once for template access. */
const composite = computed(() => typeof props.value === 'object' && props.value !== null ? props.value : null)
/** Bound expanded rendering independently of producer projection limits. */
const expandable = computed(() => composite.value && ['object', 'array', 'map', 'set', 'error'].includes(composite.value.kind))
/** Composite title remains compact while distinguishing genuinely empty values. */
const title = computed(() => {
  const value = composite.value
  if (!value)
    return ''
  if (value.kind === 'object')
    return `Object (${value.entries.length})`
  if (value.kind === 'array' || value.kind === 'set')
    return `${value.kind} (${value.values.length})`
  if (value.kind === 'map')
    return `Map (${value.entries.length})`
  if (value.kind === 'error')
    return `${value.name}: ${value.message}`
  return value.kind
})
</script>

<template>
  <span v-if="!composite" class="preview-scalar">{{ scalar }}</span>
  <details v-else-if="expandable && depth < 12" :open="depth === 0" class="preview-composite">
    <summary>{{ title }}<span v-if="'truncated' in composite && composite.truncated"> · truncated</span></summary>
    <dl v-if="composite.kind === 'object' || composite.kind === 'error'" class="preview-entries">
      <div v-for="[key, entry] in composite.entries" :key="key">
        <dt>{{ key }}</dt>
        <dd><PreviewValue :value="entry" :depth="depth + 1" /></dd>
      </div>
    </dl>
    <ol v-else-if="composite.kind === 'array' || composite.kind === 'set'" class="preview-values">
      <li v-for="(entry, index) in composite.values" :key="index">
        <PreviewValue :value="entry" :depth="depth + 1" />
      </li>
    </ol>
    <dl v-else-if="composite.kind === 'map'" class="preview-entries">
      <div v-for="([key, entry], index) in composite.entries" :key="index">
        <dt><PreviewValue :value="key" :depth="depth + 1" /></dt>
        <dd><PreviewValue :value="entry" :depth="depth + 1" /></dd>
      </div>
    </dl>
  </details>
  <span v-else-if="composite.kind === 'date'">{{ composite.value ?? 'Invalid Date' }}</span>
  <span v-else-if="composite.kind === 'bigint'">{{ composite.value }}n</span>
  <span v-else-if="composite.kind === 'function'">Function {{ composite.value }}</span>
  <span v-else-if="composite.kind === 'reference'">Reference {{ composite.path }}</span>
  <span v-else-if="'reason' in composite">{{ composite.kind }}: {{ composite.reason }}</span>
  <span v-else>Rendering limit</span>
</template>
