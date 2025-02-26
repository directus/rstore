export default defineEventHandler(async (event) => {
  const { type } = getRouterParams(event) as { type: keyof Db, id: string }
  const schema = createValidationSchemas[type]
  const body = await readValidatedBody(event, data => schema.parse(data))
  const newItem: any = {
    id: crypto.randomUUID(),
    ...defaultValues[type],
    ...body,
    createdAt: new Date(),
  }
  db[type].push(newItem)
  return newItem
})
