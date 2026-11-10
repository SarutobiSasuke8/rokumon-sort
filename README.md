# Rokumon Sort

A self-contained colour-sorting puzzle for the Rokumon Games catalogue. Pour forge pigments between crystal vials until every vial is a single sealed colour.

Open `index.html` in a browser. No build step and no network assets are required.

## Rules

- Every vial holds four measures of pigment.
- Tap a source vial, then a target. The top run of one colour pours across.
- A pour is legal only when the target is empty or its top colour matches, and only up to the space remaining.
- A vial filled with one colour seals. You cannot pour out of a sealed vial.
- The gate is clear when every colour is sealed (empty vials may remain).
- From the Copper Bell onward, deeper measures are lacquered until they reach the visible top. Each pigment also has its own seal mark so colours stay distinct.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Choose a vial | Tap | Arrows, then Enter or Space |
| Pour | Tap the target | Move to the target, Enter |
| Undo | Undo | U |
| Hint | Hint | H |
| Restart | Restart | R |
| Pause | Pause | Esc |
| Sound | Sound on the title or pause card | M |

Three hints are available on each attempt. Hints point at a legal pour; they do not play it for you. Undo steps back one pour and does not restore a spent hint.

## Campaign

Twenty gates. Clearing a gate unlocks the next. Stars compare your moves with the par (a shortest known solution):

- 3 stars: moves at or under par
- 2 stars: within half of par again (at least two extra moves)
- 1 star: cleared any other way

Level score is `stars × 500 + max(0, par × 40 − moves × 25)`. The campaign score sent to the hub is the sum of your best level scores. Best moves, stars, and the unlocked gate are stored in `localStorage` under `rokumon-sort-v1`.

| Gate | Name | What changes |
| --- | --- | --- |
| 1 | First Flame | Three pigments, everything visible. A short teaching rack. |
| 2–6 | Twin Ash through Cedar Smoke | Four, then five pigments. Full visibility. Two empty vials. |
| 7–12 | Copper Bell through Storm Glass | Five to seven pigments. Only the top two measures are visible. |
| 13–20 | Sealed Pigment through The Sixth Gate | Seven or eight pigments. Only the top measure is visible. The later gates often leave a single empty vial. |

## Night Pour

Endless mode deals a harder rack each stage: more pigments, then a single empty vial, then hidden measures. A run score is the sum of stage scores:

`100 + stage × 15 + stars × 80 + max(0, (par + 4 − moves) × 12)`

End the run from the pause card or the clear card. Your best run is kept on this device.

## Pigments

Akane red, Kohaku orange, Yamabuki yellow, Midori green, Ai blue, Murasaki violet, Sakura pink, Sora cyan. Hue, lightness, and a unique seal (circle, triangle, diamond, square, plus, star, petal, wave) separate them for colour-blind play.

## Hub bridge

If the Rokumon shell injects `window.Hub`, the game calls it. Standalone play no-ops when the bridge is absent.

- `Hub.ready({ game, version, modes })` once, when the puzzle boots.
- `Hub.event(name, payload)` for `level_start`, `level_complete`, `endless_stage`, `hint_used`, and `game_over`.
- `Hub.score(payload)` after every clear. `payload.score` is the campaign total or the current endless run. Higher is better.
- `Hub.gameOver(payload)` when gate 20 is sealed, and when a Night Pour run ends.

Payloads always include `game: "rokumon-sort"` plus mode, level or stage, moves, stars, and par when a rack is involved. `game-hub-manifest.json` describes the same contract for the catalogue.

## Audio

Tones and a short pour noise are synthesised with the Web Audio API. Nothing is downloaded. Audio starts on the first tap, and the sound control is remembered locally.
