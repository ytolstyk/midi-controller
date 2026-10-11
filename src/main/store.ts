import { promises as fs } from 'node:fs'
import { writeFileAtomic } from './atomicWrite'
import { defaultBindings, parseBindingsFile } from '../shared/validation'
import type { Binding, BindingsFile, LoadResult } from '../shared/types'

/** JSON persistence: atomic writes, one .bak of the previous file, corrupt files kept aside. */
export class BindingsStore {
  constructor(private readonly file: string) {}

  async load(): Promise<LoadResult> {
    let text: string
    try {
      text = await fs.readFile(this.file, 'utf8')
    } catch {
      return { bindings: defaultBindings(), warnings: [] }
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      const aside = `${this.file}.corrupt`
      await fs.rename(this.file, aside).catch(() => undefined)
      return {
        bindings: defaultBindings(),
        warnings: [`bindings file was unreadable; kept as ${aside} and reset to defaults`]
      }
    }
    return parseBindingsFile(raw)
  }

  async save(bindings: Binding[]): Promise<void> {
    const payload: BindingsFile = { schemaVersion: 1, bindings }
    await writeFileAtomic(this.file, JSON.stringify(payload, null, 2), { backup: true })
  }
}
