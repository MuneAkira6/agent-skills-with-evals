# The YAML this parser accepts

A full YAML parser would accept constructs the validator cannot judge, and no npm package may enter
a skill directory. So the frontmatter parser reads one subset, exactly, and refuses everything else
with the line it refused — it never guesses what was meant.

## Accepted

- `key: value` at the top level with a **plain scalar**. The value ends at ` #` or at the end of the
  line, and may continue on more-indented lines, folded with single spaces.
- A **double-quoted** scalar, with the escapes `\"`, `\\`, `\n`, `\t` and `\uXXXX`.
- A **single-quoted** scalar, where `''` is one quote.
- A **block scalar**: `|`, `|-`, `>` or `>-`.
- A **list of scalars**: `- item` lines under the key.
- One level of `key: value` pairs under `metadata:`.
- Comment lines and blank lines anywhere.

## Refused, each naming its line

- A duplicated key, at the top level or under `metadata`.
- A tab used for indentation.
- An anchor, an alias or a tag.
- Flow style, as a mapping or as a sequence.
- A map under any key but `metadata`, and deeper nesting under `metadata`.
- A block scalar header other than the four above.
- A quoted scalar that is not closed on its line, an escape outside the set above, or text after a
  closing quote.
- A line that is no key at all, and an unexpected indentation.

A refusal is exit 3, not exit 1: the skill was not judged, so saying it is valid would be a lie.
