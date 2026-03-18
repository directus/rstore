import type { Component } from 'vue'
import { defineComponent, h } from 'vue'
import { tutorialChapterFolders } from '../steps/registry'
import { normalizeTutorialGuideSearchText } from './index'

const guideModules = import.meta.glob('../../../.vitepress/tutorial/*/*/index.md', {
  eager: true,
  import: 'default',
}) as Record<string, Component>

const rawGuideModules = import.meta.glob('../../../.vitepress/tutorial/*/*/index.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const missingGuideComponent = defineComponent({
  name: 'TutorialMissingGuide',
  setup() {
    return () => h('p', { class: 'text-sm text-zinc-600 dark:text-zinc-300' }, 'Guide content is missing for this tutorial chapter.')
  },
})

function getGuideModulePath(folder: string) {
  return `../../../.vitepress/tutorial/${folder}/index.md`
}

function getChapterGuideComponent(chapterId: string): Component {
  const folder = tutorialChapterFolders[chapterId]

  if (!folder)
    return missingGuideComponent

  return guideModules[getGuideModulePath(folder)] ?? missingGuideComponent
}

function getChapterGuideSearchText(chapterId: string): string {
  const folder = tutorialChapterFolders[chapterId]

  if (!folder)
    return ''

  return normalizeTutorialGuideSearchText(rawGuideModules[getGuideModulePath(folder)] ?? '')
}

export {
  getChapterGuideComponent,
  getChapterGuideSearchText,
}
