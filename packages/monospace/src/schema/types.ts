/**
 * Minimal OpenAPI schema object used by Monospace generation.
 */
export interface OpenApiSchemaObject {
  /**
   * JSON schema type.
   */
  type?: string | string[]

  /**
   * JSON schema format.
   */
  format?: string

  /**
   * Object properties.
   */
  properties?: Record<string, OpenApiSchema>

  /**
   * Required object property names.
   */
  required?: string[]

  /**
   * Array item schema.
   */
  items?: OpenApiSchema

  /**
   * Alternative schema list.
   */
  anyOf?: OpenApiSchema[]

  /**
   * Alternative schema list.
   */
  oneOf?: OpenApiSchema[]

  /**
   * Unknown OpenAPI extensions.
   */
  [key: string]: unknown
}

/**
 * Minimal OpenAPI reference object.
 */
export interface OpenApiReferenceObject {
  /**
   * JSON pointer reference.
   */
  $ref: string
}

/**
 * Schema or reference accepted by the generator.
 */
export type OpenApiSchema = OpenApiSchemaObject | OpenApiReferenceObject

/**
 * Minimal Monospace OpenAPI document used by rstore generation.
 */
export interface MonospaceOpenApiDocument {
  /**
   * OpenAPI version string.
   */
  'openapi': string

  /**
   * OpenAPI paths object.
   */
  'paths'?: Record<string, unknown>

  /**
   * OpenAPI components object.
   */
  'components'?: {
    /**
     * Component schema map.
     */
    schemas?: Record<string, OpenApiSchemaObject>
  }

  /**
   * Monospace collection-to-path mappings.
   */
  'x-monospace-mappings'?: Record<string, {
    /**
     * Single-item endpoint reference.
     */
    one?: OpenApiReferenceObject

    /**
     * Many-items endpoint reference.
     */
    many?: OpenApiReferenceObject
  }>
}

/**
 * Explicit primary key configuration keyed by collection name.
 */
export type MonospacePrimaryKeyConfig = Record<string, string | string[]>

/**
 * Generated TypeScript item field.
 */
export interface MonospaceGeneratedField {
  /**
   * Field name.
   */
  name: string

  /**
   * TypeScript type expression.
   */
  type: string

  /**
   * Whether the property is optional.
   */
  optional: boolean
}
