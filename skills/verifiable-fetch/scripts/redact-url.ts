// URL redaction for this skill, with Node builtins only.
//
// A skill directory stands alone: it may not import from another skill, so this is deliberately not
// the A/B runner's redaction module, and the two lists differ on purpose. This one hides the query
// values of `token`, `signature`, `sig`, `expires`, `key` and `X-Amz-*` — `key` is here because a
// tracker's own download links carry one, and a line of this fetcher's output is a line somebody
// will paste into a ticket.

export const REDACTED = '[redacted]'

const QUERY_SECRET =
  /([?&](?:token|signature|sig|expires|key|X-Amz-[A-Za-z0-9-]+)=)([^&\s"'<>#]+)/gi

/** The text with every signed-URL parameter's value replaced, its name kept. */
export const redactUrls = (text: string): string =>
  text.replace(QUERY_SECRET, (_match, head: string) => `${head}${REDACTED}`)
