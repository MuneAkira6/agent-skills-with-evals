// The guard's negative self-tests: each rule broken on its own, rejected with that reason and no
// other. Every planted secret is joined from parts at run time — no literal token prefix may exist
// anywhere in this repository.

import { describe, expect, it } from 'vitest'
import type { GuardContext } from '../skills/standup-digest/scripts/guard.ts'
import { extractJson, guard, LIMITS } from '../skills/standup-digest/scripts/guard.ts'

const CONTEXT: GuardContext = {
  decisionNumbers: [206, 205, 202, 211, 201, 190, 204],
  tableNumbers: [207, 215, 203, 209],
  knownNumbers: [190, 201, 202, 203, 204, 205, 206, 207, 209, 211, 215, 221, 223, 13, 4, 7, 20, 71],
}

const VALID = {
  decisions: [
    { number: 206, stuck_on: '返信を待っている', decision_needed: '催促するか待つか' },
    { number: 205, stuck_on: '相手の確認待ち', decision_needed: '閉じるか続けるか' },
  ],
  one_liners: [{ number: 207, text: 'コメントだけ付いた' }],
  notes: ['書き方を柔らかくした'],
}

const narrative = (changes: Record<string, unknown>): string =>
  JSON.stringify({ ...VALID, ...changes })

const reasonsOf = (text: string): string[] => {
  const result = guard(text, CONTEXT)
  return result.accepted ? [] : result.reasons
}

describe('the guard accepts a narrative that keeps every rule', () => {
  it('accepts the valid one and returns exactly what it read', () => {
    const result = guard(narrative({}), CONTEXT)
    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.narrative.decisions).toEqual(VALID.decisions)
    expect(result.narrative.one_liners).toEqual(VALID.one_liners)
    expect(result.narrative.notes).toEqual(VALID.notes)
    expect(result.dropped).toEqual([])
  })

  it('unwraps a fenced block and ignores a preface', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('here you are:\n{"a":1}\nthat is all')).toBe('{"a":1}')
    expect(extractJson('no object here')).toBeNull()
    const result = guard(`いかがでしょうか。\n\`\`\`json\n${narrative({})}\n\`\`\``, CONTEXT)
    expect(result.accepted).toBe(true)
  })

  it('an entry with an empty field is dropped, not rejected', () => {
    const result = guard(
      narrative({
        decisions: [
          { number: 206, stuck_on: '', decision_needed: '催促するか待つか' },
          { number: 205, stuck_on: '相手の確認待ち', decision_needed: '' },
        ],
      }),
      CONTEXT,
    )
    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    // the page fills the missing half from the triggers
    expect(result.narrative.decisions).toEqual([
      { number: 206, decision_needed: '催促するか待つか' },
      { number: 205, stuck_on: '相手の確認待ち' },
    ])
    expect(result.dropped).toEqual(['#206: stuck_on was empty', '#205: decision_needed was empty'])
  })
})

