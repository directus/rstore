import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'rstore',
  description: 'Reactive store',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
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
          text: 'Model',
          items: [
            { text: 'Model', link: '/guide/model/model' },
            { text: 'Relations', link: '/guide/model/relations' },
            { text: 'Defaults', link: '/guide/model/model-defaults' },
          ],
        },
        {
          text: 'Data',
          items: [
            { text: 'Query', link: '/guide/data/query' },
            { text: 'Mutation', link: '/guide/data/mutation' },
            { text: 'Form Object', link: '/guide/data/form' },
            // { text: 'Live', link: '/guide/data/live' },
            { text: 'Cache', link: '/guide/data/cache' },
          ],
        },
        {
          text: 'Plugin',
          items: [
            { text: 'Setup', link: '/guide/plugin/setup' },
            { text: 'Hooks', link: '/guide/plugin/hooks' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/Akryum/rstore/edit/main/docs/:path',
    },

    outline: 'deep',
  },

  lastUpdated: true,
})
