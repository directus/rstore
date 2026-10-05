/**
 * Serves the E5 test page for the manual IME matrix on the local network:
 * `node e2e/manual-page.mjs`, then open `http://<this machine>:5179/?manual`
 * on the device (see `plans/multiplayer-package/04b-ime-manual-matrix.md`).
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
import globalSetup, { pageDir } from './globalSetup.ts'

const port = Number(process.env.PORT ?? 5179)
globalSetup().then(() => {
  createServer((request, response) => {
    const file = request.url?.startsWith('/main.js') ? 'main.js' : 'index.html'
    response.setHeader('content-type', file === 'main.js' ? 'text/javascript' : 'text/html; charset=utf-8')
    response.end(readFileSync(join(pageDir, file)))
  }).listen(port, '0.0.0.0', () => {
    process.stdout.write(`E5 manual page: http://<this machine's LAN address>:${port}/?manual\n`)
  })
})
