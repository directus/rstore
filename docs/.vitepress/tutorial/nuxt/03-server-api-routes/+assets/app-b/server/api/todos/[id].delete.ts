import { deleteTodo } from '../../utils/tutorial-data'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  return id ? deleteTodo(id) : { ok: true }
})
