import type { Scenario } from './scenarios/types'
import { describe, expect, it } from 'vitest'
import { outline, records } from './harness/docs'
import { createSimulation } from './harness/simulation'
import { nodeScenarios } from './scenarios/nodes'
import { splitMergeScenarios } from './scenarios/splitMerge'
import { textScenarios } from './scenarios/text'

const scenarios: Scenario[] = [...textScenarios, ...splitMergeScenarios, ...nodeScenarios]

/** Runs a scenario with one arrival order; returns the converged server outline. */
async function run(scenario: Scenario, order: string[]) {
  const sim = await createSimulation(scenario.doc, { clients: Object.keys(scenario.edits) })
  for (const [name, edit] of Object.entries(scenario.edits)) {
    sim.clients[name]!.edit(edit)
  }
  for (const name of order) {
    await sim.deliverUp(name)
  }
  await sim.flush()
  await expectConverged(sim)
  return sim
}

/** Every client holds exactly the server records, with no pending op. */
async function expectConverged(sim: Awaited<ReturnType<typeof createSimulation>>) {
  const server = await sim.serverState()
  for (const { client } of Object.values(sim.clients)) {
    expect(client.status).toBe('synchronized')
    expect(records(client.state)).toEqual(records(server))
  }
}

describe('e3 intention preservation', () => {
  it('covers 40 scenarios', () => {
    expect(scenarios).toHaveLength(40)
  })

  for (const scenario of scenarios) {
    it.each(scenario.orders.map(order => [order.join(' then ')]))(`${scenario.name} (%s)`, async (orderName) => {
      const sim = await run(scenario, orderName.split(' then '))
      expect(outline(await sim.serverState())).toEqual(scenario.expected)
      if (scenario.then) {
        sim.clients[scenario.then.client]!.edit(scenario.then.edit)
        await sim.flush()
        await expectConverged(sim)
        expect(outline(await sim.serverState())).toEqual(scenario.then.expected)
      }
    })
  }
})
