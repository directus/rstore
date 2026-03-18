import { existsSync } from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const workspaceRoot = '/home/tutorial'
const entryCandidates = [
  `${workspaceRoot}/node_modules/typescript-language-server/lib/cli.mjs`,
  `${workspaceRoot}/node_modules/.bin/typescript-language-server`,
]
const entry = entryCandidates.find(location => existsSync(location)) ?? entryCandidates[0]

process.argv[1] = 'typescript-language-server'
await import(pathToFileURL(entry).href)
