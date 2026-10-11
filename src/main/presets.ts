import { promises as fs } from 'node:fs'
import { writeFileAtomic } from './atomicWrite'
import { parsePresetsFile } from '../shared/validation'
import { MAX_PRESETS } from '../shared/types'
import type { Binding, Preset, PresetsFile } from '../shared/types'

/** Named binding sets in one JSON file. Callers serialize access (see inOrder in index.ts). */
export class PresetStore {
  /** Problems found by the most recent read (entries dropped as invalid). */
  warnings: string[] = []

  constructor(private readonly file: string) {}

  async list(): Promise<Preset[]> {
    this.warnings = []
    let text: string
    try {
      text = await fs.readFile(this.file, 'utf8')
    } catch (err) {
      // Only "no file yet" means an empty library; any other failure must not look empty, or the next write would wipe it.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    try {
      const parsed = parsePresetsFile(JSON.parse(text))
      this.warnings = parsed.warnings
      return parsed.presets
    } catch {
      // If it can't be moved aside, fail rather than let the next write overwrite it.
      await fs.rename(this.file, `${this.file}.${Date.now()}.corrupt`)
      return []
    }
  }

  /** Insert or replace by name. Throws when the library is full. */
  async put(name: string, bindings: Binding[]): Promise<Preset[]> {
    const presets = await this.list()
    const i = presets.findIndex((p) => p.name === name)
    if (i >= 0) presets[i] = { name, bindings }
    else if (presets.length >= MAX_PRESETS) throw new Error(`preset limit (${MAX_PRESETS}) reached`)
    else presets.push({ name, bindings })
    await this.write(presets)
    return presets
  }

  async remove(name: string): Promise<Preset[]> {
    const presets = (await this.list()).filter((p) => p.name !== name)
    await this.write(presets)
    return presets
  }

  private async write(presets: Preset[]): Promise<void> {
    // The write below drops entries that failed validation; keep the original aside so they can be recovered.
    // If the copy fails the write is abandoned, so nothing is lost.
    if (this.warnings.length > 0) await fs.copyFile(this.file, `${this.file}.${Date.now()}.dropped`)
    this.warnings = []
    const payload: PresetsFile = { schemaVersion: 1, presets }
    await writeFileAtomic(this.file, JSON.stringify(payload, null, 2), { backup: true })
  }
}
