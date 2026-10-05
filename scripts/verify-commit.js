// @ts-check
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import pico from 'picocolors'

// Linked worktrees store commit messages in their separate Git directory.
const msgPath = path.resolve(execFileSync('git', ['rev-parse', '--git-path', 'COMMIT_EDITMSG'], { encoding: 'utf-8' }).trim())
const msg = readFileSync(msgPath, 'utf-8').trim()

const commitRE
  = /^(?:revert: )?(?:feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(?:\(.+\))?: .{1,50}/
const versionRE = /^v\d+\.\d+\.\d+$/

if (!commitRE.test(msg) && !versionRE.test(msg)) {
  console.log()
  console.error(
    `  ${pico.white(pico.bgRed(' ERROR '))} ${pico.red(
      `invalid commit message format.`,
    )}\n\n${
      pico.red(
        `  Proper commit message format is required for automated changelog generation. Examples:\n\n`,
      )
    }    ${pico.green(`feat(compiler): add 'comments' option`)}\n`
    + `    ${pico.green(
      `fix(v-model): handle events on blur (close #28)`,
    )}\n\n${
      pico.red(`  See .github/commit-convention.md for more details.\n`)}`,
  )
  process.exit(1)
}
