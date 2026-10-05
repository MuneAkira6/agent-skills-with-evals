# Names and paths

A file name out of a tracker is somebody's free text. It can hold a colon, a slash, a question mark
or a newline, and it can be 150 characters long. The rules below make it a file name on every
platform without losing what it was.

## The name

1. `/`, `\`, `<`, `>`, `:`, `"`, `|`, `?`, `*` and every control character become `_`.
2. A Windows device name — `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` — is prefixed
   with `_`. `CON.txt` is the device too, so the check is on the stem.
3. A name already taken by another attachment of the same issue gets `-<attachment id>` before its
   extension.
4. If the absolute path would pass `--max-path` (240 by default), the stem is cut and
   `-<first 8 hex of sha256(the original name)>` is added, keeping the extension. The hash is of the
   original name, so the same attachment always gets the same short name.

The page always shows the **original** name, with the saved name beside it. Nothing is lost; the
mapping is written down.

## The depth check

Before any download, the fetcher measures `<out>/attachments/<id>/` plus 20 characters for a name.
If that passes `--max-path`, it exits 3 and downloads nothing. An archive you cannot finish is worse
than one you did not start.

## Why 240 and not 260

A Windows path is limited to 260 characters, and some directory tools fail past it **without an
error**: they return an empty result, and the archive reads as if the files were never saved. The
twenty characters left over are the room a reader needs to move the tree somewhere else.
