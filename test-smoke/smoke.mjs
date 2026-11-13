// Browser smoke test: plays the real index.html in headless Chromium with real
// clicks, taps and keys. No server: requests to http://rokumon.test are answered
// from disk by Playwright, and any other request fails the run.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { loadCore } = require('../test/load-core.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(here, '..', 'index.html');
const HTML = fs.readFileSync(INDEX, 'utf8');
const ORIGIN = 'http://rokumon.test';
const GAME = ORIGIN + '/game/index.html';
const PARENT = ORIGIN + '/parent.html';
const Core = loadCore(HTML);
const SAVE_KEY = Core.SAVE_KEY;
const SESSION_KEY = Core.SESSION_KEY;

const PARENT_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<script>window.got = []; addEventListener('message', (e) => { if (e.origin === location.origin) window.got.push(e.data); });</script>
<iframe id="f" src="/game/index.html" style="width:390px;height:844px;border:0"></iframe></body>`;

let passed = 0;
const failures = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n     ')}`);
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await chromium.launch();

async function open(kind = 'desktop', extra = {}) {
  const opts = kind === 'phone'
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 800 } };
  const ctx = await browser.newContext({ ...opts, ...extra });
  const foreign = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url === GAME) return route.fulfill({ contentType: 'text/html', body: HTML });
    if (url === PARENT) return route.fulfill({ contentType: 'text/html', body: PARENT_HTML });
    if (!url.startsWith('data:')) foreign.push(url);
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const done = async () => {
    await ctx.close();
    expect(errors.length === 0, `console errors: ${errors.join(' | ')}`);
    expect(foreign.length === 0, `requests outside the game: ${foreign.join(', ')}`);
  };
  return { ctx, page, errors, done };
}

async function seed(page, save, session) {
  await page.evaluate(([k1, v1, k2, v2]) => {
    localStorage.clear();
    if (v1 !== null) localStorage.setItem(k1, v1);
    if (v2 !== null) localStorage.setItem(k2, v2);
  }, [SAVE_KEY, save === null ? null : typeof save === 'string' ? save : JSON.stringify(save), SESSION_KEY, session === null || session === undefined ? null : typeof session === 'string' ? session : JSON.stringify(session)]);
}
const ALL_OPEN = { version: 1, unlocked: 20, best: {}, endlessBest: 0, sound: false, seenHelp: true };

const state = (page) => page.evaluate(() => ({
  screen: window.__rokumon.screen, overlay: window.__rokumon.overlay, tubes: window.__rokumon.tubes,
  moves: window.__rokumon.moves, won: window.__rokumon.won, busy: window.__rokumon.busy, runScore: window.__rokumon.runScore
}));
async function idle(page) {
  await page.waitForFunction(() => !window.__rokumon.busy, null, { timeout: 5000 });
}

/** Solves the rack on screen and plays it with real input. */
async function playToWin(page, how) {
  const s = await state(page);
  const res = Core.solve(s.tubes, 200000);
  if (res.status !== 'solved') throw new Error('rack on screen is not solvable: ' + JSON.stringify(s.tubes));
  for (const mv of res.moves) {
    for (const i of [mv.from, mv.to]) {
      if (how === 'keys') await page.keyboard.press(String((i + 1) % 10));
      else {
        const vial = page.locator(`.rs-vial[data-i="${i}"]`);
        if (how === 'tap') await vial.tap(); else await vial.click();
      }
    }
    await idle(page);
  }
  return res.moves.length;
}

async function noHorizontalScroll(page, where) {
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll('.rs button, .rs h1, .rs h2, .rs p')]
      .filter((el) => el.getClientRects().length && !el.closest('[inert] .rs-grid') )
      .map((el) => ({ el: el.className || el.tagName, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.right > vw + 0.5 || x.r.left < -0.5);
    return { sw: document.scrollingElement.scrollWidth, vw, over: over.map((x) => x.el).slice(0, 5) };
  });
  expect(m.sw <= m.vw, `${where}: page scrolls sideways (${m.sw} > ${m.vw})`);
  expect(m.over.length === 0, `${where}: elements outside the viewport: ${m.over.join(', ')}`);
}

/* ---------------------------------------------------------------- */

