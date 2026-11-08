import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from './atomicWrite'
import { normalizePresetName } from '../shared/validation'

export interface Settings {
  globalKeys: boolean
  /** Name of the preset last loaded or saved; null when the mapping isn't tied to one. */
  activePreset: string | null
}

export const DEFAULT_SETTINGS: Settings = { globalKeys: false, activePreset: null }

/**
 * Tiny JSON settings file with an in-memory copy. Failures fall back to defaults;
 * settings are never worth blocking startup. Await `ready` before reading `value` or calling `patch`.
 */
export class SettingsStore {
  private current: Settings = { ...DEFAULT_SETTINGS }
  private writes: Promise<void> = Promise.resolve()
  /** Resolves (never rejects) once the saved file has been read into `value`. */
  readonly ready: Promise<void>

  constructor(private readonly path: string) {
    this.ready = this.read().then((s) => {
      this.current = s
    })
  }

  get value(): Settings {
    return this.current
  }

  /** Merges `change` into the settings and persists them. Resolves once the write has finished. */
  patch(change: Partial<Settings>): Promise<void> {
    this.current = { ...this.current, ...change }
    return this.save(this.current)
  }

  private async read(): Promise<Settings> {
    try {
      // Any JSON shape is possible; each field is validated below.
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<Record<keyof Settings, unknown>> | null
      return {
        globalKeys: typeof raw?.globalKeys === 'boolean' ? raw.globalKeys : DEFAULT_SETTINGS.globalKeys,
        activePreset: normalizePresetName(raw?.activePreset)
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  /** Saves run one at a time, each via tmp + rename, so a crash or a quick double toggle can't leave a torn or stale file. */
  private save(s: Settings): Promise<void> {
    this.writes = this.writes.then(async () => {
      try {
        await writeFileAtomic(this.path, JSON.stringify(s))
      } catch (err) {
        console.warn('[settings] could not save', err) // keep running with the in-memory value
      }
    })
    return this.writes
  }
}
