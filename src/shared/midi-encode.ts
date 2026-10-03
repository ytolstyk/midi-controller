import type { Binding } from './types'

const CC_STATUS = 0xb0
const NOTE_ON_STATUS = 0x90
const NOTE_OFF_STATUS = 0x80

export const CC_ALL_NOTES_OFF = 123

/** Identifies the MIDI target a binding writes to. */
export interface Address {
  type: 'cc' | 'note'
  channel: number
  number: number
}

export const addressOf = (b: Pick<Binding, 'type' | 'channel' | 'number'>): Address => ({
  type: b.type,
  channel: b.channel,
  number: b.number
})

export const addressKey = (a: Address): string => `${a.type}:${a.channel}:${a.number}`

const status = (base: number, channel: number): number => base | ((channel - 1) & 0x0f)

export function encodeOn(a: Address, value: number): number[] {
  return a.type === 'cc'
    ? [status(CC_STATUS, a.channel), a.number, value]
    : [status(NOTE_ON_STATUS, a.channel), a.number, value]
}

/** CC 0 / Note Off with release velocity 0. */
export function encodeOff(a: Address): number[] {
  return a.type === 'cc'
    ? [status(CC_STATUS, a.channel), a.number, 0]
    : [status(NOTE_OFF_STATUS, a.channel), a.number, 0]
}

export const encodeAllNotesOff = (channel: number): number[] => [
  status(CC_STATUS, channel),
  CC_ALL_NOTES_OFF,
  0
]
