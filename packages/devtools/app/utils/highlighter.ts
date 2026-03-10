import type { Highlighter } from 'shiki'

import { createHighlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | undefined
let highlighter: Highlighter | undefined

export async function initHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['one-dark-pro', 'one-light'],
      langs: ['json', 'js'],
    }).then((instance) => {
      highlighter = instance
      return instance
    })
  }

  await highlighterPromise
}

export function getHighlighter() {
  if (!highlighter) {
    throw new Error('Highlighter not initialized')
  }

  return highlighter
}
