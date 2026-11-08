import type { BindingColorId } from './colors'

export type BindingType = 'cc' | 'note'
export type BindingMode = 'momentary' | 'toggle' | 'trigger'

export interface Binding {
  /** KeyboardEvent.code, e.g. "ArrowUp", "KeyA", "Digit1" */
  code: string
  label: string
  type: BindingType
  /** 1-16 */
  channel: number
  /** CC number or note number, 0-127 */
  number: number
  mode: BindingMode
  /** "On" value: CC value or Note velocity, 0-127 */
  value: number
  /** Palette id from shared/colors.ts; absent = default look. */
  color?: BindingColorId
}

export interface BindingsFile {
  schemaVersion: 1
  bindings: Binding[]
}

export type ToggleState = 'on' | 'off' | 'unknown'
export type PortState = 'open' | 'lost'

export interface Notice {
  text: string
  /** Dismiss-requiring (sticky) vs quiet auto-dismiss */
  sticky: boolean
}

/** Everything the renderer needs to draw; pushed from main on every change. */
export interface StatusSnapshot {
  port: { state: PortState; name: string | null }
  /** Missing key = "unknown" */
  toggles: Record<string, ToggleState>
  notice: Notice | null
}

export interface PanicResult {
  ok: boolean
  /** Human-readable outcome for the UI */
  message: string
}

export interface LoadResult {
  bindings: Binding[]
  warnings: string[]
}

export interface SaveResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface Preset {
  name: string
  bindings: Binding[]
}

export interface PresetsFile {
  schemaVersion: 1
  presets: Preset[]
}

/** The preset library as the UI needs it. */
export interface PresetLibrary {
  names: string[]
  /** Preset last loaded or saved (and still existing), else null. */
  active: string | null
  /** The active preset's stored bindings, for spotting unsaved changes; empty when `active` is null. */
  activeBindings: Binding[]
}

export const EMPTY_PRESET_LIBRARY: PresetLibrary = { names: [], active: null, activeBindings: [] }

/** Outcome of a preset operation; the library fields describe it after the operation. */
export interface PresetResult extends PresetLibrary {
  ok: boolean
  errors: string[]
}

export interface PresetLoadResult extends PresetResult {
  /** The bindings now active (empty when not ok). */
  bindings: Binding[]
  warnings: string[]
}

export const PRESET_NAME_MAX = 40
export const MAX_PRESETS = 200

/** Auto Note Off delay for trigger-mode notes and the Test button. */
export const TRIGGER_OFF_MS = 100

export const PORT_BASE_NAME = 'Midi-eval Controller'

/** OS-wide key capture state shown in the header. */
export interface GlobalStatus {
  enabled: boolean
  /** macOS Accessibility permission, required by the OS-wide key listener. */
  access: 'granted' | 'denied'
  /** The listener is actually running. */
  running: boolean
}
