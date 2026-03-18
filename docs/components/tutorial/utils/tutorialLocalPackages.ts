import type { TutorialFramework, TutorialSnapshot } from './types'

interface VendoredPackage {
  dir: 'core' | 'shared' | 'vue' | 'devtools' | 'nuxt'
  folder: string
  name: '@rstore/core' | '@rstore/shared' | '@rstore/vue' | '@rstore/devtools' | '@rstore/nuxt'
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
  {
    dir: 'devtools',
    folder: 'vendor/@rstore/devtools',
    name: '@rstore/devtools',
  },
  {
    dir: 'nuxt',
    folder: 'vendor/@rstore/nuxt',
    name: '@rstore/nuxt',
  },
] as const

const vendoredPackagesByFramework: Record<TutorialFramework, readonly VendoredPackage[]> = {
  vue: vendoredPackages.filter(pkg => ['shared', 'core', 'vue'].includes(pkg.dir)),
  nuxt: vendoredPackages.filter(pkg => ['shared', 'core', 'vue', 'nuxt'].includes(pkg.dir)),
}

const omittedWorkspaceDependenciesByFramework: Record<
  TutorialFramework,
  Partial<Record<VendoredPackage['name'], readonly string[]>>
> = {
  vue: {},
  nuxt: {
    '@rstore/nuxt': ['@rstore/devtools'],
  },
}

const packageManifestModules = import.meta.glob('../../../../packages/*/package.json', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const packageDistModules = import.meta.glob([
  '../../../../packages/*/dist/**/*',
  '!../../../../packages/*/dist/**/*.map',
], {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const packageSourceModules = import.meta.glob('../../../../packages/*/src/**/*', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const vendoredPackageFiles = createVendoredPackageFiles(vendoredPackages)
const vendoredPackageFilesByFramework = Object.fromEntries(
  (Object.entries(vendoredPackagesByFramework) as [TutorialFramework, readonly VendoredPackage[]][])
    .map(([framework, packages]) => [
      framework,
      createVendoredPackageFiles(packages, omittedWorkspaceDependenciesByFramework[framework]),
    ]),
) as Record<TutorialFramework, TutorialSnapshot>

export function createVendoredRstorePackageFiles(framework?: TutorialFramework): TutorialSnapshot {
  if (framework) {
    return {
      ...vendoredPackageFilesByFramework[framework],
    }
  }

  return {
    ...vendoredPackageFiles,
  }
}

function createVendoredPackageFiles(
  packages: readonly VendoredPackage[],
  omittedWorkspaceDependencies: Partial<Record<VendoredPackage['name'], readonly string[]>> = {},
): TutorialSnapshot {
  const files: TutorialSnapshot = {}
  const availablePackages = new Map(packages.map(pkg => [pkg.name, pkg]))

  for (const pkg of packages) {
    const manifest = readPackageManifest(pkg)
    files[`${pkg.folder}/package.json`] = `${JSON.stringify(
      rewritePackageManifest(
        pkg,
        manifest,
        availablePackages,
        omittedWorkspaceDependencies[pkg.name] ?? [],
      ),
      null,
      2,
    )}\n`
    Object.assign(files, readDistFiles(pkg))
    Object.assign(files, readSourceFiles(pkg))
  }

  return files
}

function rewritePackageManifest(
  pkg: VendoredPackage,
  manifest: PackageManifest,
  availablePackages: ReadonlyMap<VendoredPackage['name'], VendoredPackage>,
  omittedWorkspaceDependencies: readonly string[],
): PackageManifest {
  return {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    sideEffects: manifest.sideEffects,
    main: manifest.main,
    module: manifest.module,
    types: manifest.types,
    exports: manifest.exports,
    dependencies: rewriteDependencyMap(pkg, manifest.dependencies, availablePackages, omittedWorkspaceDependencies),
    peerDependencies: manifest.peerDependencies,
  }
}

function rewriteDependencyMap(
  pkg: VendoredPackage,
  dependencies: Record<string, string> | undefined,
  availablePackages: ReadonlyMap<VendoredPackage['name'], VendoredPackage>,
  omittedWorkspaceDependencies: readonly string[],
) {
  if (!dependencies) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(dependencies).flatMap(([dependencyName, version]) => {
      if (!version.startsWith('workspace:')) {
        return [[dependencyName, version]]
      }

      const target = availablePackages.get(dependencyName as VendoredPackage['name'])

      if (!target) {
        if (omittedWorkspaceDependencies.includes(dependencyName)) {
          return []
        }

        throw new Error(`Unable to vendor "${pkg.name}": unsupported workspace dependency "${dependencyName}".`)
      }

      const relativeTarget = pkg.folder === target.folder
        ? '.'
        : target.folder.replace(/^vendor\/@rstore\//, '../')

      return [[dependencyName, `file:${relativeTarget}`]]
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

function readDistFiles(pkg: VendoredPackage): TutorialSnapshot {
  const files: TutorialSnapshot = {}

  for (const [modulePath, contents] of Object.entries(packageDistModules)) {
    const marker = `/packages/${pkg.dir}/dist/`
    const index = modulePath.indexOf(marker)

    if (index === -1) {
      continue
    }

    files[`${pkg.folder}/dist/${modulePath.slice(index + marker.length)}`] = contents
  }

  if (!Object.keys(files).length) {
    throw new Error(`Missing build artifacts for "${pkg.name}". Run the package build before loading the tutorial.`)
  }

  return files
}

function readSourceFiles(pkg: VendoredPackage): TutorialSnapshot {
  const files: TutorialSnapshot = {}

  for (const [modulePath, contents] of Object.entries(packageSourceModules)) {
    const marker = `/packages/${pkg.dir}/src/`
    const index = modulePath.indexOf(marker)

    if (index === -1) {
      continue
    }

    files[`${pkg.folder}/src/${modulePath.slice(index + marker.length)}`] = contents
  }

  return files
}
