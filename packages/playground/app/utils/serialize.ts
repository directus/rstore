export function convertFunctionsToString(obj: Record<string, any> | undefined) {
  if (!obj) {
    return obj
  }
  const result: Record<string, any> = {}
  for (const key in obj) {
    if (typeof obj[key] === 'function') {
      result[key] = obj[key].toString()
    }
    else {
      result[key] = obj[key]
    }
  }
  return result
}
