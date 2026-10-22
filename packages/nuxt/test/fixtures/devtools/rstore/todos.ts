import { defineCollection } from '@rstore/vue'

/** SSR fixture cache addresses are identical across requests to expose isolation faults. */
export default defineCollection({ name: 'todos' })
