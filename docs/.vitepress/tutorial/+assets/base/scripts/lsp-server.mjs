import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

const workspaceRoot = '/tutorial'
const workspaceUri = `file://${workspaceRoot}`
const pluginFileTypes = ['vue', 'javascript', 'typescript']
const pluginLocationCandidates = [
  `${workspaceRoot}/node_modules/@vue/language-server`,
  `${workspaceRoot}/node_modules/@vue/typescript-plugin`,
]
const pluginLocation = pluginLocationCandidates.find(location => existsSync(location)) ?? pluginLocationCandidates[pluginLocationCandidates.length - 1]

const languageServer = spawn(process.execPath, [
  './node_modules/@vue/language-server/bin/vue-language-server.js',
  '--stdio',
], {
  stdio: ['pipe', 'pipe', 'pipe'],
})

const typescriptServer = spawn('./node_modules/.bin/typescript-language-server', [
  '--stdio',
], {
  stdio: ['pipe', 'pipe', 'pipe'],
})

const typescriptConnection = createLspClient(typescriptServer, {
  onNotification() {},
  onRequest() {
    return null
  },
})
const languageServerConnection = createLspClient(languageServer, {
  onNotification(message) {
    if (message.method === 'tsserver/request') {
      void forwardTypeScriptRequest(message.params)
      return
    }

    writeBrowserMessage({
      method: message.method,
      params: message.params,
    })
  },
  async onRequest(message) {
    switch (message.method) {
      case 'workspace/configuration':
        return (message.params?.items ?? []).map(() => null)
      case 'client/registerCapability':
      case 'client/unregisterCapability':
      case 'window/workDoneProgress/create':
        return null
      default:
        return null
    }
  },
})

let browserInitializeParams = null
let typescriptInitialization = null
let stdinBuffer = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk
  let newlineIndex = stdinBuffer.indexOf('\n')

  while (newlineIndex !== -1) {
    const line = stdinBuffer.slice(0, newlineIndex).trim()
    stdinBuffer = stdinBuffer.slice(newlineIndex + 1)

    if (line) {
      void handleBrowserMessage(JSON.parse(line))
    }

    newlineIndex = stdinBuffer.indexOf('\n')
  }
})

process.stdin.on('end', () => {
  languageServer.kill()
  typescriptServer.kill()
})

languageServer.stderr.on('data', () => {})
typescriptServer.stderr.on('data', () => {})

languageServer.on('exit', () => {
  typescriptServer.kill()
  process.exit()
})

typescriptServer.on('exit', () => {
  languageServer.kill()
  process.exit()
})

async function handleBrowserMessage(message) {
  if (typeof message?.method !== 'string') {
    if (typeof message?.id === 'number') {
      writeBrowserMessage({
        error: {
          message: 'Invalid LSP browser payload.',
        },
        id: message.id,
      })
    }
    return
  }

  try {
    if (typeof message.id === 'number') {
      const result = await handleBrowserRequest(message.method, message.params ?? {})
      writeBrowserMessage({
        id: message.id,
        result,
      })
      return
    }

    await handleBrowserNotification(message.method, message.params ?? {})
  }
  catch (error) {
    if (typeof message.id === 'number') {
      writeBrowserMessage({
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
        id: message.id,
      })
    }
  }
}

async function handleBrowserRequest(method, params) {
  if (method === 'initialize') {
    browserInitializeParams = params
    await ensureTypeScriptInitialized()
  }

  return languageServerConnection.request(method, params)
}

async function handleBrowserNotification(method, params) {
  if (
    method === 'textDocument/didOpen'
    || method === 'textDocument/didChange'
    || method === 'textDocument/didClose'
  ) {
    await ensureTypeScriptInitialized()
    typescriptConnection.notify(method, params)
  }

  languageServerConnection.notify(method, params)
}

