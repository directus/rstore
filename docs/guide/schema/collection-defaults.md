# Collection defaults

You can define default options for all the collections in your application. This is useful for setting up default values for properties that are common across all collections, such as `getKey`.

Set them on the `collectionDefaults` option of `createStore`.

## Accepted properties

You can define the following properties in the `collectionDefaults` option:

- `getKey`: a function that takes the collection name and the item and returns the key for the item. This is useful for setting up default keys for all collections.

- `isInstanceOf`: a function that takes the collection and returns a new function taking the item as parameter and returning a boolean indicating if the item is an instance of the collection.

- `computed`: an object that contains computed fields for all collections. This is useful for setting up default computed fields for all collections. Each collection can override the default computed fields by defining its own `computed` properties with the same name.

- `fields`: an object that contains field configurations for all collections. This is useful for setting up default field configurations for all collections. Each collection can override the default field configurations by defining its own `fields` properties with the same name.

- `meta`: an object that contains metadata for all collections. This is useful for setting up default metadata for all collections. Each collection can override the default metadata by defining its own `meta` properties with the same name.

## Plugin API

Plugins can also define default options for all collections - using the `addCollectionDefaults` method:

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-rstore-plugin',
  setup({ addCollectionDefaults, hook }) {
    addCollectionDefaults({
      getKey: (collectionName, item) => item.customId,
      // ...
    })
  }
})
```

## Recipes

### Default key

```ts
const store = createStore({
  schema,
  plugins,
  collectionDefaults: {
    getKey: (collectionName, item) => item.customId,
  },
})
```

### Instance checking using `__typename`

```ts
const store = createStore({
  schema,
  plugins,
  collectionDefaults: {
    isInstanceOf: collection => item => item.__typename === collection.name
  },
})
```

### Default parse for dates

Using the field configuration, you can set up a default parse function for all date fields in your collections. This is useful for parsing dates from the server and converting them to JavaScript Date objects.

```ts
function parseDate(value: any): Date {
  return typeof value === 'string' ? new Date(value) : value
}

const store = createStore({
  schema,
  plugins,
  collectionDefaults: {
    fields: {
      createdAt: {
        parse: parseDate,
      },
      updatedAt: {
        parse: parseDate,
      },
    },
  },
})
