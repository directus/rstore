/* eslint-disable new-cap */

import type * as Monaco from 'monaco-editor'
import { conf as htmlConf, language as htmlLanguage } from 'monaco-editor/esm/vs/basic-languages/html/html'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { createVendoredRstorePackageFiles } from './tutorialLocalPackages'
import { TUTORIAL_WORKSPACE_ROOT } from './tutorialServerUrls'

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

export function getLanguageFromPath(filePath: string): string {
  if (filePath.endsWith('.vue'))
    return 'vue'
  if (filePath.endsWith('.ts'))
    return 'typescript'
  if (filePath.endsWith('.json'))
    return 'json'
  if (filePath.endsWith('.css'))
    return 'css'
  if (filePath.endsWith('.html'))
    return 'html'
  return 'plaintext'
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

    configureTutorialTypeScript(monaco)

    return monaco
  })()

  return monacoPromise
}

export function setMonacoTheme(monaco: MonacoApi, isDark: boolean) {
  monaco.editor.setTheme(isDark ? 'rstore-docs-dark' : 'rstore-docs-light')
}

function configureTutorialTypeScript(monaco: MonacoApi) {
  if (tutorialTypeScriptConfigured) {
    return
  }

  tutorialTypeScriptConfigured = true

  const extraLibs = Object.entries(createVendoredRstorePackageFiles())
    .filter(([filePath]) => filePath.endsWith('.d.ts') || filePath.endsWith('.d.cts') || filePath.endsWith('.d.mts'))
    .map(([filePath, content]) => ({
      content,
      filePath: toWorkspaceUri(filePath),
    }))

  const diagnosticsOptions = {
    diagnosticCodesToIgnore: [2307, 2792],
    noSuggestionDiagnostics: false,
    noSyntaxValidation: false,
    onlyVisible: false,
  }

  const compilerOptions = {
    allowJs: true,
    allowSyntheticDefaultImports: true,
    baseUrl: toWorkspaceUri(''),
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    paths: {
      '@rstore/core': ['vendor/@rstore/core/dist/index.d.ts'],
      '@rstore/shared': ['vendor/@rstore/shared/dist/index.d.ts'],
      '@rstore/vue': ['vendor/@rstore/vue/dist/index.d.ts'],
    },
    strict: true,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
  }

  for (const defaults of [
    monaco.languages.typescript.javascriptDefaults,
    monaco.languages.typescript.typescriptDefaults,
  ]) {
    defaults.setCompilerOptions(compilerOptions)
    defaults.setDiagnosticsOptions(diagnosticsOptions)
    defaults.setEagerModelSync(true)
    defaults.setExtraLibs(extraLibs)
  }
}

function toWorkspaceUri(filePath: string) {
  const normalizedPath = filePath.replace(/^\//, '')
  return `file://${TUTORIAL_WORKSPACE_ROOT}/${normalizedPath}`
}
