import type { App } from 'vue'
import type { RstoreMultiplayerChannel } from '../../src/runtime/composables/useRstoreMultiplayerChannel'
import { createFormObject } from '@rstore/vue'
import { createNuxtApp } from 'nuxt/app'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { useRstoreMultiplayerChannel } from '../../src/runtime/composables/useRstoreMultiplayerChannel'
import { useRstoreMultiplayerField } from '../../src/runtime/composables/useRstoreMultiplayerField'
import { useRstoreMultiplayerForm } from '../../src/runtime/composables/useRstoreMultiplayerForm'

/** Independent values make ignored remote fields and preserved state observable. */
interface EditorData {
  /** Shared title. */
  title: string
  /** Shared body. */
  body: string
  /** Untracked authorization state. */
  isAdmin: boolean
}

/** Real editor state retained after unmount for stale-delivery assertions. */
interface Editor {
  /** Application responsible for real component teardown. */
  app: App
  /** Container removed in final resource teardown. */
  root: HTMLElement
  /** Actual transport/channel instance. */
  channel: RstoreMultiplayerChannel<Partial<EditorData>, keyof EditorData>
  /** Actual form proxy. */
  form: ReturnType<typeof createFormObject<EditorData>>
  /** Latest acknowledged base independent of local edits. */
  base: EditorData
  /** Current dynamic field option. */
  dynamicField: ReturnType<typeof ref<'title' | 'body'>>
  /** Actual field callbacks bound to native inputs. */
  fields: Record<'title' | 'body' | 'dynamic', ReturnType<typeof useRstoreMultiplayerField>>
  /** Actual synchronization callbacks including undo/redo. */
  sync: ReturnType<typeof useRstoreMultiplayerForm>
  /** Child subscriber lifetime independent of shared channel lifetime. */
  showSync: ReturnType<typeof ref<boolean>>
  /** Whether this application still owns component effects. */
  mounted: boolean
  /** Nuxt's own context scope. */
  stopNuxt: () => void
}

/** Editors are independent Vue applications sharing only external transport. */
const editors = new Map<string, Editor>()
/** Independently acquired roots/apps survive failures during later setup. */
const resources = new Set<{ app: App, root: HTMLElement, mounted: boolean, stopNuxt: () => void }>()

/** Mount real Nuxt context, Vue lifecycle, VueUse socket and rstore form. */
export async function mount(options: {
  id: string
  session: string
  userId?: string
  roomId?: string
  heartbeatInterval?: number
  stalePeerTimeout?: number
  tracked?: boolean
}): Promise<void> {
  const endpoint = `${location.origin.replace('http', 'ws')}/__multiplayer?session=${options.session}`
  const runtimeConfig = { public: { wsEndpoint: endpoint }, app: {} }
  // Nuxt's client entry hydrates this public payload before creating context.
  Object.assign(window, { __NUXT__: { config: runtimeConfig } })
  const root = document.createElement('section')
  root.dataset.editor = options.id
  document.querySelector('#app')!.append(root)
  let editor!: Editor
  const app = createApp(defineComponent({
    setup() {
      const base: EditorData = { title: 'old', body: 'Hello world', isAdmin: false }
      const form = createFormObject<EditorData>({ defaultValues: () => ({ ...base }), submit: async data => ({ ...base, ...data }) })
      const channel = useRstoreMultiplayerChannel<Partial<EditorData>, keyof EditorData>({
        roomId: options.roomId ?? 'room',
        user: { id: options.userId ?? options.id, name: options.id, color: '#123456' },
        heartbeatInterval: options.heartbeatInterval ?? 60_000,
        stalePeerTimeout: options.stalePeerTimeout,
      })
      const dynamicField = ref<'title' | 'body'>('title')
      const fields = {
        title: useRstoreMultiplayerField({ field: 'title', channel }),
        body: useRstoreMultiplayerField({ field: 'body', channel }),
        dynamic: useRstoreMultiplayerField({ field: dynamicField, channel }),
      }
      const showSync = ref(true)
      const Sync = defineComponent({
        setup() {
          editor.sync = useRstoreMultiplayerForm({
            form,
            channel,
            getBaseValue: () => editor.base,
            setBaseValue: (value) => { editor.base = value },
            trackedFields: options.tracked === false ? undefined : ['title', 'body'],
            getTextFieldElement: field => root.querySelector<HTMLInputElement>(`[data-field="${field}"]`),
          })
          return () => null
        },
      })
      editor = { app, root, channel, form, base, fields, sync: undefined!, showSync, dynamicField, mounted: true, stopNuxt: () => {} }
      return () => h('div', [showSync.value ? h(Sync) : null, ...(['title', 'body'] as const).map(field => h('input', {
        'data-field': field,
        'value': form[field],
        'onInput': (event: Event) => { form[field] = (event.target as HTMLInputElement).value },
        'onFocus': fields[field].onFocus,
        'onBlur': fields[field].onBlur,
      }))])
    },
  }))
  const resource = { app, root, mounted: false, stopNuxt: () => {} }
  resources.add(resource)
  const nuxt = createNuxtApp({ vueApp: app })
  resource.stopNuxt = () => {
    resource.mounted = false
    nuxt._scope.stop()
  }
  resource.mounted = true
  app.mount(root)
  editor.stopNuxt = resource.stopNuxt
  editors.set(options.id, editor)
  await nextTick()
}

