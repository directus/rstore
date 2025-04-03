import { createHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | undefined

export async function initHighlighter() {
  highlighter = await createHighlighter({
    themes: ['one-dark-pro', 'one-light'],
    langs: ['json', 'js'],
  })
}

export function getHighlighter() {
  if (!highlighter) {
    throw new Error('Highlighter not initialized')
  }
  return highlighter
}
