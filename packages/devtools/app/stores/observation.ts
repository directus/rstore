import type { Inspector } from './connection'
import { errorMessage } from './requests'

/** Visible producer lease owner, including delayed acquisitions and recovery. */
export class InspectorObservation {
  /** Cleanup of successfully acquired visible lease. */
  private release: (() => void) | undefined
  /** Epoch invalidates leases acquired after view, producer or connection departure. */
  private epoch = 0

  /** Release current lease and invalidate pending acquisitions. */
  clear(): void {
    this.epoch++
    this.release?.()
    this.release = undefined
  }

  /** Acquire current view only while producer exists, with asynchronous ownership fencing. */
  async acquire(state: Inspector): Promise<void> {
    this.clear()
    const id = this.epoch
    const owner = state.selection.capture()
    const view = state.view
    if (!state.transport?.watch || !owner.target || (state.session && !state.session.connected))
      return
    try {
      const release = await state.transport.watch(owner.target, view)
      if (!state.selection.owns(owner) || view !== state.view || id !== this.epoch)
        release()
      else this.release = release
    }
    catch (error) {
      if (state.selection.owns(owner) && view === state.view && id === this.epoch)
        state.readError = errorMessage(error)
    }
  }
}
