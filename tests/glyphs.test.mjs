import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toAsciiGlyphs, useAsciiGlyphs } from '../dist/glyphs.js';

/**
 * Windows tester report, 2026-11-03: ▸ and · show as garbled text in the Windows
 * PowerShell 5.1 console. The human report falls back to plain ASCII.
 */

const cliJs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const SYMBOLS = /[▸›·→✓✗…—–]/;

const decide = (over) => useAsciiGlyphs({ flag: false, env: {}, platform: 'linux', isTTY: true, ...over });

test('the symbols stay outside Windows', () => {
  assert.equal(decide({ platform: 'linux' }), false);
  assert.equal(decide({ platform: 'darwin', isTTY: false }), false);
});

test('Windows gets ASCII in the classic console, a pipe, or a file', () => {
  assert.equal(decide({ platform: 'win32', isTTY: true }), true);
  assert.equal(decide({ platform: 'win32', isTTY: false }), true);
  // Windows Terminal still pipes through PowerShell's decoding, so a pipe stays ASCII.
  assert.equal(decide({ platform: 'win32', isTTY: false, env: { WT_SESSION: 'x' } }), true);
});

test('Windows Terminal, VS Code and ConEmu consoles keep the symbols', () => {
  assert.equal(decide({ platform: 'win32', env: { WT_SESSION: 'abc' } }), false);
  assert.equal(decide({ platform: 'win32', env: { TERM_PROGRAM: 'vscode' } }), false);
  assert.equal(decide({ platform: 'win32', env: { ConEmuANSI: 'ON' } }), false);
});

test('--ascii and QA_CORE_HEAL_ASCII override the detection', () => {
  assert.equal(decide({ flag: true }), true);
  assert.equal(decide({ flag: true, env: { QA_CORE_HEAL_ASCII: '0' } }), true, 'the flag wins');
  for (const v of ['1', 'true', 'YES', ' 1 ']) assert.equal(decide({ env: { QA_CORE_HEAL_ASCII: v } }), true, v);
  for (const v of ['0', 'false', 'no']) {
    assert.equal(decide({ platform: 'win32', isTTY: false, env: { QA_CORE_HEAL_ASCII: v } }), false, v);
  }
  assert.equal(decide({ platform: 'win32', env: { QA_CORE_HEAL_ASCII: 'maybe' } }), true, 'an unknown value falls back to detection');
});

test('toAsciiGlyphs swaps the report symbols and keeps other text', () => {
  assert.equal(toAsciiGlyphs('▸ f1  a.spec.ts · Suite › adds'), '> f1  a.spec.ts - Suite > adds');
  assert.equal(toAsciiGlyphs('    → broken: #x'), '    -> broken: #x');
  assert.equal(toAsciiGlyphs('    ✓ healed to y'), '    [ok] healed to y');
  assert.equal(toAsciiGlyphs('  ✗ re-run FAILED — verifying…'), '  [x] re-run FAILED - verifying...');
  assert.equal(toAsciiGlyphs('ürün sepeti 購入'), 'ürün sepeti 購入');
});

function run(args, env) {
  return spawnSync(process.execPath, [cliJs, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('QA_CORE_HEAL_ASCII=1 prints the help with no report symbols', () => {
  const r = run(['--help'], { QA_CORE_HEAL_ASCII: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, SYMBOLS);
  assert.match(r.stdout, /Exit codes: 0 success - 1 error/);
  assert.match(r.stdout, /--ascii/);
});

test('QA_CORE_HEAL_ASCII=0 keeps the symbols, and --ascii turns them off', () => {
  assert.match(run(['--help'], { QA_CORE_HEAL_ASCII: '0' }).stdout, /0 success · 1 error/);
  const r = run(['--help', '--ascii'], { QA_CORE_HEAL_ASCII: '0' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, SYMBOLS);
});

test('ASCII mode cleans error lines too, and never changes --json output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-core-heal-glyph-'));
  try {
    const bad = run(['--findings', path.join(dir, 'missing.json'), '--results', path.join(dir, 'r.json'), '--ascii']);
    assert.notEqual(bad.status, 0);
    assert.doesNotMatch(bad.stderr, SYMBOLS);
    const plain = run(['capabilities', '--json'], { QA_CORE_HEAL_ASCII: '0' });
    const ascii = run(['capabilities', '--json', '--ascii']);
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(ascii.stdout, plain.stdout, '--json output is the same in both modes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
