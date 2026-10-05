import type { CollabClient } from '@rstore/multiplayer/ot'
import type { CollabWireServerMessage } from '@rstore/multiplayer/protocol'
import { createCollabClient, createCollabUndoManager } from '@rstore/multiplayer/ot'
import { collabPlugin, docStateToNode } from '@rstore/multiplayer/prosemirror'
import { createCollabServer, createMemoryOpLogStore } from '@rstore/multiplayer/server'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { mountManualControls } from './manual'
import { prng, schema } from './shared'
import { createSoak } from './soak'

/**
 * One run: an in-page sequencer, two clients behind FIFO links with random
 * latency, and two editors (#a is driven by CDP IME, #b by a script).
 */
function createSession(seed: number) {
  const random = prng(seed)
  const store = createMemoryOpLogStore()
  store.seed('doc', [{ id: 'p1', docId: 'doc', parentId: null, orderKey: 'a0', type: 'paragraph', attrs: {}, content: [{ insert: 'hello world' }], deleted: false, version: 0 }], 0)
  const server = createCollabServer({ store })
  let inFlight = 0

  /** FIFO delivery with a random delay per frame. */
  const link = <T>(deliver: (frame: T) => void | Promise<void>) => {
    let chain = Promise.resolve()
    return (frame: T) => {
      inFlight++
      const copy = JSON.parse(JSON.stringify(frame)) as T
      chain = chain.then(() => new Promise<void>(resolve => setTimeout(resolve, random() * 30)))
        .then(() => deliver(copy))
        .finally(() => inFlight--)
    }
  }

  const views: Record<string, EditorView> = {}
  const stats = { compositions: 0, remoteWhileComposing: 0 }
  const clients: Record<string, CollabClient> = {}
  for (const name of ['a', 'b']) {
    const peer = { id: name, userId: name, send: link<CollabWireServerMessage>(frame => clients[name]!.receive(frame)) }
    const up = link((frame: Parameters<typeof server.handleMessage>[1]) => server.handleMessage(peer, frame))
    const client = createCollabClient({ docId: 'doc', clientId: name, send: up })
    clients[name] = client
    client.connect()
  }
  return {
    clients,
    views,
    /** Creates the editors once both clients have the snapshot. */
    async mount() {
      while (!clients.a!.loaded || !clients.b!.loaded) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      for (const name of ['a', 'b']) {
        const client = clients[name]!
        const undo = createCollabUndoManager(client)
        const state = EditorState.create({ doc: docStateToNode(schema, client.state), plugins: [collabPlugin({ client, undo, createId: () => `${name}-${Math.floor(random() * 1e9)}` })] })
        const mountPoint = document.querySelector(`#${name}`)!
        mountPoint.innerHTML = ''
        const view = new EditorView(mountPoint, { state })
        views[name] = view
        // Evidence the composition path ran with concurrent remote edits.
        view.dom.addEventListener('compositionstart', () => stats.compositions++)
        client.on('change', (event) => {
          if (event.origin === 'remote' && view.composing) {
            stats.remoteWhileComposing++
          }
        })
      }
    },
    /** Types characters into editor B at random offsets of the first paragraph. */
    async typeInB(chars: string, delayMs: number) {
      const view = views.b!
      for (const char of chars) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (0.5 + random())))
        const paragraph = view.state.doc.firstChild!
        const pos = 1 + Math.floor(random() * (paragraph.content.size + 1))
        view.dispatch(view.state.tr.insertText(char, pos))
      }
    },
    /** Resolves when no frame is in flight and both clients are synchronized. */
    async settled() {
      for (let quiet = 0; quiet < 3;) {
        await new Promise(resolve => setTimeout(resolve, 20))
        const idle = inFlight === 0 && clients.a!.status === 'synchronized' && clients.b!.status === 'synchronized'
        quiet = idle ? quiet + 1 : 0
      }
    },
    /** Both editors and the server document, as JSON. */
    docs() {
      return {
        a: views.a!.state.doc.toJSON(),
        b: views.b!.state.doc.toJSON(),
        server: docStateToNode(schema, store.state('doc')).toJSON(),
        textA: views.a!.state.doc.textContent,
        stats,
      }
    },
    /** Puts the caret of editor A at a random offset of the first paragraph and focuses it. */
    focusA() {
      const view = views.a!
      const paragraph = view.state.doc.firstChild!
      const pos = 1 + Math.floor(random() * (paragraph.content.size + 1))
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
      view.focus()
    },
  }
}

declare global {
  interface Window {
    collab: { reset: (seed: number) => Promise<void>, session: () => ReturnType<typeof createSession> }
    /** E9 soak (`soak.spec.ts`). */
    collabSoak: { create: (options: Parameters<typeof createSoak>[0]) => Promise<void>, soak: () => ReturnType<typeof createSoak> }
  }
}

let session: ReturnType<typeof createSession> | null = null
window.collab = {
  async reset(seed: number) {
    for (const view of Object.values(session?.views ?? {})) {
      view.destroy()
    }
    session = createSession(seed)
    await session.mount()
  },
  session: () => session!,
}

let soak: ReturnType<typeof createSoak> | null = null
window.collabSoak = {
  async create(options) {
    soak = createSoak(options)
    await soak.mount(document.body)
  },
  soak: () => soak!,
}

if (location.search.includes('manual')) {
  mountManualControls(window.collab)
  void window.collab.reset(1)
}
