/**
 * Fractional order keys (Figma / Rocicorp `fractional-indexing`, CC0): a
 * variable-length integer part (head letter gives its length) followed by a
 * base-62 fraction without trailing zero. Keys compare with plain string
 * comparison, and a key exists between any two distinct keys.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const ZERO = DIGITS[0]!
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`

/** Midpoint of two fractions (`b` null means 1). */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // Skip the common prefix, padding `a` with zeros.
    let n = 0
    while ((a[n] ?? ZERO) === b[n]) {
      n++
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
    }
  }
  const digitA = a ? DIGITS.indexOf(a[0]!) : 0
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length
  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))]!
  }
  if (b && b.length > 1) {
    return b.slice(0, 1)
  }
  return DIGITS[digitA]! + midpoint(a.slice(1), null)
}

/** Length of the integer part announced by its head letter. */
function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') {
    return head.charCodeAt(0) - 97 + 2
  }
  if (head >= 'A' && head <= 'Z') {
    return 90 - head.charCodeAt(0) + 2
  }
  throw new Error(`invalid order key head: ${head}`)
}

/** Integer part of a key. */
function integerPart(key: string): string {
  const length = integerLength(key[0]!)
  if (length > key.length) {
    throw new Error(`invalid order key: ${key}`)
  }
  return key.slice(0, length)
}

/** Whether `key` is a well-formed order key. */
export function isValidOrderKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256 || key === SMALLEST_INTEGER) {
    return false
  }
  try {
    const integer = integerPart(key)
    for (const char of key.slice(1)) {
      if (!DIGITS.includes(char)) {
        return false
      }
    }
    return !key.slice(integer.length).endsWith(ZERO)
  }
  catch {
    return false
  }
}

/** Integer part plus or minus one (`null` when out of range). */
function stepInteger(value: string, step: 1 | -1): string | null {
  const [head, ...digits] = value.split('') as [string, ...string[]]
  let carry = true
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const digit = DIGITS.indexOf(digits[i]!) + step
    if (digit === DIGITS.length || digit === -1) {
      digits[i] = step === 1 ? ZERO : DIGITS.at(-1)!
    }
    else {
      digits[i] = DIGITS[digit]!
      carry = false
    }
  }
  if (!carry) {
    return head + digits.join('')
  }
  if (step === 1) {
    if (head === 'Z') {
      return `a${ZERO}`
    }
    if (head === 'z') {
      return null
    }
    const next = String.fromCharCode(head.charCodeAt(0) + 1)
    next > 'a' ? digits.push(ZERO) : digits.pop()
    return next + digits.join('')
  }
  if (head === 'a') {
    return `Z${DIGITS.at(-1)}`
  }
  if (head === 'A') {
    return null
  }
  const previous = String.fromCharCode(head.charCodeAt(0) - 1)
  previous < 'Z' ? digits.push(DIGITS.at(-1)!) : digits.pop()
  return previous + digits.join('')
}

/**
 * A key strictly between `before` and `after` (`null` = unbounded).
 * Throws when a bound is malformed or `before >= after`.
 */
export function generateOrderKey(before: string | null, after: string | null): string {
  for (const key of [before, after]) {
    if (key !== null && !isValidOrderKey(key)) {
      throw new Error(`invalid order key: ${key}`)
    }
  }
  if (before !== null && after !== null && before >= after) {
    throw new Error(`order key ${before} >= ${after}`)
  }
  if (before === null) {
    if (after === null) {
      return `a${ZERO}`
    }
    const integer = integerPart(after)
    if (integer === SMALLEST_INTEGER) {
      return integer + midpoint('', after.slice(integer.length))
    }
    if (integer < after) {
      return integer
    }
    const previous = stepInteger(integer, -1)
    if (previous === null) {
      throw new Error('cannot decrement order key any more')
    }
    return previous
  }
  const integer = integerPart(before)
  const fraction = before.slice(integer.length)
  if (after === null) {
    return stepInteger(integer, 1) ?? integer + midpoint(fraction, null)
  }
  const afterInteger = integerPart(after)
  if (integer === afterInteger) {
    return integer + midpoint(fraction, after.slice(afterInteger.length))
  }
  const next = stepInteger(integer, 1)
  if (next === null) {
    throw new Error('cannot increment order key any more')
  }
  return next < after ? next : integer + midpoint(fraction, null)
}

/** `count` increasing keys between `before` and `after`. */
export function generateOrderKeys(before: string | null, after: string | null, count: number): string[] {
  const keys: string[] = []
  let previous = before
  for (let i = 0; i < count; i++) {
    previous = generateOrderKey(previous, after)
    keys.push(previous)
  }
  return keys
}

/** A key between the bounds, or `null` when they are missing, malformed or not increasing. */
export function tryGenerateOrderKey(before: string | null | undefined, after: string | null | undefined): string | null {
  try {
    return generateOrderKey(before ?? null, after ?? null)
  }
  catch {
    return null
  }
}
