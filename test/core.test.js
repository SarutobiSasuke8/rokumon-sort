'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./load-core.js');

const C = loadCore();
// Arrays made inside the VM have another realm's prototype; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

/* An unpruned reference BFS, written independently of the game's solver. */
function referenceSolve(start, cap = 200000) {
  const sealed = (t) => t.length === 4 && t.every((c) => c === t[0]);
  const done = (s) => s.every((t) => t.length === 0 || sealed(t));
  const key = (s) => s.map((t) => t.join(',')).sort().join('|');
  if (done(start)) return 0;
  let frontier = [start];
  const seen = new Set([key(start)]);
  for (let depth = 1; frontier.length; depth++) {
    const nextFrontier = [];
    for (const s of frontier) {
      for (let f = 0; f < s.length; f++) for (let t = 0; t < s.length; t++) {
        const a = s[f], b = s[t];
        if (f === t || !a.length || sealed(a) || b.length >= 4) continue;
        const c = a[a.length - 1];
        if (b.length && b[b.length - 1] !== c) continue;
        let run = 1;
        while (run < a.length && a[a.length - 1 - run] === c) run++;
        const n = Math.min(run, 4 - b.length);
        const r = s.map((x) => x.slice());
        r[t].push(...r[f].splice(r[f].length - n, n));
        const k = key(r);
        if (seen.has(k)) continue;
        seen.add(k);
        if (done(r)) return depth;
        nextFrontier.push(r);
        if (seen.size > cap) throw new Error('reference solver cap');
      }
    }
    frontier = nextFrontier;
  }
  return -1;
}

function replay(tubes, moves) {
  let s = C.cloneTubes(tubes);
  for (const m of moves) {
    const legal = C.legalPour(s, m.from, m.to);
    assert.ok(legal, `move ${m.from}->${m.to} must be legal`);
    assert.equal(legal.amount, m.amount, 'replayed amount must match');
    s = C.applyPour(s, legal);
  }
  return s;
}

test('campaign: 20 gates, ids 1..20, every rack valid', () => {
  assert.equal(C.LEVELS.length, 20);
  C.LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.ok(C.isValidRack(l.tubes), `gate ${l.id} rack valid`);
    assert.ok(!C.isSolved(l.tubes), `gate ${l.id} not already solved`);
    assert.ok([1, 2, 4].includes(l.reveal));
  });
});

test('campaign: every gate is solvable and par is the true optimum', () => {
  for (const l of C.LEVELS) {
    const r = C.solve(l.tubes, 500000);
    assert.equal(r.status, 'solved', `gate ${l.id}`);
    assert.equal(r.moves.length, l.par, `gate ${l.id} par`);
    assert.ok(C.isSolved(replay(l.tubes, r.moves)), `gate ${l.id} solution replays`);
  }
});

test('campaign: pruned solver agrees with an unpruned reference on gates 1-11', () => {
  for (const l of C.LEVELS.slice(0, 11)) {
    assert.equal(referenceSolve(plain(l.tubes)), C.solve(l.tubes, 500000).moves.length, `gate ${l.id}`);
  }
});

test('rules: legal pours', () => {
  const s = [[0, 0, 1], [1], [], [2, 2, 2, 2], [0, 1, 1, 1]];
  assert.equal(C.legalPour(s, 0, 0), null, 'same vial');
  assert.equal(C.legalPour(s, 2, 0), null, 'empty source');
  assert.equal(C.legalPour(s, 3, 2), null, 'sealed source');
  assert.equal(C.legalPour(s, 0, 4), null, 'full target');
  assert.equal(C.legalPour(s, 1, 0)?.amount, 1, 'match on top');
  assert.equal(C.legalPour(s, 4, 1)?.amount, 3, 'whole run moves');
  assert.equal(C.legalPour(s, 4, 0)?.amount, 1, 'only as far as there is room');
  assert.equal(C.legalPour(s, 0, 9), null, 'out of range');
  assert.equal(C.legalPour(s, -1, 0), null, 'negative');
  assert.equal(C.legalPour(s, 0.5, 1), null, 'non-integer');
  assert.equal(C.legalPour([[0], [1], [2, 2, 2, 2]], 0, 1), null, 'colour mismatch');
});

test('rules: applyPour does not mutate its input', () => {
  const s = [[0, 1], [1], []];
  const before = JSON.stringify(s);
  const next = C.applyPour(s, C.legalPour(s, 0, 1));
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(plain(next), [[0], [1, 1], []]);
});

test('rules: win detection', () => {
  assert.ok(C.isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1]]));
  assert.ok(!C.isSolved([[0, 0, 0], [0], [1, 1, 1, 1]]), 'split colour is not a win');
  assert.ok(!C.isSolved([[0, 0, 0, 1], [1, 1, 1, 0], []]));
});

test('solver: stuck and dead racks are reported, not hinted', () => {
  const stuck = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 2, 2, 2]];
  assert.ok(C.isStuck(stuck));
  assert.equal(C.legalMoves(stuck).length, 0);
  assert.equal(C.solve(stuck).status, 'unsolvable');
  assert.equal(C.findHint(stuck), null);
});

