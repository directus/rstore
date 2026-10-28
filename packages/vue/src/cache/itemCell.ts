import type { Ref, ShallowRef } from 'vue'
import type { CacheItemCellRegistry, ItemCell } from './itemCells'
import { shallowRef, triggerRef } from 'vue'

/** Prototype-backed item source avoiding wrapper-specific reader closures. */
export class CacheItemCell implements ItemCell {
  /** Vue version dependency tracked by active wrapper reads. */
  readonly ref: ShallowRef<number>
  /** Last readable value retained after detachment or deletion. */
  fallback: any
  /** Current source value, staged before its reactive notification. */
  private current: any
  /** Shared active reader keeps every wrapper bound to its version source. */
  private readonly activeReader: ItemCellReader = () => {
    // eslint-disable-next-line ts/no-unused-expressions
    this.ref.value
    return this.current
  }

  /** Shared state-specific reader selected outside hot field reads. */
  private reader: ItemCellReader
  /** Lazy, synchronized, or detached state. */
  private currentState: ItemCellState

  /** Create one compact source. */
  constructor(
    /** Owning registry, removed on complete disposal. */
    public registry: CacheItemCellRegistry | undefined,
    /** Owning collection. */
    public readonly collection: string,
    /** Canonical item key. */
    public readonly id: string,
    initial: any,
    state: ItemCellState,
  ) {
    this.ref = shallowRef(0)
    this.fallback = initial
    this.current = initial
    this.currentState = state
    this.reader = state === 'active' ? this.activeReader : readerForInactiveState(state)
  }

  /** Return lazy, synchronized, or detached state. */
  get state(): ItemCellState {
    return this.currentState
  }

  /** Select shared reader during lifecycle transitions. */
  set state(value: ItemCellState) {
    this.currentState = value
    this.reader = value === 'active' ? this.activeReader : readerForInactiveState(value)
  }

  /** Expose this prototype-backed source through Ref API. */
  get source(): Ref<any> {
    return this as unknown as Ref<any>
  }

  /** Read active value or lazily enter fallback/active ownership. */
  get value(): any {
    return this.reader(this)
  }

  /** Support Ref-shaped writes inside Vue utilities. */
  set value(next: any) {
    this.update(next)
  }

  /** Consume reactive dependency for an already requested wrapper. */
  track(): void {
    // eslint-disable-next-line ts/no-unused-expressions
    this.value
  }

  /** Return whether committed engine changes synchronize this cell. */
  isActive(): boolean {
    return this.state === 'active'
  }

  /** Stop registry ownership while preserving lazy reads. */
  detach(): void {
    this.registry?.detach(this)
  }

  /** Store one current value and notify reactive consumers. */
  update(next: any): void {
    if (this.stage(next))
      this.notify()
  }

  /** Replace current value without running reactive consumers yet. */
  stage(next: any): boolean {
    const changed = !Object.is(this.current, next)
    this.fallback = next
    this.current = next
    return changed
  }

  /** Notify consumers that a previously staged value is now available. */
  notify(): void {
    triggerRef(this.ref)
  }
}

/** Item-cell lifecycle state. */
type ItemCellState = 'dormant' | 'active' | 'detached'

/** Shared source reader signature. */
type ItemCellReader = (cell: CacheItemCell) => any

/** Activate a lazy wrapper or fall back to detached lookup. */
function readDormant(cell: CacheItemCell): any {
  if (cell.registry?.activate(cell))
    return cell.value
  return cell.registry?.readFallback(cell) ?? cell.fallback
}

/** Read current engine value for an evicted wrapper when runtime remains live. */
function readDetached(cell: CacheItemCell): any {
  return cell.registry?.readFallback(cell) ?? cell.fallback
}

/** Return shared reader for one inactive lifecycle state. */
function readerForInactiveState(state: Exclude<ItemCellState, 'active'>): ItemCellReader {
  return state === 'dormant' ? readDormant : readDetached
}
