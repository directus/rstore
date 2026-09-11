/** Encode one string part without delimiter collisions. */
export function encodeLengthPrefixedPart(value: string): string {
  return `${value.length}:${value}`
}
