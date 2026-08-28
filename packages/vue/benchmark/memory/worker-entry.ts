import process from 'node:process'
import { parseMemoryWorkerRequest, runMemoryWorker } from './worker'

runMemoryWorker(parseMemoryWorkerRequest(process.argv[2]))
  .then(result => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
