#!/usr/bin/env node

/* eslint-disable no-console */

// Copies `skills/<skill-name>/` folders from every transitive `@rstore/*`
// workspace dependency into the target package's `skills/` folder.
//
// Rationale: skills-npm (https://github.com/antfu/skills-npm) scans the
// consumer project's top-level `node_modules` for packages that ship a
// `skills/` directory. It does NOT walk transitive deps. So a consumer
// that only installs `@rstore/nuxt-drizzle` must find every relevant
// skill directly under `@rstore/nuxt-drizzle/skills/`. This script
// materializes that layout by copying skills from dep packages at
// publish time (via `prepack`).

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const WORKSPACE_SCOPE = '@rstore/'

/**
 * Read and parse a JSON file.
 * @param {string} filePath
 * @returns {Promise<any>}
 */
async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

/**
 * Resolve a workspace-dep package directory by following the pnpm/npm
 * symlink inside `<pkgDir>/node_modules/<depName>` to its real path.
 * Returns null if the dep is not installed.
 * @param {string} depName
 * @param {string} fromDir
 * @returns {Promise<string | null>}
 */
async function resolveDepDir(depName, fromDir) {
  const linkPath = path.join(fromDir, 'node_modules', ...depName.split('/'))
  try {
    return await fs.realpath(linkPath)
  }
  catch {
    return null
  }
}

/**
 * Walk the dependency graph starting from `pkgDir`, collecting every
 * `@rstore/*` package reachable through `dependencies`.
 * @param {string} pkgDir
 * @param {Map<string, string>} out name -> absolute package dir
 * @returns {Promise<Map<string, string>>}
 */
async function collectRstoreDeps(pkgDir, out = new Map()) {
  const pkg = await readJson(path.join(pkgDir, 'package.json'))
  if (out.has(pkg.name))
    return out
  out.set(pkg.name, pkgDir)

  const deps = Object.keys(pkg.dependencies || {})
  for (const depName of deps) {
    if (!depName.startsWith(WORKSPACE_SCOPE))
      continue
    const depDir = await resolveDepDir(depName, pkgDir)
    if (!depDir)
      continue
    await collectRstoreDeps(depDir, out)
  }
  return out
}

/**
 * Copy each subdirectory of `srcSkillsDir` into `dstSkillsDir`, replacing
 * any existing target folder with the same name.
 * @param {string} srcSkillsDir
 * @param {string} dstSkillsDir
 * @returns {Promise<string[]>} list of copied skill names
 */
async function copySkillFolders(srcSkillsDir, dstSkillsDir) {
  let entries
  try {
    entries = await fs.readdir(srcSkillsDir, { withFileTypes: true })
  }
  catch {
    return []
  }

  await fs.mkdir(dstSkillsDir, { recursive: true })
  const copied = []
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue
    // Skip skills-npm-managed folders; they're gitignored and
    // regenerated per-consumer.
    if (entry.name.startsWith('npm-'))
      continue
    const src = path.join(srcSkillsDir, entry.name)
    const dst = path.join(dstSkillsDir, entry.name)
    await fs.rm(dst, { recursive: true, force: true })
    await fs.cp(src, dst, { recursive: true })
    copied.push(entry.name)
  }
  return copied
}

/**
 * Sync skills from every transitive `@rstore/*` workspace dep into
 * `<targetDir>/skills/`. Skills owned by the target package itself are
 * left untouched.
 * @param {string} targetDir
 */
async function syncDepSkills(targetDir) {
  const targetPkgPath = path.join(targetDir, 'package.json')
  const targetPkg = await readJson(targetPkgPath)
  const targetSkillsDir = path.join(targetDir, 'skills')

  // Find the target package's own skill folder names so we never
  // clobber them.
  const ownSkillNames = new Set()
  try {
    const ownEntries = await fs.readdir(targetSkillsDir, { withFileTypes: true })
    for (const e of ownEntries) {
      if (!e.isDirectory() || e.name.startsWith('npm-'))
        continue
      const skillPkgMatches = await isOwnSkill(path.join(targetSkillsDir, e.name), targetPkg.name)
      if (skillPkgMatches)
        ownSkillNames.add(e.name)
    }
  }
  catch {
    // no skills dir yet — fine
  }

  const depsMap = await collectRstoreDeps(targetDir)
  const totals = []
  for (const [depName, depDir] of depsMap) {
    if (depName === targetPkg.name)
      continue
    const depSkillsDir = path.join(depDir, 'skills')
    const copied = await copySkillFolders(depSkillsDir, targetSkillsDir)
    // Do not overwrite own skills (belt-and-suspenders; `collectRstoreDeps`
    // already excludes the target, but a dep could ship a skill that
    // collides by name).
    for (const name of copied) {
      if (ownSkillNames.has(name)) {
        // Restore: remove the foreign copy we just wrote.
        await fs.rm(path.join(targetSkillsDir, name), { recursive: true, force: true })
        continue
      }
      totals.push(`${depName} -> ${name}`)
    }
  }

  if (totals.length === 0)
    console.log(`[sync-dep-skills] ${targetPkg.name}: no dep skills to sync`)
  else
    console.log(`[sync-dep-skills] ${targetPkg.name}: synced\n  - ${totals.join('\n  - ')}`)
}

/**
 * Heuristic: treat a skill folder as "owned" by the package if the
 * folder name contains the unscoped package name. Used so that if two
 * packages in the graph ship skills with the same folder name, the
 * target package's copy always wins.
 * @param {string} _skillDir
 * @param {string} pkgName
 * @returns {Promise<boolean>}
 */
async function isOwnSkill(_skillDir, pkgName) {
  const unscoped = pkgName.replace(/^@[^/]+\//, '')
  const folderName = path.basename(_skillDir)
  return folderName.includes(unscoped)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: sync-dep-skills.mjs <target-pkg-dir> [<target-pkg-dir> ...]')
    process.exit(1)
  }
  for (const arg of args) {
    const abs = path.resolve(arg)
    await syncDepSkills(abs)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