for (const kind of ['desktop', 'phone']) {
  await check(`${kind}: first run, help, gate 1 played to a win with real ${kind === 'phone' ? 'taps' : 'clicks'}`, async () => {
    const { page, done } = await open(kind);
    await page.goto(GAME);
    expect(await page.locator('[role="dialog"] #rs-help-title').count() === 1, 'help dialog opens on first run');
    expect(await page.evaluate(() => document.activeElement.textContent.trim()) === 'Begin', 'focus moves into the help dialog');
    const tapOrClick = (loc) => (kind === 'phone' ? loc.tap() : loc.click());
    await tapOrClick(page.getByRole('button', { name: 'Begin' }));
    await tapOrClick(page.getByRole('button', { name: 'Campaign' }));
    await tapOrClick(page.locator('.rs-gate[data-i="1"]'));
    const n = await playToWin(page, kind === 'phone' ? 'tap' : 'click');
    const s = await state(page);
    expect(s.won && s.moves === n, `won in ${n} moves (state ${JSON.stringify({ won: s.won, moves: s.moves })})`);
    expect((await page.locator('#rs-win-title').textContent()) === 'First Flame', 'win dialog shows the gate');
    const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
    expect(save.unlocked === 2 && save.best['1'].stars === 3, 'progress saved: gate 2 unlocked, 3 seals');
    expect(await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY) === null, 'no stale session after a campaign win');
    await tapOrClick(page.getByRole('button', { name: 'Next gate' }));
    expect((await state(page)).screen === 'play', 'next gate opens');
    await done();
  });

  await check(`${kind}: no horizontal scroll on title, gate list and all 20 gates`, async () => {
    const { page, done } = await open(kind);
    await page.goto(GAME);
    await seed(page, ALL_OPEN);
    await page.reload();
    await noHorizontalScroll(page, 'title');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await noHorizontalScroll(page, 'gate list');
    for (let id = 1; id <= 20; id++) {
      await page.getByRole('button', { name: new RegExp(`^Gate ${id},`) }).click();
      await noHorizontalScroll(page, `gate ${id}`);
      const fits = await page.evaluate(() => {
        const tools = document.querySelector('.rs-tools').getBoundingClientRect();
        return tools.bottom <= innerHeight + 0.5;
      });
      expect(fits, `gate ${id}: toolbar is on screen`);
      await page.getByRole('button', { name: 'Back to gates' }).click();
    }
    await done();
  });
}

await check('phone: reload mid-gate restores the rack, moves and undo', async () => {
  const { page, done } = await open('phone');
  await page.goto(GAME);
  await seed(page, ALL_OPEN);
  await page.reload();
  await page.getByRole('button', { name: 'Campaign' }).tap();
  await page.getByRole('button', { name: /^Gate 5,/ }).tap();
  const start = await state(page);
  const plan = Core.solve(start.tubes, 200000).moves.slice(0, 2);
  for (const mv of plan) {
    await page.locator(`.rs-vial[data-i="${mv.from}"]`).tap();
    await page.locator(`.rs-vial[data-i="${mv.to}"]`).tap();
    await idle(page);
  }
  const before = await state(page);
  expect(before.moves === 2, 'two moves made');
  await page.reload();
  const after = await state(page);
  expect(after.screen === 'play', `resumed into play (got ${after.screen})`);
  expect(after.moves === 2 && JSON.stringify(after.tubes) === JSON.stringify(before.tubes), 'same rack and move count');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await idle(page);
  const undone = await state(page);
  expect(undone.moves === 1, 'undo survives a reload');
  await done();
});

await check('desktop: malformed saves reset safely with no errors', async () => {
  const cases = [
    ['not json', '{"v":1,"kind":"campaign","id":1,"tubes":[[0,0,0,0,0]],"moves":1,"hints":3}'],
    [JSON.stringify({ version: 1, unlocked: 3, best: { 1: { score: 'abc', stars: 'x', moves: 'y' } }, endlessBest: 1e999, seenHelp: true }), '{'],
    [JSON.stringify({ version: 1, unlocked: '20', best: { 1: { score: 5, stars: 99 } }, endlessBest: '7', seenHelp: true }), JSON.stringify({ v: 1, kind: 'campaign', id: 7, tubes: [], moves: 0, hints: 3 })],
    [JSON.stringify({ version: 1, best: [1, 2, 3], seenHelp: true }), JSON.stringify({ v: 1, kind: 'endless', stage: 3, seed: -1, score: 0, stageBase: 0, startedAt: 0, tubes: null })],
    [JSON.stringify(null), JSON.stringify('x')]
  ];
  const { page, done } = await open('desktop');
  await page.goto(GAME);
  for (const [save, session] of cases) {
    await seed(page, save, session);
    await page.reload();
    const s = await state(page);
    expect(s.screen === 'menu', `bad data lands on the title (got ${s.screen})`);
    const meta = (await page.locator('.rs-meta').innerText()).replace(/\s+/g, ' ').trim();
    expect(/^\d{1,2} \/ 60 seals ?Best run \d+$/.test(meta), `title stats are clean: "${meta}"`);
    expect(await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY) === null, 'bad session is removed');
    if (s.overlay === 'help') await page.getByRole('button', { name: 'Begin' }).click();
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page.locator('.rs-gate[data-i="1"]').click();
    expect((await state(page)).screen === 'play', 'gate 1 still playable');
  }
  await done();
});

