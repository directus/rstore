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
    'docs/**/*',
    'scripts/**/*.js',
    '**/*.md',
  ],
  rules: {
    'no-console': 'off',
  },
})