test('solver: unsolvable verdicts match the reference on random small racks', () => {
  const rng = C.mulberry32(99);
  let dead = 0, alive = 0;
  for (let i = 0; i < 300; i++) {
    // Random 3-colour racks with one empty vial: many are dead.
    const cells = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];
    for (let j = cells.length - 1; j > 0; j--) { const k = Math.floor(rng() * (j + 1)); [cells[j], cells[k]] = [cells[k], cells[j]]; }
    const rack = [cells.slice(0, 4), cells.slice(4, 8), cells.slice(8, 12), []];
    const ours = C.solve(rack, 100000);
    const ref = referenceSolve(rack);
    if (ref < 0) { dead++; assert.equal(ours.status, 'unsolvable', JSON.stringify(rack)); }
    else { alive++; assert.equal(ours.status, 'solved'); assert.equal(ours.moves.length, ref, JSON.stringify(rack)); }
  }
  assert.ok(dead > 0 && alive > 0, `covered both cases (dead ${dead}, alive ${alive})`);
});

test('hints: on every gate the hint is legal and on a shortest path', () => {
  for (const l of C.LEVELS) {
    const h = C.findHint(l.tubes, 50000);
    assert.ok(h && h.move && h.proven, `gate ${l.id} proven hint`);
    const mv = C.legalPour(l.tubes, h.move.from, h.move.to);
    assert.ok(mv, `gate ${l.id} hint legal`);
    assert.equal(C.solve(C.applyPour(l.tubes, mv), 500000).moves.length, l.par - 1, `gate ${l.id} hint optimal`);
  }
});

test('generator: 1,200 Night Pour racks over 40 stages are valid and solvable', () => {
  let checked = 0;
  for (let stage = 1; stage <= 40; stage++) {
    const shape = C.stageShape(stage);
    for (let s = 0; s < 30; s++) {
      const seed = (s * 2654435761 + stage) >>> 0;
      const g = C.generateRack(stage, C.mulberry32(C.endlessSeed(seed, stage)));
      const where = `stage ${stage} seed ${seed}`;
      assert.ok(C.isValidRack(g.tubes), `${where} valid`);
      assert.equal(g.tubes.length, shape.colors + shape.empties, `${where} vial count`);
      assert.equal(C.countColors(g.tubes), shape.colors, `${where} colours`);
      assert.ok(!C.isSolved(g.tubes), `${where} not pre-solved`);
      assert.ok(C.legalMoves(g.tubes).length > 0, `${where} has a legal pour`);
      // Constructive proof: the recorded solution replays legally to a win.
      assert.ok(C.isSolved(replay(g.tubes, g.solution)), `${where} solution replays`);
      assert.ok(g.par >= 1 && g.par <= g.solution.length, `${where} par sane`);
      checked++;
    }
  }
  assert.equal(checked, 1200);
});

test('generator: independent solver confirms solvability on 200 racks', () => {
  for (let i = 0; i < 200; i++) {
    const stage = 1 + (i % 25);
    const g = C.generateRack(stage, C.mulberry32(C.endlessSeed(i * 31337, stage)));
    const r = C.solve(g.tubes, 300000);
    assert.notEqual(r.status, 'unsolvable', `stage ${stage} #${i}`);
    if (r.status === 'solved' && g.parProven) assert.equal(r.moves.length, g.par);
  }
});

test('generator: deterministic for a seed', () => {
  const a = C.generateRack(9, C.mulberry32(C.endlessSeed(4242, 9)));
  const b = C.generateRack(9, C.mulberry32(C.endlessSeed(4242, 9)));
  assert.deepEqual(plain(a.tubes), plain(b.tubes));
  assert.equal(a.par, b.par);
});

test('scoring: stars and score formulas match the README', () => {
  assert.equal(C.starsFor(10, 10), 3);
  assert.equal(C.starsFor(15, 10), 2);
  assert.equal(C.starsFor(16, 10), 1);
  assert.equal(C.starsFor(6, 4), 2, 'at least two extra moves keep two stars');
  assert.equal(C.starsFor(7, 4), 1);
  assert.equal(C.levelScore(10, 10, 3), 1500 + 150);
  assert.equal(C.levelScore(40, 10, 1), 500);
  assert.equal(C.stageScore(3, 8, 8, 3), 100 + 45 + 240 + 48);
});

