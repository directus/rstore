import { updateTodo } from '../../utils/tutorial-data'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  return id ? updateTodo(id, body ?? {}) : null
})
