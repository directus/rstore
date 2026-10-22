/** Escape one JSON Pointer segment; root is '$', children append '/segment'. */
export function childPath(path: string, key: string | number): string {
  // Paths themselves remain bounded even for deeply nested or enormous source keys.
  return `${path}/${String(key).slice(0, 128).replace(/~/g, '~0').replace(/\//g, '~1')}`.slice(0, 512)
}

/** Read data descriptors through the prototype chain without invoking accessors. */
export function dataProperty(source: object, key: string): unknown {
  let current: object | null = source
  for (let depth = 0; current && depth < 10; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor)
      return 'value' in descriptor ? descriptor.value : undefined
    current = Object.getPrototypeOf(current) as object | null
  }
  return undefined
}

/** Get enumerable own keys lazily, avoiding an additional large source-key array. */
export function* ownKeys(source: object): Iterable<string> {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key))
      yield key
  }
}
