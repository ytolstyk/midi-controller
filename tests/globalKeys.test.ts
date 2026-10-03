import { beforeEach, describe, expect, it } from 'vitest'
import { GlobalKeys, type RawKey } from '../src/main/globalKeys'

const key = (code: string | null, down: boolean, over: Partial<RawKey> = {}): RawKey => ({
  down,
  code,
  modified: false,
  meta: false,
  ...over
})

let log: string[]
let focused: boolean
let gk: GlobalKeys

beforeEach(() => {
  log = []
  focused = false
  gk = new GlobalKeys(
    {
      press: (c) => log.push(`down ${c}`),
      release: (c) => log.push(`up ${c}`)
    },
    () => focused
  )
  gk.setEnabled(true)
})

describe('GlobalKeys', () => {
  it('presses and releases while the app is in the background', () => {
    gk.handle(key('KeyF', true))
    gk.handle(key('KeyF', false))
    expect(log).toEqual(['down KeyF', 'up KeyF'])
  })

  it('ignores auto-repeat', () => {
    gk.handle(key('KeyF', true))
    gk.handle(key('KeyF', true))
    expect(log).toEqual(['down KeyF'])
  })

  it('leaves keys to the window when the app is focused', () => {
    focused = true
    gk.handle(key('KeyF', true))
    gk.handle(key('KeyF', false))
    expect(log).toEqual([])
  })

  it('still delivers the release of a key pressed before the app got focus', () => {
    gk.handle(key('KeyF', true))
    focused = true
    gk.handle(key('KeyF', false))
    expect(log).toEqual(['down KeyF', 'up KeyF'])
  })

  it('ignores unbindable keys and modifier combos', () => {
    gk.handle(key(null, true))
    gk.handle(key('KeyC', true, { modified: true }))
    gk.handle(key('KeyC', false, { modified: true }))
    expect(log).toEqual([])
  })

  it('releases everything when Cmd goes down (no keyup arrives under Cmd)', () => {
    gk.handle(key('KeyF', true))
    gk.handle(key(null, true, { meta: true, modified: true }))
    expect(log).toEqual(['down KeyF', 'up KeyF'])
    gk.handle(key('KeyF', false))
    expect(log).toEqual(['down KeyF', 'up KeyF'])
  })

  it('releases held keys when the app gains focus', () => {
    gk.handle(key('KeyF', true))
    gk.onAppFocus()
    expect(log).toEqual(['down KeyF', 'up KeyF'])
  })

  it('does nothing when disabled and releases what it held on disable', () => {
    gk.handle(key('KeyF', true))
    gk.setEnabled(false)
    expect(log).toEqual(['down KeyF', 'up KeyF'])
    gk.handle(key('KeyG', true))
    gk.handle(key('KeyG', false))
    expect(log).toEqual(['down KeyF', 'up KeyF'])
  })

  it('sends nothing when it holds nothing', () => {
    gk.onAppFocus()
    gk.setEnabled(false)
    expect(log).toEqual([])
  })

  it('does not re-trigger from auto-repeat after a key held in the window loses focus', () => {
    focused = true
    gk.handle(key('KeyF', true))
    focused = false
    gk.handle(key('KeyF', true)) // auto-repeat arriving in the background
    gk.handle(key('KeyF', false))
    gk.handle(key('KeyF', true)) // a genuinely new press
    expect(log).toEqual(['down KeyF'])
  })
})
