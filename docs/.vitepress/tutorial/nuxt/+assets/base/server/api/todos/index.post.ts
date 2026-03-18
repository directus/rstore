import { createTodo } from '../../utils/tutorial-data'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return createTodo(body ?? {})
})
