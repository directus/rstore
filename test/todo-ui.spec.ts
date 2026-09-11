import { describe, expect, it } from 'vitest'
import { uniqueText } from './e2e/todoUi'

describe('todo E2E labels', () => {
  it('keeps the readable prefix while making each label collision-safe', () => {
    const first = uniqueText('playwright-todo')
    const second = uniqueText('playwright-todo')

    expect(first).toMatch(/^playwright-todo-[0-9a-f-]{36}$/)
    expect(second).toMatch(/^playwright-todo-[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })
})
