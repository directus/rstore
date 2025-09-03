export default defineEventHandler(async (event) => {
  await wait(4000)
  const { type } = getRouterParams(event) as { type: keyof Db, id: string }
  const schema = createValidationSchemas[type as keyof CreateValidationSchemas]
  const body = schema ? await readValidatedBody(event, data => schema.parse(data)) : await readBody(event)
  const newItem: any = {
    id: crypto.randomUUID(),
    ...defaultValues[type as keyof typeof defaultValues],
    ...body,
    createdAt: new Date(),
  }
  db[type].push(newItem)
  return newItem
})