await check('desktop: keyboard only, focus stays visible and inside dialogs', async () => {
  const { page, done } = await open('desktop');
  await page.goto(GAME);
  await seed(page, ALL_OPEN);
  await page.reload();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.textContent.trim()) === 'Campaign', 'Tab reaches Campaign first');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement.getAttribute('data-fk')) === 'gate-20', 'focus lands on the newest gate');
  await page.locator('.rs-gate[data-i="2"]').focus();
  await page.keyboard.press('Enter');
  const onVial = () => page.evaluate(() => document.activeElement.classList.contains('rs-vial'));
  expect(await onVial(), 'focus moves to the vials when a gate opens');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement.getAttribute('data-i')) === '1', 'arrow keys move between vials');
  // Arrow and Enter for the first pour, number keys for the rest.
  const first = Core.solve((await state(page)).tubes, 200000).moves[0];
  await page.keyboard.press('Home');
  for (let i = 0; i < first.from; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  for (let i = first.from; i < first.to; i++) await page.keyboard.press('ArrowRight');
  for (let i = first.from; i > first.to; i--) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await idle(page);
  expect((await state(page)).moves === 1, 'arrow + Enter pours');
  expect(await onVial(), 'focus stays on a vial after a pour');
  const live = await page.locator('.rs-live').textContent();
  expect(/Poured/.test(live), `the pour is announced (live: "${live}")`);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(ring !== 'none', 'focused vial shows an outline');
  await page.keyboard.press('Escape');
  const inDialog = await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'));
  expect(inDialog, 'Escape opens pause and focus is inside it');
  expect(await page.evaluate(() => document.querySelector('.rs-view').hasAttribute('inert')), 'background is inert while paused');
  await page.keyboard.press('Escape');
  expect(await onVial(), 'Escape resumes and focus returns to the vials');
  await page.keyboard.press('u');
  await idle(page);
  expect((await state(page)).moves === 0, 'U undoes');
  await playToWin(page, 'keys');
  expect((await state(page)).won, 'gate 2 won with number keys');
  expect(await page.evaluate(() => document.activeElement.textContent.trim()) === 'Next gate', 'win dialog takes focus');
  expect(/Sealed in/.test(await page.locator('.rs-live').textContent()), 'win is announced');
  await done();
});

await check('desktop: Night Pour stage clear, Pour again does not bank the score twice', async () => {
  const { page, done } = await open('desktop');
  await page.goto(GAME);
  await seed(page, ALL_OPEN);
  await page.reload();
  await page.getByRole('button', { name: 'Night Pour' }).click();
  await playToWin(page, 'click');
  const first = await state(page);
  expect(first.won && first.runScore > 0, 'stage 1 cleared with a score');
  await page.getByRole('button', { name: 'Pour again' }).click();
  expect((await state(page)).runScore === 0, 'replaying the stage removes its banked score');
  await playToWin(page, 'click');
  const second = await state(page);
  expect(second.runScore === first.runScore, `same play, same score (${second.runScore} vs ${first.runScore})`);
  await page.reload();
  const resumed = await state(page);
  expect(resumed.screen === 'play' && resumed.runScore === first.runScore, 'reload after a clear continues the run at stage 2');
  await done();
});

await check('desktop: a stuck rack is detected and explained, and undo leaves it', async () => {
  const { page, done } = await open('desktop');
  await page.goto(GAME);
  // Gate 20's pigments arranged so that no pour is legal. The undo entry is the gate's start.
  const stuck = [[4, 5, 0], [5, 4, 1], [6, 7, 2], [7, 6, 3], [0, 1, 2, 4], [3, 0, 1, 5], [2, 3, 0, 6], [1, 2, 3, 7], [4, 5, 6, 7]];
  expect(Core.isStuck(stuck), 'fixture is stuck');
  await seed(page, ALL_OPEN, { v: 1, kind: 'campaign', id: 20, tubes: stuck, moves: 9, hints: 3, undo: [Core.LEVELS[19].tubes] });
  await page.reload();
  expect((await state(page)).screen === 'play', 'session loaded');
  const coach = await page.locator('[data-coach]').textContent();
  expect(await page.evaluate(() => window.__rokumon.status) === 'stuck', 'status is stuck');
  expect(/No pours left\. Undo or restart/.test(coach), `player told what to do: "${coach}"`);
  expect(await page.getByRole('button', { name: /^Hint/ }).isDisabled(), 'hint is not offered');
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await page.evaluate(() => window.__rokumon.status) === null, 'undo clears the stuck state');
  await done();
});

