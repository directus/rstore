import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

/** Load real CLI source, then release loader handles before command starts. */
async function run() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    cacheDir: process.env.RSTORE_CLI_TEST_CACHE,
    server: { middlewareMode: true, watch: null },
    resolve: {
      alias: ['core', 'shared'].map(name => ({
        find: new RegExp(`^@rstore/${name}$`),
        replacement: `${root}/packages/${name}/src/index.ts`,
      })),
    },
  })
  try {
    const { runCli } = await server.ssrLoadModule('/packages/devtools/src/cli/index.ts')
    await server.close()
    await runCli(['node', 'rstore-devtools', ...process.argv.slice(2)])
  }
  finally {
    await server.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
