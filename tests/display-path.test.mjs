import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { displayPath } = await import(path.join(repoRoot, 'dist', 'display-path.js'));

const WIN_HOME = 'C:\\Users\\Abdul';
const WIN_KIT = 'C:\\Users\\Abdul\\Desktop\\qa-core-testing\\saucedemo-flaky-kit';

test('Windows: a storage state inside the working folder is printed relative to it', () => {
  assert.equal(displayPath(`${WIN_KIT}\\.auth\\state.json`, WIN_KIT, WIN_HOME, 'win32'), '.auth\\state.json');
});

test('Windows: the folder checks ignore case and accept forward slashes', () => {
  assert.equal(displayPath('c:/users/abdul/desktop/qa-core-testing/saucedemo-flaky-kit/.auth/state.json', WIN_KIT, WIN_HOME, 'win32'), '.auth\\state.json');
  assert.equal(displayPath('C:/USERS/ABDUL/AppData/Local/Temp/qa-core-flaky-heal-1/.auth/state.json', WIN_KIT, WIN_HOME, 'win32'), '<home>\\AppData\\Local\\Temp\\qa-core-flaky-heal-1\\.auth\\state.json');
});

test('Windows: a path in the home folder but outside the working folder shows <home>', () => {
  assert.equal(displayPath(`${WIN_HOME}\\qa-private\\state.json`, WIN_KIT, WIN_HOME, 'win32'), '<home>\\qa-private\\state.json');
  assert.equal(displayPath(WIN_HOME, WIN_KIT, WIN_HOME, 'win32'), '<home>');
});

test('Windows: a path outside the home folder, or on another drive, is printed as it is', () => {
  assert.equal(displayPath('D:\\ci\\.auth\\state.json', WIN_KIT, WIN_HOME, 'win32'), 'D:\\ci\\.auth\\state.json');
  assert.equal(displayPath('C:\\Users\\Abdul2\\state.json', WIN_KIT, WIN_HOME, 'win32'), 'C:\\Users\\Abdul2\\state.json');
});

test('POSIX: inside the working folder is relative, the rest of home is <home>, other paths stay', () => {
  const home = '/home/abdul';
  const kit = '/home/abdul/qa-core-testing/kit';
  assert.equal(displayPath(`${kit}/.auth/state.json`, kit, home, 'linux'), '.auth/state.json');
  assert.equal(displayPath('/home/abdul/other/state.json', kit, home, 'linux'), '<home>/other/state.json');
  assert.equal(displayPath('/home/abdulx/state.json', kit, home, 'linux'), '/home/abdulx/state.json');
  assert.equal(displayPath('/srv/ci/state.json', kit, home, 'darwin'), '/srv/ci/state.json');
});

test('a relative path is printed as written', () => {
  assert.equal(displayPath('../nope.ts', '/home/abdul/kit', '/home/abdul', 'linux'), '../nope.ts');
  assert.equal(displayPath('.auth\\state.json', WIN_KIT, WIN_HOME, 'win32'), '.auth\\state.json');
});

test('an empty home folder only uses the working folder rule', () => {
  assert.equal(displayPath('/home/abdul/other/state.json', '/home/abdul/kit', '', 'linux'), '/home/abdul/other/state.json');
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
