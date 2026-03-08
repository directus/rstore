| name | description |
| --- | --- |
| `api-with-item-type` | Reference for `withItemType<T>()` typing helper |

# withItemType

## Surface

`withItemType<T>()` returns a typed builder used before `defineCollection(...)`.

## Syntax

```ts
const todos = withItemType<Todo>().defineCollection({
  name: 'todos',
})
```

## Behavior

- Binds item type to subsequent collection definition.
- Improves inference for collection item shape in APIs/forms.

## Requirements

- Provide a stable item type that reflects transport/cache shape.

## Pitfalls

1. Mismatched type and runtime payload shape leads to false confidence.
