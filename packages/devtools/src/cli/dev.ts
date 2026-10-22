import type { CliEnvironment } from './options'
import { createServer } from 'node:http'
import { open } from 'devframe/utils/open'
import { createRstoreDevframe } from '../devframe/definition'
import { createRstoreDevframeHost } from '../devframe/host'
import { normalizeRstoreBase } from '../devframe/paths'
import { cliCredentials, cliPort } from './options'

/** Standalone uses safe host wrapper; CAC's --no-auth never bypasses role checks. */
export async function startCliDev(flags: Record<string, unknown>, environment: CliEnvironment) {
  if (flags.auth === false)
    throw new TypeError('Disabling devtools authentication is unsupported')
  if (flags.mcp === true && !environment.DEVFRAME_MCP_AUTH_TOKEN)
    throw new TypeError('HTTP MCP requires DEVFRAME_MCP_AUTH_TOKEN')
  const base = normalizeRstoreBase(typeof flags.base === 'string' ? flags.base : '/')
  const host = typeof flags.host === 'string' ? flags.host : '127.0.0.1'
  const port = cliPort(flags.port)
  const credentials = cliCredentials(environment)
  const definition = createRstoreDevframe({ basePath: base, authTokens: credentials.authTokens })
  const server = createServer()
  const instance = createRstoreDevframeHost(definition, {
    base,
    server,
    host,
    mcp: flags.mcp !== false && Boolean(credentials.mcpAuthToken),
    mcpAuthToken: credentials.mcpAuthToken,
    register: true,
  })
  server.on('request', instance.nodeMiddleware)
  try {
    await instance.ready
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Devtools listen port unavailable')
    const origin = `http://${host.includes(':') ? `[${host}]` : host}:${address.port}`
    const meta = await instance.connectionMeta()
    console.error(`RStore Devtools ${origin}${base}`)
    if (meta.mcp)
      console.error(`HTTP MCP ${new URL(meta.mcp.path, `${origin}${base}`).href}`)
    else if (!credentials.mcpAuthToken)
      console.error('HTTP MCP disabled; set DEVFRAME_MCP_AUTH_TOKEN to enable.')
    if (flags.open) {
      const target = definition.relay.auth.buildOpenUrl?.(`${origin}${base}`) ?? `${origin}${base}`
      try {
        await open(target)
      }
      catch {
        console.error('Browser could not open; use inspector URL.')
      }
    }
    let stopped = false
    return {
      /** Close only CLI-owned relay instance and listen server. */
      async close() {
        if (stopped)
          return
        stopped = true
        try {
          await instance.close()
        }
        finally {
          await new Promise<void>(resolve => server.close(() => resolve()))
        }
      },
    }
  }
  catch (error) {
    await instance.close()
    server.close()
    throw error
  }
}
