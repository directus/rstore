import { getUser } from '../../utils/tutorial-data'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  return id ? getUser(id) : null
})
