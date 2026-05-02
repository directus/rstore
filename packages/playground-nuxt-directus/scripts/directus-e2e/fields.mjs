import {
  PROJECTS_COLLECTION,
  SETTINGS_COLLECTION,
  TODOS_COLLECTION,
} from './constants.mjs'

/**
 * Directus fields required by each e2e collection.
 */
export const FIELD_DEFINITIONS = {
  [PROJECTS_COLLECTION]: [
    textField('name', { required: true }),
    textField('code', { required: true }),
    aliasField('todos'),
  ],
  [TODOS_COLLECTION]: [
    textField('title', { required: true }),
    booleanField('completed', false),
    integerField('priority', 0),
    textField('status'),
    textField('notes', { type: 'text' }),
    integerField('project_id', null),
    timestampField('date_created'),
  ],
  [SETTINGS_COLLECTION]: [
    textField('site_name', { required: true }),
    booleanField('maintenance', false),
    integerField('version', 1),
  ],
}

/**
 * Creates a Directus string-like field definition.
 */
function textField(field, options = {}) {
  const schema = { is_nullable: !(options.required ?? false) }
  if (options.type !== 'text') {
    schema.max_length = 255
  }

  return {
    field,
    type: options.type ?? 'string',
    meta: {
      interface: options.type === 'text' ? 'input-multiline' : 'input',
      required: options.required ?? false,
    },
    schema,
  }
}

/**
 * Creates a Directus boolean field definition.
 */
function booleanField(field, defaultValue) {
  return {
    field,
    type: 'boolean',
    meta: { interface: 'boolean' },
    schema: {
      default_value: defaultValue,
      is_nullable: false,
    },
  }
}

/**
 * Creates a Directus integer field definition.
 */
function integerField(field, defaultValue) {
  return {
    field,
    type: 'integer',
    meta: { interface: 'input' },
    schema: {
      default_value: defaultValue,
      is_nullable: defaultValue === null,
    },
  }
}

/**
 * Creates a Directus date-created timestamp field definition.
 */
function timestampField(field) {
  return {
    field,
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      readonly: true,
      hidden: true,
      special: ['date-created'],
    },
    schema: { is_nullable: true },
  }
}

/**
 * Creates a Directus alias field definition for one-to-many relations.
 */
function aliasField(field) {
  return {
    field,
    type: 'alias',
    meta: {
      interface: 'list-o2m',
      special: ['o2m'],
    },
    schema: null,
  }
}
