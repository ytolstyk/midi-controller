import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from './atomicWrite'

export interface Settings {
  globalKeys: boolean
}

// Off until the user opts in: capture reads keys typed in every app.
const DEFAULTS: Settings = { globalKeys: false }

/** Tiny JSON settings file. Failures fall back to defaults; settings are never worth blocking startup. */
export class SettingsStore {
  constructor(private readonly path: string) {}

  async load(): Promise<Settings> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      const saved = (raw as Partial<Settings> | null)?.globalKeys // may be any JSON shape; validated below
      return { globalKeys: typeof saved === 'boolean' ? saved : DEFAULTS.globalKeys }
    } catch {
      return { ...DEFAULTS }
    }
  }

  private writes: Promise<void> = Promise.resolve()

  /** Saves run one at a time, each via tmp + rename, so a crash or a quick double toggle can't leave a torn or stale file. */
  save(s: Settings): Promise<void> {
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
