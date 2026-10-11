import { describe, expect, it } from 'vitest'
import { isBindableCode } from '../src/shared/keys'
import {
  collectWarnings,
  defaultBindings,
  normalizePresetName,
  parseBindingsFile,
  parsePresetsFile,
  pickBinding,
  validateBinding,
  validateSet
} from '../src/shared/validation'
import type { Binding } from '../src/shared/types'

const ok: Binding = { code: 'KeyA', label: 'A', type: 'cc', channel: 1, number: 20, mode: 'momentary', value: 127 }

describe('validation', () => {
  it('accepts a good binding and the defaults', () => {
    expect(validateBinding(ok)).toEqual([])
    for (const b of defaultBindings()) expect(validateBinding(b)).toEqual([])
  })

  it('rejects out-of-range and reserved values', () => {
    expect(validateBinding({ ...ok, channel: 0 })).not.toEqual([])
    expect(validateBinding({ ...ok, channel: 17 })).not.toEqual([])
    expect(validateBinding({ ...ok, number: 128 })).not.toEqual([])
    expect(validateBinding({ ...ok, value: -1 })).not.toEqual([])
    expect(validateBinding({ ...ok, number: 123 })).toContain('CC 120-127 are reserved channel-mode messages')
    expect(validateBinding({ ...ok, type: 'note', number: 123 })).toEqual([])
  })

  it('only allows arrows, letters and digits', () => {
    expect(isBindableCode('ArrowUp')).toBe(true)
    expect(isBindableCode('KeyZ')).toBe(true)
    expect(isBindableCode('Digit0')).toBe(true)
    for (const c of ['Escape', 'Space', 'Enter', 'Tab', 'F1', 'Numpad1']) expect(isBindableCode(c)).toBe(false)
    expect(validateBinding({ ...ok, code: 'Space' })).not.toEqual([])
  })

  it('blocks duplicate keys and warns on shared targets / velocity 0', () => {
    expect(validateSet([ok, ok]).length).toBe(1)
    const b = { ...ok, code: 'KeyB' }
    expect(collectWarnings([ok, b]).some((w) => w.includes('share target'))).toBe(true)
    expect(collectWarnings([{ ...ok, type: 'note', value: 0 }]).some((w) => w.includes('velocity 0'))).toBe(true)
  })

  it('keeps valid entries and warns about the rest when loading', () => {
    const r = parseBindingsFile({ schemaVersion: 1, bindings: [ok, { ...ok, code: 'KeyB', channel: 99 }, ok] })
    expect(r.bindings).toEqual([ok])
    expect(r.warnings.length).toBe(2)
    expect(parseBindingsFile({ schemaVersion: 2, bindings: [ok] }).warnings[0]).toMatch(/schemaVersion/)
    expect(parseBindingsFile(null).bindings).toEqual([])
  })
})

describe('colors', () => {
  it('accepts palette ids and no color, rejects anything else', () => {
    expect(validateBinding({ ...ok, color: 'red' })).toEqual([])
    expect(validateBinding(ok)).toEqual([])
    expect(validateBinding({ ...ok, color: '#ff0000' })).not.toEqual([])
    expect(validateBinding({ ...ok, color: 5 })).not.toEqual([])
  })

  it('keeps color through pickBinding and parseBindingsFile, drops unknown fields', () => {
    expect(pickBinding({ ...ok, color: 'blue', extra: 1 } as Binding)).toEqual({ ...ok, color: 'blue' })
    expect('color' in pickBinding(ok)).toBe(false)
    const parsed = parseBindingsFile({ schemaVersion: 1, bindings: [{ ...ok, color: 'green' }] })
    expect(parsed.bindings[0].color).toBe('green')
  })
})

describe('presets', () => {
  it('normalizes names', () => {
    expect(normalizePresetName('  Lead  ')).toBe('Lead')
    expect(normalizePresetName('')).toBeNull()
    expect(normalizePresetName('   ')).toBeNull()
    expect(normalizePresetName('x'.repeat(41))).toBeNull()
    expect(normalizePresetName(3)).toBeNull()
  })

  it('parses leniently: drops bad names, duplicates and invalid bindings, keeps colors', () => {
    const { presets, warnings } = parsePresetsFile({
      schemaVersion: 1,
      presets: [
        { name: 'A', bindings: [{ ...ok, color: 'pink' }, { ...ok, code: 'KeyB', channel: 99 }] },
        { name: 'A', bindings: [] },
        { bindings: [] },
        null
      ]
    })
    expect(presets).toHaveLength(1)
    expect(presets[0].bindings).toEqual([{ ...ok, color: 'pink' }])
    expect(warnings.length).toBe(4)
    expect(parsePresetsFile('nope').presets).toEqual([])
  })
})

describe('pickBinding', () => {
  it('round-trips a fully populated binding (guards against fields silently dropped on save)', () => {
    const full: Binding = { ...ok, color: 'purple' }
    expect(Object.keys(pickBinding(full)).sort()).toEqual(Object.keys(full).sort())
    expect(pickBinding(full)).toEqual(full)
  })

  it('rejects control and bidi characters in preset names', () => {
    expect(normalizePresetName('a\u202Eb')).toBeNull()
    expect(normalizePresetName('a\nb')).toBeNull()
  })
})

