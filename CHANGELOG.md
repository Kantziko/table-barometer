# Changelog

Notable changes to Table Barometer, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the module follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-10-20

### Added

- German, contributed and natively reviewed by [@CePeU](https://github.com/CePeU)
  ([#2](https://github.com/Kantziko/table-barometer/pull/2)). 55 of the 77
  strings were reworked from the machine-translated draft, and German is now an
  active language of the module.
- Korean corrections by
  [@root-1-debug](https://github.com/root-1-debug)
  ([#1](https://github.com/Kantziko/table-barometer/pull/1)). Korean still waits
  in `translations-pending/`, pending confirmation that the whole file has been
  reviewed.

### Fixed

- Escape no longer closes the player palette or the GM summary. Foundry tries to
  close every open window on Escape *before* it deselects a token, and only
  deselects if nothing closed — so pressing Escape with the summary open cost the
  GM their window *and* failed to deselect anything. Both windows now decline
  that key, which also restores deselection on the first press. The axis editor
  still closes on Escape, as a window opened for a task should, and the close
  button is unaffected.

### Removed

- `translations-pending/de.json`, superseded by the reviewed `lang/de.json`.

## [1.1.1] — 2026-09-19

### Changed

- Ships in English and French only. The other eight draft translations moved to
  `translations-pending/`, where they wait for review by native speakers rather
  than being shipped unchecked.
- Interface switched to American English, matching Foundry's own.
- README: new introduction and install instructions.

### Added

- Validation messages in the axis editor are now translated.

### Removed

- Unused stylesheet rules.

## [1.1.0] — 2026-09-19

First public release.

### Added

- Player palette with three default axes: fun, pace, amount of roleplay. Three
  positions each, always on screen, changeable at any time.
- Anonymised GM summary showing the distribution before the average, with
  split-table detection — a centred average can hide a table pulling both ways.
- Axis editor: add, remove, reorder and rename axes, and pick their icons,
  without leaving the table.
- Reveal delay, so a change reaching the GM cannot be tied to the moment it was
  made.
- Interface in ten languages (only two of which survived into 1.1.1, see above).

[1.2.0]: https://github.com/Kantziko/table-barometer/releases/tag/v1.2.0
[1.1.1]: https://github.com/Kantziko/table-barometer/releases/tag/v1.1.1
[1.1.0]: https://github.com/Kantziko/table-barometer/releases/tag/v1.1.0
