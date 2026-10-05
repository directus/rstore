import type { MultiplayerUser } from '../protocol/types.js'

/** Default palette for generated user colors. */
export const DEFAULT_MULTIPLAYER_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

/**
 * Complete a partial user: a random id, a `User XXXX` name derived from it
 * and a random color from `colors` (or the default palette when empty).
 */
export function createMultiplayerUser(
  input: Partial<MultiplayerUser> | undefined,
  colors: readonly string[] = DEFAULT_MULTIPLAYER_COLORS,
): MultiplayerUser {
  const id = input?.id ?? crypto.randomUUID()
  const name = input?.name ?? `User ${id.slice(0, 4).toUpperCase()}`
  const palette = colors.length > 0 ? colors : DEFAULT_MULTIPLAYER_COLORS
  const color = input?.color ?? palette[Math.floor(Math.random() * palette.length)] ?? DEFAULT_MULTIPLAYER_COLORS[0]

  return {
    id,
    name,
    color,
  }
}
