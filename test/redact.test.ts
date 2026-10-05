import { describe, expect, it } from 'vitest'
import {
  makeRedactor,
  REDACTED,
  secretValues,
} from '../skills/skill-trigger-probe/scripts/lib/redact.ts'

// Every planted secret is joined from parts at run time: no literal token prefix exists in this
// repository, because a publication's leak scan looks for exactly those.
const KEY = ['sk', '-ant-', 'api03-', 'Z'.repeat(40)].join('')
const TOKEN = ['gh', 'p_', 'Y'.repeat(36)].join('')
const FINE_GRAINED = ['github', '_pa', 't_', 'X'.repeat(40)].join('')
const PASSWORD = ['s3cr', 'et', 'Passw0rd'].join('')

describe('the redaction, rule by rule', () => {
  it('replaces an exact value of a proxy variable', () => {
    const r = makeRedactor({ HTTPS_PROXY: 'http://proxy.invalid:3128' })
    expect(r.line('connecting through http://proxy.invalid:3128 now')).toBe(
      `connecting through ${REDACTED} now`,
    )
    expect(r.count()).toBe(1)
  })

  it('replaces the value of any variable whose name speaks of a secret, from 8 characters', () => {
    const env = {
      MY_API_TOKEN: PASSWORD,
      SOME_SECRET: 'short',
      OTHER_PASSWORD: 'abcdefgh',
      PLAIN_NAME: 'not-a-secret-value',
    }
    expect(secretValues(env)).toEqual([PASSWORD, 'abcdefgh'])
    const r = makeRedactor(env)
    expect(r.line(`${PASSWORD} short abcdefgh not-a-secret-value`)).toBe(
      `${REDACTED} short ${REDACTED} not-a-secret-value`,
    )
  })

  it('replaces an Anthropic-style key, a GitHub token and a fine-grained one by their shape', () => {
    const r = makeRedactor({})
    expect(r.line(`key ${KEY} token ${TOKEN} pat ${FINE_GRAINED}`)).toBe(
      `key ${REDACTED} token ${REDACTED} pat ${REDACTED}`,
    )
    expect(r.count()).toBe(3)
  })

  it("replaces a URL's password and keeps the user, so the line still reads", () => {
    const r = makeRedactor({})
    expect(r.line('proxy http://alice:topsecret123@gateway.invalid:8080/x')).toBe(
      `proxy http://alice:${REDACTED}@gateway.invalid:8080/x`,
    )
  })

  it('replaces the query parameters of a signed URL and keeps their names', () => {
    const r = makeRedactor({})
    const url = `http://127.0.0.1:18452/media/302?token=${'c'.repeat(32)}&signature=abc&sig=def&expires=1799999999&X-Amz-Signature=${'d'.repeat(40)}`
    expect(r.line(url)).toBe(
      `http://127.0.0.1:18452/media/302?token=${REDACTED}&signature=${REDACTED}&sig=${REDACTED}&expires=${REDACTED}&X-Amz-Signature=${REDACTED}`,
    )
    expect(r.count()).toBe(5)
  })

  it('counts every replacement, and leaves a line with no secret untouched', () => {
    const r = makeRedactor({ HTTP_PROXY: 'http://proxy.invalid:3128' })
    const clean = 'GET http://127.0.0.1:18451/issues/101.json -> 200'
    expect(r.line(clean)).toBe(clean)
    expect(r.count()).toBe(0)
    r.line(`${KEY} ${KEY} http://proxy.invalid:3128`)
    expect(r.count()).toBe(3)
  })
})
