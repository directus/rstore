import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, createServer, preview } from 'vite'
import { describe, expect, it } from 'vitest'
import { openRelayRpc } from '../src/node/rpc'
import { configureDevtoolsServer, rstoreDevtools } from '../src/vite'

/** Real Vite requests detect wrong mount paths, asset fallback, and exposed credentials. */
describe('vite devtools host', () => {
  it('serves custom-base inspector and discovery without swallowing application or missing assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rstore-vite-host-'))
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    try {
      const clientDir = join(root, 'client')
      await mkdir(join(clientDir, 'assets'), { recursive: true })
      await writeFile(join(root, 'index.html'), '<h1>application</h1>')
      await writeFile(join(clientDir, 'index.html'), '<h1>inspector</h1>')
      await writeFile(join(clientDir, 'assets', 'client.js'), 'console.log("inspector")')
      server = await createServer({
        configFile: false,
        root,
        base: '/app/',
        server: { host: '127.0.0.1', port: 0 },
        plugins: [rstoreDevtools({ base: '/inspect', clientDir })],
      })
      await server.listen()
      const address = server.httpServer!.address() as { port: number }
      const origin = `http://127.0.0.1:${address.port}`
      const inspector = `${origin}/app/inspect/`
      expect(await (await fetch(inspector)).text()).toContain('inspector')
      expect(await (await fetch(`${origin}/app/`)).text()).toContain('application')
      expect((await fetch(`${inspector}assets/missing.js`)).status).toBe(404)
      expect((await fetch(`${inspector}__unknown`)).status).toBe(404)
      const discovery = await (await fetch(`${inspector}__connection.json`)).json()
      expect(JSON.stringify(discovery)).not.toContain('authToken')
      const bootstrap = await (await fetch(`${inspector}bootstrap.json`)).json()
      expect(bootstrap.baseURL).toBe(inspector)
      expect(bootstrap.authToken).toMatch(/^[a-f0-9]{64}$/)
      expect((await fetch(`${inspector}bootstrap.json`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403)
      await configureDevtoolsServer(server, { base: '/inspect', clientDir })
      const replacement = await (await fetch(`${inspector}bootstrap.json`)).json()
      expect(replacement.authToken).not.toBe(bootstrap.authToken)
      await expect(openRelayRpc({ baseURL: inspector, authToken: bootstrap.authToken })).rejects.toThrow('authentication rejected')
      const client = await openRelayRpc({ baseURL: inspector, authToken: replacement.authToken })
      try {
        expect(await client.rpc.$call('rstore:list-sessions', {})).toEqual([])
      }
      finally {
        client.close()
      }
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('production build and preview exclude inspector routes and asset copies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rstore-vite-preview-'))
    let server: Awaited<ReturnType<typeof preview>> | undefined
    try {
      await writeFile(join(root, 'index.html'), '<h1>production application</h1>')
      const plugins = [rstoreDevtools({ base: '/inspect', clientDir: join(root, 'absent-client') })]
      await build({ configFile: false, root, plugins, logLevel: 'silent' })
      expect(await readdir(join(root, 'dist'))).toEqual(['index.html'])
      server = await preview({ configFile: false, root, plugins, preview: { host: '127.0.0.1', port: 0 } })
      const address = server.httpServer.address() as { port: number }
      const html = await (await fetch(`http://127.0.0.1:${address.port}/inspect/`)).text()
      expect(html).toContain('production application')
      expect(html).not.toContain('inspector')
      const metadata = await (await fetch(`http://127.0.0.1:${address.port}/inspect/__connection.json`)).text()
      expect(() => JSON.parse(metadata)).toThrow()
    }
    finally {
      await new Promise<void>((resolve, reject) => server ? server.httpServer.close(error => error ? reject(error) : resolve()) : resolve())
      await rm(root, { recursive: true, force: true })
    }
  })
})
