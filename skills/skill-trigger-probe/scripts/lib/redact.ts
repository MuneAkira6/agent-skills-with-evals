// Redaction. Everything an arm or a run writes passes through here first: the proxy variables are
// visible to the tools of a session on this host (fact F10) and they carry credentials, a signed URL
// is itself a credential, and a transcript is a file somebody will read later.
//
// No literal token prefix is written anywhere in this repository — a publication's leak scan looks
// for those, and a file that plants one makes every scan noisy. The patterns below are character
// classes for that reason, and every planted secret in the tests is joined from parts at run time.

export type Redactor = {
  /** the text with every known secret replaced; counts each replacement */
  line: (text: string) => string
  count: () => number
}

export const REDACTED = '[redacted]'

const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The variable names whose value is a secret by convention. */
const SECRET_NAME = /TOKEN|SECRET|PASSWORD|KEY/
const PROXY_NAMES = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']

/** Every exact value worth replacing, longest first so a prefix never wins over the whole. */
export const secretValues = (env: Record<string, string | undefined>): string[] => {
  const values = new Set<string>()
  for (const name of PROXY_NAMES) {
    const value = env[name]
    if (value !== undefined && value !== '') values.add(value)
  }
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.length < 8) continue
    if (SECRET_NAME.test(name)) values.add(value)
  }
  return [...values].sort((a, b) => b.length - a.length)
}

const PATTERNS: RegExp[] = [
  // an Anthropic-style key, a GitHub-style token and a fine-grained one, as character classes
  /sk-an[t]-[A-Za-z0-9_-]{8,}/g,
  /gh[pousr]_[A-Za-z0-9]{8,}/g,
  /github_pa[t]_[A-Za-z0-9_]{8,}/g,
]

/** A URL's `user:password@`: the password goes, the user stays so the line still makes sense. */
const URL_CREDENTIALS = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/g

/** The query parameters that carry a credential in a signed URL. */
const QUERY_SECRET = /([?&](?:token|signature|sig|expires|X-Amz-[A-Za-z0-9-]+)=)([^&\s"'<>#]+)/gi

export const makeRedactor = (env: Record<string, string | undefined> = process.env): Redactor => {
  const values = secretValues(env)
  let replacements = 0

  const line = (text: string): string => {
    let out = text
    for (const value of values) {
      const pattern = new RegExp(escapeForRegExp(value), 'g')
      out = out.replace(pattern, () => {
        replacements += 1
        return REDACTED
      })
    }
    for (const pattern of PATTERNS) {
      out = out.replace(pattern, () => {
        replacements += 1
        return REDACTED
      })
    }
    out = out.replace(URL_CREDENTIALS, (_m, scheme: string, user: string) => {
      replacements += 1
      return `${scheme}${user}:${REDACTED}@`
    })
    out = out.replace(QUERY_SECRET, (_m, head: string) => {
      replacements += 1
      return `${head}${REDACTED}`
    })
    return out
  }

  return { line, count: () => replacements }
}
