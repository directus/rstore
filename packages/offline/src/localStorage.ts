/** Read and JSON-parse a localStorage value, or `null` when absent. */
export function getLocalStorageItem(key: string): any | null {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw as string) : null
}

/** JSON-serialize and store a localStorage value. */
export function setLocalStorageItem(key: string, value: any): void {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Remove a localStorage value. */
export function removeLocalStorageItem(key: string): void {
  localStorage.removeItem(key)
}
