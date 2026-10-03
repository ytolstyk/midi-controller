import { useEffect, useRef, useState } from 'react'
import { isBindableCode } from '../../../shared/keys'

const isEditable = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)

interface Options {
  boundCodes: ReadonlySet<string>
  learnArmed: boolean
  onLearn(code: string): void
  onCancelLearn(): void
}

/**
 * Window-level key capture. Bare bound keys go to main as press/release;
 * while Learn is armed the next bindable key is captured instead (no MIDI).
 * Returns the set of keys currently held (for highlighting) and whether the window has focus.
 */
export function useKeyCapture(opts: Options): { pressed: ReadonlySet<string>; focused: boolean } {
  const optsRef = useRef(opts)
  optsRef.current = opts // always the latest options, without re-attaching listeners
  const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set())
  const [focused, setFocused] = useState(() => document.hasFocus())
  const heldRef = useRef(new Set<string>()) // keys we sent a press for; their keyup must always be honoured

  useEffect(() => {
    const setKey = (code: string, down: boolean): void =>
      setPressed((prev) => {
        if (prev.has(code) === down) return prev
        const next = new Set(prev)
        if (down) next.add(code)
        else next.delete(code)
        return next
      })

    // macOS never delivers keyup for a key that is released while Cmd is held, so Cmd drops everything.
    const releaseAll = (): void => {
      heldRef.current.clear()
      setPressed((prev) => (prev.size > 0 ? new Set() : prev))
      window.api.blur()
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      const o = optsRef.current
      if (e.key === 'Meta') {
        releaseAll()
        return
      }
      if (isEditable(e.target)) return
      if (o.learnArmed) {
        if (e.code === 'Escape') {
          o.onCancelLearn()
          e.preventDefault()
        } else if (!e.metaKey && !e.ctrlKey && !e.altKey && isBindableCode(e.code)) {
          o.onLearn(e.code)
          e.preventDefault()
        }
        return // armed: nothing reaches MIDI; modifier combos keep Learn armed
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (!o.boundCodes.has(e.code)) return
      e.preventDefault()
      if (e.repeat) return
      window.api.press(e.code) // MIDI first; highlight state second
      heldRef.current.add(e.code)
      setKey(e.code, true)
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      const wasHeld = heldRef.current.delete(e.code)
      if (isEditable(e.target) && !wasHeld) return
      setKey(e.code, false)
      if (wasHeld || optsRef.current.boundCodes.has(e.code)) window.api.release(e.code)
    }

    const onBlur = (): void => {
      setFocused(false)
      releaseAll()
      optsRef.current.onCancelLearn()
    }
    const onFocus = (): void => setFocused(true)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return { pressed, focused }
}
