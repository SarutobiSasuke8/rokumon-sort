# Rokumon Sort roadmap

## Now

- [x] Readable source in the single `index.html` (the original script was minified bundle output with no source)
- [x] Hub bridge speaks the hub's real v1 protocol (postMessage, kebab-case events, numeric score)
- [x] Reload resumes the rack in progress, including undo
- [x] Saved data validated on load; bad data resets safely
- [x] Night Pour racks guaranteed solvable, never pre-solved, and proven over 1,200 seeds
- [x] Stuck and unwinnable racks detected and explained
- [x] Night Pour "Pour again" no longer banks a stage score twice
- [x] Keyboard play with roving focus, number keys, focus kept across renders, dialogs that take and return focus
- [x] Screen reader labels and a persistent live region for moves, seals, hints and wins
- [x] Reduced motion: instant pours
- [x] Solver about ten times faster (stage start and hints no longer freeze for up to two seconds)
- [x] `npm test`, `npm run smoke` and a pull request workflow
- [ ] Human playtest on a real phone (iOS Safari and Android Chrome)
- [ ] Hub intake: copy `bridge.events` from `game-hub-manifest.json` into the hub's manifest for this game and enable the bridge

## Next

- [ ] Night Pour difficulty curve past stage 14 (more scramble depth, a stage with no spare vial, or two hidden layers sooner)
- [ ] Tune par fallback when the solver hits its budget, so 3 stars stay reachable
- [ ] Optional "keep revealed pigment visible" assist for players who find the memory element too hard
- [ ] Run the smoke test in WebKit and Firefox as well as Chromium
- [ ] Move the solver into a Web Worker if a slow phone shows hitches

## Later

- [ ] Real art pass: vial glass, pigment textures, a title illustration
- [ ] Sound design pass to replace the synthesised tones
- [ ] Daily rack with a shared seed
- [ ] More hand-built gates beyond 20
- [ ] Achievements over the hub bridge once the hub records them
