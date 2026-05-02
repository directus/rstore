import process from 'node:process'

/**
 * Directus URL used by the local e2e Compose stack.
 */
export const DIRECTUS_URL = process.env.DIRECTUS_URL ?? 'http://127.0.0.1:8056'

/**
 * Admin token configured for the local e2e Directus instance.
 */
export const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? 'rstore-directus-e2e-token'

/**
 * Collection used by the visible todo playground and most adapter tests.
 */
export const TODOS_COLLECTION = 'Todos'

/**
 * Collection used to exercise generated one-to-many relation includes.
 */
export const PROJECTS_COLLECTION = 'Projects'

/**
 * Singleton collection used to exercise Directus singleton item APIs.
 */
export const SETTINGS_COLLECTION = 'Settings'

/**
 * Built-in Directus public policy name.
 */
export const PUBLIC_POLICY_NAME = '$t:public_label'

/**
 * Collection actions needed by the browser-based e2e harness.
 */
export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete']

/**
 * Collections exposed to unauthenticated browser requests in e2e tests.
 */
export const PUBLIC_COLLECTIONS = [
  TODOS_COLLECTION,
  PROJECTS_COLLECTION,
  SETTINGS_COLLECTION,
]
