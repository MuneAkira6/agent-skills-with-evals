# When an attachment counts as fetched

Three things must hold, and they are checked in this order so that the reason names what actually
arrived:

1. **the status is 200** — otherwise `HTTP <status>`;
2. **the content matches the declared type** — otherwise `type <content_type>: got HTML` or
   `type <content_type>: signature mismatch`;
3. **the byte count equals `filesize` from the metadata** — otherwise `size <got> != <filesize>`.

The type comes before the size on purpose. A sign-in page served under `image/png` fails both tests,
and `got HTML` tells a reader what to go and fix; `size 233 != 18204` does not.

## The signatures

| Declared type | First bytes |
| --- | --- |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| `image/jpeg` | `FF D8 FF` |
| `image/gif` | `GIF8` |
| `application/pdf` | `%PDF-` |
| `application/zip` | `50 4B 03 04` |

For any declared type other than `text/html`, a body that begins — after whitespace — with
`<!doctype html` or `<html`, in any case, is refused whatever its signature says.

A type not in the table has no signature check. The byte count still applies, and so does the HTML
rule, which is what catches the error page.

## Why not trust the status alone

A gateway that refuses a request answers 403 with a page. A tracker that wants a login answers
**200** with a page. The second is the dangerous one: a downloader that checks only the status saves
it, and the file it saves has a plausible name and a plausible size.

## Where the file goes while it is checked

The body streams into a temporary file beside its target and is renamed only once all three tests
pass. A refused download leaves nothing behind — not a short file, not a partial one, and no file
under the name that was asked for. That is the property to check after a run: `find` the output
directory and confirm no file exists under a refused name.
