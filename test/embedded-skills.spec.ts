import { execFile as execFileCallback } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'

const SYNC_DEP_SKILLS_SCRIPT = 'node ../../scripts/sync-dep-skills.mjs .'
const SYNC_SKILLS_SCRIPT = 'node scripts/sync-dep-skills.mjs packages/vue packages/nuxt packages/nuxt-drizzle packages/directus packages/vite-directus packages/monospace packages/vite-monospace packages/nuxt-monospace'
const execFile = promisify(execFileCallback)

interface EmbeddedSkillPackage {
  /** Skill folders copied from dependency packages. */
  dependencySkillNames?: string[]
  /** Package directory relative to the repository root. */
  packageDir: string
  /** Skill folder owned and tracked by this package. */
  skillName: string
}

interface PackageJson {
  /** Published file allowlist. */
  files?: string[]
  /** Package name. */
  name?: string
  /** Rstore package metadata. */
  rstore?: {
    /** Packages whose embedded skills should be copied into this package. */
    skillDependencies?: string[]
  }
  /** Package scripts. */
  scripts?: Record<string, string>
}

const embeddedSkillPackages: EmbeddedSkillPackage[] = [
  { packageDir: 'packages/vue', skillName: 'rstore-vue' },
  { dependencySkillNames: ['rstore-vue'], packageDir: 'packages/nuxt', skillName: 'rstore-nuxt' },
  { dependencySkillNames: ['rstore-nuxt', 'rstore-vue'], packageDir: 'packages/nuxt-drizzle', skillName: 'rstore-nuxt-drizzle' },
  { packageDir: 'packages/directus', skillName: 'rstore-directus' },
  { dependencySkillNames: ['rstore-directus', 'rstore-vue'], packageDir: 'packages/vite-directus', skillName: 'rstore-vite-directus' },
  { packageDir: 'packages/monospace', skillName: 'rstore-monospace' },
  { dependencySkillNames: ['rstore-monospace', 'rstore-vue'], packageDir: 'packages/vite-monospace', skillName: 'rstore-vite-monospace' },
  { dependencySkillNames: ['rstore-monospace', 'rstore-nuxt', 'rstore-vue'], packageDir: 'packages/nuxt-monospace', skillName: 'rstore-nuxt-monospace' },
]

const sourceSkillPackages = new Map(embeddedSkillPackages.map(({ packageDir, skillName }) => [skillName, packageDir]))

describe('embedded package skills', () => {
  beforeAll(async () => {
    await syncEmbeddedSkills()
  })

  it('syncs all packages that publish embedded skills', async () => {
    const packageJson = await readPackageJson('.')

    expect(packageJson.scripts?.['sync-skills']).toBe(SYNC_SKILLS_SCRIPT)
  })

  it.each(embeddedSkillPackages)('$packageDir publishes and syncs $skillName', async ({ dependencySkillNames = [], packageDir, skillName }) => {
    const packageJson = await readPackageJson(packageDir)
    const gitignore = await readText(packageDir, 'skills/.gitignore')
    const npmignore = await readText(packageDir, 'skills/.npmignore')
    const skill = await readText(packageDir, `skills/${skillName}/SKILL.md`)
    const expectedSkillDependencies = await Promise.all(dependencySkillNames.map(readPackageNameForSkill))

    expect(packageJson.files).toContain('skills')
    expect(packageJson.scripts?.prepack).toBe(SYNC_DEP_SKILLS_SCRIPT)
    expect(packageJson.rstore?.skillDependencies ?? []).toEqual(expectedSkillDependencies)
    expect(gitignore).toContain('!.gitignore')
    expect(gitignore).toContain('!.npmignore')
    expect(gitignore).toContain(`!${skillName}`)
    expect(gitignore).toContain(`!${skillName}/**`)
    expect(npmignore).toContain('generated dependency skills')
    expect(skill).toContain(`name: ${skillName}`)

    for (const dependencySkillName of dependencySkillNames) {
      await expectDependencySkillCopy(packageDir, dependencySkillName)
    }
  })
})

/**
 * Synchronizes dependency skills into each package's ignored skills folder.
 */
async function syncEmbeddedSkills(): Promise<void> {
  await execFile('node', ['scripts/sync-dep-skills.mjs', ...embeddedSkillPackages.map(({ packageDir }) => packageDir)], {
    cwd: process.cwd(),
  })
}

/**
 * Reads a package manifest from a workspace package directory.
 */
async function readPackageJson(packageDir: string): Promise<PackageJson> {
  return JSON.parse(await readText(packageDir, 'package.json'))
}

/**
 * Reads the package name that owns a source skill.
 */
async function readPackageNameForSkill(skillName: string): Promise<string> {
  const sourcePackageDir = sourceSkillPackages.get(skillName)
  expect(sourcePackageDir).toBeTruthy()

  const packageJson = await readPackageJson(sourcePackageDir!)
  expect(packageJson.name).toBeTruthy()
  return packageJson.name!
}

/**
 * Verifies a dependency skill copy exactly matches the source skill folder.
 */
async function expectDependencySkillCopy(packageDir: string, skillName: string): Promise<void> {
  const sourcePackageDir = sourceSkillPackages.get(skillName)
  expect(sourcePackageDir).toBeTruthy()

  const sourceDir = join(sourcePackageDir!, 'skills', skillName)
  const copyDir = join(packageDir, 'skills', skillName)
  const sourceFiles = await listFiles(sourceDir)
  const copyFiles = await listFiles(copyDir)

  expect(copyFiles).toEqual(sourceFiles)

  for (const file of sourceFiles) {
    const source = await readText(sourceDir, file)
    const copy = await readText(copyDir, file)
    expect(copy).toBe(source)
  }
}

/**
 * Recursively lists files relative to a directory.
 */
async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(process.cwd(), dir, prefix), { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = join(prefix, entry.name)
    if (entry.isDirectory()) {
      return await listFiles(dir, relativePath)
    }
    return [relativePath]
  }))

  return files.flat().sort()
}

/**
 * Reads a UTF-8 file relative to the repository root.
 */
async function readText(...segments: string[]): Promise<string> {
  return await readFile(join(process.cwd(), ...segments), 'utf8')
}
