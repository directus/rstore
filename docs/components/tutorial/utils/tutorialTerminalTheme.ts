import type { ITheme } from '@xterm/xterm'

export const TUTORIAL_TERMINAL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace'

export function createTutorialTerminalTheme(): ITheme {
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  return isDarkMode
    ? {
        background: '#09090b',
        foreground: '#f4f4f5',
        cursor: '#a1a1aa',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        brightBlack: '#3f3f46',
        red: '#f87171',
        brightRed: '#fca5a5',
        green: '#4ade80',
        brightGreen: '#86efac',
        yellow: '#facc15',
        brightYellow: '#fde047',
        blue: '#60a5fa',
        brightBlue: '#93c5fd',
        magenta: '#c084fc',
        brightMagenta: '#d8b4fe',
        cyan: '#22d3ee',
        brightCyan: '#67e8f9',
        white: '#e4e4e7',
        brightWhite: '#fafafa',
      }
    : {
        background: '#fafafa',
        foreground: '#18181b',
        cursor: '#52525b',
        selectionBackground: '#d4d4d8',
        black: '#18181b',
        brightBlack: '#52525b',
        red: '#dc2626',
        brightRed: '#f87171',
        green: '#16a34a',
        brightGreen: '#4ade80',
        yellow: '#ca8a04',
        brightYellow: '#facc15',
        blue: '#2563eb',
        brightBlue: '#60a5fa',
        magenta: '#9333ea',
        brightMagenta: '#c084fc',
        cyan: '#0891b2',
        brightCyan: '#22d3ee',
        white: '#d4d4d8',
        brightWhite: '#09090b',
      }
}
