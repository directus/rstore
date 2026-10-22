import type { Target } from '../../src/protocol'

/** Captured viewer ownership for asynchronous reads and open editors. */
export interface Ownership {
  /** Complete producer authority identity. */
  target: Target | null
  /** Viewer-side epoch, distinct from producer generation. */
  epoch: number
}
/** Compare complete target identity, preserving generation ownership. */
export function sameTarget(first: Target | null, second: Target | null): boolean {
  return !!first && !!second && first.sessionId === second.sessionId
    && first.storeId === second.storeId && first.generation === second.generation
}
/** Selection algorithm shared by requests, action dialogs and target selectors. */
export class Selection {
  /** Selected exact target, never silently replaced when missing. */
  target: Target | null = null
  /** Incremented whenever target authority changes. */
  epoch = 0
  /** Selected target disappeared from current producer publication. */
  unavailable = false
  /** Deliberately select a published target. */
  select(target: Target | null): void {
    this.target = target ? { ...target } : null
    this.epoch++
    this.unavailable = false
  }

  /** Capture ownership before dispatch. */
  capture(): Ownership {
    return { target: this.target ? { ...this.target } : null, epoch: this.epoch }
  }

  /** Determine whether a completion still belongs to current viewer. */
  owns(owner: Ownership): boolean {
    return owner.epoch === this.epoch && sameTarget(owner.target, this.target)
  }

  /** Preserve selection only while the exact generation remains published. */
  reconcile(targets: Target[]): void {
    if (this.target && !targets.some(target => sameTarget(target, this.target))) {
      this.select(null)
      this.unavailable = true
    }
  }
}
