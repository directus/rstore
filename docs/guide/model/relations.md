# Relations

rstore supports relations between models. This allows you to define relationships between different models and automatically handle the loading and caching of related data.

## Defining Relations

Use the `relations` property in the model definition to define the relations between models. The `relations` property is an object where the keys are the names of the relations and the values are objects that define the relation.

The relation object can have the following properties:
- `to`: an object that defines the target model(s) and the fields to use for the relation.
  - Each key in the object is the name of the target model. There can be multiple target models in case of polymorphic relations.
    - `on`: the field in the target model that the relation is based on.
    - `eq`: the field in the current model that is matched against the `on` field.
- `many`: a boolean that indicates whether the relation is one-to-many or one-to-one. If `true`, the relation is one-to-many. If `false`, the relation is one-to-one.

### One-to-One

In a one-to-one relation, each item in the source model is related to exactly one item in the target model. You can define a one-to-one relation by setting the `many` property to `false` (or not specifying it as it's `false` by default).

```ts
import { defineItemType } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const userModel = defineItemType<User>().model({
  name: 'users',
  relations: {
    profile: {
      to: {
        profiles: {
          on: 'userId', // Profile.userId
          eq: 'id', // User.id
        },
      },
    },
  },
})
```

### One-to-Many

In a one-to-many relation, each item in the source model can be related to multiple items in the target model. You can define a one-to-many relation by setting the `many` property to `true`.

```ts
import { defineItemType } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const userModel = defineItemType<User>().model({
  name: 'users',
  relations: {
    posts: {
      to: {
        posts: {
          on: 'userId', // Post.userId
          eq: 'id', // User.id
        },
      },
      many: true,
    },
  },
})
```

### Example

```ts
import { defineItemType } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const userModel = defineItemType<User>().model({
  name: 'users',
  relations: {
    receivedMessages: {
      to: {
        messages: {
          on: 'recipientId', // Message.recipientId
          eq: 'id', // User.id
        },
      },
      many: true,
    },
    sentMessages: {
      to: {
        messages: {
          on: 'senderId', // Message.senderId
          eq: 'id', // User.id
        },
      },
      many: true,
    },
  },
})

interface Message {
  id: string
  content: string
  senderId: string
  recipientId: string
}

const messageModel = defineItemType<Message>().model({
  name: 'messages',
  relations: {
    sender: {
      to: {
        users: {
          on: 'senderId', // Message.senderId
          eq: 'id', // User.id
        },
      },
    },
    recipient: {
      to: {
        users: {
          on: 'recipientId', // Message.recipientId
          eq: 'id', // User.id
        },
      },
    },
  },
})
```

## Polymorphic Relations

In a polymorphic relation, the target model can be one of several models. You can define a polymorphic relation by specifying multiple target models in the `to` property.

### Example

```ts
import { defineItemType } from '@rstore/vue'

interface Comment {
  id: string
  content: string
  postId: string
  authorId: string
}

const commentModel = defineItemType<Comment>().model({
  name: 'comments',
  relations: {
    post: {
      to: {
        posts: {
          on: 'id', // Post.id
          eq: 'postId', // Comment.postId
        },
        imagesPosts: {
          on: 'id', // ImagePost.id
          eq: 'postId', // Comment.postId
        },
      },
    },
    user: {
      to: {
        users: {
          on: 'id', // User.id
          eq: 'authorId', // Comment.authorId
        },
        bots: {
          on: 'id', // Bot.id
          eq: 'authorId', // Comment.authorId
        },
      },
    },
  },
})
```

::: info
Support for matching relations on multiple fields is coming soon.
:::
