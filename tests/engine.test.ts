import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MidiEngine, type MidiPort } from '../src/main/engine'
import { TRIGGER_OFF_MS, type Binding, type PortState, type StatusSnapshot } from '../src/shared/types'

class FakePort implements MidiPort {
  sent: number[][] = []
  up = true
  failNext = 0
  isOpen = (): boolean => this.up
  state = (): PortState => (this.up ? 'open' : 'lost')
  name = (): string => 'Midi-eval Controller'
  send(bytes: number[]): boolean {
    if (!this.up) return false
    if (this.failNext > 0) {
      this.failNext--
      this.up = false
      return false
    }
    this.sent.push(bytes)
    return true
  }
}

const bind = (over: Partial<Binding> & { code: string }): Binding => ({
  label: over.code,
  type: 'cc',
  channel: 1,
  number: 20,
  mode: 'momentary',
  value: 127,
  ...over
})

let port: FakePort
let engine: MidiEngine
let last: StatusSnapshot | null

beforeEach(() => {
  vi.useFakeTimers()
  port = new FakePort()
  last = null
  engine = new MidiEngine(port, (s) => (last = s))
})

const CC = (n: number, v: number, ch = 1): number[] => [0xb0 | (ch - 1), n, v]

describe('momentary', () => {
  it('sends on at press and off at release, ignoring a second press while held', () => {
    engine.applyBindings([bind({ code: 'KeyA' })])
    engine.press('KeyA')
    engine.press('KeyA')
    engine.release('KeyA')
    expect(port.sent).toEqual([CC(20, 127), CC(20, 0)])
    expect(engine.hasActive()).toBe(false)
  })

  it('uses the configured on value', () => {
    engine.applyBindings([bind({ code: 'KeyA', value: 90 })])
    engine.press('KeyA')
    expect(port.sent[0]).toEqual(CC(20, 90))
  })

  it('blur releases held keys but leaves toggles on', () => {
    engine.applyBindings([bind({ code: 'KeyA' }), bind({ code: 'KeyB', mode: 'toggle', number: 21 })])
    engine.press('KeyA')
    engine.press('KeyB')
    engine.releaseHeld()
    expect(port.sent).toEqual([CC(20, 127), CC(21, 127), CC(20, 0)])
    expect(last?.toggles.KeyB).toBe('on')
  })
})

describe('toggle', () => {
  it('starts unknown; first press sends on, next sends off; release is ignored', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' })])
    expect(last?.toggles.KeyT).toBeUndefined()
    engine.press('KeyT')
    engine.release('KeyT')
    expect(last?.toggles.KeyT).toBe('on')
    engine.press('KeyT')
    expect(port.sent).toEqual([CC(20, 127), CC(20, 0)])
    expect(last?.toggles.KeyT).toBe('off')
  })
})

describe('trigger', () => {
  it('CC trigger sends the value only, never 0, and is not in the ledger', () => {
    engine.applyBindings([bind({ code: 'KeyN', mode: 'trigger' })])
    engine.press('KeyN')
    engine.release('KeyN')
    expect(port.sent).toEqual([CC(20, 127)])
    expect(engine.hasActive()).toBe(false)
    expect(engine.panic().ok).toBe(true)
    expect(port.sent).toEqual([CC(20, 127)]) // panic sends nothing for it
  })

  it('Note trigger auto-offs and a rapid second tap restarts the window', () => {
    engine.applyBindings([bind({ code: 'KeyN', type: 'note', number: 60, mode: 'trigger' })])
    engine.press('KeyN')
    vi.advanceTimersByTime(TRIGGER_OFF_MS - 10)
    engine.press('KeyN')
    expect(port.sent).toEqual([
      [0x90, 60, 127],
      [0x80, 60, 0],
      [0x90, 60, 127]
    ])
    vi.advanceTimersByTime(TRIGGER_OFF_MS - 10) // first timer would have fired by now
    expect(engine.hasActive()).toBe(true)
    vi.advanceTimersByTime(20)
    expect(port.sent.at(-1)).toEqual([0x80, 60, 0])
    expect(engine.hasActive()).toBe(false)
  })
})

