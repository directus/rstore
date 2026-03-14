import type { TutorialSnapshot } from './types'

interface VendoredPackage {
  dir: 'core' | 'shared' | 'vue'
  folder: string
  name: '@rstore/core' | '@rstore/shared' | '@rstore/vue'
}

interface PackageManifest {
  name: string
  version: string
  type?: string
  sideEffects?: boolean
  main?: string
  module?: string
  types?: string
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const vendoredPackages: readonly VendoredPackage[] = [
  {
    dir: 'shared',
    folder: 'vendor/@rstore/shared',
    name: '@rstore/shared',
  },
  {
    dir: 'core',
    folder: 'vendor/@rstore/core',
    name: '@rstore/core',
  },
  {
    dir: 'vue',
    folder: 'vendor/@rstore/vue',
    name: '@rstore/vue',
  },
] as const

const requiredDistFiles = [
  'index.cjs',
  'index.d.cts',
  'index.d.mts',
  'index.d.ts',
  'index.mjs',
] as const

const packageManifestModules = import.meta.glob('../../../../packages/*/package.json', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const packageDistModules = {
  ...(import.meta.glob('../../../../packages/*/dist/index.cjs', {
    eager: true,
    import: 'default',
    query: '?raw',
  }) as Record<string, string>),
  ...(import.meta.glob('../../../../packages/*/dist/index.d.cts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }) as Record<string, string>),
  ...(import.meta.glob('../../../../packages/*/dist/index.d.mts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }) as Record<string, string>),
  ...(import.meta.glob('../../../../packages/*/dist/index.d.ts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }) as Record<string, string>),
  ...(import.meta.glob('../../../../packages/*/dist/index.mjs', {
    eager: true,
    import: 'default',
    query: '?raw',
  }) as Record<string, string>),
}

const vendoredPackageFiles = createVendoredPackageFiles()

export function createVendoredRstorePackageFiles(): TutorialSnapshot {
  return {
    ...vendoredPackageFiles,
  }
}

function createVendoredPackageFiles(): TutorialSnapshot {
  const files: TutorialSnapshot = {}

  for (const pkg of vendoredPackages) {
    const manifest = readPackageManifest(pkg)
    files[`${pkg.folder}/package.json`] = `${JSON.stringify(rewritePackageManifest(pkg, manifest), null, 2)}\n`

    for (const distFile of requiredDistFiles) {
      files[`${pkg.folder}/dist/${distFile}`] = readDistFile(pkg, distFile)
    }
  }

  return files
}

function rewritePackageManifest(pkg: VendoredPackage, manifest: PackageManifest): PackageManifest {
  return {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    sideEffects: manifest.sideEffects,
    main: manifest.main,
    module: manifest.module,
    types: manifest.types,
    exports: manifest.exports,
    dependencies: rewriteDependencyMap(pkg, manifest.dependencies),
    peerDependencies: manifest.peerDependencies,
  }
}

function rewriteDependencyMap(pkg: VendoredPackage, dependencies: Record<string, string> | undefined) {
  if (!dependencies) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(dependencies).map(([dependencyName, version]) => {
      if (!version.startsWith('workspace:')) {
        return [dependencyName, version]
      }

      const target = vendoredPackages.find(candidate => candidate.name === dependencyName)

      if (!target) {
        throw new Error(`Unable to vendor "${pkg.name}": unsupported workspace dependency "${dependencyName}".`)
      }

      const relativeTarget = pkg.folder === target.folder
        ? '.'
        : target.folder.replace(/^vendor\/@rstore\//, '../')

      return [dependencyName, `file:${relativeTarget}`]
    }),
  )
}

function readPackageManifest(pkg: VendoredPackage): PackageManifest {
  const moduleEntry = Object.entries(packageManifestModules).find(([modulePath]) =>
    modulePath.includes(`/packages/${pkg.dir}/package.json`),
  )

  if (!moduleEntry) {
    throw new Error(`Missing package manifest for "${pkg.name}".`)
  }

  return JSON.parse(moduleEntry[1]) as PackageManifest
}

function readDistFile(pkg: VendoredPackage, fileName: string) {
  const moduleEntry = Object.entries(packageDistModules).find(([modulePath]) =>
    modulePath.includes(`/packages/${pkg.dir}/dist/${fileName}`),
  )

  if (!moduleEntry) {
    throw new Error(`Missing "${pkg.name}" build artifact "${fileName}". Run the package build before loading the tutorial.`)
  }

  return moduleEntry[1]
}
