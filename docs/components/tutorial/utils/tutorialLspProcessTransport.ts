import type { WebContainerProcess } from '@webcontainer/api'

export interface TutorialLspTransport {
  dispose: () => void
  notify: (method: string, params: unknown) => Promise<void>
  onClose: (callback: () => void) => () => void
  onMessage: (callback: (message: {
    error?: { message?: string }
    id?: number
    method?: string
    params?: unknown
    result?: unknown
  }) => void) => () => void
  request: <T>(method: string, params: unknown) => Promise<T | null>
}

export function createTutorialLspProcessTransport(process: WebContainerProcess): TutorialLspTransport {
  const pending = new Map<number, {
    method: string
    reject: (reason?: unknown) => void
    resolve: (value: unknown) => void
  }>()
  const messageListeners = new Set<(message: {
    error?: { message?: string }
    id?: number
    method?: string
    params?: unknown
    result?: unknown
  }) => void>()
  const closeListeners = new Set<() => void>()
  const writer = process.input.getWriter()
  const reader = process.output.getReader()
  let nextRequestId = 0
  let disposed = false
  let buffer = ''

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done || disposed) {
          if (done) {
            console.warn('[tutorial:lsp] The language server bridge output stream closed.')
          }
          break
        }

        buffer += value
        let newlineIndex = buffer.indexOf('\n')

        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)

          if (line) {
            try {
              handleMessage(JSON.parse(line))
            }
            // eslint-disable-next-line unused-imports/no-unused-vars
            catch (error) {
              console.warn(`[tutorial:lsp] Ignoring non-JSON output from the language server bridge: ${line}`)
            }
          }

          newlineIndex = buffer.indexOf('\n')
        }
      }
    }
    catch (error) {
      rejectPending(error)
    }
    finally {
      disposed = true
      rejectPending(new Error('The tutorial language server process closed.'))
      for (const listener of closeListeners) {
        listener()
      }
      closeListeners.clear()
      messageListeners.clear()
      writer.releaseLock()
      reader.releaseLock()
    }
  })()

  process.exit.finally(() => {
    if (disposed) {
      return
    }

    disposed = true
    rejectPending(new Error('The tutorial language server process exited.'))
    for (const listener of closeListeners) {
      listener()
    }
    closeListeners.clear()
    messageListeners.clear()
  })

  return {
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      rejectPending(new Error('The tutorial language server transport was disposed.'))
      writer.releaseLock()
      reader.releaseLock()
    },
    async notify(method, params) {
      if (disposed) {
        return
      }

      await writer.write(`${JSON.stringify({ method, params })}\n`)
    },
    onClose(callback) {
      closeListeners.add(callback)
      return () => {
        closeListeners.delete(callback)
      }
    },
    onMessage(callback) {
      messageListeners.add(callback)
      return () => {
        messageListeners.delete(callback)
      }
    },
    async request(method, params) {
      if (disposed) {
        return null
      }

      const id = nextRequestId++

      return new Promise((resolve, reject) => {
        pending.set(id, { method, reject, resolve })
        void writer.write(`${JSON.stringify({ id, method, params })}\n`).catch((error) => {
          pending.delete(id)
          reject(error)
        })
      }) as Promise<any>
    },
  }

  function handleMessage(message: {
    error?: { message?: string }
    id?: number
    method?: string
    params?: unknown
    result?: unknown
  }) {
    if (message.method === '$/bridgeLog') {
      console.warn(String(message.params ?? ''))
      return
    }

    if (typeof message.id === 'number' && typeof message.method === 'string') {
      return
    }

    if (typeof message.id === 'number') {
      const request = pending.get(message.id)
      if (!request) {
        return
      }

      pending.delete(message.id)

      if (message.error) {
        request.reject(new Error(message.error.message ?? 'The tutorial language server request failed.'))
        return
      }

      request.resolve(message.result ?? null)
      return
    }

    for (const listener of messageListeners) {
      listener(message)
    }
  }

  function rejectPending(error: unknown) {
    for (const request of pending.values()) {
      request.reject(error)
    }
    pending.clear()
  }
}
