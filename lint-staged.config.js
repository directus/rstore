import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'pathe'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*': [
    'eslint --fix',
  ],
  'docs/**': _stagedFiles => [
    'pnpm run docs:build',
  ],
  'packages/**': (stagedFiles) => {
    const packages = stagedFiles.map((file) => {
      const packagePath = path.relative(__dirname, file)
      return packagePath.split('/')[1]
    })
    const packageNames = [...new Set(packages)].map((packagePath) => {
      const packageJsonPath = path.join(__dirname, 'packages', packagePath, 'package.json')
      const content = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      return content.name
    })
    return [
      'pnpm run test',
      `pnpm run -r ${packageNames.map(name => `--filter ...${name}`).join(' ')} build`,
      `pnpm run -r ${packageNames.map(name => `--filter ...${name}`).join(' ')} test:types`,
    ]
  },
  'README.md': _stagedFiles => [
    'pnpm run copy-readme',
  ],
  'pnpm-lock.yaml': _stagedFiles => [
    'run-p docs:build bb test',
  ],
}
