/**
 * `@rstore/multiplayer/clock`: Hybrid Logical Clock (HLC) timestamps.
 *
 * Every causal ordering in the package (field LWW, tombstones) compares
 * serialized HLC strings (`physicalHex:logicalHex:nodeId`) or legacy numeric
 * wall-clock values with {@link compareHLC}.
 *
 * @module
 */
export * from './clock.js'
export * from './error.js'
export * from './nodeId.js'
export * from './serialization.js'
export * from './types.js'
