import type * as monaco from 'monaco-editor'
import type { TutorialLspTransport } from './tutorialLspProcessTransport'
import type {
  TutorialLspSemanticTokens,
  TutorialLspSemanticTokensEdits,
  TutorialLspSemanticTokensLegend,
} from './tutorialSemanticTokens'
import type { TutorialSnapshot } from './types'
import { getLanguageFromPath, loadMonaco } from './loadMonaco'
import {
  LSP_SEMANTIC_TOKEN_MODIFIERS,
  LSP_SEMANTIC_TOKEN_TYPES,
  toMonacoSemanticTokens,
  toMonacoSemanticTokensEdits,
} from './tutorialSemanticTokens'
import { TUTORIAL_WORKSPACE_ROOT } from './tutorialServerUrls'

type MonacoApi = Awaited<ReturnType<typeof loadMonaco>>
type TextModel = monaco.editor.ITextModel
type MonacoCompletionItem = monaco.languages.CompletionItem & { __lspItem?: LspCompletionItem }

interface ProjectModelState {
  model: TextModel
  version: number
  stopSync: { dispose: () => void }
}

interface LspHover {
  contents?: unknown
  range?: LspRange
}

interface LspCompletionItem {
  additionalTextEdits?: LspTextEdit[]
  data?: unknown
  detail?: string
  documentation?: LspMarkupContent | string
  filterText?: string
  insertText?: string
  insertTextFormat?: number
  kind?: number
  label: string | { label: string }
  sortText?: string
  textEdit?: LspTextEdit | LspInsertReplaceEdit
}

interface LspCompletionList {
  items: LspCompletionItem[]
}

interface LspDiagnostic {
  code?: number | string
  message: string
  range: LspRange
  severity?: number
}

interface LspDocumentDiagnosticReport {
  items?: LspDiagnostic[]
  kind?: 'full' | 'unchanged'
  relatedDocuments?: Record<string, LspDocumentDiagnosticReport>
}

interface LspDefinition {
  targetRange?: LspRange
  targetSelectionRange?: LspRange
  targetUri?: string
  uri?: string
  range?: LspRange
}

interface LspDocumentHighlight {
  kind?: number
  range: LspRange
}

interface LspInitializeResult {
  capabilities?: LspServerCapabilities
}

interface LspInsertReplaceEdit {
  insert: LspRange
  newText: string
  replace: LspRange
}

interface LspMarkupContent {
  kind?: 'markdown' | 'plaintext'
  value: string
}

interface LspMarkedString {
  language: string
  value: string
}

interface LspLocation {
  range: LspRange
  uri: string
}

interface LspDocumentSymbol {
  children?: LspDocumentSymbol[]
  detail?: string
  kind: number
  name: string
  range: LspRange
  selectionRange: LspRange
  tags?: number[]
}

interface LspSymbolInformation {
  containerName?: string
  kind: number
  location: LspLocation
  name: string
  tags?: number[]
}

interface LspInlayHintLabelPart {
  value: string
}

interface LspInlayHint {
  kind?: number
  label: string | LspInlayHintLabelPart[]
  paddingLeft?: boolean
  paddingRight?: boolean
  position: LspPosition
  tooltip?: LspMarkupContent | string
}

interface LspPosition {
  character: number
  line: number
}

interface LspPrepareRenameResult {
  placeholder?: string
  range: LspRange
}

interface LspSemanticTokensProviderCapability {
  full?: boolean | { delta?: boolean }
  legend: TutorialLspSemanticTokensLegend
}

interface LspServerCapabilities {
  diagnosticProvider?: unknown
  semanticTokensProvider?: LspSemanticTokensProviderCapability
}

interface LspRange {
  end: LspPosition
  start: LspPosition
}

interface LspTextDocument {
  languageId: string
  text: string
  uri: string
  version: number
}

interface LspTextEdit {
  newText: string
  range: LspRange
}

interface LspTextDocumentEdit {
  edits: LspTextEdit[]
  textDocument?: {
    uri: string
  }
}

interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>
  documentChanges?: LspTextDocumentEdit[]
}

interface LspParameterInformation {
  documentation?: LspMarkupContent | string
  label: string | [number, number]
}

interface LspSignatureInformation {
  documentation?: LspMarkupContent | string
  label: string
  parameters?: LspParameterInformation[]
}

interface LspSignatureHelp {
  activeParameter?: number
  activeSignature?: number
  signatures: LspSignatureInformation[]
}

interface LspSelectionRange {
  parent?: LspSelectionRange
  range: LspRange
}

type ReadContainerFile = (filePath: string) => Promise<string | null>

const DIAGNOSTIC_OWNER = 'tutorial-lsp'
const COMPLETION_TRIGGER_CHARACTERS = ['.', '"', '\'', '/', '@', '<', ':']
const LANGUAGE_IDS = ['vue', 'typescript', 'javascript'] as const

const projectModels = new Map<string, ProjectModelState>()
const auxiliaryModels = new Map<string, TextModel>()
const diffModels = new Map<string, TextModel>()
const diagnostics = new Map<string, LspDiagnostic[]>()
const diagnosticRefreshTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
const providerDisposables: Array<{ dispose: () => void }> = []
const semanticProviderDisposables: Array<{ dispose: () => void }> = []

