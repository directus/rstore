import { getTodo } from '../../utils/tutorial-data'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  return id ? getTodo(id) : null
})