/** Fail immediately for unsupported fixture operations. */
function editorFor(id: string): Editor {
  const editor = editors.get(id)
  if (!editor)
    throw new Error(`Unknown multiplayer editor: ${id}`)
  return editor
}

/** Read copied public values; expected literals never alias mutable state. */
export function snapshot(id: string) {
  const editor = editorFor(id)
  return {
    clientId: editor.channel.clientId,
    status: editor.channel.status.value,
    peers: editor.channel.peers.value.map(peer => ({ ...peer })),
    users: editor.channel.presenceUsers.value.map(peer => ({ ...peer })),
    remoteUpdate: editor.channel.remoteUpdate.value,
    // Browser automation serializes objects by assignment, which can lose an
    // own __proto__ key. Arrays preserve explicit evidence of received/base keys.
    remoteUpdateKeys: Object.keys(editor.channel.remoteUpdate.value ?? {}).sort(),
    form: { title: editor.form.title, body: editor.form.body, isAdmin: editor.form.isAdmin },
    base: { ...editor.base },
    baseKeys: Object.keys(editor.base).sort(),
    conflicts: editor.form.$conflicts,
    polluted: ({} as Record<string, unknown>).polluted,
  }
}

/** Consumer interactions use actual exported callbacks and actual form writes. */
export async function action(id: string, operation: string, value?: any): Promise<void> {
  const editor = editorFor(id)
  if (operation === 'edit') {
    Object.assign(editor.form, value)
  }
  else if (operation === 'focus' || operation === 'blur') {
    editor.fields[value as 'title' | 'body' | 'dynamic'][operation === 'focus' ? 'onFocus' : 'onBlur']()
  }
  else if (operation === 'dynamicField') {
    editor.dynamicField.value = value
  }
  else if (operation === 'join') {
    editor.channel.joinRoom()
  }
  else if (operation === 'leave') {
    editor.channel.leaveRoom()
  }
  else if (operation === 'undo') {
    await editor.sync.undoAndSync()
  }
  else if (operation === 'redo') {
    await editor.sync.redoAndSync()
  }
  else if (operation === 'detachSync') {
    editor.showSync.value = false
  }
  else if (operation === 'unmount') {
    if (editor.mounted) {
      editor.mounted = false
      editor.app.unmount()
      editor.stopNuxt()
    }
  }
  else {
    throw new Error(`Unsupported multiplayer operation: ${operation}`)
  }
  await nextTick()
  // Complete callbacks' native setTimeout(0) turn before observing final state.
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

/** Release every independently acquired application even after test failure. */
export async function dispose(): Promise<void> {
  const errors: unknown[] = []
  for (const [id, editor] of editors) {
    try {
      await action(id, 'unmount')
    }
    catch (error) {
      errors.push(error)
    }
    finally {
      editor.root.remove()
    }
  }
  for (const resource of resources) {
    try {
      if (resource.mounted)
        resource.app.unmount()
    }
    catch (error) {
      errors.push(error)
    }
    finally {
      resource.stopNuxt()
      resource.root.remove()
    }
  }
  resources.clear()
  editors.clear()
  if (errors.length)
    throw new AggregateError(errors, 'Multiplayer fixture teardown failed')
}