async function ensureTypeScriptInitialized() {
  if (typescriptInitialization) {
    return typescriptInitialization
  }

  const params = browserInitializeParams ?? {}
  typescriptInitialization = (async () => {
    await typescriptConnection.request('initialize', {
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: false,
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      clientInfo: {
        name: 'rstore-docs-tutorial-ts-bridge',
        version: '1.0.0',
      },
      initializationOptions: {
        hostInfo: 'rstore-docs-tutorial',
        plugins: [
          {
            configNamespace: 'typescript',
            languages: pluginFileTypes,
            location: pluginLocation,
            name: '@vue/typescript-plugin',
          },
        ],
      },
      processId: null,
      rootUri: params.rootUri ?? workspaceUri,
      workspaceFolders: params.workspaceFolders ?? [
        {
          name: 'tutorial',
          uri: workspaceUri,
        },
      ],
    })

    typescriptConnection.notify('initialized', {})
    await typescriptConnection.request('workspace/executeCommand', {
      arguments: [
        '@vue/typescript-plugin',
        {
          languages: pluginFileTypes,
        },
      ],
      command: '_typescript.configurePlugin',
    })
  })()

  return typescriptInitialization
}

async function forwardTypeScriptRequest(params) {
  const [requestId, command, args] = Array.isArray(params) ? params : []

  if (typeof requestId !== 'number' || typeof command !== 'string') {
    return
  }

  let response

  try {
    await ensureTypeScriptInitialized()
    response = await typescriptConnection.request('workspace/executeCommand', {
      arguments: [command, args],
      command: 'typescript.tsserverRequest',
    })
  }
  catch {
    response = null
  }

  const payload = response && typeof response === 'object' && 'body' in response
    ? response.body
    : response

  languageServerConnection.notify('tsserver/response', [[requestId, payload]])
}

function writeBrowserMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function encodeLspMessage(payload) {
  return `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`
}

function createMessageParser(onMessage) {
  let buffer = ''

  return {
    push: (chunk) => {
      buffer += chunk

      while (buffer.length > 0) {
        const headerEnd = buffer.indexOf('\r\n\r\n')

        if (headerEnd === -1) {
          return
        }

        const headerText = buffer.slice(0, headerEnd)
        const match = headerText.match(/Content-Length:\s*(\d+)/i)

        if (!match) {
          throw new TypeError(`Invalid LSP message header: ${headerText}`)
        }

        const contentLength = Number(match[1])
        const bodyStart = headerEnd + 4
        const body = buffer.slice(bodyStart)

        if (Buffer.byteLength(body, 'utf8') < contentLength) {
          return
        }

        let byteCount = 0
        let characterCount = 0
        for (const character of body) {
          byteCount += Buffer.byteLength(character, 'utf8')
          characterCount += character.length

          if (byteCount >= contentLength) {
            break
          }
        }

        const payload = body.slice(0, characterCount)
        onMessage(payload)
        buffer = body.slice(characterCount)
      }
    },
  }
}

function createLspClient(childProcess, hooks) {
  const pending = new Map()
  let nextRequestId = 0
  const parser = createMessageParser((payload) => {
    const message = JSON.parse(payload)

    if (typeof message.id === 'number' && !message.method) {
      const request = pending.get(message.id)
      if (!request) {
        return
      }

      pending.delete(message.id)

      if (message.error) {
        request.reject(new Error(message.error.message ?? 'Language server request failed.'))
        return
      }

      request.resolve(message.result)
      return
    }

    if (typeof message.id === 'number' && typeof message.method === 'string') {
      Promise.resolve(hooks.onRequest(message))
        .then((result) => {
          childProcess.stdin.write(encodeLspMessage(JSON.stringify({
            id: message.id,
            jsonrpc: '2.0',
            result,
          })))
        })
        .catch((error) => {
          childProcess.stdin.write(encodeLspMessage(JSON.stringify({
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : String(error),
            },
            id: message.id,
            jsonrpc: '2.0',
          })))
        })
      return
    }

    if (typeof message.method === 'string') {
      hooks.onNotification(message)
    }
  })

  childProcess.stdout.setEncoding('utf8')
  childProcess.stdout.on('data', chunk => parser.push(chunk))

  return {
    notify(method, params) {
      childProcess.stdin.write(encodeLspMessage(JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
      })))
    },
    request(method, params) {
      const id = nextRequestId++

      childProcess.stdin.write(encodeLspMessage(JSON.stringify({
        id,
        jsonrpc: '2.0',
        method,
        params,
      })))

      return new Promise((resolve, reject) => {
        pending.set(id, { reject, resolve })
      })
    },
  }
}
