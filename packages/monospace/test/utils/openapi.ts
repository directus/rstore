/**
 * Creates a compact Monospace OpenAPI fixture for schema tests.
 */
export function createOpenApiFixture(): any {
  return {
    'openapi': '3.1.0',
    'paths': {},
    'x-monospace-mappings': {
      Todos: {
        many: {
          $ref: '#/paths/~1api~1blog~1items~1Todos',
        },
        one: {
          $ref: '#/paths/~1api~1blog~1items~1Todos~1%7Bkey%7D',
        },
      },
      Profiles: {
        many: {
          $ref: '#/paths/~1api~1blog~1items~1Profiles',
        },
      },
    },
    'components': {
      schemas: {
        TodosCollectionOutput: {
          required: ['id', 'title', 'completed'],
          type: 'object',
          properties: {
            id: {
              'type': 'integer',
              'x-monospace-primary-key': true,
            },
            title: {
              type: 'string',
            },
            completed: {
              type: 'boolean',
            },
            description: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
            },
            author: {
              $ref: '#/components/schemas/ProfilesCollectionOutput',
            },
          },
        },
        ProfilesCollectionOutput: {
          required: ['id'],
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
          },
        },
      },
    },
  }
}
