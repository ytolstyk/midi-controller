import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

/** Write via tmp + rename so a crash can't leave a torn file; optionally keep one .bak of the previous content. */
export async function writeFileAtomic(file: string, text: string, opts: { backup?: boolean } = {}): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  if (opts.backup) await fs.copyFile(file, `${file}.bak`).catch(() => undefined)
  const tmp = join(dirname(file), `.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(tmp, text, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined)
    throw err
  }
}
