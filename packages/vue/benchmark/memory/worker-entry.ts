import process from 'node:process'
import { writeWorkerResult } from '../worker-output'
import { parseMemoryWorkerRequest, runMemoryWorker } from './worker'

runMemoryWorker(parseMemoryWorkerRequest(process.argv[2]))
  .then(writeWorkerResult)
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
