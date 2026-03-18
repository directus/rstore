/* eslint-disable new-cap */

import type * as Monaco from 'monaco-editor'
import { conf as htmlConf, language as htmlLanguage } from 'monaco-editor/esm/vs/basic-languages/html/html.js'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { getLanguageFromPath } from './tutorialLanguages'

let monacoPromise: Promise<typeof Monaco> | null = null
let tutorialTypeScriptConfigured = false

type MonacoApi = typeof Monaco

function getWorker(_moduleId: string, label: string) {
  if (label === 'typescript' || label === 'javascript')
    return new tsWorker()
  if (label === 'json')
    return new jsonWorker()
  if (label === 'css' || label === 'scss' || label === 'less')
    return new cssWorker()
  if (label === 'html' || label === 'handlebars' || label === 'razor' || label === 'vue')
    return new htmlWorker()
  return new editorWorker()
}

export async function loadMonaco(): Promise<typeof Monaco> {
  monacoPromise ??= (async () => {
    ;(globalThis as typeof globalThis & {
      MonacoEnvironment?: {
        getWorker: typeof getWorker
      }
    }).MonacoEnvironment = {
      getWorker,
    }

    const [monaco, _editorStyles] = await Promise.all([
      import('monaco-editor/esm/vs/editor/editor.main.js') as Promise<typeof Monaco>,
      import('monaco-editor/min/vs/editor/editor.main.css'),
    ])

    monaco.languages.register({
      id: 'vue',
      extensions: ['.vue'],
      aliases: ['Vue', 'vue'],
      mimetypes: ['text/x-vue'],
    })
    monaco.languages.setLanguageConfiguration('vue', htmlConf)
    monaco.languages.setMonarchTokensProvider('vue', htmlLanguage)

    monaco.editor.defineTheme('rstore-docs-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      semanticHighlighting: true,
      colors: {
        'editor.background': '#f8fafc',
        'editor.lineHighlightBackground': '#eef2f7',
        'editorGutter.background': '#f8fafc',
      },
    })

    monaco.editor.defineTheme('rstore-docs-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      semanticHighlighting: true,
      colors: {
        'editor.background': '#0b1220',
        'editor.lineHighlightBackground': '#121b2c',
        'editorGutter.background': '#0b1220',
      },
    })

    disableTutorialTypeScriptIdeFeatures(monaco)

    return monaco
  })()

  return monacoPromise
}

export function setMonacoTheme(monaco: MonacoApi, isDark: boolean) {
  monaco.editor.setTheme(isDark ? 'rstore-docs-dark' : 'rstore-docs-light')
}

export {
  getLanguageFromPath,
}

function disableTutorialTypeScriptIdeFeatures(monaco: MonacoApi) {
  if (tutorialTypeScriptConfigured) {
    return
  }

  tutorialTypeScriptConfigured = true

  const sandboxOnlyModeConfiguration = {
    codeActions: false,
    completionItems: false,
    definitions: false,
    diagnostics: false,
    documentHighlights: false,
    documentRangeFormattingEdits: false,
    documentSymbols: false,
    hovers: false,
    inlayHints: false,
    onTypeFormattingEdits: false,
    references: false,
    rename: false,
    signatureHelp: false,
  }

  for (const defaults of [
    monaco.languages.typescript.javascriptDefaults,
    monaco.languages.typescript.typescriptDefaults,
  ]) {
    defaults.setModeConfiguration(sandboxOnlyModeConfiguration)
    defaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      onlyVisible: false,
    })
  }
}
