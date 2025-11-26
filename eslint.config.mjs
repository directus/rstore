// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/.nitro',
    'docs/guide/migration/**',
  ],
  rules: {
    'vue/object-property-newline': ['error', {
      allowAllPropertiesOnSameLine: false,
    }],
    'no-console': 'error',
  },
}, {
  files: [
    'docs/**/*',
    'scripts/**/*.js',
  ],
  rules: {
    'no-console': 'off',
  },
})
