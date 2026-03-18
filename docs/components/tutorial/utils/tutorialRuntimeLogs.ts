export interface TutorialLogEntry {
  id: number
  text: string
}

interface TutorialLogMutationResult {
  logs: TutorialLogEntry[]
  nextLogId: number
}

interface TutorialLogAppendResult extends TutorialLogMutationResult {
  entryId: number | null
}

export interface TutorialRuntimeOutputChunkResult extends TutorialLogMutationResult {
  activeEntryId: number | null
  currentLine: string
}

const DEFAULT_TUTORIAL_LOG_LIMIT = 240

function normalizeTutorialLogLine(text: string) {
  return text.trimEnd()
}

function limitTutorialLogs(logs: TutorialLogEntry[], limit: number) {
  if (logs.length <= limit)
    return logs

  return logs.slice(logs.length - limit)
}

function appendTutorialLogLine(
  logs: TutorialLogEntry[],
  text: string,
  nextLogId: number,
  limit: number,
): TutorialLogAppendResult {
  const normalized = normalizeTutorialLogLine(text)

  if (!normalized) {
    return {
      logs,
      nextLogId,
      entryId: null,
    }
  }

  const entryId = nextLogId

  return {
    logs: limitTutorialLogs([
      ...logs,
      {
        id: entryId,
        text: normalized,
      },
    ], limit),
    nextLogId: nextLogId + 1,
    entryId,
  }
}

function updateTutorialLogLine(
  logs: TutorialLogEntry[],
  entryId: number,
  text: string,
  nextLogId: number,
  limit: number,
): TutorialLogAppendResult {
  const normalized = normalizeTutorialLogLine(text)

  if (!normalized) {
    return {
      logs,
      nextLogId,
      entryId,
    }
  }

  const index = logs.findIndex(entry => entry.id === entryId)

  if (index === -1) {
    return appendTutorialLogLine(logs, normalized, nextLogId, limit)
  }

  return {
    logs: logs.map(entry => entry.id === entryId ? { ...entry, text: normalized } : entry),
    nextLogId,
    entryId,
  }
}

export function appendTutorialLogMessage(
  logs: TutorialLogEntry[],
  message: string,
  nextLogId: number,
  limit = DEFAULT_TUTORIAL_LOG_LIMIT,
): TutorialLogMutationResult {
  let nextLogs = logs
  let nextId = nextLogId

  for (const line of message.split('\n')) {
    const appended = appendTutorialLogLine(nextLogs, line, nextId, limit)
    nextLogs = appended.logs
    nextId = appended.nextLogId
  }

  return {
    logs: nextLogs,
    nextLogId: nextId,
  }
}

export function appendTutorialRuntimeOutputChunk(
  logs: TutorialLogEntry[],
  {
    activeEntryId,
    chunk,
    currentLine,
    label,
    nextLogId,
    limit = DEFAULT_TUTORIAL_LOG_LIMIT,
  }: {
    activeEntryId: number | null
    chunk: string
    currentLine: string
    label: string
    nextLogId: number
    limit?: number
  },
): TutorialRuntimeOutputChunkResult {
  let nextLogs = logs
  let nextId = nextLogId
  let nextActiveEntryId = activeEntryId
  let nextCurrentLine = currentLine

  const flushCurrentLine = () => {
    const normalized = normalizeTutorialLogLine(nextCurrentLine)

    if (!normalized)
      return

    const prefixedLine = `[${label}] ${normalized}`
    const mutation = nextActiveEntryId == null
      ? appendTutorialLogLine(nextLogs, prefixedLine, nextId, limit)
      : updateTutorialLogLine(nextLogs, nextActiveEntryId, prefixedLine, nextId, limit)

    nextLogs = mutation.logs
    nextId = mutation.nextLogId
    nextActiveEntryId = mutation.entryId
  }

  for (const char of chunk) {
    if (char === '\r') {
      flushCurrentLine()
      nextCurrentLine = ''
      continue
    }

    if (char === '\n') {
      flushCurrentLine()
      nextCurrentLine = ''
      nextActiveEntryId = null
      continue
    }

    nextCurrentLine += char
  }

  flushCurrentLine()

  return {
    logs: nextLogs,
    nextLogId: nextId,
    activeEntryId: nextActiveEntryId,
    currentLine: nextCurrentLine,
  }
}
