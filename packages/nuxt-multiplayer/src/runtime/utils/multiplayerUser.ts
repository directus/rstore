import type { MultiplayerUser } from '../types'

/** Palette used to color a user who did not pick a color. */
const DEFAULT_COLORS = [
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
 * Complete a partial user with a random id, a derived name and a palette color.
 *
 * @param input Fields supplied by the app.
 * @param colors Palette to pick a missing color from.
 */
export function createMultiplayerUser(
  input: Partial<MultiplayerUser> | undefined,
  colors: readonly string[] = DEFAULT_COLORS,
): MultiplayerUser {
  const id = input?.id ?? crypto.randomUUID()
  const name = input?.name ?? `User ${id.slice(0, 4).toUpperCase()}`
  const palette = colors.length > 0 ? colors : DEFAULT_COLORS
  const color = input?.color ?? palette[Math.floor(Math.random() * palette.length)] ?? DEFAULT_COLORS[0]

  return {
    id,
    name,
    color,
  }
}
