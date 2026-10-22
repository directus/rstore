import type { ActionName, CollectionSummary, ReadReply, SessionSummary, StoreSummary, ViewName } from '../../src/protocol'
import type { ConnectionStatus, InspectorTransport } from '../transport/types'
import type { Outcome } from './actions'
import { defineStore } from 'pinia'
import { markRaw, reactive, shallowRef } from 'vue'
import { validateReadResult } from '../../src/protocol'
import { submitInspector } from './action-workflow'
import { ActionDraft } from './actions'
import { InspectorObservation } from './observation'
import { actionDisabled } from './policy'
import { errorMessage, withDeadline } from './requests'
import { sameTarget, Selection } from './selection'
import { CacheQuery } from './views'

/** Inspector state owner, never retains application stores or live producer objects. */
export class Inspector {
  /** Current transport status. */
  status: ConnectionStatus = 'disconnected'
  /** Connection-level failure text. */
  error = ''
  /** Latest detached producer session publication. */
  sessions: SessionSummary[] = []
  /** Session remains inspectable when failed initialization published no stores. */
  sessionId = ''
  /** Exact target and viewer epoch. */
  selection = new Selection()
  /** Current visible view. */
  view: ViewName = 'collections'
  /** Latest bounded response for visible view. */
  reply: ReadReply | null = null
  /** Collection address captured with latest accepted cache rows. */
  private replyCollection = ''
  /** Read failure belonging to current target. */
  readError = ''
  /** Visible request in flight. */
  loading = false
  /** Cache filter/page ownership. */
  cache = new CacheQuery()
  /** Collection capability descriptions loaded for active target. */
  collections: CollectionSummary[] = []
  /** Open target-bound editor. */
  draft: ActionDraft | null = null
  /** Last deliberate action outcome, target identity retained. */
  outcome: Outcome | null = null
  /** Bounded command records preserve uncertain outcomes across target changes. */
  outcomes: Outcome[] = []
  /** Managed transport excluded from Vue deep reactivity. */
  transport: InspectorTransport | null = null
  /** Cleanup callbacks for currently connected transport. */
  private releases: (() => void)[] = []
  /** Monotonic read request ownership. */
  private request = 0
  /** Monotonic connection publication ownership. */
  private connection = 0
  /** Session publication epoch prevents old registry replies restoring vanished targets. */
  private publication = 0
  /** Coalesced invalidation refresh signal. */
  private dirty = false
  /** Active visible view lease, hidden views must not retain producer watchers. */
  private observation = new InspectorObservation()
  /** Active store summary, if published generation still exists. */
  get store(): StoreSummary | undefined {
    return this.sessions.flatMap(session => session.stores).find(store => sameTarget(store.target, this.selection.target))
  }

  /** Active recorded/live producer session. */
  get session(): SessionSummary | undefined {
    return this.sessions.find(session => session.sessionId === (this.selection.target?.sessionId ?? this.sessionId))
  }

  /** Human-readable reason writes are unavailable. */
  get actionDisabled(): string {
    return actionDisabled(this.status, this.store, this.session, this.outcome?.status === 'pending')
  }

  /** Connect detached transport, releasing prior connection ownership. */
  async connect(transport: InspectorTransport): Promise<void> {
    this.disconnect()
    const epoch = this.connection
    this.transport = markRaw(transport)
    this.status = 'connecting'
    this.error = ''
    this.releases.push(transport.subscribe((event) => {
      if (epoch !== this.connection)
        return
      if (event.target && sameTarget(event.target, this.selection.target) && event.view === this.view) {
        this.dirty = true
        if (!this.loading)
          void this.refresh()
      }
      else if (!event.target) {
        this.refreshRegistry()
      }
    }))
    if (transport.onStatus) {
      this.releases.push(transport.onStatus((status) => {
        if (epoch !== this.connection)
          return
        const previous = this.status
        this.status = status
        if (status !== 'live')
          this.observation.clear()
        if (status === 'live' && previous !== 'live') {
          this.refreshRegistry(true)
        }
      }))
    }
    try {
      await this.publish()
      if (epoch !== this.connection)
        return
      this.status = 'live'
      if (!this.selection.unavailable && !this.selection.target) {
        const target = this.sessions.flatMap(session => session.stores)[0]?.target
        if (target)
          await this.select(target)
        else if (this.sessions[0])
          await this.select(null, this.sessions[0].sessionId)
      }
    }
    catch (error) {
      if (epoch !== this.connection)
        return
      this.error = errorMessage(error)
      this.status = (error as { kind?: string })?.kind === 'auth'
        ? 'authentication-error'
        : /protocol/i.test(this.error) ? 'incompatible' : 'disconnected'
    }
  }

  /** Handle registry failure within current publication ownership, without unhandled rejection. */
  private refreshRegistry(recover = false): void {
    const epoch = this.connection
    const work = this.publish(recover)
    const id = this.publication
    void work.catch((error) => {
      if (epoch === this.connection && id === this.publication)
        this.error = errorMessage(error)
    })
  }

