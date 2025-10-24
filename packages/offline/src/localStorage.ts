export function getLocalStorageItem(key: string): any | null {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw as string) : null
}

export function setLocalStorageItem(key: string, value: any): void {
  localStorage.setItem(key, JSON.stringify(value))
}
