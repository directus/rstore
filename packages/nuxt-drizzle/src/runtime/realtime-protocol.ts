/**
 * Public entry point for the realtime protocol used by `@rstore/nuxt-drizzle`.
 *
 * Import from `@rstore/nuxt-drizzle/realtime` to build a custom realtime server
 * (or a non-Vue client) that speaks the same WebSocket protocol as the built-in
 * plugin. This module has **no Nuxt, Nitro, Vue, Drizzle, or H3 runtime
 * dependencies**, so it is safe to import from a standalone Node / Bun / Deno
 * / edge service.
 *
 * Protocol reference:
 * https://rstore.akryum.dev/plugins/nuxt-drizzle.html#realtime-protocol
 */

// Pub/Sub — transport-agnostic helpers for fanning out updates.
// The in-memory default is single-process; swap it out with `setPubSub()` for
// multi-node deployments (Redis, NATS, Postgres LISTEN/NOTIFY, …).
export type {
  PubSub,
  RstoreDrizzlePubSub,
  RstoreDrizzlePubSubChannels,
} from './server/utils/pubsub'

export {
  createMemoryPubSub,
  getPubSub,
  setPubSub,
  usePeerPubSub,
} from './server/utils/pubsub'

// Protocol message types & helpers
export type {
  ClientInitMessage,
  RstoreDrizzleRealtimePayload,
  RstoreDrizzleRealtimeUpdateType,
  SubscriptionMessage,
  SubscriptionUpdateMessage,
} from './utils/realtime'

export { getSubscriptionId, normalizeSubscriptionKey } from './utils/realtime'

// Subscription matcher — pure function used by the built-in WebSocket
// handler; re-exported so custom realtime servers can share the exact
// match semantics without re-implementing them.
export type { RstoreDrizzleDialect } from './utils/subscription-match'

export { subscriptionMatches } from './utils/subscription-match'

// `where` filter — operator AST + evaluator
export type {
  RestoreDrizzleConditionModifier,
  RstoreDrizzleBinaryOperator,
  RstoreDrizzleCondition,
  RstoreDrizzleConditionGroup,
  RstoreDrizzleTernaryOperator,
  RstoreDrizzleUnaryOperator,
} from './utils/types'

export { filterWhere } from './where'
