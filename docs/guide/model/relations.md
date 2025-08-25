# Relations

rstore supports relations between models. This allows you to define relationships between different models and automatically handle the loading and caching of related data.

## Defining Relations

Use the `defineRelations` function to define the relations between models. It accepts an object where the keys are the names of the relations and the values are objects that define the relation.

The first parameter is the source model, andd the second parameter is a function that receives an object with a `model` method to reference other models.

The relation object can have the following properties:
- `to`: an object that defines the target model(s) and the fields to use for the relation.
  - Each key in the object is the name of the target model. There can be multiple target models in case of polymorphic relations.
    - `on`: An object that maps fields from the target model to fields in the source model. The keys are the fields in the target model, and the values are the corresponding fields in the source model. You can use the model names as prefixes to make it clearer which model the fields belong to.
    - `filter`: (optional) A function that takes an item from the current model and an item from the target model, and returns a boolean indicating whether the items are related.
- `many`: a boolean that indicates whether the relation is one-to-many or one-to-one. If `true`, the relation is one-to-many. If `false`, the relation is one-to-one.

You can then pass the relations alongside the models to the store schema:

```ts{18-22}
import { createStore, defineModel, defineRelations } from '@rstore/vue'

const model1 = defineModel({ name: 'model1' })
const model2 = defineModel({ name: 'model2' })

const model1Relations = defineRelations(model1, ({ model }) => ({
  relatedItems: {
    to: model(model2, {
      on: {
        'model2.foreignKey': 'model1.id', // Type checked!
      },
    }),
    many: true, // One-to-many relation
  },
}))

const store = await createStore({
  schema: [
    model1,
    model2,
    model1Relations,
  ],
  plugins: [
    // Your plugins here
  ],
})
```

### One-to-One

In a one-to-one relation, each item in the source model is related to exactly one item in the target model. You can define a one-to-one relation by setting the `many` property to `false` (or not specifying it as it's `false` by default).

```ts
import { defineItemType, defineRelations } from '@rstore/vue'
// Import another model that is named 'profile'
import { profileModel } from './profile'

interface User {
  id: string
  name: string
}

const userModel = defineItemType<User>().model({
  name: 'users',
})

const userRelations = defineRelations(userModel, ({ model }) => ({
  profile: {
    to: model(profileModel, {
      on: {
        'profiles.userId': 'users.id', // Type checked!
      },
    })
  }
}))
```

### One-to-Many

In a one-to-many relation, each item in the source model can be related to multiple items in the target model. You can define a one-to-many relation by setting the `many` property to `true`.

```ts
import { defineItemType, defineRelations } from '@rstore/vue'
// Import another model that is named 'post'
import { postModel } from './post'

interface User {
  id: string
  name: string
}

const userModel = defineItemType<User>().model({
  name: 'users',
})

const userRelations = defineRelations(userModel, ({ model }) => ({
  posts: {
    to: model(postModel, {
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
import { defineItemType, defineRelations } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const userModel = defineItemType<User>().model({
  name: 'users',
})

const userRelations = defineRelations(userModel, ({ model }) => ({
  receivedMessages: {
    to: model(messageModel, {
      on: {
        'messages.recipientId': 'users.id',
      },
    }),
    many: true,
  },
  sentMessages: {
    to: model(messageModel, {
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

const messageModel = defineItemType<Message>().model({
  name: 'messages',
})

const messageRelations = defineRelations(messageModel, ({ model }) => ({
  sender: {
    to: model(userModel, {
      on: {
        'users.id': 'messages.senderId',
      },
    }),
  },
  recipient: {
    to: model(userModel, {
      on: {
        'users.id': 'messages.recipientId',
      },
    }),
  },
}))
```

## Polymorphic Relations

In a polymorphic relation, the target model can be one of several models. You can define a polymorphic relation by specifying multiple target models in the `to` property.

### Example

```ts
import { defineItemType, defineRelations } from '@rstore/vue'

interface Comment {
  id: string
  content: string
  postId: string
  authorId: string
}

const commentModel = defineItemType<Comment>().model({
  name: 'comments',
})

const commentRelations = defineRelations(commentModel, ({ model }) => ({
  post: {
    to: {
      ...model(postsModel, {
        on: {
          'posts.id': 'comments.postId',
        },
      }),
      ...model(imagesPostsModel, {
        on: {
          'imagesPosts.id': 'comments.postId',
        },
      }),
    },
  },
  author: {
    to: {
      ...model(usersModel, {
        on: {
          'users.id': 'comments.authorId',
        },
      }),
      ...model(botsModel, {
        on: {
          'bots.id': 'comments.authorId',
        },
      }),
    },
  },
}))
```

## Multi-field Relations

You can define relations that use multiple fields to establish the relationship between models.

```ts
const myModelRelations = defineRelations(myModel, ({ model }) => ({
  relatedItems: {
    to: model(otherModel, {
      on: {
        // Will match only if both fields are equal
        'otherModel.type': 'things.relatedItemType',
        'otherModel.subType': 'things.relatedItemSubType',
      },
    }),
  },
}))
```

## Custom Filter

You can also define a custom filter function to determine if two items are related. The `filter` function receives two parameters: the item from the source model and the item from the target model. It should return `true` if the items are related, and `false` otherwise.

```ts
const userRelations = defineRelations(userModel, ({ model }) => ({
  recentMessages: {
    to: model(messageModel, {
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