let monacoApi: MonacoApi | null = null
let projectSnapshot: TutorialSnapshot = {}
let readContainerFile: ReadContainerFile | null = null
let languageServerTransport: TutorialLspTransport | null = null
let connectionGeneration = 0
let activeConnection: TutorialLspConnection | null = null
let supportsPullDiagnostics = false
let semanticTokensProvider: LspSemanticTokensProviderCapability | null = null

export async function configureTutorialMonacoWorkspace(options: {
  languageServerTransport: TutorialLspTransport | null
  readFile: ReadContainerFile | null
}) {
  languageServerTransport = options.languageServerTransport
  readContainerFile = options.readFile

  if (!languageServerTransport) {
    connectionGeneration += 1
    activeConnection?.dispose()
    activeConnection = null
    supportsPullDiagnostics = false
    semanticTokensProvider = null
    clearScheduledDocumentDiagnostics()
    disposeSemanticTokenProviders()
    clearDiagnostics()
    return
  }

  await ensureTutorialMonacoWorkspace()
  await connectTutorialLanguageServer(languageServerTransport)
}

export async function ensureTutorialMonacoWorkspace() {
  monacoApi ??= await loadMonaco()
  registerLanguageProviders(monacoApi)
  return monacoApi
}

export function updateTutorialWorkspaceSnapshot(snapshot: TutorialSnapshot) {
  projectSnapshot = {
    ...snapshot,
  }

  for (const [uri, state] of projectModels) {
    const filePath = getWorkspaceRelativePath(uri)
    if (!filePath || !(filePath in projectSnapshot)) {
      closeProjectModel(uri)
      continue
    }

    const nextContents = projectSnapshot[filePath] ?? ''
    if (state.model.getValue() !== nextContents) {
      state.model.setValue(nextContents)
    }
  }

  for (const [uri, model] of auxiliaryModels) {
    const filePath = getWorkspaceRelativePath(uri)
    if (!filePath || filePath in projectSnapshot) {
      continue
    }

    clearDiagnostics(uri)
    model.dispose()
    auxiliaryModels.delete(uri)
  }
}

export async function getTutorialProjectModel(filePath: string) {
  const monaco = await ensureTutorialMonacoWorkspace()
  const uri = monaco.Uri.parse(toWorkspaceUri(filePath))
  const key = uri.toString()
  const existing = projectModels.get(key)

  if (existing) {
    const nextContents = projectSnapshot[filePath] ?? ''
    if (existing.model.getValue() !== nextContents) {
      existing.model.setValue(nextContents)
    }
    return existing.model
  }

  const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(
    projectSnapshot[filePath] ?? '',
    getLanguageFromPath(filePath),
    uri,
  )
  const state: ProjectModelState = {
    model,
    version: 1,
    stopSync: model.onDidChangeContent(() => {
      const current = projectModels.get(key)
      if (!current) {
        return
      }

      current.version += 1
      void activeConnection?.didChangeTextDocument(toTextDocument(current.model, current.version))
      scheduleDocumentDiagnostics(key)
    }),
  }

  projectModels.set(key, state)
  applyDiagnostics(key)

  if (activeConnection) {
    await activeConnection.didOpenTextDocument(toTextDocument(model, state.version))
    scheduleDocumentDiagnostics(key, 0)
  }

  return model
}

export async function getTutorialDiffModel(options: {
  contents: string
  filePath: string
  kind: 'project' | 'solution'
  stepId: string
}) {
  const monaco = await ensureTutorialMonacoWorkspace()
  const uri = monaco.Uri.parse(`inmemory:///${options.kind}/${options.stepId}/${options.filePath}`)
  const key = uri.toString()
  let model = diffModels.get(key) ?? monaco.editor.getModel(uri)

  if (!model) {
    model = monaco.editor.createModel(options.contents, getLanguageFromPath(options.filePath), uri)
    diffModels.set(key, model)
  }
  else if (!diffModels.has(key)) {
    diffModels.set(key, model)
  }

  if (model.getValue() !== options.contents) {
    model.setValue(options.contents)
  }

  return model
}

export async function disposeTutorialMonacoWorkspace() {
  connectionGeneration += 1
  activeConnection?.dispose()
  activeConnection = null
  supportsPullDiagnostics = false
  semanticTokensProvider = null
  clearScheduledDocumentDiagnostics()
  disposeSemanticTokenProviders()
  clearDiagnostics()

  for (const provider of providerDisposables.splice(0, providerDisposables.length)) {
    provider.dispose()
  }

  for (const state of projectModels.values()) {
    state.stopSync.dispose()
    state.model.dispose()
  }
  projectModels.clear()

  for (const model of auxiliaryModels.values()) {
    model.dispose()
  }
  auxiliaryModels.clear()

  for (const model of diffModels.values()) {
    model.dispose()
  }
  diffModels.clear()
  diagnostics.clear()
}

