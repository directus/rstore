import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

/** Start Vite without writing temporary config modules beside shared dependencies. */
export async function startServer() {
  const server = await createServer({
    configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
    configLoader: 'runner',
    // Keep machine-readable Playwright reporters free of optimizer progress logs.
    logLevel: 'warn',
  })
  try {
    await server.listen()
    return server
  }
  catch (error) {
    await server.close()
    throw error
  }
}
