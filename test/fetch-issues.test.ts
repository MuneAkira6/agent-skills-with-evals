import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTempDir, removeTempDir } from './support/tmp.ts'
import { fetchIssue, filesUnder, sha256File } from './support/tracker.ts'

const F20 = {
  'board-before.png': '39ae80397eed9d46b448385be587018fcc0a31b4b2de2e05ae198b4645e95627',
  'board-after.png': '99b66246758c34aa8a99d79ab8e6dadcfbadd21148daf03a9c73f6df2a40ed8f',
  'export-dialog.png': '4d4b1b73790b4d26a4fe423b5373c6d3842383c4e9047402b57f2b3274ff4c10',
  'export-log.zip': '02e34249abc54aba2c06c3b8b35b7f4fc78ba9b10df5371e7d8372f50adbf44c',
}

let root: string

beforeAll(() => {
  root = makeTempDir('g2-issues')
})

afterAll(() => {
  removeTempDir(root)
})

describe('issue 101: every attachment fetched', () => {
  it('exits 0, writes the five sections in order and both images with the checksums of F20', async () => {
    const out = join(root, 'i101')
    const run = await fetchIssue(101, out)
    expect(run.code).toBe(0)
    expect(run.lines).toEqual([
      'OK board-before.png 812',
      'OK board-after.png 812',
      'fetched #101: 2 attachments, 2 ok, 0 failed',
    ])

    const page = readFileSync(join(out, '101.md'), 'utf8')
    expect(page.split('\n').filter((line) => line.startsWith('## '))).toEqual([
      '## Title',
      '## Meta',
      '## Description',
      '## Journals',
      '## Attachments',
    ])
    expect(page).toContain('#101: ボード画面でカードの並び順が保存されない')
    expect(page).toContain('| Assignee | 田中 葵 |')
    expect(page).toContain('| Created | 2026-09-28 |')
    expect(page).toContain('| Updated | 2026-09-30 |')

    // the description's own headings are demoted so they sit under the page's
    expect(page).toContain('### 再現手順')
    expect(page).toContain('### 期待する結果')
    expect(page).not.toContain('\n## 再現手順')

    // both journals, oldest first, with the detail line of the first
    const journalHeadings = page
      .split('\n')
      .filter((line) => line.startsWith('### ') && line.includes(' UTC'))
    expect(journalHeadings).toEqual([
      '### 田中 葵 — 2026-09-29 02:00 UTC',
      '### 鈴木 蓮 — 2026-09-30 06:40 UTC',
    ])
    expect(page).toContain('再現しました。並べ替えた直後は正しく、再読み込みで元に戻ります。')
    expect(page).toContain('- status_id: 1 → 2')
    expect(page).toContain('画像を 2 枚添付しました。')

    expect(page).toContain('| board-before.png | 812 | board-before.png | OK |')
    expect(page).toContain('| board-after.png | 812 | board-after.png | OK |')
    expect(page).toContain('![board-before.png](attachments/101/board-before.png)')
    expect((page.match(/（説明なし）/g) ?? []).length).toBe(2)

    expect(filesUnder(out)).toEqual([
      '101.md',
      'attachments/101/board-after.png',
      'attachments/101/board-before.png',
    ])
    expect(sha256File(join(out, 'attachments', '101', 'board-before.png'))).toBe(
      F20['board-before.png'],
    )
    expect(sha256File(join(out, 'attachments', '101', 'board-after.png'))).toBe(
      F20['board-after.png'],
    )
  })
})

describe('issue 102: two fetched, two refused', () => {
  it('exits 1, keeps the two good files and leaves nothing under the refused names', async () => {
    const out = join(root, 'i102')
    const run = await fetchIssue(102, out)
    expect(run.code).toBe(1)
    expect(run.lines).toEqual([
      'OK export-dialog.png 617',
      'OK export-log.zip 3145728',
      'FAIL gateway-screenshot.png: HTTP 403',
      'FAIL settings.png: type image/png: got HTML',
      'fetched #102: 4 attachments, 2 ok, 2 failed',
    ])

    // no HTML is ever saved under an image's name: the two refused names exist nowhere on disk
    expect(filesUnder(out)).toEqual([
      '102.md',
      'attachments/102/export-dialog.png',
      'attachments/102/export-log.zip',
    ])
    expect(existsSync(join(out, 'attachments', '102', 'gateway-screenshot.png'))).toBe(false)
    expect(existsSync(join(out, 'attachments', '102', 'settings.png'))).toBe(false)
    // and no part file is left behind either
    expect(filesUnder(out).filter((p) => p.includes('.part'))).toEqual([])

    expect(statSync(join(out, 'attachments', '102', 'export-dialog.png')).size).toBe(617)
    expect(sha256File(join(out, 'attachments', '102', 'export-dialog.png'))).toBe(
      F20['export-dialog.png'],
    )
    expect(statSync(join(out, 'attachments', '102', 'export-log.zip')).size).toBe(3_145_728)
    expect(sha256File(join(out, 'attachments', '102', 'export-log.zip'))).toBe(
      F20['export-log.zip'],
    )

    const page = readFileSync(join(out, '102.md'), 'utf8')
    expect(page).toContain('| export-dialog.png | 617 | export-dialog.png | OK |')
    expect(page).toContain('| export-log.zip | 3145728 | export-log.zip | OK |')
    expect(page).toContain('| gateway-screenshot.png | 23456 | - | 取得失敗: HTTP 403 |')
    expect(page).toContain('| settings.png | 18204 | - | 取得失敗: type image/png: got HTML |')
    // the archive is listed as a row and gets no image section and no link: it is not an image
    expect(page).not.toContain('### export-log.zip')
    expect(page).not.toContain('](attachments/102/export-log.zip)')
    expect(page).toContain('![export-dialog.png](attachments/102/export-dialog.png)')
    expect((page.match(/（説明なし）/g) ?? []).length).toBe(1)
  })
})

describe('issue 104 and the issue that does not exist', () => {
  it('issue 104 exits 1 with a 404 and a short read', async () => {
    const out = join(root, 'i104')
    const run = await fetchIssue(104, out)
    expect(run.code).toBe(1)
    expect(run.lines).toEqual([
      'FAIL missing.png: HTTP 404',
      'FAIL partial.png: size 274 != 548',
      'fetched #104: 2 attachments, 0 ok, 2 failed',
    ])
    // the page is still written, and no attachment file exists
    expect(filesUnder(out)).toEqual(['104.md'])
    const page = readFileSync(join(out, '104.md'), 'utf8')
    expect(page).toContain('| missing.png | 4096 | - | 取得失敗: HTTP 404 |')
    expect(page).toContain('| partial.png | 548 | - | 取得失敗: size 274 != 548 |')
    // issue 104 has no journal with notes or details
    expect(page).toContain('（なし）')
  })

  it('issue 105 exits 2 and writes nothing at all', async () => {
    const out = join(root, 'i105')
    const run = await fetchIssue(105, out)
    expect(run.code).toBe(2)
    expect(run.lines).toEqual(['issue 105: HTTP 404'])
    expect(existsSync(out)).toBe(false)
    expect(filesUnder(out)).toEqual([])
  })
})