async function connectTutorialLanguageServer(transport: TutorialLspTransport) {
  const generation = ++connectionGeneration
  activeConnection?.dispose()
  activeConnection = null
  supportsPullDiagnostics = false
  semanticTokensProvider = null
  clearScheduledDocumentDiagnostics()
  disposeSemanticTokenProviders()
  clearDiagnostics()

  const connection = new TutorialLspConnection(transport)
  activeConnection = connection

  try {
    const initializeResult = await connection.initialize()

    if (generation !== connectionGeneration || activeConnection !== connection) {
      connection.dispose()
      return
    }

    supportsPullDiagnostics = Boolean(initializeResult.capabilities?.diagnosticProvider)
    semanticTokensProvider = initializeResult.capabilities?.semanticTokensProvider ?? null
    registerSemanticTokenProviders()

    for (const [uri, state] of projectModels) {
      await connection.didOpenTextDocument(toTextDocument(state.model, state.version))
      scheduleDocumentDiagnostics(uri, 0)
      applyDiagnostics(uri)
    }
  }
  catch (error) {
    if (generation === connectionGeneration && activeConnection === connection) {
      activeConnection = null
      supportsPullDiagnostics = false
      semanticTokensProvider = null
      clearScheduledDocumentDiagnostics()
      disposeSemanticTokenProviders()
      clearDiagnostics()
    }

    throw error
  }
}

function registerLanguageProviders(monaco: MonacoApi) {
  if (providerDisposables.length > 0) {
    return
  }

  for (const languageId of LANGUAGE_IDS) {
    providerDisposables.push(monaco.languages.registerHoverProvider(languageId, {
      async provideHover(model, position) {
        const hover = await requestTextDocument<LspHover>(model, 'textDocument/hover', {
          position: toLspPosition(position),
        })

        if (!hover?.contents) {
          return null
        }

        return {
          contents: toMonacoHoverContents(hover.contents),
          range: hover.range ? toMonacoRange(hover.range) : undefined,
        }
      },
    }))

    providerDisposables.push(monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS],
      async provideCompletionItems(model, position) {
        const response = await requestTextDocument<LspCompletionItem[] | LspCompletionList>(model, 'textDocument/completion', {
          position: toLspPosition(position),
        })

        const items = Array.isArray(response) ? response : response?.items ?? []

        return {
          suggestions: items.map(item => toMonacoCompletionItem(monaco, model, position, item)),
        }
      },
      async resolveCompletionItem(item) {
        const completionItem = item as MonacoCompletionItem
        const lspItem = completionItem.__lspItem
        if (!lspItem) {
          return item
        }

        const resolved = await activeConnection?.request<LspCompletionItem>('completionItem/resolve', lspItem)
        if (!resolved) {
          return item
        }

        completionItem.detail = resolved.detail ?? completionItem.detail
        completionItem.documentation = toMonacoDocumentation(resolved.documentation)
        completionItem.additionalTextEdits = resolved.additionalTextEdits?.map(edit => toMonacoSingleEdit(edit))
        return completionItem
      },
    }))

    providerDisposables.push(monaco.languages.registerDefinitionProvider(languageId, {
      async provideDefinition(model, position) {
        return requestLocations(monaco, model, 'textDocument/definition', position)
      },
    }))
    providerDisposables.push(monaco.languages.registerImplementationProvider(languageId, {
      async provideImplementation(model, position) {
        return requestLocations(monaco, model, 'textDocument/implementation', position)
      },
    }))
    providerDisposables.push(monaco.languages.registerTypeDefinitionProvider(languageId, {
      async provideTypeDefinition(model, position) {
        return requestLocations(monaco, model, 'textDocument/typeDefinition', position)
      },
    }))
    providerDisposables.push(monaco.languages.registerDeclarationProvider(languageId, {
      async provideDeclaration(model, position) {
        return requestLocations(monaco, model, 'textDocument/declaration', position)
      },
    }))

    providerDisposables.push(monaco.languages.registerReferenceProvider(languageId, {
      async provideReferences(model, position) {
        const response = await requestTextDocument<LspLocation[] | null>(model, 'textDocument/references', {
          context: {
            includeDeclaration: true,
          },
          position: toLspPosition(position),
        })

        return toMonacoLocations(monaco, response)
      },
    }))

    providerDisposables.push(monaco.languages.registerDocumentHighlightProvider(languageId, {
      async provideDocumentHighlights(model, position) {
        const response = await requestTextDocument<LspDocumentHighlight[] | null>(model, 'textDocument/documentHighlight', {
          position: toLspPosition(position),
        })

        return (response ?? []).map(highlight => ({
          kind: mapDocumentHighlightKind(monaco, highlight.kind),
          range: toMonacoRange(highlight.range),
        }))
      },
    }))

    providerDisposables.push(monaco.languages.registerSignatureHelpProvider(languageId, {
      signatureHelpRetriggerCharacters: [','],
      signatureHelpTriggerCharacters: ['(', ',', '<'],
      async provideSignatureHelp(model, position) {
        const response = await requestTextDocument<LspSignatureHelp | null>(model, 'textDocument/signatureHelp', {
          position: toLspPosition(position),
        })

        if (!response) {
          return null
        }

        return {
          dispose() {},
          value: {
            activeParameter: response.activeParameter ?? 0,
            activeSignature: response.activeSignature ?? 0,
            signatures: response.signatures.map(signature => ({
              documentation: toMonacoDocumentation(signature.documentation),
              label: signature.label,
              parameters: (signature.parameters ?? []).map(parameter => ({
                documentation: toMonacoDocumentation(parameter.documentation),
                label: parameter.label,
              })),
            })),
          },
        }
      },
    }))

    providerDisposables.push(monaco.languages.registerRenameProvider(languageId, {
      async provideRenameEdits(model, position, newName) {
        const response = await requestTextDocument<LspWorkspaceEdit | null>(model, 'textDocument/rename', {
          newName,
          position: toLspPosition(position),
        })

        if (!response) {
          return null
        }

        return {
          edits: toMonacoWorkspaceEdits(monaco, response),
        }
      },
      async resolveRenameLocation(model, position) {
        const response = await requestTextDocument<LspRange | LspPrepareRenameResult | null>(model, 'textDocument/prepareRename', {
          position: toLspPosition(position),
        })

        if (!response) {
          return null
        }

        const range = 'range' in response ? response.range : response

        return {
          range: toMonacoRange(range),
          text: 'placeholder' in response && response.placeholder
            ? response.placeholder
            : model.getValueInRange(toMonacoRange(range)),
        }
      },
    }))

    providerDisposables.push(monaco.languages.registerDocumentSymbolProvider(languageId, {
      async provideDocumentSymbols(model) {
        const response = await requestTextDocument<LspDocumentSymbol[] | LspSymbolInformation[] | null>(model, 'textDocument/documentSymbol', {})
        return toMonacoDocumentSymbols(monaco, response ?? [])
      },
    }))

    providerDisposables.push(monaco.languages.registerSelectionRangeProvider(languageId, {
      async provideSelectionRanges(model, positions) {
        const response = await requestTextDocument<LspSelectionRange[] | null>(model, 'textDocument/selectionRange', {
          positions: positions.map(toLspPosition),
        })

        return (response ?? []).map(toMonacoSelectionRanges)
      },
    }))

    providerDisposables.push(monaco.languages.registerInlayHintsProvider(languageId, {
      async provideInlayHints(model, range) {
        const response = await requestTextDocument<LspInlayHint[] | null>(model, 'textDocument/inlayHint', {
          range: toLspRange(range),
        })

        return {
          dispose() {},
          hints: (response ?? []).map(hint => ({
            kind: mapInlayHintKind(monaco, hint.kind),
            label: typeof hint.label === 'string'
              ? hint.label
              : hint.label.map(part => part.value).join(''),
            paddingLeft: hint.paddingLeft,
            paddingRight: hint.paddingRight,
            position: {
              column: hint.position.character + 1,
              lineNumber: hint.position.line + 1,
            },
            tooltip: toMonacoDocumentation(hint.tooltip),
          })),
        }
      },
    }))
  }
}

