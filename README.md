# Rokumon Sort

A self-contained colour-sorting puzzle for the Rokumon Games catalogue. Pour forge pigments between crystal vials until every vial is a single sealed colour.

The game is one file: `index.html`. Open it in a browser and play. It has no build step, loads nothing from the network, and sends no analytics. Everything else in this repo (`package.json`, `test/`, `test-smoke/`, `.github/`) is dev-only tooling and is not needed to play.

## How to play

- Every vial holds four measures of pigment.
- Choose a source vial, then a target. The top run of one colour pours across.
- A pour is allowed only when the target is empty or its top colour matches, and only as far as there is room.
- A vial filled with one colour seals. You cannot pour out of a sealed vial.
- The gate is clear when every colour is sealed. Empty vials may remain.
- From Copper Bell (gate 7) onward, only the top two measures of each vial are visible, and from Sealed Pigment (gate 13) only the top one. Hidden measures show as striped lacquer and come into view when they reach the visible depth. They hide again if you pour more on top.
- Each pigment has its own seal mark (circle, triangle, diamond, square, plus, star, petal, wave), so colours can be told apart without relying on hue.

If you pick a target that cannot take the pour and it holds pigment, the selection moves to that vial. Tap the selected vial again to put it down.

If a rack reaches a point with no legal pour, or the solver proves it can no longer be sealed, the game says so ("No pours left" or "This rack can no longer be sealed") and the hint button is switched off. Undo or restart to continue.

## Controls

| Action | Touch or mouse | Keyboard |
| --- | --- | --- |
| Move between vials | | Arrow keys, Home, End (Up and Down move by row) |
| Choose or pour into a vial | Tap the vial | Enter or Space on the focused vial, or the number keys 1 to 9 and 0 for vial 10 |
| Put the selection down | Tap the selected vial again | Esc |
| Undo | Undo | U |
| Hint | Hint | H |
| Restart | Restart | R |
| Pause | Pause | Esc or P |
| Next gate on the clear card | Next gate | Enter |
| Sound | Sound button on the title or pause card | M |

Tab moves through the buttons. Focus is shown with an amber outline, moves into a dialog when one opens and returns to the vials when it closes. The background is inert while a dialog is open. Moves, seals, wins, stuck racks and hints are read out through a polite live region, and each vial has a label such as "Vial 3, top 2 Ai, 4 of 4, deeper pigment hidden". Labels never reveal hidden pigment.

Three hints are available on each attempt. A hint highlights a pour on a shortest solution when the solver can find one within its budget, and otherwise a pour that reduces disorder. Hints do not play the move. Undo steps back one pour and does not give back a spent hint. Restart resets the rack and the three hints.

With `prefers-reduced-motion: reduce`, pours apply instantly with no tilt, stream or shake.

## Campaign

Twenty hand-built gates. Clearing a gate unlocks the next. Par is the shortest possible solution (checked by the tests with a breadth-first solver). Stars compare your moves with par:

- 3 stars: moves at or under par
- 2 stars: at most par + max(2, ceil(par / 2)) moves
- 1 star: cleared any other way

Undo takes a move off the counter, so stars measure the line you finish with.

Level score is `stars × 500 + max(0, par × 40 − moves × 25)`. The campaign score sent to the hub is the sum of your best level scores.

| Gate | Name | What changes |
| --- | --- | --- |
| 1 | First Flame | Three pigments, everything visible. A short teaching rack. |
| 2 to 6 | Twin Ash to Cedar Smoke | Three to five pigments, everything visible, two vials of free space. |
| 7 to 12 | Copper Bell to Storm Glass | Five to seven pigments. Only the top two measures are visible. |
| 13 to 20 | Sealed Pigment to The Sixth Gate | Seven or eight pigments. Only the top measure is visible. Several gates leave one vial of free space. |

## Night Pour

Endless mode deals a generated rack each stage: more pigments as you go, then a single empty vial from stage 14, then hidden measures (top two visible from stage 5, top one from stage 10). Every rack is built by pouring backwards from a solved rack, so it is always solvable; the tests replay the recorded solution for 1,200 seeds across 40 stages and run an independent solver on 200 more. Par is the solver's shortest solution, or the construction's solution length if the solver hits its search budget.

A run score is the sum of stage scores:

`100 + stage × 15 + stars × 80 + max(0, (par + 4 − moves) × 12)`