await check('desktop: prefers-reduced-motion pours instantly', async () => {
  const { page, done } = await open('desktop', { reducedMotion: 'reduce' });
  await page.goto(GAME);
  await seed(page, ALL_OPEN);
  await page.reload();
  await page.getByRole('button', { name: 'Campaign' }).click();
  await page.locator('.rs-gate[data-i="1"]').click();
  const mv = Core.solve((await state(page)).tubes, 1000).moves[0];
  await page.locator(`.rs-vial[data-i="${mv.from}"]`).click();
  await page.locator(`.rs-vial[data-i="${mv.to}"]`).click();
  const s = await state(page);
  expect(!s.busy && s.moves === 1, 'pour is applied with no animation');
  await done();
});

await check('desktop: sound off means no audio nodes; sound on plays', async () => {
  const { page, done } = await open('desktop');
  await page.addInitScript(() => {
    window.__tones = 0;
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      createOscillator() { window.__tones++; return super.createOscillator(); }
    };
  });
  await page.goto(GAME);
  await seed(page, ALL_OPEN);
  await page.reload();
  await page.getByRole('button', { name: 'Campaign' }).click();
  await page.locator('.rs-gate[data-i="1"]').click();
  await playToWin(page, 'click');
  expect(await page.evaluate(() => window.__tones) === 0, 'muted: no tones');
  await page.getByRole('button', { name: 'Pour again' }).click();
  await page.keyboard.press('m');
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).sound, SAVE_KEY) === true, 'M toggles and saves sound');
  await playToWin(page, 'click');
  expect(await page.evaluate(() => window.__tones) > 0, 'unmuted: tones play');
  await done();
});

await check('hub: bridge v1 messages reach a same-origin parent and match the contract', async () => {
  const { page, done } = await open('desktop');
  await page.goto(PARENT);
  const frame = page.frameLocator('#f');
  await frame.getByRole('button', { name: 'Begin' }).click();
  await frame.getByRole('button', { name: 'Campaign' }).click();
  await frame.locator('.rs-gate[data-i="1"]').click();
  const game = page.frame({ url: GAME });
  const tubes = await game.evaluate(() => window.__rokumon.tubes);
  for (const mv of Core.solve(tubes, 1000).moves) {
    await frame.locator(`.rs-vial[data-i="${mv.from}"]`).click();
    await frame.locator(`.rs-vial[data-i="${mv.to}"]`).click();
    await game.waitForFunction(() => !window.__rokumon.busy);
  }
  const got = await page.evaluate(() => window.got);
  const types = got.map((m) => m.type + (m.name ? ':' + m.name : ''));
  for (const want of ['hub:ready', 'hub:event:level-start', 'hub:event:level-complete', 'hub:score']) {
    expect(types.includes(want), `parent received ${want} (got ${types.join(', ')})`);
  }
  for (const m of got) {
    if (m.type === 'hub:event') {
      expect(m.version === 1 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(m.name), `event name ok: ${m.name}`);
      expect(JSON.stringify(Core.bridgeEventData(m.name, m.data)) === JSON.stringify(m.data), `payload matches contract: ${m.name}`);
    }
    if (m.type === 'hub:score') expect(typeof m.score === 'number' && Number.isFinite(m.score), 'score is a number');
  }
  await done();
});

await check('bridge: window.Hub is used when the page provides one', async () => {
  const { page, done } = await open('desktop');
  await page.addInitScript(() => {
    window.calls = [];
    window.Hub = { ready: () => window.calls.push('ready'), event: (n) => window.calls.push(n), score: (s) => window.calls.push('score:' + typeof s) };
  });
  await page.goto(GAME);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('button', { name: 'Campaign' }).click();
  await page.locator('.rs-gate[data-i="1"]').click();
  const calls = await page.evaluate(() => window.calls);
  expect(calls[0] === 'ready' && calls.includes('level-start'), `window.Hub called: ${calls.join(', ')}`);
  await done();
});

await browser.close();
console.log(`\nsmoke: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('failed: ' + failures.join('; ')); process.exit(1); }
