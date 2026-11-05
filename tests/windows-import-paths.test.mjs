import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// On Windows, import() of a plain absolute path such as C:\...\dist\x.js
// throws ERR_UNSUPPORTED_ESM_URL_SCHEME, and the pathname of a file URL
// gives /C:/... which is not a usable file path. CI runs on Linux, where both
// still work, so this check keeps the test and eval files Windows safe.
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function scriptFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'fixtures') out.push(...scriptFiles(full));
    } else if (entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const files = [...scriptFiles(path.join(repoRoot, 'tests')), ...scriptFiles(path.join(repoRoot, 'evals'))];
const importCall = new RegExp('import\\(\\s*(\\$\\{JSON\\.stringify\\()?path\\.(join|resolve)\\(', 'g');
const urlPathname = ['import.meta.url', ').pathname'].join('');

test('test and eval files pass a file URL, not a plain path, to import()', () => {
  const bad = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(importCall)) {
      bad.push(`${path.relative(repoRoot, file)}:${text.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('test and eval files turn import.meta.url into a path with fileURLToPath', () => {
  const bad = files.filter((file) => fs.readFileSync(file, 'utf8').includes(urlPathname)).map((file) => path.relative(repoRoot, file));
  assert.deepEqual(bad, []);
});
