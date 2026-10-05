// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/.nitro',
    'docs/guide/migration/**',
    '**/skills/**',
    // Codemod inputs and expected outputs are compared verbatim.
    'scripts/codemods/__fixtures__/**',
    'scripts/codemods/*.yml',
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
  // `@rstore/multiplayer` is framework-agnostic and depends only on
  // `@rstore/shared`: `@rstore/core` re-exports it during 0.9, so importing
  // core back would create a cycle.
  files: ['packages/multiplayer/src/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '@rstore/*',
            '!@rstore/shared',
            'vue',
            'vue/*',
            '@vue/*',
            'nuxt',
            'nuxt/*',
            '@nuxt/*',
            '#app',
            '#imports',
          ],
          message: '@rstore/multiplayer may only import @rstore/shared: no core, Vue or Nuxt.',
        },
      ],
    }],
  },
}, {
  files: ['packages/multiplayer/test/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['../src/*', '../../src/*', '../../../src/*', '**/packages/multiplayer/src/*'],
          message: 'Import the public @rstore/multiplayer entries so tests exercise their boundary.',
        },
      ],
    }],
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
