# Subscriptions

rstore provides a set of methods to help build realtime applications. Plugins can use [the relevant hooks](../plugin/hooks.md#subscriptions) to connect to WebSockets, Server-Sent Events, or any other realtime protocol.

## Subscribe <Badge text="Changed in v0.7" type="warning" />

Subscriptions are a way to listen for changes in the data store. You can subscribe to a specific collection and plugins will update the store in realtime. You can pass the same parameters than in the [queries](./query.md).

```ts
const store = useStore()

store.ChatMessage.subscribe(q => q({
  params: {
    filter: {
      roomId: 'room1',
    },
  },
}))
```

## Unsubscribe

The `subscribe` method returns a function that can be called to unsubscribe from the store. This is useful when you want to stop listening for changes in the data store. Futhermore, the subscription will be automatically removed when the current component is unmounted.

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

You can use the `liveQueryFirst` and `liveQueryMany` methods to do both a query and a subscription at the same time.

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
