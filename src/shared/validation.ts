import { isBindingColor } from './colors'
import { isBindableCode } from './keys'
import { addressKey, addressOf } from './midi-encode'
import { MAX_PRESETS, PRESET_NAME_MAX } from './types'
import type { Binding, BindingMode, BindingType, BindingsFile, Preset, PresetsFile } from './types'

const TYPES: readonly BindingType[] = ['cc', 'note']
const MODES: readonly BindingMode[] = ['momentary', 'toggle', 'trigger']

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max

const RESERVED_CC_MIN = 120
const RESERVED_CC_MAX = 127

/** Hard errors that make a binding unusable. */
export function validateBinding(b: unknown): string[] {
  if (typeof b !== 'object' || b === null) return ['not an object']
  const x = b as Record<string, unknown>
  const errors: string[] = []
  if (typeof x.code !== 'string' || !isBindableCode(x.code)) errors.push('key is not bindable')
  if (typeof x.label !== 'string' || x.label.length > 40) errors.push('label must be text up to 40 characters')
  if (!TYPES.includes(x.type as BindingType)) errors.push('type must be cc or note')
  if (!isInt(x.channel, 1, 16)) errors.push('channel must be 1-16')
  if (!isInt(x.number, 0, 127)) errors.push('number must be 0-127')
  else if (x.type === 'cc' && x.number >= RESERVED_CC_MIN && x.number <= RESERVED_CC_MAX) {
    errors.push('CC 120-127 are reserved channel-mode messages')
  }
  if (!MODES.includes(x.mode as BindingMode)) errors.push('mode must be momentary, toggle or trigger')
  if (!isInt(x.value, 0, 127)) errors.push('value must be 0-127')
  if (x.color !== undefined && !isBindingColor(x.color)) errors.push('color is not in the palette')
  return errors
}

/** Re-pick known fields of a validated binding so nothing extra is persisted or applied. */
export const pickBinding = (b: Binding): Binding => ({
  code: b.code,
  label: b.label,
  type: b.type,
  channel: b.channel,
  number: b.number,
  mode: b.mode,
  value: b.value,
  ...(b.color ? { color: b.color } : {})
})

/** Hard errors across a whole set (duplicate keys). */
export function validateSet(bindings: Binding[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const b of bindings) {
    if (seen.has(b.code)) errors.push(`key ${b.code} is bound more than once`)
    seen.add(b.code)
  }
  return errors
}

/** Soft problems worth showing but not blocking. */
export function collectWarnings(bindings: Binding[]): string[] {
  const warnings: string[] = []
  const targets = new Map<string, string[]>()
  for (const b of bindings) {
    const key = addressKey(addressOf(b))
    targets.set(key, [...(targets.get(key) ?? []), b.code])
    if (b.type === 'note' && b.value === 0) {
      warnings.push(`${b.code}: Note velocity 0 is treated as Note Off by most receivers`)
    }
  }
  for (const [key, codes] of targets) {
    if (codes.length > 1) warnings.push(`${codes.join(', ')} share target ${key}`)
  }
  return warnings
}

export interface ParsedFile {
  bindings: Binding[]
  warnings: string[]
}

/** Keep the entries that validate (and aren't duplicate keys), warn about the rest. */
function parseBindingList(list: unknown[], warnings: string[], prefix = ''): Binding[] {
  const bindings: Binding[] = []
  const seen = new Set<string>()
  list.forEach((item, i) => {
    const errs = validateBinding(item)
    if (errs.length > 0) {
      warnings.push(`${prefix}binding #${i + 1} dropped: ${errs.join('; ')}`)
      return
    }
    const b = pickBinding(item as Binding)
    if (seen.has(b.code)) {
      warnings.push(`${prefix}binding #${i + 1} dropped: duplicate key ${b.code}`)
      return
    }
    seen.add(b.code)
    bindings.push(b)
  })
  return bindings
}

/** Lenient parse of an already-JSON-parsed file: keep what validates, warn about the rest. */
export function parseBindingsFile(raw: unknown): ParsedFile {
  const warnings: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { bindings: [], warnings: ['bindings file has an unexpected shape; ignored'] }
  }
  const file = raw as Partial<BindingsFile>
  if (file.schemaVersion !== 1) {
    warnings.push(`unknown schemaVersion ${String(file.schemaVersion)}; loading what validates`)
  }
  const list = Array.isArray(file.bindings) ? file.bindings : []
  return { bindings: parseBindingList(list, warnings), warnings }
}

/** Trimmed preset name, or null when empty / too long / not text. */
export function normalizePresetName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim()
  // Control and bidi-override characters could make a name look different in different places.
  if (/[\p{Cc}\u202A-\u202E\u2066-\u2069]/u.test(name)) return null
  return name.length > 0 && name.length <= PRESET_NAME_MAX ? name : null
}

export interface ParsedPresets {
  presets: Preset[]
  warnings: string[]
}

/** Lenient parse of the preset library file. Unnamed or duplicate presets are dropped with a warning. */
export function parsePresetsFile(raw: unknown): ParsedPresets {
  const warnings: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { presets: [], warnings: ['presets file has an unexpected shape; ignored'] }
  }
  const file = raw as Partial<PresetsFile>
  const all = Array.isArray(file.presets) ? file.presets : []
  if (all.length > MAX_PRESETS) warnings.push(`only the first ${MAX_PRESETS} presets are kept`)
  const list = all.slice(0, MAX_PRESETS)
  const presets: Preset[] = []
  const seen = new Set<string>()
  list.forEach((item, i) => {
    const entry = (typeof item === 'object' && item !== null ? item : {}) as Partial<Preset>
    const name = normalizePresetName(entry.name)
    if (!name || seen.has(name)) {
      warnings.push(`preset #${i + 1} dropped: missing, invalid or duplicate name`)
      return
    }
    seen.add(name)
    const bindings = parseBindingList(Array.isArray(entry.bindings) ? entry.bindings : [], warnings, `preset "${name}": `)
    presets.push({ name, bindings })
  })
  return { presets, warnings }
}

export const defaultBindings = (): Binding[] => [
  { code: 'ArrowUp', label: 'Up', type: 'cc', channel: 1, number: 20, mode: 'momentary', value: 127 },
  { code: 'ArrowDown', label: 'Down', type: 'cc', channel: 1, number: 21, mode: 'momentary', value: 127 },
  { code: 'ArrowLeft', label: 'Left', type: 'cc', channel: 1, number: 22, mode: 'momentary', value: 127 },
  { code: 'ArrowRight', label: 'Right', type: 'cc', channel: 1, number: 23, mode: 'momentary', value: 127 }
]
