import { describe, expect, it } from 'vitest'
import { addressKey, encodeAllNotesOff, encodeOff, encodeOn } from '../src/shared/midi-encode'

describe('midi-encode', () => {
  it('encodes CC on/off with the channel in the status nibble', () => {
    const a = { type: 'cc', channel: 1, number: 20 } as const
    expect(encodeOn(a, 127)).toEqual([0xb0, 20, 127])
    expect(encodeOff(a)).toEqual([0xb0, 20, 0])
    expect(encodeOn({ ...a, channel: 16 }, 64)).toEqual([0xbf, 20, 64])
  })

  it('encodes Note On / Note Off with release velocity 0', () => {
    const a = { type: 'note', channel: 3, number: 60 } as const
    expect(encodeOn(a, 100)).toEqual([0x92, 60, 100])
    expect(encodeOff(a)).toEqual([0x82, 60, 0])
  })

  it('encodes All Notes Off per channel', () => {
    expect(encodeAllNotesOff(2)).toEqual([0xb1, 123, 0])
  })

  it('keys addresses by type, channel and number', () => {
    expect(addressKey({ type: 'cc', channel: 1, number: 7 })).not.toBe(
      addressKey({ type: 'note', channel: 1, number: 7 })
    )
  })
})