function registerSemanticTokenProviders() {
  disposeSemanticTokenProviders()

  const monaco = monacoApi
  const capability = semanticTokensProvider
  if (!monaco || !capability?.full) {
    return
  }

  for (const languageId of LANGUAGE_IDS) {
    semanticProviderDisposables.push(monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
      getLegend() {
        return capability.legend
      },
      async provideDocumentSemanticTokens(model, lastResultId) {
        if (!isWorkspaceModel(model)) {
          return null
        }

        if (lastResultId && typeof capability.full === 'object' && capability.full.delta) {
          try {
            const deltaResult = await activeConnection?.request<TutorialLspSemanticTokens | TutorialLspSemanticTokensEdits>(
              'textDocument/semanticTokens/full/delta',
              {
                previousResultId: lastResultId,
                textDocument: { uri: model.uri.toString() },
              },
            )

            if (deltaResult && 'edits' in deltaResult) {
              return toMonacoSemanticTokensEdits(deltaResult)
            }

            return toMonacoSemanticTokens(deltaResult)
          }
          catch {
            // Fall through to a full refresh if delta tokens are unavailable.
          }
        }

        const result = await activeConnection?.request<TutorialLspSemanticTokens>('textDocument/semanticTokens/full', {
          textDocument: { uri: model.uri.toString() },
        })

        return toMonacoSemanticTokens(result)
      },
      releaseDocumentSemanticTokens() {},
    }))
  }
}

function disposeSemanticTokenProviders() {
  for (const provider of semanticProviderDisposables.splice(0, semanticProviderDisposables.length)) {
    provider.dispose()
  }
}

function isWorkspaceModel(model: TextModel) {
  return model.uri.scheme === 'file'
    && model.uri.path.startsWith(`${TUTORIAL_WORKSPACE_ROOT}/`)
}

function scheduleDocumentDiagnostics(uri: string, delay = 120) {
  if (!supportsPullDiagnostics) {
    return
  }

  const existingTimer = diagnosticRefreshTimers.get(uri)
  if (existingTimer != null) {
    globalThis.clearTimeout(existingTimer)
  }

  const timer = globalThis.setTimeout(() => {
    diagnosticRefreshTimers.delete(uri)
    void refreshDocumentDiagnostics(uri)
  }, delay)

  diagnosticRefreshTimers.set(uri, timer)
}

function clearScheduledDocumentDiagnostics(uri?: string) {
  if (uri) {
    const timer = diagnosticRefreshTimers.get(uri)
    if (timer != null) {
      globalThis.clearTimeout(timer)
      diagnosticRefreshTimers.delete(uri)
    }
    return
  }

  for (const timer of diagnosticRefreshTimers.values()) {
    globalThis.clearTimeout(timer)
  }
  diagnosticRefreshTimers.clear()
}

