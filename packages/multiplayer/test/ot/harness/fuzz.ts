import type { CollabUndoManager, DocOp, DocState } from '@rstore/multiplayer/ot'
import type { CollabServerHooks } from '@rstore/multiplayer/server'
import type { DocOpType } from './randomOps'
import { createCollabUndoManager, isNodeVisible, OtValidationError } from '@rstore/multiplayer/ot'
import { fieldValuesEqual } from '@rstore/shared'
import { records } from './docs'
import { seededRandom } from './random'
import { randomDocOp } from './randomOps'
import { createSimulation } from './simulation'

/** Options of one fuzz run. */
export interface FuzzOptions {
  seed: number
  clients: number
  /** Transactions each client authors. */
  txPerClient: number
  /** Share of transactions the server must refuse (E10). @default 0 */
  forbiddenRate?: number
  /** Share of actions that are undo/redo. @default 0.1 */
  undoRate?: number
  /** Probability per step that a random client drops its connection. @default 0.005 */
  disconnectRate?: number
  /** Textblocks created by `c0` are hidden from `c1` (redaction). @default false */
  privateNodes?: boolean
  /** Debugging: log change events of `traceClient` touching `traceNode` into `result.trace`. */
  traceNode?: string
  traceClient?: string
}

/** Outcome of one fuzz run. */
export interface FuzzResult {
  seed: number
  diverged: boolean
  transactions: number
  undos: number
  /** Undos that hid or deleted characters another client authored (E4). */
  undoViolations: number
  reconnects: number
  rejected: Record<string, number>
  /** First differing record, for debugging a diverged seed. */
  divergence?: string
  /** First undo that removed foreign characters, for debugging. */
  violation?: string
  trace?: string[]
}

/** Weighted op mix of a generated transaction. */
const OP_WEIGHTS: Array<[DocOpType, number]> = [['text', 55], ['splitNode', 10], ['mergeNode', 5], ['insertNode', 8], ['deleteNode', 6], ['moveNode', 6], ['setAttrs', 4], ['setType', 2]]

/** The `redact` hook of `privateNodes` runs: textblocks created by `c0` are hidden from `c1`. */
const hidePrivateNodes: NonNullable<CollabServerHooks['redact']> = ({ peer, node }) => peer.userId === 'c1' && node.id.startsWith('c0-') && node.content !== null ? null : node

/** Visible characters authored by someone other than `author` (`a` mark). */
function foreignVisibleChars(state: DocState, author: string): number {
  let count = 0
  for (const node of state.nodes.values()) {
    if (!node.content || !isNodeVisible(state, node.id)) {
      continue
    }
    for (const run of node.content) {
      if (run.attributes?.a !== author) {
        count += typeof run.insert === 'string' ? run.insert.length : 1
      }
    }
  }
  return count
}

/**
 * N clients, random transactions (text, formats, split/merge, moves,
 * deletes, attributes, undo/redo), random delivery order and delays per FIFO
 * link, random disconnects with pending replay. Ends by delivering
 * everything and comparing every client with the server, record by record.
 */
