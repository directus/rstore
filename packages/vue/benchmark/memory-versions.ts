import process from 'node:process'
import { runMemoryVersionBenchmark } from './memory/version-runner'

runMemoryVersionBenchmark().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