describe('shared addresses (refcount)', () => {
  it('only sends off when the last holder releases', () => {
    engine.applyBindings([bind({ code: 'KeyA' }), bind({ code: 'KeyB' })])
    engine.press('KeyA')
    engine.press('KeyB')
    engine.release('KeyA')
    expect(port.sent.filter((m) => m[2] === 0)).toHaveLength(0)
    engine.release('KeyB')
    expect(port.sent.at(-1)).toEqual(CC(20, 0))
  })

  it('a toggle and a momentary sharing an address obey the same rule', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' }), bind({ code: 'KeyM' })])
    engine.press('KeyT')
    engine.press('KeyM')
    engine.release('KeyM')
    expect(port.sent.filter((m) => m[2] === 0)).toHaveLength(0)
    engine.press('KeyT')
    expect(port.sent.at(-1)).toEqual(CC(20, 0))
  })
})

describe('panic', () => {
  it('sweeps the ledger (not bindings), even after the binding was edited', () => {
    engine.applyBindings([bind({ code: 'KeyA', number: 30 })])
    engine.press('KeyA')
    // edit the CC number while the key is held: the old target is switched off first
    engine.applyBindings([bind({ code: 'KeyA', number: 31 })])
    expect(port.sent.at(-1)).toEqual(CC(30, 0))
    expect(engine.hasActive()).toBe(false)
  })

  it('sends nothing when the ledger is empty', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' })])
    const r = engine.panic()
    expect(r.ok).toBe(true)
    expect(port.sent).toEqual([])
    expect(last?.toggles.KeyT).toBe('off')
  })

  it('sends All Notes Off only for channels in the ledger, then Off for each entry', () => {
    engine.applyBindings([
      bind({ code: 'KeyA', channel: 2, number: 10 }),
      bind({ code: 'KeyB', channel: 3, number: 11, type: 'note', mode: 'toggle' })
    ])
    engine.press('KeyA')
    engine.press('KeyB')
    port.sent = []
    expect(engine.panic().ok).toBe(true)
    expect(port.sent).toContainEqual([0xb1, 123, 0])
    expect(port.sent).toContainEqual([0xb2, 123, 0])
    expect(port.sent).toContainEqual(CC(10, 0, 2))
    expect(port.sent).toContainEqual([0x82, 11, 0])
    expect(engine.hasActive()).toBe(false)
    expect(last?.toggles.KeyB).toBe('off')
  })

  it('is a no-op returning ok:false while the port is lost; state untouched', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' })])
    engine.press('KeyT')
    port.up = false
    const r = engine.panic()
    expect(r.ok).toBe(false)
    expect(engine.hasActive()).toBe(true)
    expect(last?.toggles.KeyT).toBe('on')
  })

  it('stops mid-sweep on a failed send, keeping unsent entries in the ledger', () => {
    engine.applyBindings([bind({ code: 'KeyA', number: 1 }), bind({ code: 'KeyB', number: 2 })])
    engine.press('KeyA')
    engine.press('KeyB')
    // let the All Notes Off (call 1) through, fail on the first Off (call 2)
    const origSend = port.send.bind(port)
    let calls = 0
    port.send = (b): boolean => (++calls === 2 ? ((port.up = false), false) : origSend(b))
    const r = engine.panic()
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/incomplete/i)
    expect(calls).toBe(2) // failed on the first Off, after CC123 went out
    expect(engine.hasActive()).toBe(true)
  })
})

describe('lost port', () => {
  it('rejects presses without touching ledger or toggle state', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' })])
    port.up = false
    engine.press('KeyT')
    expect(engine.hasActive()).toBe(false)
    expect(last?.toggles.KeyT).toBeUndefined()
  })

  it('a failed send flips nothing: toggle stays off when the on never went out', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' })])
    port.failNext = 1
    engine.press('KeyT')
    expect(engine.hasActive()).toBe(false)
    expect(last?.toggles.KeyT).toBeUndefined()
  })
})