async function refreshDocumentDiagnostics(uri: string) {
  if (!supportsPullDiagnostics || !activeConnection) {
    return
  }

  try {
    const response = await activeConnection.request<LspDocumentDiagnosticReport>('textDocument/diagnostic', {
      textDocument: { uri },
    })

    applyDocumentDiagnosticReport(uri, response)
  }
  catch {
  }
}

function applyDocumentDiagnosticReport(uri: string, report: LspDocumentDiagnosticReport | null) {
  if (!report) {
    return
  }

  if (Array.isArray(report.items)) {
    diagnostics.set(uri, report.items)
    applyDiagnostics(uri)
  }

  for (const [relatedUri, relatedReport] of Object.entries(report.relatedDocuments ?? {})) {
    if (!Array.isArray(relatedReport.items)) {
      continue
    }

    diagnostics.set(relatedUri, relatedReport.items)
    applyDiagnostics(relatedUri)
  }
}

async function ensureAuxiliaryModel(uriString: string) {
  const monaco = await ensureTutorialMonacoWorkspace()
  const uri = monaco.Uri.parse(uriString)
  const key = uri.toString()

  if (projectModels.has(key)) {
    return projectModels.get(key)!.model
  }

  const existing = auxiliaryModels.get(key) ?? monaco.editor.getModel(uri)
  if (existing) {
    auxiliaryModels.set(key, existing)
    applyDiagnostics(key)
    return existing
  }

  const filePath = getWorkspaceRelativePath(key)
  let contents: string | null = null

  if (filePath && filePath in projectSnapshot) {
    contents = projectSnapshot[filePath] ?? ''
  }
  else if (filePath && readContainerFile) {
    contents = await readContainerFile(filePath)
  }

  if (contents == null) {
    return null
  }

  const model = monaco.editor.createModel(contents, getLanguageFromPath(filePath ?? uri.path), uri)
  auxiliaryModels.set(key, model)
  applyDiagnostics(key)
  return model
}

function closeProjectModel(uri: string) {
  const state = projectModels.get(uri)
  if (!state) {
    return
  }

  state.stopSync.dispose()
  void activeConnection?.didCloseTextDocument(state.model.uri.toString())
  clearScheduledDocumentDiagnostics(uri)
  clearDiagnostics(uri)
  state.model.dispose()
  projectModels.delete(uri)
}

function clearDiagnostics(uri?: string) {
  if (!monacoApi) {
    if (uri) {
      diagnostics.delete(uri)
    }
    else {
      diagnostics.clear()
    }
    return
  }

  if (uri) {
    diagnostics.delete(uri)
    const model = monacoApi.editor.getModel(monacoApi.Uri.parse(uri))
    if (model) {
      monacoApi.editor.setModelMarkers(model, DIAGNOSTIC_OWNER, [])
    }
    return
  }

  for (const model of monacoApi.editor.getModels()) {
    monacoApi.editor.setModelMarkers(model, DIAGNOSTIC_OWNER, [])
  }
  diagnostics.clear()
}

function applyDiagnostics(uri: string) {
  const monaco = monacoApi
  if (!monaco) {
    return
  }

  const model = monaco.editor.getModel(monaco.Uri.parse(uri))
  if (!model) {
    return
  }

  const markers = (diagnostics.get(uri) ?? []).map(diagnostic => ({
    code: diagnostic.code != null ? String(diagnostic.code) : undefined,
    endColumn: diagnostic.range.end.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    message: diagnostic.message,
    severity: mapDiagnosticSeverity(monaco, diagnostic.severity),
    startColumn: diagnostic.range.start.character + 1,
    startLineNumber: diagnostic.range.start.line + 1,
  }))

  monaco.editor.setModelMarkers(model, DIAGNOSTIC_OWNER, markers)
}

function mapDiagnosticSeverity(monaco: MonacoApi, severity = 3) {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error
    case 2:
      return monaco.MarkerSeverity.Warning
    case 4:
      return monaco.MarkerSeverity.Hint
    default:
      return monaco.MarkerSeverity.Info
  }
}

function toMonacoHoverContents(contents: unknown) {
  const values = Array.isArray(contents) ? contents : [contents]

  return values.flatMap((value) => {
    const markdown = toMonacoMarkdown(value)
    return markdown ? [markdown] : []
  })
}

function toMonacoDocumentation(documentation: LspMarkupContent | string | undefined) {
  if (!documentation) {
    return undefined
  }

  return toMonacoMarkdown(documentation) ?? undefined
}

function toMonacoCompletionItem(
  monaco: MonacoApi,
  model: TextModel,
  position: monaco.Position,
  item: LspCompletionItem,
): MonacoCompletionItem {
  const fallbackRange = model.getWordUntilPosition(position)
  const range = item.textEdit
    ? toMonacoEditRange(item.textEdit)
    : {
        startColumn: fallbackRange.startColumn,
        startLineNumber: position.lineNumber,
        endColumn: fallbackRange.endColumn,
        endLineNumber: position.lineNumber,
      }

  return {
    __lspItem: item,
    additionalTextEdits: item.additionalTextEdits?.map(edit => toMonacoSingleEdit(edit)),
    detail: item.detail,
    documentation: toMonacoDocumentation(item.documentation),
    filterText: item.filterText,
    insertText: 'textEdit' in item && item.textEdit
      ? item.textEdit.newText
      : item.insertText ?? getCompletionLabel(item.label),
    insertTextRules: item.insertTextFormat === 2
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    kind: mapCompletionKind(monaco, item.kind),
    label: getCompletionLabel(item.label),
    range,
    sortText: item.sortText,
  }
}

