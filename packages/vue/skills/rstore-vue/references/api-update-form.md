| name | description |
| --- | --- |
| `api-update-form` | Reference for collection `updateForm(options, formOptions?)` |

# updateForm

## Surface

Builds form object for updating one existing item.

## Syntax

```ts
const form = await store.todos.updateForm('1')
form.title = 'Updated'
await form.$submit()
```

## Behavior

- Can fetch item first to prefill form.
- Defaults to changed-field submission (`pickOnlyChanged: true`).

## Requirements

- Selection options/key must identify one item.

## Pitfalls

1. Disabling changed-field behavior may send larger payloads than needed.