describe('reconnect', () => {
  it('sends nothing, marks toggles unknown, keeps the ledger, and flags a sticky notice', () => {
    engine.applyBindings([bind({ code: 'KeyT', mode: 'toggle' })])
    engine.press('KeyT')
    const sentBefore = port.sent.length
    engine.onReconnected(null)
    expect(port.sent.length).toBe(sentBefore)
    expect(engine.hasActive()).toBe(true)
    expect(last?.toggles.KeyT).toBeUndefined()
    expect(last?.notice?.sticky).toBe(true)
  })

  it('is a quiet notice when nothing was at stake, sticky when the port was renamed', () => {
    engine.applyBindings([bind({ code: 'KeyA' })])
    engine.onReconnected(null)
    expect(last?.notice).toEqual({ text: 'Reconnected', sticky: false })
    engine.onReconnected('Midi-eval Controller 2')
    expect(last?.notice?.sticky).toBe(true)
    expect(last?.notice?.text).toMatch(/Midi-eval Controller 2/)
  })
})

describe('test button', () => {
  it('pulses momentary on then off, and leaves toggles unknown', () => {
    engine.applyBindings([bind({ code: 'KeyA' }), bind({ code: 'KeyT', mode: 'toggle', number: 5 })])
    engine.test('KeyA')
    vi.advanceTimersByTime(TRIGGER_OFF_MS)
    expect(port.sent).toEqual([CC(20, 127), CC(20, 0)])
    engine.test('KeyT')
    expect(port.sent.at(-1)).toEqual(CC(5, 127))
    expect(last?.toggles.KeyT).toBe('unknown')
  })
})

describe('bindings edits', () => {
  it('deleting a binding whose key is held switches it off', () => {
    engine.applyBindings([bind({ code: 'KeyA' })])
    engine.press('KeyA')
    engine.applyBindings([])
    expect(port.sent.at(-1)).toEqual(CC(20, 0))
    expect(engine.hasActive()).toBe(false)
  })

  it('editing a pending Note trigger fires its Note Off immediately on the old address', () => {
    engine.applyBindings([bind({ code: 'KeyN', type: 'note', number: 60, mode: 'trigger' })])
    engine.press('KeyN')
    engine.applyBindings([bind({ code: 'KeyN', type: 'note', number: 61, mode: 'trigger' })])
    expect(port.sent.at(-1)).toEqual([0x80, 60, 0])
    vi.advanceTimersByTime(TRIGGER_OFF_MS * 2)
    expect(port.sent).toHaveLength(2) // the cancelled timer did not fire a second off
  })
})

describe('stale held keys', () => {
  it('a key held across a reconnect can be pressed and released again, and Panic still clears it', () => {
    engine.applyBindings([bind({ code: 'KeyA' })])
    engine.press('KeyA')
    port.up = false
    engine.release('KeyA') // rejected: the release never reached the plugin
    port.up = true
    engine.onReconnected(null)
    port.sent = []
    engine.press('KeyA') // must not be swallowed as "already held"
    expect(port.sent).toEqual([CC(20, 127)])
    engine.release('KeyA')
    expect(port.sent.at(-1)).toEqual(CC(20, 0))
    expect(engine.hasActive()).toBe(false)
  })

  it('releaseHeld frees held keys (renderer lost / hidden)', () => {
    engine.applyBindings([bind({ code: 'KeyA' })])
    engine.press('KeyA')
    engine.releaseHeld()
    expect(engine.hasActive()).toBe(false)
    expect(port.sent.at(-1)).toEqual(CC(20, 0))
  })
})

describe('emit', () => {
  it('does not push when a key press changes nothing the UI shows', () => {
    engine.applyBindings([bind({ code: 'KeyA' })])
    const calls: number[] = []
    const quiet = new MidiEngine(port, () => calls.push(1))
    quiet.applyBindings([bind({ code: 'KeyA' })])
    const before = calls.length
    quiet.press('KeyA')
    quiet.release('KeyA')
    expect(calls.length).toBe(before)
  })

  describe('key sources', () => {
    it('releaseHeld(source) only releases that source', () => {
      engine.applyBindings([bind({ code: 'KeyA', number: 1 }), bind({ code: 'KeyB', number: 2 })])
      engine.press('KeyA', 'window')
      engine.press('KeyB', 'global')
      port.sent = []
      engine.releaseHeld('window')
      expect(port.sent).toEqual([[0xb0, 1, 0]])
      engine.releaseHeld()
      expect(port.sent).toEqual([[0xb0, 1, 0], [0xb0, 2, 0]])
    })
  })
})
