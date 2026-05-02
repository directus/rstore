import type { DirectusE2eStore } from './helpers'
import { assertCase, createTodos, sortedTitles } from './helpers'

/**
 * Runs generated Directus relation include coverage.
 */
export async function runRelationCase(store: DirectusE2eStore, prefix: string) {
  const project = await store.Projects.create({
    name: `${prefix}-project`,
    code: `${prefix}-project-code`,
  }, {
    optimistic: false,
  })

  await createTodos(store, [
    relationTodo(prefix, 'a', project.id, false),
    relationTodo(prefix, 'b', project.id, true),
  ])

  const projects = await store.Projects.findMany({
    fields: ['id', 'name', 'code'],
    filter: { id: { _eq: project.id } },
    include: { todos: true },
    fetchPolicy: 'fetch-only',
  })
  const includedProject = projects[0]
  const includedTodos = Array.isArray(includedProject?.todos) ? includedProject.todos : []
  const filteredTodos = includedTodos.filter((todo: any) => !todo.completed)

  assertCase(includedProject?.name === `${prefix}-project`, 'included project should be returned')
  assertCase(includedTodos.length === 2, 'relation include should fetch both project todos')

  return {
    ok: true,
    projectName: includedProject.name,
    includedTitles: sortedTitles(includedTodos),
    filteredRelationTitles: sortedTitles(filteredTodos),
  }
}

/**
 * Creates one relation case todo payload.
 */
function relationTodo(prefix: string, suffix: string, projectId: number, completed: boolean) {
  return {
    title: `${prefix}-relation-${suffix}`,
    completed,
    priority: suffix.charCodeAt(0),
    status: `${prefix}-relation`,
    project_id: projectId,
  }
}
