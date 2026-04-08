import { memoryBackend } from './backend'
import { registerTutorialAction, setTutorialState } from './bridge'

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}

async function nextUiTick() {
  await sleep(0)
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  await sleep(0)
}

async function waitFor(predicate: () => boolean, timeout = 1500, interval = 50) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (predicate())
      return true

    await sleep(interval)
  }

  return predicate()
}

function getElementText(element: Element | null | undefined) {
  return element?.textContent?.trim() ?? ''
}

function getTodoTexts(selector = '.todo-list li') {
  return Array.from(document.querySelectorAll(selector))
    .map((item) => {
      const strong = item.querySelector('strong')
      return getElementText(strong ?? item)
    })
    .filter(Boolean)
}

function getTodoCount(selector = '.todo-list li') {
  return document.querySelectorAll(selector).length
}

function getTodoItem(text: string) {
  return Array.from(document.querySelectorAll<HTMLLIElement>('.todo-list li'))
    .find(item => getElementText(item).includes(text)) ?? null
}

function findButton(text: string, scope: ParentNode = document) {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => getElementText(button) === text) ?? null
}

function setInputValue(element: HTMLInputElement, value: string) {
  element.focus()
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(element: HTMLSelectElement, value: string) {
  element.focus()
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function clickButton(button: HTMLButtonElement | null) {
  if (!button)
    return false

  button.click()
  await nextUiTick()
  return true
}

async function clickElement(element: HTMLElement | null) {
  if (!element)
    return false

  element.click()
  await nextUiTick()
  return true
}

export function registerTutorialSmokeActions() {
  registerTutorialAction('query-smoke', async () => {
    await nextUiTick()

    setTutorialState({
      listCount: getTodoCount(),
      todoTexts: getTodoTexts(),
    })
  })

  registerTutorialAction('query-refresh-smoke', async () => {
    const before = getTodoCount()
    const refreshButton = findButton('Refresh')

    const clicked = await clickButton(refreshButton)
    const refreshWorked = clicked
      ? await waitFor(() => getTodoCount() >= before)
      : false

    setTutorialState({
      listCount: getTodoCount(),
      todoTexts: getTodoTexts(),
      query: {
        refreshWorked,
      },
    })
  })

  registerTutorialAction('mutation-smoke', async () => {
    const probeText = 'Verify the mutation chapter'
    let created = false
    let toggled = false
    let deleted = false

    const input = document.querySelector<HTMLInputElement>('.form-row input')
    const addButton = findButton('Add task') ?? findButton('Add todo')

    if (input && addButton) {
      setInputValue(input, probeText)
      await clickButton(addButton)
      created = await waitFor(() => getTodoTexts().includes(probeText))
    }

    const createdTodo = memoryBackend.list('todos').find(todo => todo.text === probeText)
    const todoItem = createdTodo ? getTodoItem(probeText) : null

    if (createdTodo && todoItem) {
      const toggleCheckbox = todoItem.querySelector<HTMLInputElement>('.todo-checkbox')
      const toggleButton = findButton(createdTodo.completed ? 'Mark open' : 'Complete', todoItem)
        ?? findButton('Complete', todoItem)
        ?? findButton('Mark open', todoItem)
      const deleteButton = findButton('Delete', todoItem)

      if (await clickElement(toggleCheckbox) || await clickButton(toggleButton)) {
        toggled = await waitFor(() => Boolean(memoryBackend.get('todos', createdTodo.id)?.completed))
      }

      if (await clickButton(deleteButton)) {
        deleted = await waitFor(() => !memoryBackend.get('todos', createdTodo.id))
      }
    }

    setTutorialState({
      listCount: getTodoCount(),
      todoTexts: getTodoTexts(),
      mutation: {
        created,
        toggled,
        deleted,
      },
    })
  })

  registerTutorialAction('mutation-create-smoke', async () => {
    const probeText = 'Verify the create chapter'
    const input = document.querySelector<HTMLInputElement>('.form-row input')
    const addButton = findButton('Add task') ?? findButton('Add todo')
    let created = false

    if (input && addButton) {
      setInputValue(input, probeText)
      await clickButton(addButton)
      created = await waitFor(() => getTodoTexts().includes(probeText))
    }

    setTutorialState({
      listCount: getTodoCount(),
      todoTexts: getTodoTexts(),
      mutation: {
        created,
        toggled: false,
        deleted: false,
      },
    })
  })

  registerTutorialAction('mutation-update-delete-smoke', async () => {
    let toggled = false
    let deleted = false
    const initialCount = getTodoCount()
    const todoItem = document.querySelector<HTMLLIElement>('.todo-list li')

    if (todoItem) {
      const todoText = getTodoTexts()[0] ?? ''
      const todoRecord = memoryBackend.list('todos').find(todo => todo.text === todoText)
      const beforeCompleted = Boolean(todoRecord?.completed)
      const toggleCheckbox = todoItem.querySelector<HTMLInputElement>('.todo-checkbox')
      const toggleButton = findButton('Complete', todoItem) ?? findButton('Mark open', todoItem)
      const beforeToggleLabel = getElementText(toggleButton)
      toggled = (await clickElement(toggleCheckbox) || await clickButton(toggleButton))
        ? await waitFor(() => todoRecord
            ? Boolean(memoryBackend.get('todos', todoRecord.id)?.completed) !== beforeCompleted
            : (() => {
                const nextButton = findButton('Complete', todoItem) ?? findButton('Mark open', todoItem)
                return Boolean(nextButton) && getElementText(nextButton) !== beforeToggleLabel
              })())
        : false

      const deleteButton = findButton('Delete', todoItem)
      deleted = await clickButton(deleteButton)
        ? await waitFor(() => getTodoCount() === Math.max(initialCount - 1, 0))
        : false
    }

    setTutorialState({
      listCount: getTodoCount(),
      todoTexts: getTodoTexts(),
      mutation: {
        created: false,
        toggled,
        deleted,
      },
    })
  })

  registerTutorialAction('form-smoke', async () => {
    const createText = 'Practice createForm'
    const updateText = 'Updated from updateForm'
    let created = false
    let updated = false
    let resetWorked = false

    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
    const createInput = inputs[0] ?? null
    const editInput = inputs[1] ?? null
    const createSelect = document.querySelector<HTMLSelectElement>('select')
    const createButton = findButton('Save')
    const resetButton = findButton('Reset')
    const saveChangesButton = findButton('Save changes')
    const originalEditValue = editInput?.value ?? ''

    if (createInput && createButton) {
      setInputValue(createInput, createText)
      if (createSelect) {
        setSelectValue(createSelect, 'user-1')
      }
      await nextUiTick()
      await clickButton(createButton)
      created = await waitFor(() => memoryBackend.list('todos').some(todo => todo.text === createText))
    }

    if (editInput && resetButton && saveChangesButton) {
      setInputValue(editInput, updateText)
      await nextUiTick()

      if (await clickButton(resetButton)) {
        resetWorked = await waitFor(() => editInput.value === originalEditValue)
      }

      setInputValue(editInput, updateText)
      await nextUiTick()

      if (await clickButton(saveChangesButton)) {
        updated = await waitFor(() => memoryBackend.list('todos').some(todo => todo.text === updateText))
      }
    }

    setTutorialState({
      listCount: getTodoCount('.summary-list li'),
      todoTexts: getTodoTexts('.summary-list li'),
      form: {
        ready: Boolean(editInput),
        valid: Boolean(createInput?.value.trim().length),
        hasChanges: Boolean(editInput && editInput.value !== originalEditValue),
        created,
        updated,
        resetWorked,
      },
    })
  })

  registerTutorialAction('live-smoke', async () => {
    const before = getTodoCount()
    const simulateButton = findButton('Simulate remote task') ?? findButton('Simulate remote todo')

    await clickButton(simulateButton)
    await sleep(120)
    await nextUiTick()

    const todoTexts = getTodoTexts()
    setTutorialState({
      listCount: todoTexts.length,
      todoTexts,
      live: {
        total: todoTexts.length,
        remoteInsertSeen: todoTexts.length > before && todoTexts.some(text => text.startsWith('Remote todo')),
      },
    })
  })

  registerTutorialAction('cache-smoke', async () => {
    const injectButton = findButton('Inject task') ?? findButton('Inject cached todo')
    const clearButton = findButton('Clear cache')
    const initialCount = getTodoCount('.summary-list li, .todo-list li')

    const clickedInject = await clickButton(injectButton)
    const injected = clickedInject
      ? await waitFor(() => getTodoCount('.summary-list li, .todo-list li') > initialCount)
      : false

    const clickedClear = await clickButton(clearButton)
    const cleared = clickedClear
      ? await waitFor(() => getTodoCount('.summary-list li, .todo-list li') === 0)
      : false

    setTutorialState({
      listCount: getTodoCount('.summary-list li, .todo-list li'),
      todoTexts: getTodoTexts('.summary-list li, .todo-list li'),
      cache: {
        count: getTodoCount('.summary-list li, .todo-list li'),
        injected,
        cleared,
      },
    })
  })
}
