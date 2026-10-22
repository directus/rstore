import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createCoreStack } from '#test-utils/store/coreStack'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it, onTestFinished } from 'vitest'
import { MCP_TOOL_NAMES, PUBLIC_METHODS } from '../src/agent/catalog'
import { connectRstoreDevtools } from '../src/node'
import { openRelayRpc } from '../src/node/rpc'
import { createRstoreDevtools } from '../src/runtime'
import { startRelay, waitFor } from './utils/relay'

/** Official SDK text result decoding; errors cannot masquerade as empty success. */
function resultData(result: Awaited<ReturnType<Client['callTool']>>) {
  expect(result.isError).not.toBe(true)
  const text = (result.content as Array<{ type: string, text?: string }>).find(block => block.type === 'text')?.text
  expect(text).toBeTypeOf('string')
  return JSON.parse(text!)
}

/** Real Core producer and public-cache fixture; connector replaces external DB only. */
async function producer(host: Awaited<ReturnType<typeof startRelay>>) {
  const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }], data: { items: [{ id: 'keep', title: 'Keep' }] } })
  const runtime = createRstoreDevtools({ kind: 'node' })
  onTestFinished(runtime.dispose)
  const target = runtime.attachStore(stack.store, { id: 'live' }).target
  const readonlyStack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })
  readonlyStack.cache.writeItem({ collection: readonlyStack.collection('items'), key: 'locked', item: { id: 'locked', title: 'Locked' } })
  const readonly = runtime.attachStore(readonlyStack.store, { id: 'readonly', readOnly: true }).target
  const connection = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
  onTestFinished(connection.dispose)
  await connection.ready
  return { stack, target, readonly, readonlyStack }
}