function getCompletionLabel(label: string | { label: string }) {
  return typeof label === 'string' ? label : label.label
}

function toMonacoEditRange(edit: LspTextEdit | LspInsertReplaceEdit) {
  if ('range' in edit) {
    return toMonacoRange(edit.range)
  }

  return {
    insert: toMonacoRange(edit.insert),
    replace: toMonacoRange(edit.replace),
  }
}

function toMonacoSingleEdit(edit: LspTextEdit) {
  return {
    forceMoveMarkers: true,
    range: toMonacoRange(edit.range),
    text: edit.newText,
  }
}

function mapCompletionKind(monaco: MonacoApi, kind = 1) {
  switch (kind) {
    case 2:
      return monaco.languages.CompletionItemKind.Method
    case 3:
      return monaco.languages.CompletionItemKind.Function
    case 4:
      return monaco.languages.CompletionItemKind.Constructor
    case 5:
      return monaco.languages.CompletionItemKind.Field
    case 6:
      return monaco.languages.CompletionItemKind.Variable
    case 7:
      return monaco.languages.CompletionItemKind.Class
    case 8:
      return monaco.languages.CompletionItemKind.Interface
    case 9:
      return monaco.languages.CompletionItemKind.Module
    case 10:
      return monaco.languages.CompletionItemKind.Property
    case 11:
      return monaco.languages.CompletionItemKind.Unit
    case 12:
      return monaco.languages.CompletionItemKind.Value
    case 13:
      return monaco.languages.CompletionItemKind.Enum
    case 14:
      return monaco.languages.CompletionItemKind.Keyword
    case 15:
      return monaco.languages.CompletionItemKind.Snippet
    case 17:
      return monaco.languages.CompletionItemKind.File
    case 18:
      return monaco.languages.CompletionItemKind.Reference
    case 19:
      return monaco.languages.CompletionItemKind.Folder
    case 20:
      return monaco.languages.CompletionItemKind.EnumMember
    case 21:
      return monaco.languages.CompletionItemKind.Constant
    case 22:
      return monaco.languages.CompletionItemKind.Struct
    case 23:
      return monaco.languages.CompletionItemKind.Event
    case 24:
      return monaco.languages.CompletionItemKind.Operator
    case 25:
      return monaco.languages.CompletionItemKind.TypeParameter
    default:
      return monaco.languages.CompletionItemKind.Text
  }
}

function toTextDocument(model: TextModel, version: number): LspTextDocument {
  return {
    languageId: model.getLanguageId(),
    text: model.getValue(),
    uri: model.uri.toString(),
    version,
  }
}

function toLspRange(range: monaco.IRange): LspRange {
  return {
    end: {
      character: range.endColumn - 1,
      line: range.endLineNumber - 1,
    },
    start: {
      character: range.startColumn - 1,
      line: range.startLineNumber - 1,
    },
  }
}

function toWorkspaceUri(filePath: string) {
  return `file://${TUTORIAL_WORKSPACE_ROOT}/${filePath}`
}

function getWorkspaceRelativePath(uri: string) {
  const path = uri.replace(/^file:\/\//, '')
  if (!path.startsWith(`${TUTORIAL_WORKSPACE_ROOT}/`)) {
    return null
  }

  return path.slice(TUTORIAL_WORKSPACE_ROOT.length + 1)
}

function toLspPosition(position: monaco.IPosition): LspPosition {
  return {
    character: position.column - 1,
    line: position.lineNumber - 1,
  }
}

function toMonacoRange(range: LspRange) {
  return {
    endColumn: range.end.character + 1,
    endLineNumber: range.end.line + 1,
    startColumn: range.start.character + 1,
    startLineNumber: range.start.line + 1,
  }
}

async function requestTextDocument<T>(model: TextModel, method: string, params: Record<string, unknown>) {
  if (!isWorkspaceModel(model)) {
    return null
  }

  try {
    return await activeConnection?.request<T>(method, {
      ...params,
      textDocument: { uri: model.uri.toString() },
    }) ?? null
  }
  catch {
    return null
  }
}

async function requestLocations(monaco: MonacoApi, model: TextModel, method: string, position: monaco.Position) {
  const response = await requestTextDocument<LspDefinition | LspDefinition[] | LspLocation | LspLocation[] | null>(model, method, {
    position: toLspPosition(position),
  })

  return toMonacoLocations(monaco, response)
}

async function toMonacoLocations(
  monaco: MonacoApi,
  response: LspDefinition | LspDefinition[] | LspLocation | LspLocation[] | null,
) {
  const locations = Array.isArray(response)
    ? response
    : response
      ? [response]
      : []

  const resolvedLocations = await Promise.all(locations.map(async (location) => {
    const targetUri = 'targetUri' in location ? location.targetUri : location.uri
    const targetRange = 'targetSelectionRange' in location
      ? location.targetSelectionRange ?? location.targetRange ?? location.range
      : location.range

    if (!targetUri || !targetRange) {
      return null
    }

    const targetModel = await ensureAuxiliaryModel(targetUri)
    if (!targetModel) {
      return null
    }

    return {
      uri: targetModel.uri,
      range: toMonacoRange(targetRange),
    }
  }))

  return resolvedLocations.filter((location): location is {
    range: monaco.IRange
    uri: monaco.Uri
  } => Boolean(location))
}

function toMonacoMarkdown(value: unknown): monaco.IMarkdownString | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === 'string') {
    return { value }
  }

  if (
    typeof value === 'object'
    && 'language' in value
    && 'value' in value
    && typeof value.language === 'string'
    && typeof value.value === 'string'
  ) {
    const markedString = value as LspMarkedString
    return {
      value: `\`\`\`${markedString.language}\n${markedString.value}\n\`\`\``,
    }
  }

  if (typeof value === 'object' && 'value' in value && typeof value.value === 'string') {
    const markup = value as LspMarkupContent
    return {
      value: markup.kind === 'plaintext'
        ? escapeMarkdown(markup.value)
        : markup.value,
    }
  }

  return undefined
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}[\]()#+\-.!|>]/g, '\\$&')
}

