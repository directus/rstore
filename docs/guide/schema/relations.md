# Relations

rstore supports relations between collections. This allows you to define relationships between different collections and automatically handle the loading and caching of related data.

## Defining Relations <Badge text="Changed in v0.7" type="warning" />

Use the `defineRelations` function to define the relations between collections. It accepts an object where the keys are the names of the relations and the values are objects that define the relation.

The first parameter is the source collection, andd the second parameter is a function that receives an object with a `collection` method to reference other collections.

The relation object can have the following properties:
- `to`: an object that defines the target collection(s) and the fields to use for the relation.
  - Each key in the object is the name of the target collection. There can be multiple target collections in case of polymorphic relations.
    - `on`: An object that maps fields from the target collection to fields in the source collection. The keys are the fields in the target collection, and the values are the corresponding fields in the source collection. You can use the collection names as prefixes to make it clearer which collection the fields belong to.
    - `filter`: (optional) A function that takes an item from the current collection and an item from the target collection, and returns a boolean indicating whether the items are related.
- `many`: a boolean that indicates whether the relation is one-to-many or one-to-one. If `true`, the relation is one-to-many. If `false`, the relation is one-to-one.

You can then pass the relations alongside the collections to the store schema:

```ts{18-22}
import { createStore, defineCollection, defineRelations } from '@rstore/vue'

const collection1 = defineCollection({ name: 'collection1' })
const collection2 = defineCollection({ name: 'collection2' })

const collection1Relations = defineRelations(collection1, ({ collection }) => ({
  relatedItems: {
    to: collection(collection2, {
      on: {
        'collection2.foreignKey': 'collection1.id', // Type checked!
      },
    }),
    many: true, // One-to-many relation
  },
}))

const store = await createStore({
  schema: [
    collection1,
    collection2,
    collection1Relations,
  ],
  plugins: [
    // Your plugins here
  ],
})
```

### One-to-One

In a one-to-one relation, each item in the source collection is related to exactly one item in the target collection. You can define a one-to-one relation by setting the `many` property to `false` (or not specifying it as it's `false` by default).

```ts
import { defineRelations, withItemType } from '@rstore/vue'
// Import another collection that is named 'profile'
import { profileCollection } from './profile'

interface User {
  id: string
  name: string
}

const userCollection = withItemType<User>().defineCollection({
  name: 'users',
})

const userRelations = defineRelations(userCollection, ({ collection }) => ({
  profile: {
    to: collection(profileCollection, {
      on: {
        'profiles.userId': 'users.id', // Type checked!
      },
    })
  }
}))
```

### One-to-Many

In a one-to-many relation, each item in the source collection can be related to multiple items in the target collection. You can define a one-to-many relation by setting the `many` property to `true`.

```ts
import { defineRelations, withItemType } from '@rstore/vue'
// Import another collection that is named 'post'
import { postCollection } from './post'

interface User {
  id: string
  name: string
}

const userCollection = withItemType<User>().defineCollection({
  name: 'users',
})

const userRelations = defineRelations(userCollection, ({ collection }) => ({
  posts: {
    to: collection(postCollection, {
      on: {
        'posts.authorId': 'users.id', // Type checked!
      },
    }),
    many: true, // One-to-many relation
  },
}))
```
### Example

```ts
import { defineRelations, withItemType } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const userCollection = withItemType<User>().defineCollection({
  name: 'users',
})

const userRelations = defineRelations(userCollection, ({ collection }) => ({
  receivedMessages: {
    to: collection(messageCollection, {
      on: {
        'messages.recipientId': 'users.id',
      },
    }),
    many: true,
  },
  sentMessages: {
    to: collection(messageCollection, {
      on: {
        'messages.senderId': 'users.id',
      },
    }),
    many: true,
  },
}))

interface Message {
  id: string
  content: string
  senderId: string
  recipientId: string
}

const messageCollection = withItemType<Message>().defineCollection({
  name: 'messages',
})

const messageRelations = defineRelations(messageCollection, ({ collection }) => ({
  sender: {
    to: collection(userCollection, {
      on: {
        'users.id': 'messages.senderId',
      },
    }),
  },
  recipient: {
    to: collection(userCollection, {
      on: {
        'users.id': 'messages.recipientId',
      },
    }),
  },
}))
```

## Polymorphic Relations <Badge text="Changed in v0.7" type="warning" />

In a polymorphic relation, the target collection can be one of several collections. You can define a polymorphic relation by specifying multiple target collections in the `to` property.

### Example

```ts
import { defineRelations, withItemType } from '@rstore/vue'

interface Comment {
  id: string
  content: string
  postId: string
  authorId: string
}

const commentCollection = withItemType<Comment>().defineCollection({
  name: 'comments',
})

const commentRelations = defineRelations(commentCollection, ({ collection }) => ({
  post: {
    to: {
      ...collection(postsCollection, {
        on: {
          'posts.id': 'comments.postId',
        },
      }),
      ...collection(imagesPostsCollection, {
        on: {
          'imagesPosts.id': 'comments.postId',
        },
      }),
    },
  },
  author: {
    to: {
      ...collection(usersCollection, {
        on: {
          'users.id': 'comments.authorId',
        },
      }),
      ...collection(botsCollection, {
        on: {
          'bots.id': 'comments.authorId',
        },
      }),
    },
  },
}))
```

## Multi-field Relations <Badge text="New in v0.7" />

You can define relations that use multiple fields to establish the relationship between collections.

```ts
const myCollectionRelations = defineRelations(myCollection, ({ collection }) => ({
  relatedItems: {
    to: collection(otherCollection, {
      on: {
        // Will match only if both fields are equal
        'otherCollection.type': 'things.relatedItemType',
        'otherCollection.subType': 'things.relatedItemSubType',
      },
    }),
  },
}))
```

## Custom Filter <Badge text="New in v0.7" />

You can also define a custom filter function to determine if two items are related. The `filter` function receives two parameters: the item from the source collection and the item from the target collection. It should return `true` if the items are related, and `false` otherwise.

```ts
const userRelations = defineRelations(userCollection, ({ collection }) => ({
  recentMessages: {
    to: collection(messageCollection, {
      on: {
        'messages.recipientId': 'users.id',
      },
      filter: (user, message) =>
        // Messages from the last 7 days
        message.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000,
    }),
    many: true,
  },
}))
```
