'use strict';
// Guards the shipping rules: one self-contained file, no network, no analytics,
// and a manifest that matches what the game actually emits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCore, readIndex } = require('./load-core.js');

const html = readIndex();
const root = path.join(__dirname, '..');

test('index.html loads nothing from anywhere', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'no external scripts');
  assert.doesNotMatch(html, /<link[^>]+rel=["']?stylesheet/i, 'no external stylesheets');
  assert.doesNotMatch(html, /@import/i, 'no CSS imports');
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\s*\(/, 'no network APIs');
  assert.doesNotMatch(html, /url\(\s*['"]?(https?:)?\/\//i, 'no remote CSS urls');
  const urls = html.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  for (const u of urls) assert.equal(u, 'http://www.w3.org/2000/svg', `unexpected URL ${u}`);
  assert.doesNotMatch(html, /gtag|google-analytics|googletagmanager|plausible|segment\.|mixpanel|posthog/i, 'no analytics');
});

test('postMessage only targets the same origin', () => {
  const calls = html.match(/postMessage\([^)]*\)/g) || [];
  assert.ok(calls.length >= 1);
  for (const c of calls) assert.match(c, /window\.location\.origin/);
});

test('index.html has exactly the two expected inline scripts', () => {
  const scripts = html.match(/<script\b[^>]*>/g) || [];
  assert.deepEqual(scripts, ['<script id="rs-core">', '<script id="rs-ui">']);
});

test('manifest identity and event list match the game', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'game-hub-manifest.json'), 'utf8'));
  assert.equal(m.slug, 'rokumon-sort');
  assert.equal(m.title, 'Rokumon Sort');
  assert.equal(m.entry, 'index.html');
  const C = loadCore();
  assert.deepEqual(Object.keys(m.bridge.events).sort(), Object.keys(C.EVENTS).sort());
  for (const [name, props] of Object.entries(m.bridge.events)) {
    assert.deepEqual(props, JSON.parse(JSON.stringify(C.EVENTS[name])), name);
  }
  const versionInGame = html.match(/GAME_VERSION = '([^']+)'/)[1];
  assert.equal(m.version, versionInGame, 'manifest version matches the game');
});
