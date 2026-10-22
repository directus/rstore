import type { DevframeNodeContext, DevframeNodeRpcSession } from 'devframe'
import type { DevframeAuthHandler } from 'devframe/node/auth'
import type { ProducerRole, RoleTokens } from './options'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { DevtoolsError } from '../protocol'

/** Lazy auth adapter initializes against exactly one Devframe server context. */
export function createRoleAuth(tokens: RoleTokens = {}) {
  const roles = new Map<string, ProducerRole>()
  for (const [role, values] of Object.entries(tokens)) {
    for (const token of values ?? []) {
      if (!token || roles.has(token))
        throw new TypeError('Devtools role credentials must be nonempty and distinct')
      roles.set(token, role as ProducerRole)
    }
  }
  let interactive: DevframeAuthHandler | undefined
  /** Resolve trusted authority from authenticated server session state. */
  function role(session?: DevframeNodeRpcSession): ProducerRole | undefined {
    if (!session?.meta.isTrusted)
      return undefined
    return roles.get(session.meta.clientAuthToken ?? '') ?? 'viewer'
  }
  /** Default-deny every private producer RPC unless role token was authenticated. */
  function authorize(name: string, session: DevframeNodeRpcSession): boolean {
    if (!interactive?.authorize(name, session))
      return false
    // Registration returns a plain structured denial, preserving codes across
    // upstream Error serialization; trusted viewers still gain no authority.
    if (name === 'rstore:producer-register')
      return true
    if (name.startsWith('rstore:producer-'))
      return role(session) !== undefined && role(session) !== 'viewer'
    return true
  }
  const handler: DevframeAuthHandler = {
    get rpcFunctions() { return interactive?.rpcFunctions ?? [] },
    authorize,
    onConnect: (connection, session) => interactive?.onConnect(connection, session),
    printBanner: () => interactive?.printBanner(),
    buildOpenUrl: url => interactive?.buildOpenUrl?.(url) ?? url,
  }
  return {
    handler,
    role,
    /** Prevent unrelated bearer paths from acquiring interactive producer authority. */
    rejectCredential(token: string) {
      if (!token || roles.has(token))
        throw new TypeError('HTTP MCP credential must be nonempty and distinct from interactive roles')
    },
    /** Initialize once during definition setup, before transport becomes reachable. */
    initialize(context: DevframeNodeContext) {
      interactive = createInteractiveAuth(context, { clientAuthTokens: [...roles.keys()] })
    },
    /** Private handlers also guard direct local calls, not only wire resolver. */
    requireProducer(session?: DevframeNodeRpcSession) {
      const value = role(session)
      if (!value || value === 'viewer')
        throw new DevtoolsError({ code: 'READ_ONLY', message: 'Authenticated producer role required' })
      return value
    },
  }
}