test('save: malformed data never throws and resets to safe values', () => {
  const junk = [
    undefined, null, 0, 'x', [], [1, 2], true,
    { version: 2, unlocked: 20 },
    { version: 1, unlocked: '20', best: 'nope', endlessBest: '7', sound: 'yes', seenHelp: 1 },
    { version: 1, unlocked: 1e9, best: [1, 2, 3], endlessBest: Infinity },
    { version: 1, unlocked: -4, best: { 1: { score: 'abc', stars: 'x', moves: 'y' } }, endlessBest: -1 },
    { version: 1, unlocked: 2.5, best: { 1: { score: 5, stars: 99, moves: 3 } }, endlessBest: 1e300 },
    { version: 1, best: { 99: { score: 5, stars: 2, moves: 3 }, __proto__: { polluted: true } } },
    { version: 1, best: { 1: null, 2: [], 3: { score: NaN, stars: 2, moves: 4 } } }
  ];
  for (const raw of junk) {
    const s = C.sanitizeSave(raw);
    assert.equal(s.version, 1);
    assert.ok(Number.isInteger(s.unlocked) && s.unlocked >= 1 && s.unlocked <= 20);
    assert.ok(Number.isInteger(s.endlessBest) && s.endlessBest >= 0 && s.endlessBest <= 1e9);
    assert.equal(typeof s.sound, 'boolean');
    assert.equal(typeof s.seenHelp, 'boolean');
    for (const [k, v] of Object.entries(s.best)) {
      assert.ok(/^([1-9]|1\d|20)$/.test(k));
      assert.ok(Number.isInteger(v.moves) && v.stars >= 1 && v.stars <= 3 && Number.isInteger(v.score));
    }
    assert.ok(C.totalStars(s) <= 60);
    assert.ok(Number.isFinite(C.totalScore(s)));
  }
});

test('save: a valid save round-trips', () => {
  const good = { version: 1, unlocked: 4, best: { 1: { moves: 4, stars: 3, score: 1660 }, 2: { moves: 9, stars: 2, score: 1015 } }, endlessBest: 1234, sound: false, seenHelp: true };
  assert.deepEqual(plain(C.sanitizeSave(JSON.parse(JSON.stringify(good)))), good);
});

test('session: valid campaign session restores; tampered sessions are rejected', () => {
  const save = C.sanitizeSave({ version: 1, unlocked: 5 });
  const l = C.LEVELS[2];
  const tubes = plain(C.applyPour(l.tubes, C.legalMoves(l.tubes)[0]));
  const good = { v: 1, kind: 'campaign', id: 3, tubes, moves: 1, hints: 3, undo: [plain(l.tubes)] };
  const out = C.sanitizeSession(JSON.parse(JSON.stringify(good)), save);
  assert.ok(out);
  assert.deepEqual(plain(out.tubes), tubes);
  assert.equal(out.moves, 1);
  assert.equal(out.undo.length, 1);

  const bad = [
    null, 'x', [], { ...good, v: 2 }, { ...good, kind: 'other' },
    { ...good, id: 9 },                                   // locked gate
    { ...good, id: 0 }, { ...good, moves: -1 }, { ...good, hints: 4 }, { ...good, moves: 'two' },
    { ...good, tubes: [[0, 0, 0, 0, 0]] },
    { ...good, tubes: plain(C.LEVELS[12].tubes) },        // another gate's rack
    { ...good, tubes: tubes.map((t) => t.map((c) => (c === 0 ? 1 : c))) }, // colour counts broken
    { ...good, tubes: tubes.concat([[]]) },
    { ...good, tubes: tubes.map((t) => t.map(String)) }
  ];
  for (const b of bad) assert.equal(C.sanitizeSession(b, save), null, JSON.stringify(b).slice(0, 80));

  const badUndo = C.sanitizeSession({ ...good, undo: [[[9]]] }, save);
  assert.ok(badUndo && badUndo.undo.length === 0, 'a bad undo stack is dropped, not fatal');
});

test('session: endless session must match the seeded rack', () => {
  const save = C.defaultSave();
  const g = C.generateRack(4, C.mulberry32(C.endlessSeed(777, 4)));
  const base = { v: 1, kind: 'endless', stage: 4, seed: 777, score: 900, stageBase: 900, startedAt: 1700000000000 };
  assert.ok(C.sanitizeSession({ ...base, tubes: plain(g.tubes), moves: 0, hints: 3, undo: [] }, save));
  assert.ok(C.sanitizeSession({ ...base, tubes: null }, save), 'pending next stage');
  assert.equal(C.sanitizeSession({ ...base, stage: 5, tubes: plain(g.tubes), moves: 0, hints: 3 }, save), null, 'rack from another stage');
  assert.equal(C.sanitizeSession({ ...base, stageBase: 901, tubes: null }, save), null);
  assert.equal(C.sanitizeSession({ ...base, score: Infinity, tubes: null }, save), null);
});

test('bridge: event payloads must match the contract exactly', () => {
  for (const name of Object.keys(C.EVENTS)) assert.match(name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
  const ok = { mode: 'campaign', level: 3, par: 8, colors: 4 };
  assert.deepEqual(plain(C.bridgeEventData('level-start', ok)), ok);
  assert.equal(C.bridgeEventData('level_start', ok), null, 'snake_case names are rejected by the hub');
  assert.equal(C.bridgeEventData('level-start', { ...ok, extra: 1 }), null);
  assert.equal(C.bridgeEventData('level-start', { ...ok, level: '3' }), null);
  assert.equal(C.bridgeEventData('level-start', { ...ok, par: Infinity }), null);
  assert.equal(C.bridgeEventData('level-start', { mode: 'x'.repeat(161), level: 1, par: 1, colors: 1 }), null);
  assert.equal(C.bridgeEventData('nope', {}), null);
});
