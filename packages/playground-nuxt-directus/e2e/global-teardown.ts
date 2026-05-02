import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const composeFile = resolve(packageDir, 'docker-compose.e2e.yml')

/**
 * Stops the Directus e2e Compose stack after Playwright completes.
 */
export default function globalTeardown(): void {
  execFileSync('docker', [
    'compose',
    '-p',
    'rstore-nuxt-directus-e2e',
    '-f',
    composeFile,
    'down',
    '--volumes',
    '--remove-orphans',
  ], {
    cwd: packageDir,
    stdio: 'inherit',
  })
}
