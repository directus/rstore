export function getLanguageFromPath(filePath: string): string {
  if (filePath.endsWith('.vue'))
    return 'vue'
  if (filePath.endsWith('.ts'))
    return 'typescript'
  if (filePath.endsWith('.json'))
    return 'json'
  if (filePath.endsWith('.css'))
    return 'css'
  if (filePath.endsWith('.html'))
    return 'html'
  return 'plaintext'
}