  /** Refresh published sessions and invalidate vanished authority. */
  async publish(recover = false): Promise<void> {
    const transport = this.transport
    const epoch = this.connection
    const id = ++this.publication
    if (!transport)
      return
    const sessions = validateReadResult('rstore:list-sessions', await withDeadline(transport.listSessions(), 10_000))
    if (epoch !== this.connection || id !== this.publication)
      return
    const connected = this.session?.connected
    this.sessions = sessions
    this.selection.reconcile(sessions.flatMap(session => session.stores.map(store => store.target)))
    if (!this.selection.target) {
      this.reply = null
      this.collections = []
      this.draft = null
      this.request++
      this.loading = false
      this.observation.clear()
    }
    // Registry replies may coalesce a fast disconnect/reconnect into one live publication.
    else if (recover || this.session?.connected || connected !== this.session?.connected) {
      await this.observation.acquire(this)
      if (this.session?.connected && epoch === this.connection && id === this.publication)
        await this.refresh()
    }
  }

  /** Deliberately select target and invalidate old reads/editor. */
  async select(target: StoreSummary['target'] | null, sessionId = target?.sessionId ?? ''): Promise<void> {
    this.selection.select(target)
    this.sessionId = sessionId
    this.request++
    this.reply = null
    this.readError = ''
    this.draft = null
    this.outcome = null
    this.collections = []
    this.loading = false
    this.cache = new CacheQuery()
    const owner = this.selection.capture()
    await this.observation.acquire(this)
    if (!target)
      return
    if (!this.selection.owns(owner))
      return
    if (this.transport) {
      try {
        const response = validateReadResult('rstore:get-collections', await withDeadline(this.transport.read('collections', target), 10_000), target)
        if (!this.selection.owns(owner))
          return
        this.collections = response.unavailable ? [] : response.data ?? []
        if (this.collections[0])
          this.cache.select(this.collections[0].name)
      }
      catch (error) {
        if (this.selection.owns(owner))
          this.readError = errorMessage(error)
      }
    }
    if (this.selection.owns(owner))
      await this.refresh()
  }

  /** Navigate view and immediately release old view request ownership. */
  async show(view: ViewName): Promise<void> {
    this.view = view
    this.request++
    this.reply = null
    this.loading = false
    this.readError = ''
    await this.observation.acquire(this)
    await this.refresh()
  }

  /** Read visible view, fencing delayed data and errors by target/epoch/request. */
  async refresh(parameters?: Record<string, unknown>): Promise<void> {
    const transport = this.transport
    const owner = this.selection.capture()
    if (!transport || !owner.target || (this.view === 'cache' && !this.cache.collection))
      return
    const id = ++this.request
    const view = this.view
    const collection = view === 'cache' ? this.cache.collection : ''
    if (view === 'cache' && collection !== this.replyCollection) {
      this.reply = null
      this.draft = null
    }
    this.loading = true
    this.dirty = false
    this.readError = ''
    try {
      const reply = validateReadResult(`rstore:get-${view}`, await withDeadline(transport.read(view, owner.target, parameters ?? (view === 'cache' ? this.cache.parameters() : {})), 10_000), owner.target)
      if (!this.selection.owns(owner) || id !== this.request)
        return
      // Invalidation requires catch-up, but does not invalidate this fenced snapshot.
      this.reply = reply
      this.replyCollection = collection
    }
    catch (error) {
      if (this.selection.owns(owner) && id === this.request)
        this.readError = errorMessage(error)
    }
    finally {
      if (id === this.request) {
        this.loading = false
        if (this.dirty)
          void this.refresh()
      }
    }
  }

  /** Open editor only when current target permits writes. */
  open(action: ActionName, collection = '', key?: string | number): void {
    if (this.view === 'cache' && key !== undefined && (!this.reply || collection !== this.replyCollection))
      return
    if (!this.actionDisabled)
      this.draft = new ActionDraft(this.selection, action, collection, key)
  }

  /** Submit one deliberate command through shared target-fenced outcome workflow. */
  submit(): Promise<void> {
    return submitInspector(this)
  }

  /** Release all channel ownership on app unmount, reconnection or HMR. */
  disconnect(): void {
    this.connection++
    this.publication++
    this.request++
    this.observation.clear()
    this.releases.splice(0).forEach(release => release())
    this.transport?.dispose()
    this.transport = null
    this.selection.select(null)
    this.reply = null
    this.collections = []
    this.draft = null
    this.sessions = []
    this.sessionId = ''
    this.loading = false
    this.status = 'disconnected'
  }
}
/** Sole reactive connection/data/action owner shared directly by inspector components. */
export const useInspector = defineStore('rstore-inspector', () => ({ state: shallowRef(reactive(new Inspector()) as Inspector) }))
