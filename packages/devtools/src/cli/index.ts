#!/usr/bin/env node
import type { CliEnvironment } from './options'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createCac } from 'devframe/adapters/cac'
import { createRstoreDevframe } from '../devframe/definition'
import { startCliDev } from './dev'
import { cliCredentials, stdioOptions } from './options'
import { ownCliShutdown } from './shutdown'
import { startConnectedStdio } from './stdio'

/** Assemble official CAC shell while replacing actions that need rstore ownership. */
export async function runCli(argv = process.argv, environment: CliEnvironment = process.env) {
  const credentials = cliCredentials(environment)
  const definition = createRstoreDevframe({ basePath: '/', authTokens: credentials.authTokens })
  let owned: ReturnType<typeof ownCliShutdown> | undefined
  const handle = createCac(definition, {
    mcp: false,
    configureCli(cli) {
      const dev = cli.commands.find(command => command.isDefaultCommand)!
      dev.option('--base <base>', 'Inspector and discovery base path (default /)')
      dev.action(async (args: string[], flags: Record<string, unknown>) => {
        if (args.length && (args.length !== 1 || args[0] !== 'dev'))
          throw new TypeError('Unsupported command; static build reports are unavailable')
        // CAC's negated --no-open sets open=true by default. Opening requires
        // explicit positive flag; negative flag always wins, regardless of order.
        const open = argv.slice(2).includes('--open') && !argv.slice(2).includes('--no-open')
        const server = await startCliDev({ ...flags, open }, environment)
        owned = ownCliShutdown(server.close)
      })
      const mcp = cli.commands.find(command => command.name === 'mcp')!
      mcp.option('--connect <relay-base-url>', 'Connect running relay using RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN')
      mcp.action(async (flags: Record<string, unknown>) => {
        const server = await startConnectedStdio(stdioOptions(flags.connect, environment))
        owned = ownCliShutdown(server.close)
      })
    },
  })
  try {
    await handle.parse(argv)
    return { close: () => owned?.stop() ?? Promise.resolve() }
  }
  catch (error) {
    await owned?.stop()
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Devtools command failed')
    process.exitCode = 1
  })
}
