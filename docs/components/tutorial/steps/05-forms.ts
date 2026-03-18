import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const formsStep: TutorialStepDefinition = {
  id: 'forms',
  title: 'Form Objects',
  feature: 'Use `createForm()` and `updateForm()`',
  group: 'Core',
  referenceLinks: [
    { label: 'Form Object', href: '/guide/data/form' },
    { label: 'Mutation', href: '/guide/data/mutation' },
  ],
  editableFiles: ['src/components/TodoForm.vue'],
  validationAction: 'form-smoke',
  validator: (state) => {
    const storeResult = shared.requireStore('src/components/TodoForm.vue', state)
    if (storeResult)
      return storeResult

    if (!state.form?.ready || !state.form.created || !state.form.updated || !state.form.resetWorked) {
      return shared.fail(
        'The form object smoke test is still missing part of the expected workflow.',
        [
          'The create form should submit a new todo.',
          'The update form should detect changes, reset cleanly, and then submit an update.',
        ],
        ['src/components/TodoForm.vue'],
      )
    }

    return shared.pass('The form component is now powered by rstore form objects.', [
      'The preview successfully exercised create, reset, and update form flows.',
    ])
  },
}
