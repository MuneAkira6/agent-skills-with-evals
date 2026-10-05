import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { OutputFile } from './types.ts'

/** 1 MB: a bigger file is listed with its checksum but not copied beside the results. */
export const COPY_LIMIT = 1024 * 1024

const walk = (dir: string, base: string, found: string[]): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const path = join(dir, entry.name)
    const rel = relative(base, path)
    // the arm's own session files are not an output
    if (rel.split(sep)[0] === '.claude') continue
    if (entry.isDirectory()) walk(path, base, found)
    else if (entry.isFile()) found.push(path)
  }
}

/**
 * Every file the arm left in `ws/` outside `.claude/`, with its size, sha256 and first 64 bytes;
 * the ones of 1 MB or less are copied into `<dest>/outputs/`.
 */
export const collectOutputs = (ws: string, dest: string): OutputFile[] => {
  const found: string[] = []
  walk(ws, ws, found)
  const files: OutputFile[] = []
  for (const path of found) {
    const rel = relative(ws, path).split(sep).join('/')
    const bytes = readFileSync(path)
    const copied = bytes.length <= COPY_LIMIT
    if (copied) {
      const target = join(dest, 'outputs', ...rel.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(path, target)
    }
    files.push({
      path: rel,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      head64: bytes.subarray(0, 64).toString('base64'),
      copied,
    })
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1))
}
