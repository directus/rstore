import { Buffer } from 'node:buffer'

/** Generate one stable fixed-width scalar value. */
export function scalarValue(record: number, field: number): string {
  return `r${record.toString(36)}-f${field.toString(36)}-payload`.padEnd(32, String((record + field) % 10)).slice(0, 32)
}

/** Create narrow three-field records. */
export function createNarrowRecords(items: number): any[] {
  return Array.from({ length: items }, (_, index) => ({ id: index + 1, group: index % 97, label: `item-${index + 1}` }))
}

/** Create wide records containing fixed-width scalar fields. */
export function createWideRecords(items: number, fields: number): any[] {
  return Array.from({ length: items }, (_, index) => {
    const item: Record<string, unknown> = { id: index + 1 }
    for (let field = 0; field < fields; field++)
      item[`field${field}`] = scalarValue(index + 1, field)
    return item
  })
}

/** Create partial replacements for existing wide records. */
export function createWidePatches(items: number, fields: number): any[] {
  return Array.from({ length: items }, (_, index) => {
    const item: Record<string, unknown> = { id: index + 1 }
    for (let field = 0; field < fields; field += 2)
      item[`field${field}`] = scalarValue(index + 10_001, field)
    return item
  })
}

/** Create mixed deep records with objects and arrays. */
export function createDeepRecords(items: number, objects: number, leaves: number, arrayLength: number): any[] {
  return Array.from({ length: items }, (_, index) => {
    const item: Record<string, unknown> = { id: index + 1 }
    for (let object = 0; object < objects; object++) {
      const nested: Record<string, unknown> = {}
      for (let leaf = 0; leaf < leaves; leaf++)
        nested[`leaf${leaf}`] = scalarValue(index + 1, object * leaves + leaf)
      nested.values = Array.from({ length: arrayLength }, (_, value) => (index + object + value) % 10_007)
      item[`nested${object}`] = nested
    }
    return item
  })
}

/** Create parents containing deterministic nested relation children. */
export function createRelationRecords(items: number, childrenPerParent: number): any[] {
  return Array.from({ length: items }, (_, index) => ({
    id: index + 1,
    title: scalarValue(index + 1, 0),
    comments: Array.from({ length: childrenPerParent }, (_, child) => ({
      id: index * childrenPerParent + child + 1,
      postId: index + 1,
      body: scalarValue(index + 1, child + 1),
    })),
  }))
}

/** Approximate source bytes through deterministic JSON serialization. */
export function approximateSourceBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value))
}

/** Mutate one source graph after cache ingestion to prove detachment. */
export function mutateSource(records: any[] | undefined): void {
  const first = records?.[0]
  if (!first)
    return
  first.label = 'released-source-mutated'
  first.field0 = 'released-source-mutated'
  first.title = 'released-source-mutated'
  if (first.nested0)
    first.nested0.leaf0 = 'released-source-mutated'
  if (first.comments?.[0])
    first.comments[0].body = 'released-source-mutated'
}
