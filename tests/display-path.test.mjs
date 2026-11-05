import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { displayMessage, displayPath } = await import(pathToFileURL(path.join(repoRoot, 'dist', 'display-path.js')).href);

const WIN_HOME = 'C:\\Users\\zbob';
const WIN_KIT = 'C:\\Users\\zbob\\Desktop\\qa-core-testing\\saucedemo-flaky-kit';

test('Windows: a storage state inside the working folder is printed relative to it', () => {
  assert.equal(displayPath(`${WIN_KIT}\\.auth\\state.json`, WIN_KIT, WIN_HOME, 'win32'), '.auth\\state.json');
});

test('Windows: the folder checks ignore case and accept forward slashes', () => {
  assert.equal(displayPath('c:/users/zbob/desktop/qa-core-testing/saucedemo-flaky-kit/.auth/state.json', WIN_KIT, WIN_HOME, 'win32'), '.auth\\state.json');
  assert.equal(displayPath('C:/USERS/ZBOB/AppData/Local/Temp/qa-core-flaky-heal-1/.auth/state.json', WIN_KIT, WIN_HOME, 'win32'), '<home>\\AppData\\Local\\Temp\\qa-core-flaky-heal-1\\.auth\\state.json');
});

test('Windows: a path in the home folder but outside the working folder shows <home>', () => {
  assert.equal(displayPath(`${WIN_HOME}\\qa-private\\state.json`, WIN_KIT, WIN_HOME, 'win32'), '<home>\\qa-private\\state.json');
  assert.equal(displayPath(WIN_HOME, WIN_KIT, WIN_HOME, 'win32'), '<home>');
});

test('Windows: a path outside the home folder, or on another drive, is printed as it is', () => {
  assert.equal(displayPath('D:\\ci\\.auth\\state.json', WIN_KIT, WIN_HOME, 'win32'), 'D:\\ci\\.auth\\state.json');
  assert.equal(displayPath('C:\\Users\\zbobX\\state.json', WIN_KIT, WIN_HOME, 'win32'), 'C:\\Users\\zbobX\\state.json');
});

test('POSIX: inside the working folder is relative, the rest of home is <home>, other paths stay', () => {
  const home = '/home/zbob';
  const kit = '/home/zbob/qa-core-testing/kit';
  assert.equal(displayPath(`${kit}/.auth/state.json`, kit, home, 'linux'), '.auth/state.json');
  assert.equal(displayPath('/home/zbob/other/state.json', kit, home, 'linux'), '<home>/other/state.json');
  assert.equal(displayPath('/home/zbobx/state.json', kit, home, 'linux'), '/home/zbobx/state.json');
  assert.equal(displayPath('/srv/ci/state.json', kit, home, 'darwin'), '/srv/ci/state.json');
});

test('a relative path is printed as written', () => {
  assert.equal(displayPath('../nope.ts', '/home/zbob/kit', '/home/zbob', 'linux'), '../nope.ts');
  assert.equal(displayPath('.auth\\state.json', WIN_KIT, WIN_HOME, 'win32'), '.auth\\state.json');
});

test('an empty home folder only uses the working folder rule', () => {
  assert.equal(displayPath('/home/zbob/other/state.json', '/home/zbob/kit', '', 'linux'), '/home/zbob/other/state.json');
});

