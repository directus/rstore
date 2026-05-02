import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'pathe'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * lint-staged config.
 *
 * Returned commands run **sequentially** in array order — that's important.
 * The previous multi-pattern config let lint-staged fan commands out across
 * patterns in parallel, which caused a race: `bb` (the lockfile hook) calls
 * `unbuild` which wipes `packages/*\/dist` while the `packages/**` hook ran
 * `pnpm run test` and `test:types` against those same dist trees, leading
 * to "Failed to resolve entry for package @rstore/shared" failures during
 * an otherwise-clean commit.
 *
 * Sequential ordering also lets us run `build` once before any test or
 * typecheck reads from dist, regardless of which combination of files is
 * staged (packages, docs, lockfile, README, …).
 *
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default (stagedFiles) => {
  const tasks = []

  // 1. Lint+fix staged files first so any auto-fixes are folded into the
  //    same commit. Empty if nothing to lint.
  const eslintTargets = stagedFiles.filter(file =>
    /\.(?:[cm]?[jt]sx?|vue|json|md)$/i.test(file),
  )
  if (eslintTargets.length > 0) {
    tasks.push(`eslint --fix ${eslintTargets.map(f => JSON.stringify(f)).join(' ')}`)
  }

  // Categorize once so we don't re-scan the file list four times.
  const hasReadme = stagedFiles.some(file => /(?:^|\/)README\.md$/.test(file))
  const hasLockfile = stagedFiles.some(file => /(?:^|\/)pnpm-lock\.yaml$/.test(file))
  const docsFiles = stagedFiles.filter(file =>
    /(?:^|\/)docs\//.test(path.relative(__dirname, file)),
  )
  const packageFiles = stagedFiles.filter(file =>
    /(?:^|\/)packages\//.test(path.relative(__dirname, file)),
  )

  // 2. Mirror the root README into each package's README (must run before
  //    builds in case they bundle the README into dist).
  if (hasReadme) {
    tasks.push('pnpm run copy-readme')
  }

  // 3. Build packages BEFORE any tests or typechecks read from dist. A
  //    lockfile change implies cross-package effects so we always rebuild.
  const needsPackageWork = packageFiles.length > 0 || hasLockfile
  if (needsPackageWork) {
    tasks.push('pnpm run build')
  }

  // 4. Docs build — runs after package build so any locally-published
  //    docs imports resolve against fresh dist.
  if (docsFiles.length > 0 || hasLockfile) {
    tasks.push('pnpm run docs:build')
  }

  // 5. Tests, then typechecks. Order matters: failures should surface
  //    from the cheaper checks first.
  if (needsPackageWork) {
    tasks.push('pnpm run test')

    if (hasLockfile) {
      // A lockfile change can affect any package — typecheck them all.
      tasks.push('pnpm run test:types')
    }
    else {
      // Otherwise narrow to the packages whose source actually changed,
      // including their reverse deps via `--filter ...<name>`.
      const packages = packageFiles
        .map(file => path.relative(__dirname, file).split('/')[1])
        .filter(Boolean)
      const packageNames = [...new Set(packages)]
        .map((dir) => {
          const pkgJsonPath = path.join(__dirname, 'packages', dir, 'package.json')
          if (!fs.existsSync(pkgJsonPath)) {
            return null
          }
          return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')).name
        })
        .filter(Boolean)

      if (packageNames.length > 0) {
        const filters = packageNames
          .map(name => `--filter ...${name}`)
          .join(' ')
        tasks.push(`pnpm run -r ${filters} test:types`)
      }
    }
  }

  return tasks
}
