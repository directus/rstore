import type { Component } from 'vue'
import { defineComponent, h } from 'vue'
import { tutorialStepFolders } from '../steps/registry'

const guideModules = import.meta.glob('../../../.vitepress/tutorial/*/index.md', {
  eager: true,
  import: 'default',
}) as Record<string, Component>

const missingGuideComponent = defineComponent({
  name: 'TutorialMissingGuide',
  setup() {
    return () => h('p', { class: 'text-sm text-zinc-600 dark:text-zinc-300' }, 'Guide content is missing for this tutorial step.')
  },
})

function getStepGuideComponent(stepId: string): Component {
  const folder = tutorialStepFolders[stepId]

  if (!folder)
    return missingGuideComponent

  return guideModules[`../../../.vitepress/tutorial/${folder}/index.md`] ?? missingGuideComponent
}

export {
  getStepGuideComponent,
}
