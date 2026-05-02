import {
  createCollection,
  createField,
  createPermissions,
  createRelation,
  deleteCollection,
  readCollection,
  readFieldsByCollection,
  readPermissions,
  readPolicies,
  readRelations,
  updateCollection,
  updateSingleton,
} from '@directus/sdk'
import { directus, isMissingDirectusResource } from './client.mjs'
import {
  CRUD_ACTIONS,
  PROJECTS_COLLECTION,
  PUBLIC_COLLECTIONS,
  PUBLIC_POLICY_NAME,
  SETTINGS_COLLECTION,
  TODOS_COLLECTION,
} from './constants.mjs'
import { FIELD_DEFINITIONS } from './fields.mjs'

const COLLECTION_DEFINITIONS = [
  {
    collection: PROJECTS_COLLECTION,
    meta: { icon: 'folder', note: 'rstore Directus e2e projects' },
  },
  {
    collection: TODOS_COLLECTION,
    meta: { icon: 'check_box', note: 'rstore Directus e2e todos' },
  },
  {
    collection: SETTINGS_COLLECTION,
    meta: { icon: 'settings', note: 'rstore Directus e2e singleton', singleton: true },
  },
]

/**
 * Creates all Directus collections, fields, relations, defaults, and permissions.
 */
export async function ensureDirectusSchema() {
  for (const definition of COLLECTION_DEFINITIONS) {
    await ensureCollection(definition)
  }
  await ensureFields()
  await ensureTodoProjectRelation()
  await ensureSettingsDefaults()
  await ensurePublicPermissions()
}

/**
 * Creates or updates one collection used by the e2e suite.
 */
async function ensureCollection(definition) {
  const collection = await readOptionalCollection(definition.collection)

  if (!collection) {
    await createSchemaCollection(definition)
    return
  }

  if (!collection.schema) {
    await directus.request(deleteCollection(definition.collection))
    await createSchemaCollection(definition)
    return
  }

  await directus.request(updateCollection(definition.collection, {
    meta: {
      ...(collection.meta ?? {}),
      ...definition.meta,
      collection: definition.collection,
    },
  }))
}

/**
 * Reads a collection or returns null when it does not exist.
 */
async function readOptionalCollection(collection) {
  try {
    return await directus.request(readCollection(collection))
  }
  catch (error) {
    if (isMissingDirectusResource(error)) {
      return null
    }
    throw error
  }
}

/**
 * Creates one database-backed Directus collection.
 */
async function createSchemaCollection(definition) {
  await directus.request(createCollection({
    collection: definition.collection,
    meta: {
      collection: definition.collection,
      ...definition.meta,
    },
    schema: {
      name: definition.collection,
    },
  }))
}

/**
 * Creates all missing fields for the e2e collections.
 */
async function ensureFields() {
  for (const [collection, fields] of Object.entries(FIELD_DEFINITIONS)) {
    const existingFields = await directus.request(readFieldsByCollection(collection))
    const fieldNames = new Set(existingFields.map(field => field.field))

    for (const field of fields) {
      if (!fieldNames.has(field.field)) {
        await directus.request(createField(collection, field))
        fieldNames.add(field.field)
      }
    }
  }
}

/**
 * Creates the Projects.todos alias-side relation used by include tests.
 */
async function ensureTodoProjectRelation() {
  const relations = await directus.request(readRelations())
  const exists = relations.some((relation) => {
    return relation.collection === TODOS_COLLECTION && relation.field === 'project_id'
  })
  if (exists) {
    return
  }

  await directus.request(createRelation({
    collection: TODOS_COLLECTION,
    field: 'project_id',
    related_collection: PROJECTS_COLLECTION,
    meta: {
      many_collection: TODOS_COLLECTION,
      many_field: 'project_id',
      one_collection: PROJECTS_COLLECTION,
      one_deselect_action: 'nullify',
      one_field: 'todos',
    },
    schema: {
      on_delete: 'SET NULL',
    },
  }))
}

/**
 * Writes a stable default singleton row for Settings.
 */
async function ensureSettingsDefaults() {
  await directus.request(updateSingleton(SETTINGS_COLLECTION, {
    site_name: 'Rstore Directus E2E',
    maintenance: false,
    version: 1,
  }))
}

/**
 * Grants public CRUD permissions for all playground e2e collections.
 */
async function ensurePublicPermissions() {
  const publicPolicyId = await getPublicPolicyId()
  const permissions = await directus.request(readPermissions({
    fields: ['id', 'action', 'collection', 'policy'],
    filter: {
      collection: {
        _in: PUBLIC_COLLECTIONS,
      },
      policy: {
        _eq: publicPolicyId,
      },
    },
    limit: -1,
  }))

  const existing = new Set(permissions.map(permission => permissionKey(permission.collection, permission.action)))
  const missingPermissions = PUBLIC_COLLECTIONS.flatMap((collection) => {
    return CRUD_ACTIONS
      .filter(action => !existing.has(permissionKey(collection, action)))
      .map(action => ({
        policy: publicPolicyId,
        collection,
        action,
        permissions: {},
        validation: null,
        presets: null,
        fields: ['*'],
      }))
  })

  if (missingPermissions.length) {
    await directus.request(createPermissions(missingPermissions))
  }
}

/**
 * Returns the built-in public policy id.
 */
async function getPublicPolicyId() {
  const policies = await directus.request(readPolicies({
    fields: ['id', 'name'],
    filter: { name: { _eq: PUBLIC_POLICY_NAME } },
    limit: 1,
  }))
  const policy = policies[0]
  if (!policy) {
    throw new Error('Directus public policy was not found')
  }
  return policy.id
}

/**
 * Creates a set key for one collection action permission.
 */
function permissionKey(collection, action) {
  return `${collection}:${action}`
}
