| name | description |
| --- | --- |
| `api-define-collection` | Reference for `defineCollection(...)` |

# defineCollection

## Surface

Defines a collection schema entry consumed by `createStore`.

## Syntax

```ts
const messages = withItemType<Message>().defineCollection({
  name: 'messages',
})
```

## Behavior

- Collection `name` becomes `store.<name>` proxy key.
- Collection config drives key extraction, hooks, relations, and forms.

## Requirements

- Names must be unique in store schema.

## Pitfalls

1. Duplicate names collide at store proxy and throw.
