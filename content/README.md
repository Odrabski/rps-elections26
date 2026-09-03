# UI copy

`ui-strings.csv` is every Hebrew string a player can see, for rewriting by hand.

| column | meaning |
| --- | --- |
| `id` | stable key — **do not edit**; it's how edits find their way back to the source |
| `hebrew` | the current text, for reading. Ignored when applying, so reformatting it is harmless |
| `note` | where it shows up, and a warning if it never does — see below. Ignored when applying |
| `new_text` | the replacement. Leave blank to keep the current text |

Import it into Google Sheets with **File → Import → Upload**, choosing *Replace spreadsheet* and
comma as the separator. When you're done, **File → Download → CSV** and save it back over
`content/ui-strings.csv`.

Then:

```
node tools/apply-ui-strings.mjs --dry-run   # show what would change
node tools/apply-ui-strings.mjs             # write it
```

Only rows with a non-empty `new_text` are touched, so a partly-filled sheet is safe to run, as
often as you like.

`{0}`, `{1}` are placeholders for values the code fills in — e.g. `אתם משחקים בתור {0}` becomes
"אתם משחקים בתור קואליציה". Keep them in your replacement; they can move, but every one must
still appear.

`ui-strings.json` records which file each id lives in. It's regenerated, along with the blank CSV,
by `node tools/extract-ui-strings.mjs` — but note that re-running **overwrites the CSV**, so apply
or back up your edits first. Ids are hashes of the original text, so they stay stable across runs.

## The `note` column

Twelve of these strings are **never displayed to anyone** and are marked `NEVER SHOWN`. Don't spend
a pass on them. Most are error messages that can only fire once you're in a game, but `errorMessage`
is only rendered on the home screen — so they're translated, stored, and dropped. Two others are
branches that no reachable state satisfies.

They're left in the sheet rather than hidden so the list stays a complete inventory of what's in the
code, and so the reason is recorded next to each one.

Reachability can't be worked out mechanically — each note was traced by hand and lives in
`tools/ui-string-notes.json`. If the code changes, the notes don't follow it automatically.
