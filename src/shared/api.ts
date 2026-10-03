import type { Binding, LoadResult, PanicResult, SaveResult, StatusSnapshot } from './types'

/** Surface exposed to the renderer via contextBridge as `window.api`. */
export interface Api {
  press(code: string): void
  release(code: string): void
  /** Window lost focus: release held momentary keys. */
  blur(): void
  test(code: string): Promise<void>
  panic(): Promise<PanicResult>
  reconnect(): Promise<void>
  dismissNotice(): void
  loadBindings(): Promise<LoadResult>
  saveBindings(bindings: Binding[]): Promise<SaveResult>
  getStatus(): Promise<StatusSnapshot>
  /** Subscribe to status pushes; returns an unsubscribe function. */
  onStatus(cb: (s: StatusSnapshot) => void): () => void
}