describe('real MCP transports', () => {
  // Boundary: actual SDK, official MCP HTTP adapter, relay, authenticated Node
  // wire, direct Core and actual cache. Two targets make wrong dispatch observable.
  it('serves HTTP catalog and connector writes preserving target, deduplication and read-only denial', async () => {
    const host = await startRelay({ mcp: true })
    onTestFinished(host.close)
    const { stack, target, readonly, readonlyStack } = await producer(host)
    const client = new Client({ name: 'rstore-http-proof', version: '1.0.0' })
    onTestFinished(() => client.close())
    await client.connect(new StreamableHTTPClientTransport(new URL(host.mcpURL!), {
      requestInit: { headers: { Origin: new URL(host.baseURL).origin, Authorization: `Bearer ${host.mcpToken}` } },
    }))
    const tools = (await client.listTools()).tools.filter(tool => tool.name.startsWith('rstore_'))
    expect(tools.map(tool => tool.name).sort()).toEqual(PUBLIC_METHODS.map(method => MCP_TOOL_NAMES[method]).sort())
    expect(tools.find(tool => tool.name === 'rstore_get-cache')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(tools.find(tool => tool.name === 'rstore_delete-item')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    expect(tools.some(tool => tool.name.includes('producer') || tool.name.includes('invoke-module'))).toBe(false)
    const sessions = resultData(await client.callTool({ name: 'rstore_list-sessions', arguments: { arg0: {} } }))
    expect(sessions.map((session: any) => session.sessionId)).toContain(target.sessionId)
    const envelope = { target, action: 'create-item', commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', item: { id: 'chosen', title: 'Created' } }
    const created = resultData(await client.callTool({ name: 'rstore_create-item', arguments: { arg0: envelope } }))
    expect(created.status).toBe('completed')
    resultData(await client.callTool({ name: 'rstore_create-item', arguments: { arg0: envelope } }))
    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.remote.rows('items')).toEqual([{ id: 'keep', title: 'Keep' }, { id: 'chosen', title: 'Created' }])
    resultData(await client.callTool({ name: 'rstore_update-item', arguments: { arg0: { ...envelope, commandId: randomUUID(), action: 'update-item', key: 'chosen', item: { title: 'Changed' } } } }))
    expect(stack.remote.rows('items')).toEqual([{ id: 'keep', title: 'Keep' }, { id: 'chosen', title: 'Changed' }])
    const denied = await client.callTool({ name: 'rstore_clear-cache', arguments: { arg0: { target: readonly, action: 'clear-cache', commandId: randomUUID(), issuedAt: Date.now() } } })
    expect(denied.isError).toBe(true)
    expect(readonlyStack.read('items', 'locked')).toMatchObject({ id: 'locked', title: 'Locked' })
    resultData(await client.callTool({ name: 'rstore_delete-item', arguments: { arg0: { target, commandId: randomUUID(), issuedAt: Date.now(), action: 'delete-item', collection: 'items', key: 'chosen' } } }))
    expect(stack.remote.rows('items')).toEqual([{ id: 'keep', title: 'Keep' }])
    const cacheCommand = { target, commandId: randomUUID(), issuedAt: Date.now(), action: 'write-cache-item', collection: 'items', item: { id: 'cache-only', title: 'Local' } }
    resultData(await client.callTool({ name: 'rstore_write-cache-item', arguments: { arg0: cacheCommand } }))
    expect(stack.read('items', 'cache-only')).toMatchObject({ title: 'Local' })
    expect(stack.remote.rows('items')).toEqual([{ id: 'keep', title: 'Keep' }])
    resultData(await client.callTool({ name: 'rstore_delete-cache-item', arguments: { arg0: { target, commandId: randomUUID(), issuedAt: Date.now(), action: 'delete-cache-item', collection: 'items', key: 'cache-only' } } }))
    expect(stack.read('items', 'cache-only')).toBeUndefined()
  })

  it('requires HTTP bearer; disabled endpoint never exposes actions', async () => {
    const disabled = await startRelay()
    onTestFinished(disabled.close)
    expect((await fetch(new URL('__mcp', disabled.baseURL), { method: 'POST' })).status).toBe(404)
    const host = await startRelay({ mcp: true })
    onTestFinished(host.close)
    // Pinned HTTP adapter requires explicit accepted Origin even for native
    // clients with valid bearer; published SDK setup must send both headers.
    expect((await fetch(host.mcpURL!, { method: 'POST', headers: { 'Authorization': `Bearer ${host.mcpToken}`, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
    await expect(openRelayRpc({ baseURL: host.baseURL, authToken: host.mcpToken })).rejects.toThrow('authentication rejected')
    for (const token of [undefined, 'wrong', host.nodeToken]) {
      const headers: Record<string, string> = { 'Origin': new URL(host.baseURL).origin, 'Content-Type': 'application/json' }
      if (token)
        headers.Authorization = `Bearer ${token}`
      expect((await fetch(host.mcpURL!, { method: 'POST', headers, body: '{}' })).status).toBe(401)
    }
  })

  it('packaged stdio binary forwards real connected producer and keeps stdout protocol-only', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const { stack, target } = await producer(host)
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../dist/cli/index.mjs', import.meta.url)), 'mcp', '--connect', host.baseURL],
      env: { ...process.env, RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN: host.viewerToken } as Record<string, string>,
      stderr: 'pipe',
    })
    const client = new Client({ name: 'rstore-stdio-proof', version: '1.0.0' })
    const transportErrors: Error[] = []
    let stderr = ''
    client.onerror = (error) => {
      transportErrors.push(error)
    }
    transport.stderr?.on('data', (data) => {
      stderr += String(data)
    })
    onTestFinished(() => client.close())
    await client.connect(transport)
    expect(resultData(await client.callTool({ name: 'rstore_list-sessions', arguments: { arg0: {} } })).map((session: any) => session.sessionId)).toContain(target.sessionId)
    resultData(await client.callTool({ name: 'rstore_write-cache-item', arguments: { arg0: { target, action: 'write-cache-item', commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', item: { id: 'stdio', title: 'Written' } } } }))
    expect(stack.read('items', 'stdio')).toMatchObject({ id: 'stdio', title: 'Written' })
    expect(stack.remote.rows('items')).toEqual([{ id: 'keep', title: 'Keep' }])
    expect(transportErrors).toEqual([])
    for (const credential of [host.viewerToken, host.nodeToken, host.mcpToken, host.ssrToken])
      expect(stderr).not.toContain(credential)
    const pid = transport.pid!
    await client.close()
    await waitFor(async () => {
      try {
        process.kill(pid, 0)
        return false
      }
      catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ESRCH'
      }
    })
  })
})
