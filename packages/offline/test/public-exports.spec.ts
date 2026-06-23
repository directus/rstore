import { describe, expect, it } from 'vitest'
import { createOfflinePlugin } from '../src'

describe('public offline exports', () => {
  it('exports the offline plugin factory from the package root', () => {
    expect(createOfflinePlugin()).toMatchObject({
      name: 'offline',
      category: 'local',
    })
  })
})
