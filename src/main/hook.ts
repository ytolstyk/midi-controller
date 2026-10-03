import { uIOhook, UiohookKey, EventType, type UiohookKeyboardEvent } from 'uiohook-napi'
import { BINDABLE_CODES } from '../shared/keys'
import type { RawKey } from './globalKeys'

/** uiohook scancode → KeyboardEvent.code, for bindable keys only. */
const CODE_BY_KEYCODE: ReadonlyMap<number, string> = new Map(
  BINDABLE_CODES.flatMap((code): [number, string][] => {
    const name = code.replace(/^(Key|Digit)/, '') // 'KeyA' → 'A', 'Digit1' → '1', 'ArrowUp' unchanged
    const keycode = (UiohookKey as Record<string, number>)[name] // looked up by name; unknown names are dropped
    return keycode === undefined ? [] : [[keycode, code]]
  })
)

const translate = (e: UiohookKeyboardEvent): RawKey | null => {
  const code = CODE_BY_KEYCODE.get(e.keycode) ?? null
  // Unbindable keys only matter while Cmd is down (Cmd releases held keys); skip everything else early.
  if (!code && !e.metaKey) return null
  return {
    down: e.type === EventType.EVENT_KEY_PRESSED,
    code,
    modified: e.metaKey || e.ctrlKey || e.altKey || e.shiftKey,
    meta: e.metaKey
  }
}

let running = false
let listener: ((e: UiohookKeyboardEvent) => void) | null = null

/** Start the OS-wide listener. Throws if the OS refuses (e.g. missing permission). */
export function startHook(onKey: (k: RawKey) => void): void {
  if (running) return
  listener = (e) => {
    const k = translate(e)
    if (k) onKey(k)
  }
  uIOhook.on('keydown', listener)
  uIOhook.on('keyup', listener)
  try {
    uIOhook.start()
  } catch (err) {
    detach()
    throw err
  }
  running = true
}

export function stopHook(): void {
  if (!running) return
  running = false
  detach()
  try {
    uIOhook.stop()
  } catch {
    // already stopped; nothing to do
  }
}

export const isHookRunning = (): boolean => running

function detach(): void {
  if (!listener) return
  uIOhook.off('keydown', listener)
  uIOhook.off('keyup', listener)
  listener = null
}
