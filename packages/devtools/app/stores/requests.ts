/** Race transport work against a deadline without cancelling possible backend effects. */
export async function withDeadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Inspector request timed out')), milliseconds)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}
/** Convert transport failures to concise rendered text. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error)
    return String(error.message)
  return String(error)
}
