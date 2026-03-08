<script lang="ts" setup>
import type { Ref } from 'vue'
import { isRef } from 'vue'

const props = defineProps<{
  id: string
}>()

const store = useStore()

// Load the document into an update form
const form = await store.CollabDocument!.updateForm(props.id)

// Set up collab sync via WebSocket
const {
  userName,
  userColor,
  peers,
  remoteUpdates,
  joinRoom,
  broadcastChanges,
  broadcastFocus,
  broadcastCursor,
} = useCollabSync(props.id)

type TextField = 'title' | 'body'
type MaybeElementRef<T> = T | Ref<T>

interface InputComponentRef {
  inputRef: MaybeElementRef<HTMLInputElement | null>
}

interface TextareaComponentRef {
  textareaRef: MaybeElementRef<HTMLTextAreaElement | null>
}

const titleFieldRef = ref<HTMLElement | null>(null)
const bodyFieldRef = ref<HTMLElement | null>(null)
const titleInputRef = ref<InputComponentRef | null>(null)
const bodyTextareaRef = ref<TextareaComponentRef | null>(null)
const titleInputEl = computed(() => titleInputRef.value ? resolveElementRef(titleInputRef.value.inputRef) : null)
const bodyTextareaEl = computed(() => bodyTextareaRef.value ? resolveElementRef(bodyTextareaRef.value.textareaRef) : null)
const activePresenceField = ref<string | null>(null)
let pendingBlurTimer: ReturnType<typeof setTimeout> | null = null

// Join the room when mounted
onMounted(() => {
  joinRoom()
})

// When the form changes, broadcast the new values to peers
let suppressBroadcast = false

form.$onChange((changes) => {
  if (suppressBroadcast)
    return
  const fields: Record<string, any> = {}
  for (const [key, value] of Object.entries(changes)) {
    if (value) {
      fields[key] = value[0] // newValue
    }
  }
  if (Object.keys(fields).length > 0) {
    broadcastChanges(fields)
  }
})

// Broadcast current form state for all tracked fields (used after undo/redo)
function broadcastCurrentState() {
  const fields: Record<string, any> = {}
  for (const key of ['title', 'body', 'status'] as const) {
    fields[key] = (form as any)[key]
  }
  broadcastChanges(fields)
}

function undoAndSync() {
  suppressBroadcast = true
  form.$opLog.undo()
  suppressBroadcast = false
  broadcastCurrentState()
}

function redoAndSync() {
  suppressBroadcast = true
  form.$opLog.redo()
  suppressBroadcast = false
  broadcastCurrentState()
}

// When we receive remote updates, rebase the form
watch(remoteUpdates, (updates) => {
  if (!updates)
    return
  // Build the new base data by merging current cache data with remote changes
  const currentItem = store.CollabDocument!.peekFirst(props.id)
  if (currentItem) {
    const newBase = { ...currentItem, ...updates }
    // Also apply changes to the cache so the underlying data is up-to-date
    const collection = store.$collections.find(c => c.name === 'CollabDocument')!
    store.$cache.writeItem({
      collection,
      key: props.id,
      item: newBase,
    })
    form.$rebase(newBase, Object.keys(updates) as (keyof typeof newBase)[])
  }
})

// Conflict handling
form.$onConflict((conflicts) => {
  // eslint-disable-next-line no-console
  console.log('Conflicts detected:', conflicts)
})

// Track which field has focus
function onFieldFocus(field: string) {
  clearPendingBlur()
  activePresenceField.value = field
  broadcastFocus(field)
}

function onFieldBlur(field: string) {
  clearPendingBlur()
  pendingBlurTimer = setTimeout(() => {
    pendingBlurTimer = null

    if (activePresenceField.value !== field) {
      return
    }

    if (!document.hasFocus()) {
      return
    }

    activePresenceField.value = null
    broadcastFocus(undefined)
  }, 0)
}

function onTextFieldFocus(field: TextField, event: FocusEvent) {
  onFieldFocus(field)
  updateTextCursor(field, event)
}

function onTextCursorEvent(field: TextField, event: Event) {
  updateTextCursor(field, event)
}