function mapDocumentHighlightKind(monaco: MonacoApi, kind = 1) {
  switch (kind) {
    case 2:
      return monaco.languages.DocumentHighlightKind.Read
    case 3:
      return monaco.languages.DocumentHighlightKind.Write
    default:
      return monaco.languages.DocumentHighlightKind.Text
  }
}

function mapSymbolKind(monaco: MonacoApi, kind = 13) {
  switch (kind) {
    case 1:
      return monaco.languages.SymbolKind.File
    case 2:
      return monaco.languages.SymbolKind.Module
    case 3:
      return monaco.languages.SymbolKind.Namespace
    case 4:
      return monaco.languages.SymbolKind.Package
    case 5:
      return monaco.languages.SymbolKind.Class
    case 6:
      return monaco.languages.SymbolKind.Method
    case 7:
      return monaco.languages.SymbolKind.Property
    case 8:
      return monaco.languages.SymbolKind.Field
    case 9:
      return monaco.languages.SymbolKind.Constructor
    case 10:
      return monaco.languages.SymbolKind.Enum
    case 11:
      return monaco.languages.SymbolKind.Interface
    case 12:
      return monaco.languages.SymbolKind.Function
    case 14:
      return monaco.languages.SymbolKind.Constant
    case 15:
      return monaco.languages.SymbolKind.String
    case 16:
      return monaco.languages.SymbolKind.Number
    case 17:
      return monaco.languages.SymbolKind.Boolean
    case 18:
      return monaco.languages.SymbolKind.Array
    case 19:
      return monaco.languages.SymbolKind.Object
    case 20:
      return monaco.languages.SymbolKind.Key
    case 21:
      return monaco.languages.SymbolKind.Null
    case 22:
      return monaco.languages.SymbolKind.EnumMember
    case 23:
      return monaco.languages.SymbolKind.Struct
    case 24:
      return monaco.languages.SymbolKind.Event
    case 25:
      return monaco.languages.SymbolKind.Operator
    case 26:
      return monaco.languages.SymbolKind.TypeParameter
    default:
      return monaco.languages.SymbolKind.Variable
  }
}

function toMonacoDocumentSymbols(monaco: MonacoApi, symbols: LspDocumentSymbol[] | LspSymbolInformation[]) {
  if (!symbols.length) {
    return []
  }

  if ('location' in symbols[0]!) {
    return (symbols as LspSymbolInformation[]).map(symbol => ({
      children: [],
      detail: symbol.containerName ?? '',
      kind: mapSymbolKind(monaco, symbol.kind),
      name: symbol.name,
      range: toMonacoRange(symbol.location.range),
      selectionRange: toMonacoRange(symbol.location.range),
      tags: symbol.tags?.includes(1) ? [monaco.languages.SymbolTag.Deprecated] : [],
    }))
  }

  return (symbols as LspDocumentSymbol[]).map(symbol => toMonacoDocumentSymbol(monaco, symbol))
}

function toMonacoDocumentSymbol(monaco: MonacoApi, symbol: LspDocumentSymbol): monaco.languages.DocumentSymbol {
  return {
    children: (symbol.children ?? []).map(child => toMonacoDocumentSymbol(monaco, child)),
    detail: symbol.detail ?? '',
    kind: mapSymbolKind(monaco, symbol.kind),
    name: symbol.name,
    range: toMonacoRange(symbol.range),
    selectionRange: toMonacoRange(symbol.selectionRange),
    tags: symbol.tags?.includes(1) ? [monaco.languages.SymbolTag.Deprecated] : [],
  }
}

function toMonacoSelectionRanges(range: LspSelectionRange): monaco.languages.SelectionRange[] {
  const result: monaco.languages.SelectionRange[] = []
  let current: LspSelectionRange | undefined = range

  while (current) {
    result.push({
      range: toMonacoRange(current.range),
    })
    current = current.parent
  }

  return result
}

function mapInlayHintKind(monaco: MonacoApi, kind = 1) {
  return kind === 1
    ? monaco.languages.InlayHintKind.Type
    : monaco.languages.InlayHintKind.Parameter
}

