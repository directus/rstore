| name | description |
| --- | --- |
| `api-rstore-drizzle-hooks` | Reference for `rstoreDrizzleHooks` |

# rstoreDrizzleHooks

## Surface

Global hook bus for generated REST handlers and realtime filtering.

## Syntax

```ts
rstoreDrizzleHooks.hook('index.get.before', ({ transformQuery }) => {
  transformQuery(({ where }) => {
    // add extra where constraints
  })
})
```

## Behavior

- Provides `index.*` and `item.*` before/after hooks plus `realtime.filter` and `realtime.authorize`.
- Before hooks can append query transforms through `transformQuery(...)`.
- After hooks can replace returned result through `setResult(...)`.
- `realtime.filter` runs per peer per frame: `reject()` drops the frame for that peer, `narrowRecord(partial)` delivers a column subset to that peer only.

## Requirements

- Hook logic must stay deterministic and safe for all matching requests.
- A `realtime.filter` handler must never mutate `payload.record` — one object is shared by every peer.

## Pitfalls

1. Heavy async hooks add latency to every matching API request.
2. `narrowRecord` intersects rather than replaces: it cannot add a column the published record lacks, nor re-add one an earlier handler removed.
3. Narrowing away the primary key columns makes the client-side apply throw, dropping that frame.
4. Narrowing runs after `where` matching, so a subscription filtering on a narrowed-away column still receives the frame — gate those in `realtime.authorize`, which carries `subscription.where`.
