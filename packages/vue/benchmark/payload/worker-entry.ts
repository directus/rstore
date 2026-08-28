import process from 'node:process'
import { parsePayloadWorkerRequest, runPayloadWorker } from './worker'

runPayloadWorker(parsePayloadWorkerRequest(process.argv[2]))
  .then(result => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
