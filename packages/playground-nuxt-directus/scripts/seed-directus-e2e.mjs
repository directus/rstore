import { waitForDirectus } from './directus-e2e/client.mjs'
import { ensureDirectusSchema } from './directus-e2e/schema.mjs'

await seedDirectus()

/**
 * Creates the Directus data model and public access needed by the e2e suite.
 */
async function seedDirectus() {
  await waitForDirectus()
  await ensureDirectusSchema()
}
