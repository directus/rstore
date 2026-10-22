import process from 'node:process'
import { defineDevframe } from 'devframe'
import { createMcpServer } from 'devframe/adapters/mcp'
import { publicRpcDefinitions } from '../agent/catalog'
import { openRelayRpc } from '../node/rpc'

/** Official stdio adapter forwards public calls to authenticated running relay. */
export async function startConnectedStdio(options: { baseURL: string, authToken: string }) {
  const connection = await openRelayRpc(options)
  try {
    const definition = defineDevframe({
      id: 'rstore-stdio',
      name: 'RStore connected MCP',
      packageName: '@rstore/devtools',
      version: '0.0.0',
      homepage: 'https://rstore.dev',
      description: 'MCP bridge for explicitly connected RStore producers.',
      importMetaUrl: import.meta.url,
      capabilities: { build: false, dev: false },
      setup(context) {
        for (const handler of publicRpcDefinitions((method, input) => connection.rpc.$call(method, input)))
          context.rpc.register(handler)
      },
    })
    const server = await createMcpServer(definition, { transport: 'stdio', exposeSharedState: false })
    let stopped = false
    const handle = {
      /** Release transport and remote viewer connection once. */
      async close() {
        if (stopped)
          return
        stopped = true
        process.stdin.off('end', onInputEnd)
        try {
          await server.stop()
        }
        finally {
          connection.close()
        }
      },
    }
    /** EOF owns same cleanup as explicit stop; SDK closes transport only. */
    function onInputEnd() {
      void handle.close().catch((error) => {
        console.error(error instanceof Error ? error.message : 'Devtools shutdown failed')
        process.exitCode = 1
      })
    }
    process.stdin.once('end', onInputEnd)
    // EOF may arrive while asynchronous relay/MCP setup is completing.
    if (process.stdin.readableEnded)
      onInputEnd()
    return handle
  }
  catch (error) {
    connection.close()
    throw error
  }
}
