import type { RoleTokens } from '../devframe/options'
import { producerBaseURL } from '../devframe/paths'

/** Credential sources never appear as command-line flags or log output. */
export interface CliEnvironment {
  /** HTTP MCP bearer, deliberately distinct from RPC credentials. */
  DEVFRAME_MCP_AUTH_TOKEN?: string
  /** Explicit viewer credential used by connected stdio bridge. */
  RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN?: string
  /** Explicit Node producer credential. */
  RSTORE_DEVTOOLS_NODE_AUTH_TOKEN?: string
  /** Explicit browser producer credential. */
  RSTORE_DEVTOOLS_BROWSER_AUTH_TOKEN?: string
  /** Private SSR producer credential. */
  RSTORE_DEVTOOLS_SSR_AUTH_TOKEN?: string
}

/** Parse listen port without treating malformed values as default ports. */
export function cliPort(input: unknown): number {
  const port = input === undefined ? 9999 : Number(input)
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new TypeError('Expected port between 0 and 65535')
  return port
}

/** Build explicit disjoint roles and reject accidental MCP/producer token reuse. */
export function cliCredentials(environment: CliEnvironment): { authTokens: RoleTokens, mcpAuthToken?: string } {
  const authTokens: RoleTokens = {}
  const pairs = [
    ['viewer', environment.RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN],
    ['node', environment.RSTORE_DEVTOOLS_NODE_AUTH_TOKEN],
    ['browser', environment.RSTORE_DEVTOOLS_BROWSER_AUTH_TOKEN],
    ['ssr', environment.RSTORE_DEVTOOLS_SSR_AUTH_TOKEN],
  ] as const
  const used = new Set<string>()
  for (const [role, token] of pairs) {
    if (token === undefined)
      continue
    if (!token || used.has(token))
      throw new TypeError('Devtools role credentials must be nonempty and distinct')
    used.add(token)
    authTokens[role] = [token]
  }
  const mcpAuthToken = environment.DEVFRAME_MCP_AUTH_TOKEN
  if (mcpAuthToken !== undefined && (!mcpAuthToken || used.has(mcpAuthToken)))
    throw new TypeError('HTTP MCP credential must be nonempty and distinct from RPC credentials')
  return { authTokens, mcpAuthToken }
}

/** StdIO bridge cannot silently start against an empty local producer registry. */
export function stdioOptions(connect: unknown, environment: CliEnvironment) {
  if (typeof connect !== 'string' || !connect)
    throw new TypeError('mcp requires --connect <relay-base-url>')
  const baseURL = producerBaseURL(connect).href
  const authToken = environment.RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN
  if (!authToken)
    throw new TypeError('mcp requires RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN')
  cliCredentials(environment)
  return { baseURL, authToken }
}
