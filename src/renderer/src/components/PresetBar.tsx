import { memo, useState, type JSX } from 'react'
import { PRESET_NAME_MAX } from '../../../shared/types'

interface Props {
  names: string[]
  /** Preset the current mapping came from (last loaded or saved), if any. */
  active: string | null
  /** The current mapping differs from the active preset's saved copy. */
  modified: boolean
  onSave(name: string): Promise<boolean>
  onLoad(name: string): void
  onDelete(name: string): void
}

function loadPrompt(picked: string, active: string | null, modified: boolean): string {
  if (modified && picked === active) return `Discard your unsaved changes to “${picked}” and reload it?`
  if (modified) return `“${active}” has unsaved changes. Load “${picked}” and discard them?`
  return `Load “${picked}”? This replaces the current mapping.`
}

export const PresetBar = memo(function PresetBar({ names, active, modified, onSave, onLoad, onDelete }: Props): JSX.Element {
  // The dropdown follows the active preset until the user picks something else.
  const [userChoice, setUserChoice] = useState<{ forActive: string | null; name: string } | null>(null)
  const [name, setName] = useState('')
  const choice = userChoice && userChoice.forActive === active ? userChoice.name : (active ?? '')
  const picked = names.includes(choice) ? choice : ''
  const trimmed = name.trim()

  const save = (): void => {
    if (!trimmed) return
    if (names.includes(trimmed) && !window.confirm(`Replace preset “${trimmed}” with the current mapping?`)) return
    void onSave(trimmed).then((ok) => ok && setName(''))
  }

  return (
    <div className="presets" role="group" aria-label="Presets">
      <select value={picked} onChange={(e) => setUserChoice({ forActive: active, name: e.target.value })} aria-label="Saved presets">
        <option value="">{names.length > 0 ? 'Choose a preset…' : 'No saved presets'}</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        disabled={!picked}
        onClick={() => window.confirm(loadPrompt(picked, active, modified)) && onLoad(picked)}
      >
        Load
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={!picked}
        onClick={() => window.confirm(`Delete preset “${picked}”?`) && onDelete(picked)}
      >
        Delete
      </button>
      {active ? (
        <>
          <span className="preset-sep" aria-hidden="true" />
          <button
            type="button"
            className="btn btn-primary preset-save-active"
            disabled={!modified}
            title={modified ? `Overwrite “${active}” with the current mapping` : `“${active}” is up to date`}
            onClick={() => void onSave(active)}
          >
            Save “{active}”
          </button>
          <span className={modified ? 'preset-state preset-modified' : 'preset-state muted'} role="status">
            {modified ? 'Unsaved changes' : 'Saved'}
          </span>
        </>
      ) : null}
      <span className="preset-sep" aria-hidden="true" />
      <input
        value={name}
        maxLength={PRESET_NAME_MAX}
        placeholder="New preset name"
        aria-label="New preset name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <button type="button" className="btn" disabled={!trimmed} onClick={save}>
        Save as new
      </button>
    </div>
  )
})
