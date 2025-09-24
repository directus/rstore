let counter = 100

export default defineEventHandler(() => {
  const sourceId = `source1`
  db.dataSources = [
    {
      id: sourceId,
      name: `Source ${sourceId}`,
    },
  ]
  const collectionId = `c${counter++}`
  db.dataCollections = [
    {
      id: collectionId,
      name: `Collection ${collectionId}`,
      dataSourceId: sourceId,
    },
  ]
  const fields: DataField[] = []
  const fieldCount = Math.floor(Math.random() * 5) + 3
  const types = ['string', 'number', 'boolean', 'date']
  for (let i = 0; i < fieldCount; i++) {
    const fieldId = `f${counter++}`
    fields.push({
      id: fieldId,
      dataCollectionId: collectionId,
      name: `Field ${fieldId}`,
      type: types[Math.floor(Math.random() * types.length)],
      nullable: Math.random() < 0.5,
    })
  }
  db.dataFields = fields
})
