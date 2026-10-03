import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Binding, StatusSnapshot } from '../../shared/types'
import { BindingEditor } from './components/BindingEditor'
import { KeyboardView } from './components/KeyboardView'
import { StatusBar } from './components/StatusBar'
import { useKeyCapture } from './hooks/useKeyCapture'

const INITIAL_STATUS: StatusSnapshot = { port: { state: 'lost', name: null }, toggles: {}, notice: null }
const FLASH_MS = 4000

export function App(): JSX.Element {
  const [bindings, setBindings] = useState<Binding[]>([])
  const [status, setStatus] = useState<StatusSnapshot>(INITIAL_STATUS)
  const [selected, setSelected] = useState<string | null>(null)
  const [learnArmed, setLearnArmed] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [panicMessage, setPanicMessage] = useState<string | null>(null)
  const bindingsRef = useRef<Binding[]>([])
  bindingsRef.current = bindings
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const off = window.api.onStatus(setStatus)
    void window.api.getStatus().then(setStatus)
    void window.api.loadBindings().then((r) => {
      setBindings(r.bindings)
      setWarnings(r.warnings)
    })
    return off
  }, [])

  // Quiet notices ("Reconnected") clear themselves; sticky ones wait for Dismiss.
  // Depend on values, not object identity, so key-driven pushes don't re-arm the timer.
  const noticeText = status.notice?.text
  const noticeSticky = status.notice?.sticky
  useEffect(() => {
    if (!noticeText || noticeSticky) return
    const t = setTimeout(() => window.api.dismissNotice(), FLASH_MS)
    return () => clearTimeout(t)
  }, [noticeText, noticeSticky])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const byCode = useMemo(() => new Map(bindings.map((b) => [b.code, b])), [bindings])
  const boundCodes = useMemo(() => new Set(byCode.keys()), [byCode])

  const select = useCallback((code: string) => {
    setSelected(code)
    setErrors([])
  }, [])

  const { pressed, focused } = useKeyCapture({
    boundCodes,
    learnArmed,
    onLearn: (code) => {
      select(code)
      setLearnArmed(false)
    },
    onCancelLearn: () => setLearnArmed(false)
  })

  const persist = useCallback(async (next: Binding[]): Promise<boolean> => {
    const r = await window.api.saveBindings(next)
    setErrors(r.errors)
    if (r.ok) {
      setBindings(next)
      setWarnings(r.warnings)
    }
    return r.ok
  }, [])

  const onSave = useCallback(
    (b: Binding): void => {
      const current = bindingsRef.current
      const next = current.some((x) => x.code === b.code)
        ? current.map((x) => (x.code === b.code ? b : x))
        : [...current, b]
      void persist(next)
    },
    [persist]
  )

  const onClear = useCallback((): void => {
    if (selected) void persist(bindingsRef.current.filter((b) => b.code !== selected))
  }, [persist, selected])

  const onPanic = useCallback((): void => {
    void window.api.panic().then((r) => {
      setPanicMessage(r.message)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setPanicMessage(null), FLASH_MS)
    })
  }, [])

  const onReconnect = useCallback((): void => void window.api.reconnect(), [])
  const onDismissNotice = useCallback((): void => window.api.dismissNotice(), [])
  const onToggleLearn = useCallback((): void => setLearnArmed((v) => !v), [])
  const onTest = useCallback((): void => {
    if (selected) void window.api.test(selected)
  }, [selected])

  return (
    <div className="app">
      <StatusBar
        status={status}
        focused={focused}
        panicMessage={panicMessage}
        onPanic={onPanic}
        onReconnect={onReconnect}
        onDismissNotice={onDismissNotice}
      />
      <main className="workspace">
        <section className="board" aria-label="Keyboard bindings">
          <KeyboardView
            bindings={byCode}
            toggles={status.toggles}
            pressed={pressed}
            selected={selected}
            onSelect={select}
          />
          <p className="legend muted small">
            Lit key = pressed · bound keys show label and MIDI target · toggle LED: lit = on, dim = off, dashed = unknown
          </p>
          {warnings.length > 0 ? (
            <ul className="warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
        <BindingEditor
          code={selected}
          binding={selected ? byCode.get(selected) : undefined}
          learnArmed={learnArmed}
          errors={errors}
          onToggleLearn={onToggleLearn}
          onSave={onSave}
          onClear={onClear}
          onTest={onTest}
        />
      </main>
    </div>
  )
}