function toMonacoWorkspaceEdits(monaco: MonacoApi, workspaceEdit: LspWorkspaceEdit): monaco.languages.IWorkspaceTextEdit[] {
  const edits: monaco.languages.IWorkspaceTextEdit[] = []

  for (const [uri, textEdits] of Object.entries(workspaceEdit.changes ?? {})) {
    const resource = monaco.Uri.parse(uri)
    const model = monaco.editor.getModel(resource)

    for (const edit of textEdits) {
      edits.push({
        resource,
        textEdit: toMonacoSingleEdit(edit),
        versionId: model?.getVersionId(),
      })
    }
  }

  for (const change of workspaceEdit.documentChanges ?? []) {
    const uri = change.textDocument?.uri
    if (!uri) {
      continue
    }

    const resource = monaco.Uri.parse(uri)
    const model = monaco.editor.getModel(resource)

    for (const edit of change.edits) {
      edits.push({
        resource,
        textEdit: toMonacoSingleEdit(edit),
        versionId: model?.getVersionId(),
      })
    }
  }

  return edits
}

class TutorialLspConnection {
  private initialized = false
  private disposeMessageListener: (() => void) | null = null
  private disposeCloseListener: (() => void) | null = null

  constructor(private readonly transport: TutorialLspTransport) {}

  async initialize() {
    if (this.initialized) {
      return { capabilities: {} } satisfies LspInitializeResult
    }

    this.disposeMessageListener = this.transport.onMessage((message) => {
      if (message.method === 'textDocument/publishDiagnostics') {
        const uri = (message.params as { diagnostics?: LspDiagnostic[], uri?: string } | undefined)?.uri
        if (typeof uri === 'string') {
          diagnostics.set(uri, ((message.params as { diagnostics?: LspDiagnostic[] } | undefined)?.diagnostics) ?? [])
          applyDiagnostics(uri)
        }
      }
    })

    this.disposeCloseListener = this.transport.onClose(() => {
      activeConnection = activeConnection === this ? null : activeConnection
      if (!activeConnection) {
        supportsPullDiagnostics = false
        semanticTokensProvider = null
        clearScheduledDocumentDiagnostics()
        disposeSemanticTokenProviders()
      }
      clearDiagnostics()
    })

    const result = await this.request<LspInitializeResult>('initialize', {
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              documentationFormat: ['markdown', 'plaintext'],
              labelDetailsSupport: true,
              resolveSupport: {
                properties: ['detail', 'documentation', 'additionalTextEdits'],
              },
              snippetSupport: true,
            },
          },
          declaration: {
            linkSupport: true,
          },
          definition: {
            linkSupport: true,
          },
          diagnostic: {
            dynamicRegistration: false,
            relatedDocumentSupport: true,
          },
          documentHighlight: {
            dynamicRegistration: false,
          },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
            symbolKind: {
              valueSet: Array.from({ length: 26 }, (_value, index) => index + 1),
            },
            tagSupport: {
              valueSet: [1],
            },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          implementation: {
            linkSupport: true,
          },
          inlayHint: {
            dynamicRegistration: false,
          },
          references: {
            dynamicRegistration: false,
          },
          rename: {
            dynamicRegistration: false,
            prepareSupport: true,
          },
          semanticTokens: {
            dynamicRegistration: false,
            formats: ['relative'],
            multilineTokenSupport: true,
            overlappingTokenSupport: false,
            requests: {
              full: {
                delta: true,
              },
              range: true,
            },
            tokenModifiers: [...LSP_SEMANTIC_TOKEN_MODIFIERS],
            tokenTypes: [...LSP_SEMANTIC_TOKEN_TYPES],
          },
          selectionRange: {
            dynamicRegistration: false,
          },
          signatureHelp: {
            signatureInformation: {
              activeParameterSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: {
                labelOffsetSupport: true,
              },
            },
          },
          synchronization: {
            didSave: false,
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
          },
          typeDefinition: {
            linkSupport: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      clientInfo: {
        name: 'rstore-docs-tutorial',
        version: '1.0.0',
      },
      processId: null,
      rootUri: `file://${TUTORIAL_WORKSPACE_ROOT}`,
      workspaceFolders: [
        {
          name: 'tutorial',
          uri: `file://${TUTORIAL_WORKSPACE_ROOT}`,
        },
      ],
    })

    await this.notify('initialized', {})
    this.initialized = true
    return result ?? { capabilities: {} }
  }

  async didOpenTextDocument(document: LspTextDocument) {
    this.notify('textDocument/didOpen', {
      textDocument: document,
    })
  }

  async didChangeTextDocument(document: LspTextDocument) {
    this.notify('textDocument/didChange', {
      contentChanges: [
        {
          text: document.text,
        },
      ],
      textDocument: {
        uri: document.uri,
        version: document.version,
      },
    })
  }

  async didCloseTextDocument(uri: string) {
    this.notify('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  async request<T>(method: string, params: unknown) {
    return this.transport.request<T>(method, params)
  }

  async notify(method: string, params: unknown) {
    await this.transport.notify(method, params)
  }

  dispose() {
    this.disposeMessageListener?.()
    this.disposeCloseListener?.()
    this.disposeMessageListener = null
    this.disposeCloseListener = null
    this.transport.dispose()
  }
}
