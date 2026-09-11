import process from 'node:process'
import { writeWorkerResult } from '../worker-output'
import { parsePayloadWorkerRequest, runPayloadWorker } from './worker'

runPayloadWorker(parsePayloadWorkerRequest(process.argv[2]))
  .then(writeWorkerResult)
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