function updateTextCursor(field: TextField, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    return
  }

  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start

  broadcastCursor(field, {
    start,
    end,
    direction: normalizeSelectionDirection(target.selectionDirection),
  })
}

function normalizeSelectionDirection(direction: string | null): 'forward' | 'backward' | 'none' {
  if (direction === 'forward' || direction === 'backward') {
    return direction
  }

  return 'none'
}

function resolveElementRef<T>(value: MaybeElementRef<T>) {
  return isRef(value) ? value.value : value
}

function clearPendingBlur() {
  if (pendingBlurTimer != null) {
    clearTimeout(pendingBlurTimer)
    pendingBlurTimer = null
  }
}

// Get peers editing a specific field
function peersOnField(field: string) {
  return peers.value.filter(peer => peer.field === field)
}

const toast = useToast()

form.$onSuccess(() => {
  toast.add({
    title: 'Document saved',
    icon: 'lucide:check',
    color: 'success',
  })
})

onUnmounted(() => {
  clearPendingBlur()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Presence indicators -->
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1">
        <div
          class="w-3 h-3 rounded-full border-2"
          :style="{ backgroundColor: userColor,
                    borderColor: userColor }"
        />
        <span class="text-xs font-medium">{{ userName }} (you)</span>
      </div>
      <div
        v-for="peer in peers"
        :key="peer.userId"
        class="flex items-center gap-1"
      >
        <div
          class="w-3 h-3 rounded-full border-2"
          :style="{ backgroundColor: peer.userColor,
                    borderColor: peer.userColor }"
        />
        <span class="text-xs font-medium">{{ peer.userName }}</span>
        <span v-if="peer.field" class="text-xs opacity-50">(editing {{ peer.field }})</span>
      </div>
      <div v-if="peers.length === 0" class="text-xs opacity-40 ml-2">
        No other editors — open this page in another tab!
      </div>
    </div>

    <USeparator />

    <!-- Conflict banner -->
    <div
      v-if="form.$conflicts.length > 0"
      class="p-3 rounded-lg bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800"
    >
      <div class="flex items-center gap-2 mb-2 font-medium text-warning-700 dark:text-warning-300">
        <UIcon name="lucide:alert-triangle" />
        {{ form.$conflicts.length }} conflict{{ form.$conflicts.length > 1 ? 's' : '' }} detected
      </div>
      <div
        v-for="conflict in form.$conflicts"
        :key="String(conflict.field)"
        class="flex items-center gap-2 text-sm mb-1"
      >
        <span class="font-mono">{{ conflict.field }}</span>
        <span class="opacity-50">—</span>
        <span class="text-xs">
          yours: <code class="bg-primary-100 dark:bg-primary-900 px-1 rounded">{{ conflict.localValue }}</code>
        </span>
        <span class="text-xs">
          remote: <code class="bg-warning-100 dark:bg-warning-900 px-1 rounded">{{ conflict.remoteValue }}</code>
        </span>
        <UButton
          size="xs"
          variant="soft"
          color="primary"
          label="Keep mine"
          @click="form.$resolveConflict(conflict.field, 'local')"
        />
        <UButton
          size="xs"
          variant="soft"
          color="warning"
          label="Accept remote"
          @click="form.$resolveConflict(conflict.field, 'remote')"
        />
      </div>
    </div>

    <!-- Form -->
    <UForm
      :state="form"
      :schema="form.$schema"
      class="flex flex-col gap-4"
      @submit="form.$submit()"
    >
      <UFormField
        label="Title"
        name="title"
      >
        <div ref="titleFieldRef" class="relative w-full">
          <UInput
            ref="titleInputRef"
            v-model="form.title"
            placeholder="Document title"
            size="lg"
            class="w-full"
            @focus="onTextFieldFocus('title', $event)"
            @blur="onFieldBlur('title')"
            @click="onTextCursorEvent('title', $event)"
            @input="onTextCursorEvent('title', $event)"
            @keyup="onTextCursorEvent('title', $event)"
            @select="onTextCursorEvent('title', $event)"
          />
          <CollabTextCursorOverlay
            field="title"
            :peers="peers"
            :container="titleFieldRef"
            :target="titleInputEl"
          />
          <div
            v-for="peer in peersOnField('title')"
            :key="peer.userId"
            class="absolute -top-2 -right-2"
          >
            <div
              class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
              :style="{ backgroundColor: peer.userColor }"
              :title="`${peer.userName} is editing`"
            />
          </div>
        </div>
      </UFormField>

      <UFormField
        label="Content"
        name="body"
      >
        <div ref="bodyFieldRef" class="relative w-full">
          <UTextarea
            ref="bodyTextareaRef"
            v-model="form.body"
            placeholder="Write your content here..."
            :rows="10"
            class="w-full"
            @focus="onTextFieldFocus('body', $event)"
            @blur="onFieldBlur('body')"
            @click="onTextCursorEvent('body', $event)"
            @input="onTextCursorEvent('body', $event)"
            @keyup="onTextCursorEvent('body', $event)"
            @select="onTextCursorEvent('body', $event)"
          />
          <CollabTextCursorOverlay
            field="body"
            :peers="peers"
            :container="bodyFieldRef"
            :target="bodyTextareaEl"
          />
          <div
            v-for="peer in peersOnField('body')"
            :key="peer.userId"
            class="absolute -top-2 -right-2"
          >
            <div
              class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
              :style="{ backgroundColor: peer.userColor }"
              :title="`${peer.userName} is editing`"
            />
          </div>
        </div>
      </UFormField>

      <UFormField
        label="Status"
        name="status"
      >
        <USelect
          v-model="form.status"
          :items="[
            { label: 'Draft',
              value: 'draft' },
            { label: 'Published',
              value: 'published' },
          ]"
          class="w-48"
          @focus="onFieldFocus('status')"
          @blur="onFieldBlur('status')"
        />
      </UFormField>

      <USeparator />

      <div class="flex items-center gap-3">
        <UButton
          type="button"
          icon="lucide:undo-2"
          label="Undo"
          color="neutral"
          variant="ghost"
          :disabled="!form.$opLog.canUndo"
          @click="undoAndSync()"
        />
        <UButton
          type="button"
          icon="lucide:redo-2"
          label="Redo"
          color="neutral"
          variant="ghost"
          :disabled="!form.$opLog.canRedo"
          @click="redoAndSync()"
        />

        <div class="flex-1" />

        <UButton
          type="button"
          icon="lucide:rotate-ccw"
          label="Reset"
          color="neutral"
          variant="soft"
          :disabled="form.$loading"
          @click="form.$reset()"
        />
        <UButton
          type="submit"
          icon="lucide:save"
          label="Save"
          color="primary"
          :loading="form.$loading"
          :disabled="!form.$hasChanges() || !form.$valid"
        />
      </div>
    </UForm>

    <!-- Debug info -->
    <USeparator />

    <div class="text-xs flex flex-col gap-2">
      <div class="flex gap-2">
        <UBadge
          :color="form.$valid ? 'success' : 'error'"
          :label="form.$valid ? 'Valid' : 'Invalid'"
          variant="soft"
        />
        <UBadge
          :color="form.$hasChanges() ? 'info' : 'neutral'"
          :label="form.$hasChanges() ? 'Has changes' : 'No changes'"
          variant="soft"
        />
        <UBadge
          color="neutral"
          :label="`${form.$opLog.getAll().length} ops`"
          variant="soft"
        />
        <UBadge
          v-if="form.$conflicts.length"
          color="warning"
          :label="`${form.$conflicts.length} conflicts`"
          variant="soft"
        />
      </div>

      <div v-if="form.$hasChanges()">
        <div class="mb-1 font-medium">
          Changed props:
        </div>
        <Output
          :data="form.$changedProps"
          class="!m-0"
        />
      </div>

      <div v-if="form.$opLog.getAll().length">
        <div class="mb-1 font-medium">
          Operation log:
        </div>
        <Output
          :data="form.$opLog.getAll()"
          class="!m-0"
        />
      </div>
    </div>
  </div>
</template>
