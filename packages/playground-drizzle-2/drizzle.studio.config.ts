import fs from 'node:fs'
import process from 'node:process'
import { defineConfig } from 'drizzle-kit'
import path from 'pathe'

import config from './drizzle.config'

const folder = path.join(process.cwd(), '.data/hub/d1')
let files = fs.readdirSync(folder)
const folder2 = path.join(folder, files[0]!)
files = fs.readdirSync(folder2)
const url = `file://${folder2}/${files.find(f => f.endsWith('.sqlite'))}`

export default defineConfig({
  ...config as any,
  dbCredentials: {
    url,
  },
})
