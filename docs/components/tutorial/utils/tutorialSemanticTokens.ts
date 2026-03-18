export const LSP_SEMANTIC_TOKEN_TYPES = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
] as const

export const LSP_SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
] as const

export interface TutorialLspSemanticTokens {
  data: number[]
  resultId?: string
}

export interface TutorialLspSemanticTokensEdit {
  data?: number[]
  deleteCount: number
  start: number
}

export interface TutorialLspSemanticTokensEdits {
  edits: TutorialLspSemanticTokensEdit[]
  resultId?: string
}

export interface TutorialLspSemanticTokensLegend {
  tokenModifiers: string[]
  tokenTypes: string[]
}

export function toMonacoSemanticTokens(result: TutorialLspSemanticTokens | null | undefined) {
  if (!result) {
    return null
  }

  return {
    data: new Uint32Array(result.data),
    resultId: result.resultId,
  }
}

export function toMonacoSemanticTokensEdits(result: TutorialLspSemanticTokensEdits | null | undefined) {
  if (!result) {
    return null
  }

  return {
    edits: result.edits.map(edit => ({
      data: edit.data ? new Uint32Array(edit.data) : undefined,
      deleteCount: edit.deleteCount,
      start: edit.start,
    })),
    resultId: result.resultId,
  }
}
