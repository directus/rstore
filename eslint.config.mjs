// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/.nitro',
    'docs/guide/migration/**',
    '**/skills/**',
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
  files: [
    'docs/**/*',
    'scripts/**/*.js',
    '**/*.md',
  ],
  rules: {
    'no-console': 'off',
  },
})
