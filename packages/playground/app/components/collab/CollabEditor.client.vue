<script lang="ts" setup>
import type { Ref } from 'vue'
import { isRef } from 'vue'

const props = defineProps<{
  id: string
}>()

const store = useStore()

// Load the document into an update form
const form = await store.CollabDocument!.updateForm(props.id)

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

const channel = useRstoreMultiplayerChannel<{
  title?: string
  body?: string
  status?: 'draft' | 'published'
}, TextField | 'status'>({
  roomId: `collab:${props.id}`,
})

const titleField = useRstoreMultiplayerTextField({
  field: 'title',
  channel,
})

const bodyField = useRstoreMultiplayerTextField({
  field: 'body',
  channel,
})

const statusField = useRstoreMultiplayerField({
  field: 'status',
  channel,
})

const {
  undoAndSync,
  redoAndSync,
} = useRstoreMultiplayerForm({
  form,
  channel,
  trackedFields: ['title', 'body', 'status'],
  getTextFieldElement: (field) => {
    if (field === 'title') {
      return titleInputEl.value
    }

    if (field === 'body') {
      return bodyTextareaEl.value
    }

    return null
  },
  getBaseValue: () => store.CollabDocument!.peekFirst(props.id),
  setBaseValue: (value) => {
    const collection = store.$collections.find(c => c.name === 'CollabDocument')!
    store.$cache.writeItem({
      collection,
      key: props.id,
      item: value,
    })
  },
})

// Join the room when mounted
onMounted(() => {
  channel.joinRoom()
})

// Conflict handling
form.$onConflict((conflicts) => {
  // eslint-disable-next-line no-console
  console.log('Conflicts detected:', conflicts)
})

function resolveElementRef<T>(value: MaybeElementRef<T>) {
  return isRef(value) ? value.value : value
}

// Get peers editing a specific field
function peersOnField(field: string) {
  return channel.peers.value.filter(peer => peer.field === field)
}

const toast = useToast()

form.$onSuccess(() => {
  toast.add({
    title: 'Document saved',
    icon: 'lucide:check',
    color: 'success',
  })
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Presence indicators -->
    <RstoreMultiplayerPresenceList
      :user="channel.user"
      :peers="channel.peers"
      empty-label="No other editors — open this page in another tab!"
    />

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
            @focus="titleField.onFocus"
            @blur="titleField.onBlur"
            @click="titleField.onCursorEvent"
            @input="titleField.onCursorEvent"
            @keyup="titleField.onCursorEvent"
            @select="titleField.onCursorEvent"
          />
          <RstoreMultiplayerTextCursorOverlay
            field="title"
            :peers="channel.peers"
            :container="titleFieldRef"
            :target="titleInputEl"
          />
          <div
            v-for="peer in peersOnField('title')"
            :key="peer.id"
            class="absolute -top-2 -right-2"
          >
            <div
              class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
              :style="{ backgroundColor: peer.color }"
              :title="`${peer.name} is editing`"
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
            @focus="bodyField.onFocus"
            @blur="bodyField.onBlur"
            @click="bodyField.onCursorEvent"
            @input="bodyField.onCursorEvent"
            @keyup="bodyField.onCursorEvent"
            @select="bodyField.onCursorEvent"
          />
          <RstoreMultiplayerTextCursorOverlay
            field="body"
            :peers="channel.peers"
            :container="bodyFieldRef"
            :target="bodyTextareaEl"
          />
          <div
            v-for="peer in peersOnField('body')"
            :key="peer.id"
            class="absolute -top-2 -right-2"
          >
            <div
              class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
              :style="{ backgroundColor: peer.color }"
              :title="`${peer.name} is editing`"
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
          @focus="statusField.onFocus"
          @blur="statusField.onBlur"
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
