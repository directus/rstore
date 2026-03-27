---
title: Mutation Patterns
---

The app only needs one create, one update, and one delete flow, but the mutation API is wider than that.

`createMany`, `updateMany`, and `deleteMany` exist when your backend can batch work more efficiently than individual requests. They do not change the mental model. They are still collection mutations that reconcile through the cache.

Optimistic updates sit one layer closer to the cache. rstore implements them with cache layers. If you later need a “show this change immediately, then confirm or roll it back” flow, that is the part of the API to study.

The practical lesson is simple: treat mutations as changes to application state, not as manual UI bookkeeping. The more you keep that separation intact now, the easier the advanced cases will feel later.
