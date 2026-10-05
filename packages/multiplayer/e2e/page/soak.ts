import type { CollabClient, CollabUndoManager } from '@rstore/multiplayer/ot'
import type { CollabWireServerMessage } from '@rstore/multiplayer/protocol'
import { createCollabClient, createCollabUndoManager, generateOrderKeys } from '@rstore/multiplayer/ot'
import { collabPlugin, collabUndo, docStateToNode } from '@rstore/multiplayer/prosemirror'
import { createCollabServer, createMemoryOpLogStore } from '@rstore/multiplayer/server'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { prng, schema } from './shared'

/** One bot: an editor bound to its own client, with its undo manager. */
interface Bot {
  client: CollabClient
  undo: CollabUndoManager
  view: EditorView
}

/**
 * E9 soak: a 200-block document, an in-page sequencer whose op log keeps
 * the last `minOps` entries, and `bots` editors typing, deleting, splitting,
 * merging and undoing at human speed through FIFO links with latency.
 */
export function createSoak(options: { bots: number, minOps: number, seed: number }) {
  const random = prng(options.seed)
  const store = createMemoryOpLogStore({ retention: { minOps: options.minOps, maxAgeMs: 0 } })
  const keys = generateOrderKeys(null, null, 200)
  store.seed('doc', keys.map((orderKey, i) => ({ id: `b${i}`, docId: 'doc', parentId: null, orderKey, type: 'paragraph', attrs: {}, content: [{ insert: `block ${i} lorem ipsum dolor` }], deleted: false, version: 0 })), 0)
  const server = createCollabServer({ store })
  let inFlight = 0
  let actions = 0
  let timer: ReturnType<typeof setInterval> | undefined

  /** FIFO delivery with a random delay per frame (a JSON copy, like a socket). */
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

  const bots: Bot[] = []
  for (let i = 0; i < options.bots; i++) {
    const name = `bot${i}`
    const peer = { id: name, userId: name, send: link<CollabWireServerMessage>(frame => bots[i]!.client.receive(frame)) }
    const up = link((frame: Parameters<typeof server.handleMessage>[1]) => server.handleMessage(peer, frame))
    const client = createCollabClient({ docId: 'doc', clientId: name, send: up })
    bots.push({ client, undo: createCollabUndoManager(client), view: null as unknown as EditorView })
    client.connect()
  }

  /** One random human-like action of a bot. */
  const act = (bot: Bot) => {
    const { view } = bot
    const blocks: Array<{ pos: number, size: number }> = []
    view.state.doc.forEach((node, offset) => blocks.push({ pos: offset + 1, size: node.content.size }))
    const block = blocks[Math.floor(random() * blocks.length)]!
    const at = block.pos + Math.floor(random() * (block.size + 1))
    const roll = random()
    if (roll < 0.65) {
      view.dispatch(view.state.tr.insertText('abcdefgh'[Math.floor(random() * 8)]!, at))
    }
    else if (roll < 0.87 && block.size > 3) {
      view.dispatch(view.state.tr.delete(at === block.pos + block.size ? at - 1 : at, (at === block.pos + block.size ? at - 1 : at) + 1))
    }
    else if (roll < 0.98) {
      // Enter or Backspace at a block start, keeping about 200 blocks so the
      // heap measures the engine, not a growing document.
      const index = blocks.indexOf(block)
      if (blocks.length < 200 || index === 0) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)).split(at))
      }
      else {
        view.dispatch(view.state.tr.join(block.pos - 1))
      }
    }
    else {
      collabUndo(bot.undo)(view.state, view.dispatch)
    }
    actions++
  }

  return {
    store,
    bots,
    /** Mounts the editors once every client has the snapshot. */
    async mount(root: HTMLElement) {
      while (bots.some(bot => !bot.client.loaded)) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      for (const bot of bots) {
        const mountPoint = root.appendChild(document.createElement('div'))
        const state = EditorState.create({ doc: docStateToNode(schema, bot.client.state), plugins: [collabPlugin({ client: bot.client, undo: bot.undo, createId: () => `n${Math.floor(random() * 1e12)}` })] })
        bot.view = new EditorView(mountPoint, { state })
      }
    },
    /** Starts acting: every bot acts about every `intervalMs`. */
    start(intervalMs: number) {
      timer = setInterval(() => {
        for (const bot of bots) {
          if (random() < 0.8) {
            act(bot)
          }
        }
      }, intervalMs)
    },
    /** Stops acting and waits until everything is delivered and acknowledged. */
    async stop() {
      clearInterval(timer)
      for (let quiet = 0; quiet < 3;) {
        await new Promise(resolve => setTimeout(resolve, 50))
        quiet = inFlight === 0 && bots.every(bot => bot.client.status === 'synchronized') ? quiet + 1 : 0
      }
    },
    /** Counters, retained op log size and convergence. */
    async stats() {
      const server = JSON.stringify(docStateToNode(schema, store.state('doc')).toJSON())
      const log = store.state('doc')
      return {
        actions,
        version: log.version,
        nodes: log.nodes.size,
        retainedEntries: (await store.range('doc', await store.floor('doc'))).length,
        liveBlocks: bots[0]!.view.state.doc.childCount,
        textLength: bots[0]!.view.state.doc.textContent.length,
        converged: bots.every(bot => JSON.stringify(bot.view.state.doc.toJSON()) === server),
      }
    },
  }
}
