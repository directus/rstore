# S12: Monospace adoption of S08–S11

- Status: planned.
- Depends on: [S08](./08-subscribe-payload.md)–[S11](./11-ended-live-queries.md) released on a pkg.pr.new build pinned in `directus-next`.
- Owner: `packages/studio/app/rstore/plugins/3.realtime.ts` and `useItems` in `directus-next`.

## Outcome

The Studio realtime plugin shrinks to the collection guard, the REST query string, `client.subscribe`, and one `setResult(rows, { meta })` per push. Behavior stays "exactly the same as today, but with live updates".

## Changes

- S08: drop `store.$resolveFindOptions` and `readOptionsKey`; use `findOptions` and `key` from the payload.
- S09: drop the plugin's cache-write loop; let `setResult` write the rows.
- S10: resolved server-read comparison excludes client-only options; re-check whether the "follow no pages while typing" selection in `useItems` is still needed.
- S11: forward engine `kickedOut` to `end({ retry: true })`.
- Update the S07 known limitations accordingly.

## Tests

- Existing plugin, client, `useItems` and e2e (`packages/testing/e2e/tests/realtime/live-lists.spec.ts`) tests pass unchanged in behavior.
- New: a kicked-out live query re-subscribes; a rejected push writes nothing to the cache.

## Exit gate

Studio typecheck, lint, unit suite, the realtime e2e spec.
