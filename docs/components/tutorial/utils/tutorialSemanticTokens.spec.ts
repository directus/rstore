import { describe, expect, it } from 'vitest'
import {
  toMonacoSemanticTokens,
  toMonacoSemanticTokensEdits,
} from './tutorialSemanticTokens'

describe('tutorial semantic tokens helpers', () => {
  it('converts full semantic tokens payloads to Uint32Array data', () => {
    const result = toMonacoSemanticTokens({
      data: [0, 0, 5, 12, 0],
      resultId: 'full-1',
    })

    expect(result).toEqual({
      data: new Uint32Array([0, 0, 5, 12, 0]),
      resultId: 'full-1',
    })
  })

  it('converts semantic token delta edits to Uint32Array payloads', () => {
    const result = toMonacoSemanticTokensEdits({
      edits: [
        {
          data: [1, 2, 3],
          deleteCount: 5,
          start: 2,
        },
        {
          deleteCount: 1,
          start: 8,
        },
      ],
      resultId: 'delta-1',
    })

    expect(result).toEqual({
      edits: [
        {
          data: new Uint32Array([1, 2, 3]),
          deleteCount: 5,
          start: 2,
        },
        {
          data: undefined,
          deleteCount: 1,
          start: 8,
        },
      ],
      resultId: 'delta-1',
    })
  })
})