test('a real path is checked too, so a link to the working folder is still relative', (t) => {
  if (process.platform === 'win32') {
    t.skip('symlinks need Developer Mode on Windows');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-core-heal-display-'));
  try {
    const kit = path.join(dir, 'kit');
    fs.mkdirSync(path.join(kit, '.auth'), { recursive: true });
    fs.writeFileSync(path.join(kit, '.auth', 'state.json'), '{}');
    const link = path.join(dir, 'link');
    fs.symlinkSync(kit, link);
    assert.equal(displayPath(path.join(link, '.auth', 'state.json'), kit, '', process.platform), path.join('.auth', 'state.json'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows: from a folder above home, a home file shows <home>, not the username', () => {
  const file = `${WIN_KIT}\\.auth\\state.json`;
  const shown = '<home>\\Desktop\\qa-core-testing\\saucedemo-flaky-kit\\.auth\\state.json';
  assert.equal(displayPath(file, 'C:\\', WIN_HOME, 'win32'), shown);
  assert.equal(displayPath(file, 'C:\\Users', WIN_HOME, 'win32'), shown);
  assert.equal(displayPath(file, 'c:\\users', WIN_HOME, 'win32'), shown);
  // A file outside home is still relative from above home.
  assert.equal(displayPath('C:\\ci\\state.json', 'C:\\', WIN_HOME, 'win32'), 'ci\\state.json');
  // The home folder itself as the working folder keeps the relative form.
  assert.equal(displayPath(file, WIN_HOME, WIN_HOME, 'win32'), 'Desktop\\qa-core-testing\\saucedemo-flaky-kit\\.auth\\state.json');
});

test('POSIX: from a folder above home, a home file shows <home>, not the username', () => {
  const home = '/home/zbob';
  const file = '/home/zbob/kit/.auth/state.json';
  assert.equal(displayPath(file, '/', home, 'linux'), '<home>/kit/.auth/state.json');
  assert.equal(displayPath(file, '/home', home, 'linux'), '<home>/kit/.auth/state.json');
  assert.equal(displayPath(file, '/Users', '/Users/zbob', 'darwin'), file, 'a file outside that home stays as it is');
  assert.equal(displayPath('/srv/ci/state.json', '/', home, 'linux'), 'srv/ci/state.json');
  assert.equal(displayPath(file, home, home, 'linux'), 'kit/.auth/state.json');
});

test('displayMessage hides every spelling of the path in an error message', () => {
  const posixMsg = "EACCES: permission denied, open '/home/zbob/kit/tests/b.spec.ts'";
  assert.equal(displayMessage(posixMsg, '/home/zbob/kit/tests/b.spec.ts', '/home/zbob/kit', '/home/zbob', 'linux'),
    "EACCES: permission denied, open 'tests/b.spec.ts'");
  assert.equal(displayMessage(posixMsg, '/home/zbob/kit/tests/b.spec.ts', '/home', '/home/zbob', 'linux'),
    "EACCES: permission denied, open '<home>/kit/tests/b.spec.ts'");
  const winFile = `${WIN_KIT}\\tests\\b.spec.ts`;
  const winMsg = "EBUSY: resource busy or locked, open 'c:\\users\\ZBOB\\Desktop\\qa-core-testing\\saucedemo-flaky-kit\\tests\\b.spec.ts' (also C:/Users/zbob/Desktop/qa-core-testing/saucedemo-flaky-kit/tests/b.spec.ts)";
  assert.equal(displayMessage(winMsg, winFile, WIN_KIT, WIN_HOME, 'win32'),
    "EBUSY: resource busy or locked, open 'tests\\b.spec.ts' (also tests\\b.spec.ts)");
  assert.equal(displayMessage('ENOENT: no such file or directory', winFile, WIN_KIT, WIN_HOME, 'win32'), 'ENOENT: no such file or directory');
  // A path outside home is left as it is.
  assert.equal(displayMessage("ENOENT: open '/srv/x.ts'", '/srv/x.ts', '/home/zbob/kit', '/home/zbob', 'linux'), "ENOENT: open '/srv/x.ts'");
});

test('displayMessage also replaces the real path when the file exists', (t) => {
  if (process.platform === 'win32') {
    t.skip('symlinks need Developer Mode on Windows');
    return;
  }
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-core-heal-display-')));
  try {
    const real = path.join(dir, 'real');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'b.spec.ts'), '');
    fs.symlinkSync(real, path.join(dir, 'link'));
    const viaLink = path.join(dir, 'link', 'b.spec.ts');
    const msg = `EACCES: permission denied, open '${path.join(real, 'b.spec.ts')}'`;
    assert.equal(displayMessage(msg, viaLink, path.join(dir, 'other'), dir, process.platform), `EACCES: permission denied, open '<home>${path.sep}link${path.sep}b.spec.ts'`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
