import { writeFile } from 'node:fs/promises'
import process from 'node:process'

/** Persist worker JSON when vite-node suppresses captured standard output. */
export async function writeWorkerResult(result: unknown): Promise<void> {
  const source = JSON.stringify(result)
  const outputPath = process.env.RSTORE_BENCHMARK_RESULT_PATH
  if (outputPath) {
    await writeFile(outputPath, source)
    return
  }
  process.stdout.write(`${source}\n`)
}
