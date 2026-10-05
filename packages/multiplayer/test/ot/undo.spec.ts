import type { NodeSpec } from './harness/docs'
import { createCollabUndoManager, mergeNodeOp, moveNodeOp, splitNodeOp } from '@rstore/multiplayer/ot'
import { describe, expect, it } from 'vitest'
import { outline, records } from './harness/docs'
import { deleteText, formatText, insertText } from './harness/edits'
import { createSimulation } from './harness/simulation'

/** Two clients with an undo manager each and a controllable clock (grouping window). */
async function setup(doc: NodeSpec[] = [{ id: 'p1', content: 'hello' }, { id: 'p2', content: 'world' }]) {
  const sim = await createSimulation(doc, { server: { hooks: { filterOp: ({ op }) => op.t === 'setAttrs' && op.attrs.locked ? 'forbidden' : undefined } } })
  let time = 0
  const now = () => time
  const undoA = createCollabUndoManager(sim.clients.A!.client, { now })
  const undoB = createCollabUndoManager(sim.clients.B!.client, { now })
  const tick = (ms = 1000) => {
    time += ms
  }
  const A = sim.clients.A!
  const B = sim.clients.B!
  /** Converges and returns the server outline, checking both clients agree. */
  const settle = async () => {
    await sim.flush()
    const server = await sim.serverState()
    expect(records(A.client.state)).toEqual(records(server))
    expect(records(B.client.state)).toEqual(records(server))
    return outline(server)
  }
  return { sim, A, B, undoA, undoB, tick, settle }
}

