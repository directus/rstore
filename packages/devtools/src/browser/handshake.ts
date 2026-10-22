import { DevtoolsError } from '../protocol'

/** Reject wildcard/opaque origins rather than weakening Devframe's same-origin trust default. */
export function browserOrigins(options: { allowedOrigins?: string[], window?: Window | false }): string[] | undefined {
  const host = options.window === false ? undefined : options.window ?? (typeof window === 'undefined' ? undefined : window)
  const origins = options.allowedOrigins?.length ? options.allowedOrigins : host ? [host.location.origin] : undefined
  if (!origins)
    return undefined
  for (const origin of origins) {
    try {
      const parsed = new URL(origin)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
        throw new Error('Origin must be exact')
    }
    catch {
      throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Browser channel requires exact HTTP origins' })
    }
  }
  return origins
}
