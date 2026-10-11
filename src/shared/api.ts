import type {
  Binding,
  GlobalStatus,
  LoadResult,
  PanicResult,
  PresetLoadResult,
  PresetResult,
  SaveResult,
  StatusSnapshot
} from './types'

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
  listPresets(): Promise<string[]>
  /** Save the currently saved bindings under `name` (overwrites a preset with that name). */
  savePreset(name: string): Promise<PresetResult>
  /** Make a preset the active bindings. */
  loadPreset(name: string): Promise<PresetLoadResult>
  deletePreset(name: string): Promise<PresetResult>
  getStatus(): Promise<StatusSnapshot>
  /** Subscribe to status pushes; returns an unsubscribe function. */
  onStatus(cb: (s: StatusSnapshot) => void): () => void
  getGlobal(): Promise<GlobalStatus>
  setGlobal(enabled: boolean): Promise<GlobalStatus>
  onGlobal(cb: (s: GlobalStatus) => void): () => void
  /** Open System Settings → Privacy & Security → Accessibility. */
  openAccessSettings(): void
}
