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

const User = defineItemType<User>().model({
  name: 'users',
  relations: {
    profile: {
      to: {
        Profile: {
          on: 'userId', // Profile.userId
          eq: 'id', // User.id
        },
      },
    },
  },
} as const)
```

### One-to-Many

In a one-to-many relation, each item in the source model can be related to multiple items in the target model. You can define a one-to-many relation by setting the `many` property to `true`.

```ts
import { defineItemType } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const User = defineItemType<User>().model({
  name: 'users',
  relations: {
    posts: {
      to: {
        Post: {
          on: 'userId', // Post.userId
          eq: 'id', // User.id
        },
      },
      many: true,
    },
  },
} as const)
```

### Example

```ts
import { defineItemType } from '@rstore/vue'

interface User {
  id: string
  name: string
}

const User = defineItemType<User>().model({
  name: 'users',
  relations: {
    receivedMessages: {
      to: {
        Message: {
          on: 'recipientId', // Message.recipientId
          eq: 'id', // User.id
        },
      },
      many: true,
    },
    sentMessages: {
      to: {
        Message: {
          on: 'senderId', // Message.senderId
          eq: 'id', // User.id
        },
      },
      many: true,
    },
  },
} as const)

interface Message {
  id: string
  content: string
  senderId: string
  recipientId: string
}

const Message = defineItemType<Message>().model({
  name: 'messages',
  relations: {
    sender: {
      to: {
        User: {
          on: 'senderId', // Message.senderId
          eq: 'id', // User.id
        },
      },
    },
    recipient: {
      to: {
        User: {
          on: 'recipientId', // Message.recipientId
          eq: 'id', // User.id
        },
      },
    },
  },
} as const)
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

const Comment = defineItemType<Comment>().model({
  name: 'comments',
  relations: {
    post: {
      to: {
        Post: {
          on: 'id', // Post.id
          eq: 'postId', // Comment.postId
        },
        ImagePost: {
          on: 'id', // ImagePost.id
          eq: 'postId', // Comment.postId
        },
      },
    },
    user: {
      to: {
        User: {
          on: 'id', // User.id
          eq: 'authorId', // Comment.authorId
        },
        Bot: {
          on: 'id', // Bot.id
          eq: 'authorId', // Comment.authorId
        },
      },
    },
  },
} as const)
```
