import type { CollabClient, DocOp } from '@rstore/multiplayer/ot'
import type { Transaction } from 'prosemirror-state'
import { createCollabClient } from '@rstore/multiplayer/ot'
import { collabPlugin, collabPluginKey, diffDocument, docStateToNode, remoteTransaction } from '@rstore/multiplayer/prosemirror'
import fc from 'fast-check'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import { buildNodes, outline } from '../ot/harness/docs'
import { fcRandom } from '../ot/harness/random'
import { createSimulation } from '../ot/harness/simulation'
import { propertyRuns } from '../ot/harness/textArbitraries'
import { testSchema } from './schema'

/** An editor state bound to a client, without a view: local transactions go through `diffDocument`. */
function editor(client: CollabClient) {
  let ids = 0
  const plugin = collabPlugin({ client, createId: () => `${client.clientId}-b${++ids}` })
  let state = EditorState.create({ doc: docStateToNode(testSchema, client.state), plugins: [plugin] })
  const sent: DocOp[][] = []
  client.on('change', (event) => {
    if (event.origin === 'remote' || event.origin === 'rollback') {
      state = state.apply(remoteTransaction(state, event.ops, client.state))
    }
    else if (event.origin === 'reset') {
      state = EditorState.create({ doc: docStateToNode(testSchema, client.state), plugins: [plugin] })
    }
  })
  return {
    get state() {
      return state
    },
    sent,
    /** Applies a local transaction and submits what it changed. */
    run(build: (state: EditorState) => Transaction) {
      state = state.applyTransaction(build(state)).state
      const ops = diffDocument(client.state, state.doc)
      sent.push(ops)
      client.submit(ops)
    },
  }
}

const doc = [{ id: 'p1', content: 'hello world' }, { id: 'p2', content: 'second' }]

describe('proseMirror binding', () => {
  it('hydrates an already-restored client when its plugin view attaches without resubmitting', () => {
    const client = createCollabClient({
      docId: 'doc',
      clientId: 'reload',
      send: () => {},
      restore: {
        seq: 4,
        confirmed: { version: 6, nodes: buildNodes(doc) },
        inflight: null,
        buffer: [{ t: 'text', node: 'p1', ops: [{ retain: 11 }, { insert: '!' }] }],
      },
    })
    const submit = vi.spyOn(client, 'submit')
    const plugin = collabPlugin({ client, createId: () => 'unused' })
    const dispatched: Transaction[] = []
    let state = EditorState.create({ doc: testSchema.topNodeType.createAndFill()!, plugins: [plugin] })
    const dom = { addEventListener: () => {}, removeEventListener: () => {} }
    const view = {
      get state() {
        return state
      },
      dom,
      composing: false,
      dispatch(transaction: Transaction) {
        dispatched.push(transaction)
        state = state.applyTransaction(transaction).state
      },
    }

    const binding = plugin.spec.view!(view as never)

    expect(client.loaded).toBe(true)
    expect(view.state.doc.eq(docStateToNode(testSchema, client.state))).toBe(true)
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]!.getMeta(collabPluginKey)).toBe('remote')
    expect(dispatched[0]!.getMeta('addToHistory')).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    binding.destroy?.()
  })

  it('turns typing, Enter and Backspace into text, split and merge ops', async () => {
    const sim = await createSimulation(doc)
    const a = editor(sim.clients.A!.client)
    const b = editor(sim.clients.B!.client)
    a.run(state => state.tr.insertText('!', 12))
    a.run(state => state.tr.split(7))
    a.run(state => state.tr.join(16))
    a.run(state => state.tr.addMark(1, 6, testSchema.marks.strong!.create()))
    expect(a.sent.map(ops => ops.map(op => op.t))).toEqual([['text'], ['splitNode'], ['mergeNode'], ['text']])
    await sim.flush()
    expect(b.state.doc.eq(a.state.doc)).toBe(true)
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: {hello|strong} ', 'paragraph#A-b1: world!second'])
  })

  it('maps list items, headings and inline nodes to node records', async () => {
    const sim = await createSimulation(doc)
    const a = editor(sim.clients.A!.client)
    const b = editor(sim.clients.B!.client)
    const { bullet_list: list, list_item: item, paragraph, heading, hard_break: hardBreak } = testSchema.nodes
    a.run(state => state.tr.insert(state.doc.content.size, list!.create(null, item!.create(null, paragraph!.create(null, testSchema.text('item'))))))
    a.run(state => state.tr.setBlockType(1, 1, heading!, { level: 2 }))
    a.run(state => state.tr.insert(3, hardBreak!.create()))
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual([
      'heading#p1 {"level":2}: he<hard_break>llo world',
      'paragraph#p2: second',
      'bullet_list#A-b1',
      '  list_item#A-b2',
      '    paragraph#A-b3: item',
    ])
    expect(b.state.doc.eq(a.state.doc)).toBe(true)
  })

  it('converges with concurrent random edits in both editors', async () => {
    await fc.assert(fc.asyncProperty(fc.gen(), async (g) => {
      const random = fcRandom(g, fc)
      const sim = await createSimulation(doc)
      const editors = [editor(sim.clients.A!.client), editor(sim.clients.B!.client)]
      for (let step = 0; step < 12; step++) {
        const target = random.pick(editors)
        target.run((state) => {
          const size = state.doc.content.size
          // Cursor positions, never between the two halves of a surrogate pair (as in a browser).
          const at = (pos: number) => {
            const near = TextSelection.near(state.doc.resolve(pos)).from
            const text = state.doc.textBetween(Math.max(0, near - 1), Math.min(size, near + 1), '\n', '\n')
            return text.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text) ? near - 1 : near
          }
          const from = at(random.int(0, size))
          const to = Math.max(from, at(Math.min(random.int(from, size), from + 4)))
          switch (random.int(0, 4)) {
            case 0: return state.tr.insertText(random.pick(['a', 'bc', '😀', ' ']), from)
            case 1: return to > from ? state.tr.delete(from, to) : state.tr.insertText('x', from)
            case 2: return state.doc.resolve(from).parent.isTextblock ? state.tr.split(from) : state.tr
            case 3: return to > from ? state.tr.addMark(from, to, testSchema.marks.em!.create()) : state.tr
            default: return state.tr
          }
        })
        if (random.bool(0.4)) {
          await sim.deliverUp(random.pick(['A', 'B']))
          sim.deliverDown(random.pick(['A', 'B']))
        }
      }
      await sim.flush()
      const server = docStateToNode(testSchema, await sim.serverState())
      for (const { state } of editors) {
        expect(state.doc.eq(server)).toBe(true)
      }
    }), { numRuns: Math.min(propertyRuns, 200) })
  })
})
