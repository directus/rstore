---
title: Mutation Patterns
---

The page only needs the everyday CRUD loop, but the mutation API is broader than three single-item handlers.

`createMany`, `updateMany`, and `deleteMany` exist when batching is the right fit for your backend. Optimistic updates live closer to the cache and rely on cache layers so the UI can reflect a change before the backend round-trip finishes.

The reason this matters is not that you need those methods right now. It is that the bigger mutation API still follows the same model you have already been using: mutations change shared store state, and the rest of the app stays in sync by reading that shared state instead of patching local arrays by hand.