describe('each rejection rule, broken on its own', () => {
  it('a decision the rules did not choose', () => {
    expect(
      reasonsOf(narrative({ decisions: [{ number: 999, stuck_on: 'x', decision_needed: 'y' }] })),
    ).toEqual(['#999 is not one of the decisions the rules chose'])
  })

  it('the same decision twice', () => {
    expect(
      reasonsOf(
        narrative({
          decisions: [
            { number: 206, stuck_on: 'a', decision_needed: 'b' },
            { number: 206, stuck_on: 'c', decision_needed: 'd' },
          ],
        }),
      ),
    ).toEqual(['#206 appears twice among the decisions'])
  })

  it('stuck_on over 80 characters', () => {
    const long = 'あ'.repeat(LIMITS.stuckOn + 1)
    expect(
      reasonsOf(narrative({ decisions: [{ number: 206, stuck_on: long, decision_needed: 'b' }] })),
    ).toEqual([`stuck_on of #206 is ${LIMITS.stuckOn + 1} characters (limit ${LIMITS.stuckOn})`])
  })

  it('decision_needed over 50 characters', () => {
    const long = 'い'.repeat(LIMITS.decisionNeeded + 1)
    expect(
      reasonsOf(narrative({ decisions: [{ number: 206, stuck_on: 'a', decision_needed: long }] })),
    ).toEqual([
      `decision_needed of #206 is ${LIMITS.decisionNeeded + 1} characters (limit ${LIMITS.decisionNeeded})`,
    ])
  })

  it('a one-liner for an item that is not in the table', () => {
    expect(reasonsOf(narrative({ one_liners: [{ number: 206, text: 'x' }] }))).toEqual([
      'a one-liner for #206, which is not in the table',
    ])
  })

  it('a one-liner over 60 characters', () => {
    const long = 'う'.repeat(LIMITS.oneLiner + 1)
    expect(reasonsOf(narrative({ one_liners: [{ number: 207, text: long }] }))).toEqual([
      `the one-liner of #207 is ${LIMITS.oneLiner + 1} characters (limit ${LIMITS.oneLiner})`,
    ])
  })

  it('more than three notes', () => {
    expect(reasonsOf(narrative({ notes: ['a', 'b', 'c', 'd'] }))).toEqual(['4 notes (limit 3)'])
  })

  it('a note over 120 characters', () => {
    const long = 'え'.repeat(LIMITS.note + 1)
    expect(reasonsOf(narrative({ notes: [long] }))).toEqual([
      `note 1 is ${LIMITS.note + 1} characters (limit ${LIMITS.note})`,
    ])
  })

  it('a number that occurs nowhere in the narration input', () => {
    expect(reasonsOf(narrative({ notes: ['#777 も見てほしい'] }))).toEqual([
      '#777 does not occur in narrate-input.json',
    ])
    // a number that does occur is fine
    expect(reasonsOf(narrative({ notes: ['#221 のレビュー待ち'] }))).toEqual([])
  })

  it('https://, http:// and www.', () => {
    expect(reasonsOf(narrative({ notes: ['詳細は https://example.invalid/x'] }))).toEqual([
      '"https://" is not allowed: 詳細は https://example.invalid/x',
    ])
    expect(reasonsOf(narrative({ notes: ['詳細は http://example.invalid/x'] }))).toEqual([
      '"http://" is not allowed: 詳細は http://example.invalid/x',
    ])
    expect(reasonsOf(narrative({ notes: ['詳細は www.example.invalid'] }))).toEqual([
      '"www." is not allowed: 詳細は www.example.invalid',
    ])
  })

  it('an @ mention', () => {
    expect(reasonsOf(narrative({ notes: ['確認は @aoi-tanaka に頼む'] }))).toEqual([
      'an @ mention is not allowed: 確認は @aoi-tanaka に頼む',
    ])
    // an address-like string that is not a mention at the start or after a space is left alone
    expect(reasonsOf(narrative({ notes: ['メールはa@bに送った'] }))).toEqual([])
  })

  it('an Anthropic-style key, a GitHub-style token and a fine-grained one', () => {
    const key = ['sk', '-ant-', 'api03-', 'A'.repeat(20)].join('')
    const token = ['gh', 'p_', 'B'.repeat(20)].join('')
    const pat = ['github', '_pa', 't_', 'C'.repeat(20)].join('')
    expect(reasonsOf(narrative({ notes: [key] }))).toEqual([
      `an Anthropic-style key is not allowed: ${key}`,
    ])
    expect(reasonsOf(narrative({ notes: [token] }))).toEqual([
      `a GitHub-style token is not allowed: ${token}`,
    ])
    expect(reasonsOf(narrative({ notes: [pat] }))).toEqual([
      `a fine-grained GitHub token is not allowed: ${pat}`,
    ])
  })

  it('password and パスワード', () => {
    expect(reasonsOf(narrative({ notes: ['the password is in the ticket'] }))).toEqual([
      '"password" is not allowed: the password is in the ticket',
    ])
    expect(reasonsOf(narrative({ notes: ['パスワードは共有済み'] }))).toEqual([
      '"パスワード" is not allowed: パスワードは共有済み',
    ])
  })

  it('an answer that is no JSON at all, and one that does not parse', () => {
    expect(reasonsOf('すみません、わかりません。')).toEqual(['no JSON object in the answer'])
    const broken = guard('{"decisions": [}', CONTEXT)
    expect(broken.accepted).toBe(false)
    if (broken.accepted) return
    expect(broken.reasons[0]).toContain('the JSON does not parse')
  })

  it('every reason is listed, not only the first', () => {
    const reasons = reasonsOf(
      narrative({
        decisions: [{ number: 999, stuck_on: 'a', decision_needed: 'b' }],
        one_liners: [{ number: 206, text: 'x' }],
        notes: ['a', 'b', 'c', 'd'],
      }),
    )
    expect(reasons).toContain('#999 is not one of the decisions the rules chose')
    expect(reasons).toContain('a one-liner for #206, which is not in the table')
    expect(reasons).toContain('4 notes (limit 3)')
    expect(reasons).toHaveLength(3)
  })
})
