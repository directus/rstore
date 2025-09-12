import type { ElementContent, Properties } from 'hast'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'

const MARKERS: Record<string, 'add' | 'remove'> = {
  '// [!code ++]': 'add',
  '// [!code --]': 'remove',
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'rstore',
  description: 'Reactive store',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      {
        text: 'Plugins',
        items: [
          { text: 'Nuxt + Drizzle', link: '/plugins/nuxt-drizzle' },
          { text: 'Nuxt + Directus', link: '/plugins/nuxt-directus' },
        ],
      },
      // { text: 'Demo', link: 'https://rstore-playground.pages.dev/' },
      { text: 'Changelog', link: 'https://github.com/Akryum/rstore/blob/main/CHANGELOG.md' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Learn More', link: '/guide/learn-more' },
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Schema',
          items: [
            { text: 'Collection', link: '/guide/schema/collection' },
            { text: 'Relations', link: '/guide/schema/relations' },
            { text: 'Federation', link: '/guide/schema/federation' },
            { text: 'Defaults', link: '/guide/schema/collection-defaults' },
          ],
        },
        {
          text: 'Data',
          items: [
            { text: 'Query', link: '/guide/data/query' },
            { text: 'Mutation', link: '/guide/data/mutation' },
            { text: 'Form Object', link: '/guide/data/form' },
            { text: 'Subscriptions', link: '/guide/data/live' },
            { text: 'Cache', link: '/guide/data/cache' },
            { text: 'Module', link: '/guide/data/module' },
          ],
        },
        {
          text: 'Plugin',
          items: [
            { text: 'Setup', link: '/guide/plugin/setup' },
            { text: 'Hooks', link: '/guide/plugin/hooks' },
          ],
        },
        {
          text: 'Migration',
          items: [
            { text: 'From 0.6 to 0.7', link: '/guide/migration/v0_7' },
          ],
        },
      ],
      '/plugins/': [
        {
          text: 'Plugins',
          items: [
            { text: 'Nuxt + Drizzle', link: '/plugins/nuxt-drizzle' },
            { text: 'Nuxt + Directus', link: '/plugins/nuxt-directus' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Akryum/rstore' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/Akryum/rstore/edit/main/docs/:path',
    },

    outline: 'deep',

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present Guillaume Chau',
    },
  },

  lastUpdated: true,

  vite: {
    plugins: [
      tailwindcss(),
    ],

    resolve: {
      alias: [
        {
          find: /^.*\/VPFooter\.vue$/,
          replacement: fileURLToPath(new URL('./theme/components/Footer.vue', import.meta.url)),
        },
      ],
    },
  },

  markdown: {
    codeTransformers: [
      {
        line(line) {
          const lastThree = line.children.slice(-3)
          if (lastThree.length !== 3)
            return
          if (!lastThree.every(isSingleTextElement))
            return

          const texts = lastThree.map(el => el.children[0])
          const joined = texts
            .map(t => t.value)
            .join('')
            .trim()

          const kind = MARKERS[joined]
          if (!kind)
            return

          texts.forEach(t => (t.value = ''))
          this.addClassToHast(this.pre, 'has-diff')
          this.addClassToHast(line, ['diff', kind])
        },
      },
    ],
  },
})

function isSingleTextElement(node: ElementContent): node is {
  type: 'element'
  tagName: string
  properties: Properties
  children: [{ type: 'text', value: string }]
} {
  return (
    node.type === 'element'
    && Array.isArray(node.children)
    && node.children.length === 1
    && node.children[0]!.type === 'text'
  )
}
