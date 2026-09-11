import type { CacheModuleSnapshot } from '@rstore/shared'
import type { EngineContext, ModuleHolder, ModuleIdentity, NormalizedCacheSnapshot } from './internal-types.js'
import { getLegacyModuleKey } from './module-key.js'
import { replaceRecordContents } from './records.js'

/** Preflighted module registry replacement. */
export interface PreparedModuleHydration {
  /** Exact next registry, retaining existing holders. */
  modules: Map<string, Map<string, ModuleHolder>>
  /** Existing holder content replacements. */
  replacements: Array<{ holder: ModuleHolder, value: unknown }>
  /** Unclaimed legacy entries. */
  pendingLegacyModules: Map<string, unknown>
  /** Exact tuples that claimed legacy entries. */
  legacyModuleClaims: Map<string, ModuleIdentity>
}

/** Return stable exact module state, lazily claiming legacy input. */
export function getModuleState(ctx: EngineContext, name: string, key: string, initState: any): any {
  const existing = ctx.modules.get(name)?.get(key)
  if (existing) {
    return existing.value
  }

  const legacyKey = getLegacyModuleKey(name, key)
  let value = initState
  let claimsLegacy = false
  if (ctx.pendingLegacyModules.has(legacyKey)) {
    const claim = ctx.legacyModuleClaims.get(legacyKey)
    if (claim && (claim.name !== name || claim.key !== key)) {
      throw ambiguousLegacyModuleError(legacyKey, claim, { name, key })
    }
    value = ctx.pendingLegacyModules.get(legacyKey)
    claimsLegacy = true
  }
  else {
    const claim = ctx.legacyModuleClaims.get(legacyKey)
    if (claim && (claim.name !== name || claim.key !== key)) {
      throw ambiguousLegacyModuleError(legacyKey, claim, { name, key })
    }
  }

  const holder = { value: ctx.callbacks.wrapModuleState?.(value) ?? value }
  if (claimsLegacy) {
    ctx.pendingLegacyModules.delete(legacyKey)
    ctx.legacyModuleClaims.set(legacyKey, { name, key })
  }
  const byKey = ctx.modules.get(name) ?? new Map<string, ModuleHolder>()
  ctx.modules.set(name, byKey)
  byKey.set(key, holder)
  return holder.value
}

/** Serialize exact tuples plus pending unclaimed legacy entries. */
export function serializeModules(ctx: EngineContext): CacheModuleSnapshot[] {
  const result: CacheModuleSnapshot[] = []
  for (const [name, byKey] of ctx.modules) {
    for (const [key, holder] of byKey) {
      result.push({ name, key, state: holder.value })
    }
  }
  for (const [legacyKey, state] of ctx.pendingLegacyModules) {
    result.push({ legacyKey, state })
  }
  return result
}

/** Validate module shape compatibility and prepare new holders before reset. */
export function prepareModuleHydration(
  ctx: EngineContext,
  snapshot: NormalizedCacheSnapshot,
): PreparedModuleHydration {
  const modules = cloneModuleRegistry(ctx.modules)
  const replacements: PreparedModuleHydration['replacements'] = []
  const pendingLegacyModules = new Map(snapshot.legacyModules)
  const legacyModuleClaims = new Map<string, ModuleIdentity>()

  const legacyClaimants = collectLegacyClaimants(ctx.modules, pendingLegacyModules)
  for (const [legacyKey, claimants] of legacyClaimants) {
    if (claimants.length > 1) {
      throw ambiguousLegacyModuleError(legacyKey, claimants[0]!, claimants[1]!)
    }
  }

  for (const [name, byKey] of ctx.modules) {
    for (const [key, holder] of byKey) {
      const exact = snapshot.modules.get(name)
      let incoming = exact?.has(key) ? exact.get(key) : emptyModuleState(holder.value)
      const legacyKey = getLegacyModuleKey(name, key)
      if (!exact?.has(key) && pendingLegacyModules.has(legacyKey)) {
        incoming = pendingLegacyModules.get(legacyKey)
        pendingLegacyModules.delete(legacyKey)
        legacyModuleClaims.set(legacyKey, { name, key })
      }
      assertCompatibleModuleKinds(holder.value, incoming, `${name}:${key}`)
      assertReplaceableModule(holder.value, incoming, `${name}:${key}`)
      replacements.push({ holder, value: incoming })
    }
  }

  for (const [name, incomingByKey] of snapshot.modules) {
    const byKey = modules.get(name) ?? new Map<string, ModuleHolder>()
    modules.set(name, byKey)
    for (const [key, value] of incomingByKey) {
      if (!byKey.has(key)) {
        byKey.set(key, { value: ctx.callbacks.wrapModuleState?.(value) ?? value })
      }
    }
  }

  return { modules, replacements, pendingLegacyModules, legacyModuleClaims }
}

