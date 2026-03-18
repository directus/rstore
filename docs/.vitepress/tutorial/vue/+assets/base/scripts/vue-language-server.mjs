import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)
const { createParsedCommandLine, createParsedCommandLineByJson, createVueLanguagePlugin } = requireFrom('@vue/language-core', ['@vue/language-server'])
const { createVueLanguageServicePlugins } = requireFrom('@vue/language-service', ['@vue/language-server'])
const { createConnection, createServer } = requireFrom('@volar/language-server/node', ['@vue/language-server'])
const { createTypeScriptProject } = requireFrom('@volar/language-server/lib/project/typescriptProject', ['@vue/language-server'])
const tsSemantic = requireFrom('volar-service-typescript/lib/plugins/semantic', ['@vue/language-service', '@vue/language-server'])

let ts
for (const arg of process.argv) {
  if (arg.startsWith('--tsdk=')) {
    const tsdk = arg.slice('--tsdk='.length)
    const tsPath = require.resolve('./typescript.js', { paths: [tsdk] })
    ts = require(tsPath)
    break
  }
}
ts ??= require('typescript')

const connection = createConnection()
const server = createServer(connection)
const tsserverRequestHandlers = new Map()
let tsserverRequestId = 0

connection.listen()
connection.onNotification('tsserver/response', ([id, res]) => {
  tsserverRequestHandlers.get(id)?.(res)
  tsserverRequestHandlers.delete(id)
})

connection.onInitialize((params) => {
  const result = server.initialize(
    params,
    createTypeScriptProject(ts, undefined, ({ configFileName, projectHost, sys, uriConverter }) => {
      const commandLine = configFileName && !ts.server.isInferredProjectName(configFileName)
        ? createParsedCommandLine(ts, sys, configFileName)
        : createParsedCommandLineByJson(ts, sys, projectHost.getCurrentDirectory(), {})

      return {
        languagePlugins: [
          createVueLanguagePlugin(
            ts,
            commandLine.options,
            commandLine.vueOptions,
            uri => uriConverter.asFileName(uri),
          ),
        ],
      }
    }),
    createPlugins(),
  )

  const packageJson = require('@vue/language-server/package.json')
  result.serverInfo = {
    name: packageJson.name,
    version: packageJson.version,
  }
  return result
})

connection.onInitialized(server.initialized)
connection.onShutdown(server.shutdown)

function createPlugins() {
  const client = {
    collectExtractProps(...args) {
      return sendTsServerRequest('_vue:collectExtractProps', args)
    },
    getComponentDirectives(...args) {
      return sendTsServerRequest('_vue:getComponentDirectives', args)
    },
    getComponentNames(...args) {
      return sendTsServerRequest('_vue:getComponentNames', args)
    },
    getComponentMeta(...args) {
      return sendTsServerRequest('_vue:getComponentMeta', args)
    },
    getComponentSlots(...args) {
      return sendTsServerRequest('_vue:getComponentSlots', args)
    },
    getElementAttrs(...args) {
      return sendTsServerRequest('_vue:getElementAttrs', args)
    },
    getElementNames(...args) {
      return sendTsServerRequest('_vue:getElementNames', args)
    },
    getImportPathForFile(...args) {
      return sendTsServerRequest('_vue:getImportPathForFile', args)
    },
    getAutoImportSuggestions(...args) {
      return sendTsServerRequest('_vue:getAutoImportSuggestions', args)
    },
    resolveAutoImportCompletionEntry(...args) {
      return sendTsServerRequest('_vue:resolveAutoImportCompletionEntry', args)
    },
    isRefAtPosition(...args) {
      return sendTsServerRequest('_vue:isRefAtPosition', args)
    },
    resolveModuleName(...args) {
      return sendTsServerRequest('_vue:resolveModuleName', args)
    },
    getDocumentHighlights(fileName, position) {
      return sendTsServerRequest('_vue:documentHighlights-full', {
        file: fileName,
        position,
        filesToSearch: [fileName],
      })
    },
    getEncodedSemanticClassifications(fileName, span) {
      return sendTsServerRequest('_vue:encodedSemanticClassifications-full', {
        file: fileName,
        ...span,
        format: ts.SemanticClassificationFormat.TwentyTwenty,
      })
    },
    async getQuickInfoAtPosition(fileName, { line, character }) {
      const result = await sendTsServerRequest(`_vue:${ts.server.protocol.CommandTypes.Quickinfo}`, {
        file: fileName,
        line: line + 1,
        offset: character + 1,
      })
      return result?.displayString
    },
  }

  const plugins = createVueLanguageServicePlugins(ts, client)
  plugins.splice(14, 0, tsSemantic.create(ts))
  return plugins
}

async function sendTsServerRequest(command, args) {
  return await new Promise((resolve) => {
    const requestId = ++tsserverRequestId
    tsserverRequestHandlers.set(requestId, resolve)
    connection.sendNotification('tsserver/request', [requestId, command, args])
  })
}

function requireFrom(specifier, parentPackages) {
  for (const parentPackage of parentPackages) {
    try {
      const packageRoot = dirname(require.resolve(`${parentPackage}/package.json`))
      return require(require.resolve(specifier, { paths: [packageRoot] }))
    }
    catch {
    }
  }

  return require(specifier)
}
