---
title: Learn Next
---

At this point you have built the core rstore loop by hand in Vue: define collections, create a store, query data, mutate it, manage forms, resolve relations, extract a plugin, subscribe to updates, and work with the cache directly.

This chapter starts with the completed tutorial app already loaded in the preview, and every app file is unlocked in the editor. Treat it like a playground: change the finished code, try new query or mutation ideas, and use the guide links below when you want to pull the app in a new direction.

From here, a few important directions open up:

- [Module](/guide/data/module) when you need shared app logic that lives next to the store instead of inside a single component
- [Offline](/guide/data/offline) when local cache state and queued mutations should survive network loss
- [Devtools](/guide/devtools) when you want to inspect cache state, subscriptions, collections, and module behavior directly
- [Federation](/guide/schema/federation) when different collections belong to different backends or scopes
- [Yjs](/plugins/yjs) when you want collaborative editing on top of rstore’s local-first data model

These are not separate sub-products. They are extensions of the same ideas you already used in the app: collections, cache, plugins, and local-first reads.