export async function runFuzz(options: FuzzOptions): Promise<FuzzResult> {
  const random = seededRandom(options.seed)
  const names = Array.from({ length: options.clients }, (_, i) => `c${i}`)
  const forbiddenRate = options.forbiddenRate ?? 0
  const sim = await createSimulation([
    { id: 'p1', content: 'hello world' },
    { id: 'p2', content: 'second line' },
    { id: 'list', children: [{ id: 'li1', type: 'listItem', children: [{ id: 'l1', content: 'item' }] }] },
  ], {
    clients: names,
    server: {
      hooks: {
        filterOp: ({ op }) => op.t === 'setAttrs' && op.attrs.forbidden ? 'forbidden' : undefined,
        ...(options.privateNodes ? { redact: hidePrivateNodes } : {}),
      },
    },
  })
  const result: FuzzResult = { seed: options.seed, diverged: false, transactions: 0, undos: 0, undoViolations: 0, reconnects: 0, rejected: {} }
  const budget = new Map(names.map(name => [name, options.txPerClient]))
  const undoManagers = new Map<string, CollabUndoManager>()
  const trace: string[] = []
  if (options.traceNode) {
    for (const name of names) {
      sim.clients[name]!.client.on('change', (event) => {
        if (name === options.traceClient && (JSON.stringify(event.ops).includes(options.traceNode!) || event.origin === 'reset')) {
          trace.push(`${event.origin} ${event.clientId ?? ''} ${JSON.stringify(event.ops)} has=${JSON.stringify(sim.clients[name]!.client.state.nodes.get(options.traceNode!))}`)
        }
      })
      sim.clients[name]!.client.on('rejected', (event) => {
        if (name === options.traceClient) {
          trace.push(`rejected ${event.reason} ${JSON.stringify(event.ops)}`)
        }
      })
    }
  }
  for (const name of names) {
    undoManagers.set(name, createCollabUndoManager(sim.clients[name]!.client, { now: () => result.transactions * 100 }))
    sim.clients[name]!.client.on('rejected', ({ reason }) => {
      result.rejected[reason] = (result.rejected[reason] ?? 0) + 1
    })
  }
  const total = weightTotal()
  let step = 0

  /** One random local transaction; invalid generated ops are skipped. */
  const edit = (name: string) => {
    const { client } = sim.clients[name]!
    if (!client.loaded) {
      return
    }
    let roll = random.int(1, total)
    const type = OP_WEIGHTS.find(([, weight]) => (roll -= weight) <= 0)![0]
    const op: DocOp | null = random.bool(forbiddenRate)
      ? { t: 'setAttrs', node: random.pick([...client.state.nodes.keys()]), attrs: { forbidden: true } }
      : randomDocOp(random, client.state, type, `${name}-${step}-`, { marks: { a: name }, visibleOnly: true })
    if (!op) {
      return
    }
    try {
      client.submit([op])
      result.transactions++
      budget.set(name, budget.get(name)! - 1)
    }
    catch (error) {
      if (!(error instanceof OtValidationError)) {
        throw error
      }
    }
  }

  /** Undo or redo, counting foreign characters it removes from view. */
  const undo = (name: string) => {
    const { client } = sim.clients[name]!
    const before = foreignVisibleChars(client.state, name)
    const isUndo = random.bool(0.7)
    const manager = undoManagers.get(name)!
    let applied: DocOp[] = []
    const stop = client.on('change', (event) => {
      applied = event.ops
    })
    const snapshot = isUndo ? records(client.state) : []
    if (isUndo ? manager.undo() : manager.redo()) {
      result.undos++
      if (isUndo && foreignVisibleChars(client.state, name) < before) {
        result.undoViolations++
        result.violation ??= JSON.stringify({ name, applied, before: snapshot.filter(node => applied.some(op => JSON.stringify(op).includes(`"${node.id}"`))) })
      }
    }
    stop()
  }

  while ([...budget.values()].some(left => left > 0)) {
    step++
    const name = random.pick(names)
    const link = sim.links.get(name)!
    const roll = random.int(0, 999) / 1000
    if (roll < (options.disconnectRate ?? 0.005)) {
      if (link.online) {
        sim.disconnect(name)
      }
      else {
        sim.reconnect(name)
        result.reconnects++
      }
    }
    else if (roll < 0.35 && budget.get(name)! > 0) {
      edit(name)
    }
    else if (roll < 0.35 + (options.undoRate ?? 0.1)) {
      undo(name)
    }
    else if (random.bool()) {
      await sim.deliverUp(name, random.int(1, 3))
    }
    else {
      sim.deliverDown(name, random.int(1, 3))
    }
  }
  for (const name of names) {
    if (!sim.links.get(name)!.online) {
      sim.reconnect(name)
    }
  }
  await sim.flush()
  const serverState = await sim.serverState()
  for (const name of names) {
    const { client } = sim.clients[name]!
    const mine = records(client.state)
    // What this client may see of the server document.
    const server = options.privateNodes ? records(serverState).flatMap(node => hidePrivateNodes({ peer: { id: name, userId: name, send: () => {} }, node }) ?? []) : records(serverState)
    if (client.status !== 'synchronized' || !fieldValuesEqual(mine, server)) {
      result.diverged = true
      const byId = new Map(server.map(node => [node.id, node]))
      const differing = mine.find(node => !fieldValuesEqual(node, byId.get(node.id))) ?? server.find(node => !client.state.nodes.has(node.id))
      result.divergence ??= JSON.stringify({ client: name, status: client.status, mine: differing && client.state.nodes.get(differing.id), server: differing && byId.get(differing.id) })
    }
  }
  if (options.traceNode) {
    result.trace = trace
  }
  return result
}

/** Sum of op weights. */
function weightTotal() {
  return OP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
}
