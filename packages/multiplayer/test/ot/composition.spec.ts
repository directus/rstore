import type { DocOp, DocState } from '@rstore/multiplayer/ot'
import { applyDocOps, cloneDocState, createCompositionGuard, splitNodeOp } from '@rstore/multiplayer/ot'
import { describe, expect, it } from 'vitest'
import { outline, records } from './harness/docs'
import { insertText } from './harness/edits'
import { createSimulation } from './harness/simulation'

/**
 * A "view" (the editor document) next to client A: it applies what the
 * guard lets through, and composes text locally like the browser does.
 */
async function setup(options: { maxHoldMs?: number, maxQueuedOps?: number } = {}) {
  const sim = await createSimulation([{ id: 'p1', content: 'hello world' }, { id: 'p2', content: 'other' }])
  const A = sim.clients.A!
  let time = 0
  const view: DocState = cloneDocState(A.client.state)
  const guard = createCompositionGuard(A.client, {
    ...options,
    now: () => time,
    readComposingContent: id => view.nodes.get(id)?.content ?? undefined,
    onForcedFlush: ops => applyDocOps(view, ops),
  })
  A.client.on('change', (event) => {
    if (event.origin === 'remote') {
      const dispatch = guard.receive(event.ops)
      if (dispatch) {
        applyDocOps(view, dispatch)
      }
    }
  })
  /** The browser changing the composing node (not sent). */
  const compose = (ops: DocOp[]) => applyDocOps(view, ops)
  return {
    sim,
    A,
    B: sim.clients.B!,
    guard,
    compose,
    view: () => view,
    tick: (ms: number) => {
      time += ms
    },
  }
}

describe('iME composition guard', () => {
  it('sends one transaction at composition end and holds remote ops for the composing node', async () => {
    const { sim, A, B, guard, compose, view } = await setup()
    guard.start('p1')
    // Intermediate browser states (Android/Safari style): never transmitted.
    compose([insertText('p1', 5, 'k')])
    compose([{ t: 'text', node: 'p1', ops: [{ retain: 5 }, { insert: 'か' }, { delete: 1 }] }])
    B.edit([insertText('p2', 5, '!')])
    B.edit([insertText('p1', 0, '>> ')])
    await sim.flush()
    // p2 is updated right away, p1 still shows the composition only.
    expect(outline(view())).toEqual(['paragraph#p1: helloか world', 'paragraph#p2: other!'])
    expect(sim.links.get('A')!.up).toEqual([])

    const result = guard.end(view().nodes.get('p1')!.content!)
    applyDocOps(view(), result.dispatch)
    await sim.flush()
    const server = await sim.serverState()
    expect(outline(server)).toEqual(['paragraph#p1: >> helloか world', 'paragraph#p2: other!'])
    expect(records(view(), { withVersion: false })).toEqual(records(A.client.state, { withVersion: false }))
    expect((await sim.store.range(sim.docId, 0)).filter(entry => entry.clientId === 'A')).toHaveLength(1)
  })

  it('transforms the composition over a remote split of the composing node', async () => {
    const { sim, B, guard, compose, view } = await setup()
    guard.start('p1')
    compose([insertText('p1', 11, 'ー')])
    B.edit(s => [splitNodeOp(s, 'p1', 6, 'n1')])
    await sim.flush()
    const result = guard.end(view().nodes.get('p1')!.content!)
    applyDocOps(view(), result.dispatch)
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: hello ', 'paragraph#n1: worldー', 'paragraph#p2: other'])
    expect(outline(view())).toEqual(outline(await sim.serverState()))
  })

  it('force-flushes held ops after the hold time', async () => {
    const { sim, B, guard, compose, view, tick } = await setup({ maxHoldMs: 1000 })
    guard.start('p1')
    compose([insertText('p1', 0, 'あ')])
    B.edit([insertText('p1', 11, '!')])
    await sim.flush()
    expect(outline(view())).toEqual(['paragraph#p1: あhello world', 'paragraph#p2: other'])
    tick(1500)
    guard.flushIfOverdue()
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: あhello world!', 'paragraph#p2: other'])
    expect(outline(view())).toEqual(outline(await sim.serverState()))
    // The composition goes on from the flushed content.
    compose([insertText('p1', 1, 'い')])
    expect(guard.end(view().nodes.get('p1')!.content!).submitted).toEqual([insertText('p1', 1, 'い')])
  })

  it('force-flushes when too many ops are held', async () => {
    const { sim, B, guard, compose, view } = await setup({ maxQueuedOps: 3 })
    guard.start('p1')
    compose([insertText('p1', 0, 'あ')])
    for (const [index, char] of [...'abc'].entries()) {
      B.edit([insertText('p1', 11 + index, char)])
      await sim.flush()
    }
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: あhello worldabc', 'paragraph#p2: other'])
    expect(outline(view())).toEqual(outline(await sim.serverState()))
  })
})
