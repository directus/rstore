// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/.nitro',
    'docs/guide/migration/**',
    '**/skills/**',
    // Verbatim audited baseline; authored benchmark code stays linted.
    'packages/vue/benchmark/legacy-cache.ts',
  ],
  rules: {
    'vue/object-property-newline': ['error', {
      allowAllPropertiesOnSameLine: false,
    }],
    'no-console': 'error',
    'pnpm/json-enforce-catalog': 'off',
  },
}, {
  files: [
    'packages/{core,vue,shared}/test/**/*.{ts,tsx}',
    'test/utils/**/*.{ts,tsx}',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '@rstore/core/*',
            '@rstore/shared/*',
            '@rstore/vue/*',
          ],
          message: 'Import the package root so tests exercise its public boundary.',
        },
        {
          group: [
            '../src/*',
            '../../src/*',
            '../../../src/*',
            '../../../../src/*',
            '**/packages/core/src/*',
            '**/packages/shared/src/*',
            '**/packages/vue/src/*',
          ],
          message: 'Tests may use a source root barrel, never an internal source module.',
        },
      ],
    }],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[property.name="_private"]',
        message: 'Assert public cache behavior instead of Vue cache internals.',
      },
      {
        selector: 'MemberExpression[property.name=/^\\$(dedupePromises|processItemParsing|processItemSerialization|registeredModules|resolveFindOptions)$/]',
        message: 'Assert the public Store behavior produced by this private member.',
      },
    ],
  },
}, {
  // These specs intentionally exercise private bridge algorithms. Keep the
  // public-boundary rule active for every integration and behavior spec.
  files: [
    'packages/vue/test/cache-differential.spec.ts',
    'packages/vue/test/change-interest.spec.ts',
    'packages/vue/test/index-result-cache.spec.ts',
    'packages/vue/test/signals.spec.ts',
    'packages/vue/test/state-sink.spec.ts',
    'packages/vue/test/wrapped-item-metadata.spec.ts',
  ],
  rules: {
    'no-restricted-imports': 'off',
  },
}, {
  // Bridge lifecycle assertions need the deliberately exposed private cache
  // handle; other behavior in this file still uses public cache operations.
  files: [
    'packages/vue/test/cache-data-core.spec.ts',
  ],
  rules: {
    'no-restricted-syntax': 'off',
  },
}, {
  files: [
    'packages/*/benchmark/**/*.ts',
  ],
  rules: {
    'no-console': 'off',
  },
}, {
  files: [
    'docs/**/*',
    'scripts/**/*.js',
    '**/*.md',
  ],
  rules: {
    'no-console': 'off',
  },
})
