import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_MAX_PATH } from '../skills/verifiable-fetch/scripts/fetch.ts'
import {
  deduplicate,
  extensionOf,
  fitToPath,
  safeName,
} from '../skills/verifiable-fetch/scripts/names.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'
import { fetchIssue, filesUnder, sha256File } from './support/tracker.ts'

const LONG_NAME =
  'notification-settings-wording-review-before-and-after-comparison-for-the-customer-escalation-meeting-on-the-fifth-of-october-final-revised-ver2-jp.png'

let root: string

beforeAll(() => {
  root = makeTempDir('g2-names')
})

afterAll(() => {
  removeTempDir(root)
})

describe('the naming rules on their own', () => {
  it('replaces every forbidden character and every control character', () => {
    expect(safeName('通知:設定?.png')).toBe('通知_設定_.png')
    expect(safeName('a/b\\c<d>e:f"g|h?i*j.png')).toBe('a_b_c_d_e_f_g_h_i_j.png')
    expect(safeName(`tab\there.png`)).toBe('tab_here.png')
  })

  it('prefixes a Windows device name, extension or not', () => {
    expect(safeName('CON')).toBe('_CON')
    expect(safeName('con.txt')).toBe('_con.txt')
    expect(safeName('COM9.png')).toBe('_COM9.png')
    expect(safeName('LPT1')).toBe('_LPT1')
    expect(safeName('console.png')).toBe('console.png')
  })

  it('gives a name taken twice the attachment id before its extension', () => {
    expect(deduplicate('a.png', 302, new Set())).toBe('a.png')
    expect(deduplicate('a.png', 302, new Set(['a.png']))).toBe('a-302.png')
    expect(deduplicate('a', 302, new Set(['a']))).toBe('a-302')
    expect(extensionOf('.hidden')).toBe('')
    expect(extensionOf('a.tar.gz')).toBe('.gz')
  })

  it('cuts the stem and keeps the extension so the absolute path fits', () => {
    const dir = `/${'d'.repeat(100)}`
    const fitted = fitToPath(dir, LONG_NAME, LONG_NAME, 140)
    expect(join(dir, fitted).length).toBeLessThanOrEqual(140)
    expect(fitted.endsWith('.png')).toBe(true)
    expect(fitted).toMatch(/-[0-9a-f]{8}\.png$/)
    // the same attachment always gets the same short name
    expect(fitToPath(dir, LONG_NAME, LONG_NAME, 140)).toBe(fitted)
    // a name that already fits is left alone
    expect(fitToPath(dir, 'short.png', 'short.png', 240)).toBe('short.png')
  })
})

describe('issue 103 into a directory deep enough to force a cut', () => {
  it('cuts the 150-character name, keeps the absolute path within 240 and keeps the original in the page', async () => {
    // a directory deep enough that <out>/attachments/103/ plus the 150-character name exceeds 240
    const deep = join(root, 'a'.repeat(40), 'b'.repeat(40), 'c'.repeat(20))
    const run = await fetchIssue(103, deep)
    expect(run.code).toBe(0)

    const files = filesUnder(deep)
    const saved = files.filter((f) => f.startsWith('attachments/103/'))
    expect(saved.length).toBe(2)
    const long = saved.find((f) => f.includes('notification-settings'))
    expect(long).toBeDefined()
    const longName = (long ?? '').split('/')[2]
    expect(longName.length).toBeLessThan(LONG_NAME.length)
    expect(longName).toMatch(/-[0-9a-f]{8}\.png$/)
    const absolute = join(deep, long ?? '')
    expect(absolute.length).toBeLessThanOrEqual(DEFAULT_MAX_PATH)

    // the Japanese name keeps neither the colon nor the question mark
    expect(saved).toContain('attachments/103/通知_設定_.png')
    const notice = saved.find((f) => f.endsWith('通知_設定_.png')) ?? ''
    expect(notice).not.toContain(':')
    expect(notice).not.toContain('?')
    expect(sha256File(join(deep, notice))).toBe(
      '9c3acf9da6d30444d64fef71d04c6c5222808c55f1edc254e48cd35e19b8ef9b',
    )
    expect(sha256File(join(deep, long ?? ''))).toBe(
      'a398ab8aca6a272e160dead7cf8e4904b1acd4ccbf60e192d0b18fa841780871',
    )

    // the Markdown keeps the original names, and says what each was saved as
    const page = readFileSync(join(deep, '103.md'), 'utf8')
    expect(page).toContain(`| ${LONG_NAME} | 316 | ${longName} | OK |`)
    expect(page).toContain('| 通知:設定?.png | 739 | 通知_設定_.png | OK |')
    expect(page).toContain(`### ${LONG_NAME}`)
    expect(page).toContain('### 通知:設定?.png')
  })

  it('an output directory too deep for --max-path exits 3 before any download', async () => {
    const deep = join(root, 'x'.repeat(60))
    const run = await fetchIssue(103, deep, ['--max-path', '80'])
    expect(run.code).toBe(3)
    expect(run.lines).toEqual(['output directory too deep for --max-path 80'])
    // the issue itself was read; nothing was downloaded
    const log = run.tracker.log()
    expect(log.map((entry) => entry.path)).toEqual(['/issues/103.json'])
    expect(log.filter((entry) => entry.path.startsWith('/attachments/download/')).length).toBe(0)
    expect(filesUnder(deep)).toEqual([])
  })
})
