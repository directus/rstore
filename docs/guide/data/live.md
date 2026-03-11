# Subscriptions

rstore provides a set of methods to help build realtime applications. Plugins can use [the relevant hooks](../plugin/hooks.md#subscriptions) to connect to WebSockets, Server-Sent Events, or any other realtime protocol.

## Subscribe <Badge text="Changed in v0.7" type="warning" />

Subscriptions are a way to listen for data changes. You can subscribe to a specific collection and let plugins update the store in realtime. You can pass the same options you use in [queries](./query.md).

```ts
const store = useStore()

store.ChatMessage.subscribe(q => q.many({
  params: {
    filter: {
      roomId: 'room1',
    },
  },
}))
```

## Unsubscribe

The `subscribe` method returns a function you can call to stop listening. The subscription is also automatically removed when the current component is unmounted.

```ts
const { unsubscribe } = store.ChatMessage.subscribe()

// ...

unsubscribe()
```

## Metadata

Plugins can set metadata information on the `meta` ref returned by `subscribe`:

```ts
const { meta } = store.ChatMessage.subscribe()
console.log(meta.value)
```

## Live Query <Badge text="Changed in v0.7" type="warning" />

Use `liveQuery` to combine query + subscription in one call.

```ts
const { data: user } = store.User.liveQuery(q => q.first('some-id'))
```

```ts
const { data: messages } = store.ChatMessage.liveQuery(q => q.many({
  filter: item => item.roomId === 'room1',
  params: {
    filter: {
      roomId: 'room1',
    },
  },
}))
```

## Reconnect Handling

`liveQuery` also refreshes when `realtimeReconnectEventHook` is triggered.

This hook is exported from `@rstore/vue` and is intended for realtime adapters to signal that their transport has recovered after a disconnect. For example, `@rstore/nuxt-drizzle` triggers it after the websocket reconnects and active subscriptions have been re-sent.

If you build a custom realtime plugin, trigger the hook only after the connection is usable again:

```ts
import { definePlugin, realtimeReconnectEventHook } from '@rstore/vue'
import { watch } from 'vue'

export default definePlugin({
  name: 'my-realtime',
  category: 'remote',
  setup() {
    let hasConnected = false

    watch(socketStatus, (status) => {
      if (status === 'OPEN') {
        if (hasConnected) {
          realtimeReconnectEventHook.trigger()
        }
        hasConnected = true
      }
    })
  },
})
```

You can also listen to the hook directly for advanced cases:

```ts
import { realtimeReconnectEventHook } from '@rstore/vue'
import { onScopeDispose } from 'vue'

const query = await store.todos.liveQuery(q => q.many())

const { off } = realtimeReconnectEventHook.on(() => {
  query.refresh()
})

onScopeDispose(off)
```

Avoid triggering it on the initial connect, otherwise `liveQuery` will perform an unnecessary extra refresh.
