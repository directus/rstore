/** Register default field parsers for generated Drizzle collections. */
export function installCollectionDefaults(addCollectionDefaults: any) {
  const parseDate = (value: any): Date => typeof value === 'string' ? new Date(value) : value
  addCollectionDefaults({
    fields: {
      createdAt: {
        parse: parseDate,
      },
      updatedAt: {
        parse: parseDate,
      },
    },
  })
}
