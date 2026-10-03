import { isBindableCode } from './keys'
import { addressKey, addressOf } from './midi-encode'
import type { Binding, BindingMode, BindingType, BindingsFile } from './types'

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
  return errors
}

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
  const bindings: Binding[] = []
  const seen = new Set<string>()
  list.forEach((item, i) => {
    const errs = validateBinding(item)
    if (errs.length > 0) {
      warnings.push(`binding #${i + 1} dropped: ${errs.join('; ')}`)
      return
    }
    const b = item as Binding
    if (seen.has(b.code)) {
      warnings.push(`binding #${i + 1} dropped: duplicate key ${b.code}`)
      return
    }
    seen.add(b.code)
    bindings.push(b)
  })
  return { bindings, warnings }
}

export const defaultBindings = (): Binding[] => [
  { code: 'ArrowUp', label: 'Up', type: 'cc', channel: 1, number: 20, mode: 'momentary', value: 127 },
  { code: 'ArrowDown', label: 'Down', type: 'cc', channel: 1, number: 21, mode: 'momentary', value: 127 },
  { code: 'ArrowLeft', label: 'Left', type: 'cc', channel: 1, number: 22, mode: 'momentary', value: 127 },
  { code: 'ArrowRight', label: 'Right', type: 'cc', channel: 1, number: 23, mode: 'momentary', value: 127 }
]