describe('per-user undo', () => {
  it('1. undoes and redoes own typing', async () => {
    const { A, undoA, settle } = await setup()
    A.edit([insertText('p1', 5, '!')])
    expect(undoA.undo()).toBe(true)
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
    expect(undoA.redo()).toBe(true)
    expect(await settle()).toEqual(['paragraph#p1: hello!', 'paragraph#p2: world'])
  })

  it('2. groups keystrokes in one node within the window', async () => {
    const { A, undoA, tick, settle } = await setup()
    A.edit([insertText('p1', 5, 'a')])
    tick(100)
    A.edit([insertText('p1', 6, 'b')])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
  })

  it('3. splits groups after the window', async () => {
    const { A, undoA, tick, settle } = await setup()
    A.edit([insertText('p1', 5, 'a')])
    tick(600)
    A.edit([insertText('p1', 6, 'b')])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: helloa', 'paragraph#p2: world'])
  })

  it('4. splits groups across nodes', async () => {
    const { A, undoA, settle } = await setup()
    A.edit([insertText('p1', 0, 'a')])
    A.edit([insertText('p2', 0, 'b')])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: ahello', 'paragraph#p2: world'])
  })

  it('5. keeps text another user typed after the undone edit', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([insertText('p1', 5, ' A')])
    await settle()
    B.edit([insertText('p1', 7, ' B')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello B', 'paragraph#p2: world'])
  })

  it('6. keeps text another user typed inside the undone insert', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([insertText('p1', 5, 'abc')])
    await settle()
    B.edit([insertText('p1', 6, 'X')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: helloX', 'paragraph#p2: world'])
  })

  it('7. undoing an insert another user deleted is a no-op', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([insertText('p1', 5, 'abc')])
    await settle()
    B.edit([deleteText('p1', 4, 8)])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hell', 'paragraph#p2: world'])
  })

  it('8. undoing a delete restores the text with its marks', async () => {
    const { A, undoA, settle } = await setup([{ id: 'p1', content: [{ insert: 'bold', attributes: { bold: true } }, { insert: ' plain' }] }])
    A.edit([deleteText('p1', 0, 6)])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: {bold|bold} plain'])
  })

  it('9. undoing a format keeps another user\'s formatting on other marks', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([formatText('p1', 0, 5, { bold: true })])
    await settle()
    B.edit([formatText('p1', 0, 5, { italic: true })])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: {hello|italic}', 'paragraph#p2: world'])
  })

  it('10. undoing a format over replaced text applies to the survivors only', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([formatText('p1', 0, 5, { bold: true })])
    await settle()
    B.edit([{ t: 'text', node: 'p1', ops: [{ retain: 2 }, { insert: 'XY' }, { delete: 3 }] }])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: heXY', 'paragraph#p2: world'])
  })

  it('11. undoing a split merges back, keeping text typed in the tail', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit(s => [splitNodeOp(s, 'p1', 2, 'n1')])
    await settle()
    B.edit([insertText('n1', 3, '!')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello!', 'paragraph#p2: world'])
  })

  it('12. undoing a merge splits back with the same node id', async () => {
    const { A, undoA, settle } = await setup()
    A.edit(s => [mergeNodeOp(s, 'p2', 'p1')])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
  })

  it('13. undoing a node insert hides it', async () => {
    const { A, undoA, settle } = await setup()
    A.edit([{ t: 'insertNode', node: { id: 'x', parentId: null, orderKey: 'a5', type: 'paragraph', attrs: {}, content: [{ insert: 'new' }] } }])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
  })

  it('14. undoing a node insert keeps it when another user typed in it', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([{ t: 'insertNode', node: { id: 'x', parentId: null, orderKey: 'a5', type: 'paragraph', attrs: {}, content: [{ insert: 'new' }] } }])
    await settle()
    B.edit([insertText('x', 3, ' by B')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world', 'paragraph#x: new by B'])
  })

  it('15. undoing a node delete restores it with edits made while hidden', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([{ t: 'deleteNode', node: 'p2' }])
    B.edit([insertText('p2', 5, '!')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world!'])
  })

  it('16. undoing a move moves the node back', async () => {
    const { A, undoA, settle } = await setup()
    A.edit(s => [moveNodeOp(s, 'p2', { parentId: null, after: null })])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
  })

  it('17. undoing attributes restores previous values and keeps other keys set later', async () => {
    const { A, B, undoA, settle } = await setup([{ id: 'p1', content: 'hi', attrs: { level: 1 } }])
    A.edit([{ t: 'setAttrs', node: 'p1', attrs: { level: 2 } }])
    await settle()
    B.edit([{ t: 'setAttrs', node: 'p1', attrs: { align: 'center' } }])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1 {"align":"center","level":1}: hi'])
  })

  it('18. a new edit clears the redo stack', async () => {
    const { A, undoA, tick, settle } = await setup()
    A.edit([insertText('p1', 5, '1')])
    undoA.undo()
    tick()
    A.edit([insertText('p1', 0, '2')])
    expect(undoA.canRedo).toBe(false)
    expect(undoA.redo()).toBe(false)
    expect(await settle()).toEqual(['paragraph#p1: 2hello', 'paragraph#p2: world'])
  })

  it('19. rebases undo entries over many remote edits', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([insertText('p1', 5, '!')])
    await settle()
    for (let i = 0; i < 10; i++) {
      B.edit([insertText('p1', 0, String(i))])
    }
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: 9876543210hello', 'paragraph#p2: world'])
  })

  it('20. a rejected edit leaves nothing to undo', async () => {
    const { A, undoA, settle } = await setup()
    A.edit([{ t: 'setAttrs', node: 'p1', attrs: { locked: true } }])
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
  })

  it('21. undo never touches another user\'s edits', async () => {
    const { A, B, undoA, undoB, settle } = await setup()
    A.edit([insertText('p1', 0, 'A')])
    B.edit([insertText('p2', 0, 'B')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: Bworld'])
    expect(undoB.canUndo).toBe(true)
  })

  it('22. an explicit group break keeps a composition as its own entry', async () => {
    const { A, undoA, settle } = await setup()
    A.edit([insertText('p1', 5, 'a')])
    undoA.stopCapturing()
    A.edit([insertText('p1', 6, 'かな')])
    undoA.stopCapturing()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: helloa', 'paragraph#p2: world'])
  })

  it('23. undoing a split whose tail another user deleted brings the tail text back', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit(s => [splitNodeOp(s, 'p1', 2, 'n1')])
    await settle()
    B.edit([{ t: 'deleteNode', node: 'n1' }])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: hello', 'paragraph#p2: world'])
  })

  it('24. undoing typing in a paragraph merged by another user removes only own text', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([insertText('p2', 0, '>')])
    await settle()
    B.edit(s => [mergeNodeOp(s, 'p2', 'p1')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: helloworld'])
  })

  it('25. undoing typing in a paragraph split by another user removes it from both parts', async () => {
    const { A, B, undoA, settle } = await setup()
    A.edit([insertText('p1', 1, 'XXXX')])
    await settle()
    B.edit(s => [splitNodeOp(s, 'p1', 3, 'n1')])
    await settle()
    undoA.undo()
    expect(await settle()).toEqual(['paragraph#p1: h', 'paragraph#n1: ello', 'paragraph#p2: world'])
  })
})