"Pour again" on a cleared stage replays it without banking its score twice. The back arrow opens the pause card during a run; end the run from the pause card or the clear card. Your best run is kept on this device.

## What is saved

Everything is in `localStorage` on this device. Nothing leaves it.

- `rokumon-sort-v1`: unlocked gate, best moves, stars and score per gate, best Night Pour run, sound on or off, and whether the rules card has been seen.
- `rokumon-sort-session-v1`: the rack in progress (campaign gate or Night Pour stage, the vials, moves, hints left and up to 60 undo steps). Reloading the page resumes it. It is removed when you clear a campaign gate or leave the rack. After a Night Pour clear it points at the next stage.

Both are validated on load. A missing, unreadable or tampered value (wrong types, out-of-range numbers, a rack that does not match the gate or the seeded stage, broken pigment counts) falls back to safe defaults or is discarded, and the game starts at the title. If storage is blocked, as in some sandboxed frames, the game still plays and simply does not remember progress.

## Hub bridge

The game speaks hub bridge v1, the protocol in the hub's `public/hub-bridge.js` and `src/lib/bridge.ts`:

- If the page has a `window.Hub` object, the game calls it.
- Otherwise, when the game is inside a frame, it posts the same v1 messages to `window.parent` with `targetOrigin` set to the game's own origin, so nothing goes to another origin.
- Opened directly, with no parent frame and no `window.Hub`, it sends nothing and plays normally. A failing bridge is caught and never stops the game.

Messages:

| When | Message |
| --- | --- |
| Boot | `{ type: "hub:ready", version: 1 }` |
| Every clear | `{ type: "hub:score", score }`: the campaign total, or the current Night Pour run score |
| Gate 20 cleared, or a Night Pour run ends | `{ type: "hub:gameover", score, durationMs? }` (duration is sent for runs) |
| Events | `{ type: "hub:event", version: 1, name, data }` |

Events and their exact properties (also in `game-hub-manifest.json` under `bridge.events`, ready to copy into the hub's game manifest):

| Event | Properties |
| --- | --- |
| `level-start` | `mode` (campaign or endless), `level` (gate or stage), `par`, `colors` |
| `level-complete` | `mode`, `level`, `moves`, `stars`, `par`, `levelScore`, `score` |
| `hint-used` | `mode`, `level`, `hintsLeft` |
| `campaign-complete` | `score`, `stars` |
| `run-end` | `score`, `stages`, `best`, `durationMs` |

Resumed racks do not send a second `level-start`.

## Audio

Tones and a short pour noise are synthesised with the Web Audio API. Nothing is downloaded. Audio starts on the first tap or key press, is silent when sound is off, and is suspended while the tab is hidden.

## Checks (dev only)

Requires Node 20 or later.

```sh
npm ci
npm test                                      # rules, solver, generator, saves, bridge contract, single-file rules
npx playwright install --only-shell chromium  # once
npm run smoke                                 # plays index.html in headless Chromium
```

`npm test` runs `node --test`. The tests read the `<script id="rs-core">` block straight out of `index.html` into a Node VM, so the shipped file is what is tested and there is nothing to keep in sync.

`npm run smoke` serves `index.html` to Playwright from disk (no server, and any other request fails the run). It plays gate 1 to a win with real clicks at 1280×800 and with real taps at 390×844 (touch), checks every screen and all 20 gates for horizontal scroll at both sizes, reloads mid-gate and checks the rack, moves and undo come back, loads five kinds of malformed save, plays a gate by keyboard only and checks focus and announcements, clears a Night Pour stage and replays it, loads a stuck rack, checks reduced motion and that muted play creates no audio nodes, and plays inside a same-origin parent frame to check the bridge messages. Any console error or warning fails it.

GitHub Actions runs both on every pull request (`.github/workflows/checks.yml`).

## Known limits

- Not yet played by a person on a real phone. The touch checks are emulated in Chromium only; Safari and Firefox have not been run.
- Night Pour difficulty flattens out after about stage 14: racks stay at eight pigments and one empty vial, and par sits around 14 to 17.
- Hidden measures hide again when covered. That is deliberate (it is a memory element) but it is not explained in the game beyond the rules card.
- The solver runs on the main thread. Starting a Night Pour stage or asking for a hint can take up to about 150 ms on a slow device.
- Art is CSS and inline SVG only, and audio is simple synthesised tones.