/** Preflight same-kind empty states for a transactional whole-cache clear. */
export function prepareModuleClear(ctx: EngineContext): PreparedModuleHydration {
  const replacements: PreparedModuleHydration['replacements'] = []
  for (const [name, byKey] of ctx.modules) {
    for (const [key, holder] of byKey) {
      const label = `${name}:${key}`
      const incoming = emptyModuleState(holder.value)
      assertReplaceableModule(holder.value, incoming, label)
      replacements.push({ holder, value: incoming })
    }
  }
  return {
    modules: cloneModuleRegistry(ctx.modules),
    replacements,
    pendingLegacyModules: new Map(),
    legacyModuleClaims: new Map(),
  }
}

/** Apply a fully preflighted module hydration. */
export function applyModuleHydration(ctx: EngineContext, prepared: PreparedModuleHydration): void {
  for (const replacement of prepared.replacements) {
    replaceModuleValue(replacement.holder, replacement.value)
  }
  ctx.modules = prepared.modules
  ctx.pendingLegacyModules = prepared.pendingLegacyModules
  ctx.legacyModuleClaims = prepared.legacyModuleClaims
}

/** Clone nested maps while retaining state holders. */
function cloneModuleRegistry(source: Map<string, Map<string, ModuleHolder>>): Map<string, Map<string, ModuleHolder>> {
  return new Map(Array.from(source, ([name, byKey]) => [name, new Map(byKey)]))
}

/** Find registered tuples that could claim each incoming legacy key. */
function collectLegacyClaimants(
  modules: Map<string, Map<string, ModuleHolder>>,
  pending: Map<string, unknown>,
): Map<string, ModuleIdentity[]> {
  const result = new Map<string, ModuleIdentity[]>()
  for (const [name, byKey] of modules) {
    for (const key of byKey.keys()) {
      const legacyKey = getLegacyModuleKey(name, key)
      if (pending.has(legacyKey)) {
        const entries = result.get(legacyKey) ?? []
        entries.push({ name, key })
        result.set(legacyKey, entries)
      }
    }
  }
  return result
}

/** Return same-kind empty module state. */
function emptyModuleState(value: unknown): unknown {
  if (Array.isArray(value)) {
    return []
  }
  if (value !== null && typeof value === 'object') {
    return {}
  }
  return undefined
}

/** Reject object/array/primitive shape changes before any cache swap. */
function assertCompatibleModuleKinds(target: unknown, source: unknown, label: string): void {
  const targetKind = moduleKind(target)
  const sourceKind = moduleKind(source)
  if ((targetKind === 'array' || targetKind === 'object') && targetKind !== sourceKind) {
    throw new TypeError(`Cache module "${label}" cannot change kind from ${targetKind} to ${sourceKind}`)
  }
}

/** Reject containers that cannot preserve identity during replacement. */
function assertReplaceableModule(target: unknown, source: unknown, label: string): void {
  if (target === source || (moduleKind(target) !== 'array' && moduleKind(target) !== 'object')) {
    return
  }
  const container = target as object
  if (!Object.isExtensible(container)) {
    throw new TypeError(`Cache module "${label}" is immutable and cannot be replaced in place`)
  }
  for (const key of Object.keys(container)) {
    if (Object.getOwnPropertyDescriptor(container, key)?.configurable === false) {
      throw new TypeError(`Cache module "${label}" is immutable and cannot be replaced in place`)
    }
  }
}

/** Classify identity-bearing module containers. */
function moduleKind(value: unknown): 'array' | 'object' | 'primitive' {
  return Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'primitive'
}

/** Replace object or array contents without changing caller identity. */
function replaceModuleValue(holder: ModuleHolder, source: unknown): void {
  const target = holder.value
  if (target === source) {
    return
  }
  if (Array.isArray(target)) {
    target.splice(0, target.length, ...(source as unknown[]))
  }
  else if (target !== null && typeof target === 'object') {
    replaceRecordContents(target, source as object)
  }
  else {
    holder.value = source
  }
}

/** Build explicit error for a legacy tuple collision. */
function ambiguousLegacyModuleError(legacyKey: string, first: ModuleIdentity, second: ModuleIdentity): Error {
  return new Error(`Ambiguous legacy module key "${legacyKey}" matches "${first.name}"/"${first.key}" and "${second.name}"/"${second.key}"`)
}
