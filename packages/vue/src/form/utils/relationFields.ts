import { leafFieldName } from './fieldPath'

/**
 * Visit each source field projected by a relation in declaration order.
 *
 * Repeated source fields are intentionally visited repeatedly. Callers decide
 * whether a repeated projection is observable or needs its own deduplication.
 *
 * @param relation Relation definition containing target field mappings.
 * @param relation.to Ordered relation targets and their field mappings.
 * @param visit Receives one source field leaf name per mapping.
 */
export function forEachRelationSourceField(
  relation: { to: readonly { on: Record<string, string> }[] },
  visit: (field: string) => void,
): void {
  for (const target of relation.to) {
    for (const sourceField of Object.values(target.on)) {
      visit(leafFieldName(sourceField))
    }
  }
}
