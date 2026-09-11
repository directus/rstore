/** Build the legacy delimiter-joined module identity used only for migration. */
export function getLegacyModuleKey(name: string, key: string): string {
  return `${name}:${key}`
}
