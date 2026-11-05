import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Review of PR 15: from a folder above the home folder (C:\Users, /home), or
 * from another drive, the console must show `<home>` and never the
 * username. Every console line with a file path goes through displayPath().
 * The --json output keeps the paths it always had.
 */

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cliJs = path.join(repoRoot, 'dist', 'cli.js');
const { consolePath, hideHome } = await import(pathToFileURL(path.join(repoRoot, 'dist', 'display-path.js')).href);

const WIN_HOME = 'C:\\Users\\zbob';

function startServer(html) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Moving HOME also moves Playwright's default browser folder, so keep the real one. */
function browsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === 'linux') return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ms-playwright');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  return undefined; // Windows uses LOCALAPPDATA, which a new USERPROFILE does not move.
}

const runCli = (args, cwd, home) => new Promise((resolve) => {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const browsers = browsersPath();
  if (browsers) env.PLAYWRIGHT_BROWSERS_PATH = browsers;
  const child = spawn(process.execPath, [cliJs, ...args], { cwd, env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

test('--scan and a run-first heal from the folder above a fake home folder never print the username', async () => {
  const server = await startServer('<html><body><p id="ok">fine</p></body></html>');
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(repoRoot, '.tmp-test-'));
  const home = path.join(dir, 'zbob');
  const kit = path.join(home, 'kit');
  fs.mkdirSync(path.join(kit, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(kit, '.auth'));
  fs.writeFileSync(path.join(kit, 'package.json'), '{ "name": "kit", "private": true, "type": "module" }');
  fs.writeFileSync(path.join(kit, '.auth', 'state.json'), '{"cookies":[],"origins":[]}');
  fs.writeFileSync(path.join(kit, 'tests', 'a.spec.ts'), `import { test, expect } from '@playwright/test';
test('a', async ({ page }) => {
  await page.goto('${base}/');
  await page.goto(\`\${'${base}'}/next\`);
  await expect(page.locator('#okk')).toHaveText('fine');
});
`);
  try {
    const one = await runCli([path.join('zbob', 'kit', 'tests', 'a.spec.ts'), '--scan', '--dry-run', '--verbose'], dir, home);
    const all = await runCli([path.join('zbob', 'kit', 'tests'), '--scan', '--dry-run', '--verbose'], dir, home);
    for (const r of [one, all]) {
      assert.equal(r.status, 0, r.stderr);
      const text = r.stdout + r.stderr;
      assert.ok(!text.includes('zbob'), text);
      assert.ok(!text.includes(home), text);
      // The file header, with `/` as before.
      assert.ok(r.stdout.split(/\r?\n/).includes('  <home>/kit/tests/a.spec.ts:'), r.stdout);
      assert.ok(r.stderr.split(/\r?\n/).includes(`using storage state from ${['<home>', 'kit', '.auth', 'state.json'].join(path.sep)}`), r.stderr);
      assert.match(r.stderr, /skipped template route at <home>\/kit\/tests\/a\.spec\.ts:4:/);
    }
    assert.ok(one.stdout.split(/\r?\n/).some((l) => l.startsWith(`▸ Healing ${['<home>', 'kit', 'tests', 'a.spec.ts'].join(path.sep)}`)), one.stdout);
    // A run-first heal runs Playwright, so the typed spec echo and the child command are checked too.
    const first = await runCli([path.join('zbob', 'kit', 'tests', 'a.spec.ts'), '--dry-run', '--verbose'], dir, home);
    assert.ok(!(first.stdout + first.stderr).includes('zbob'), first.stdout + first.stderr);
    assert.ok(first.stdout.split(/\r?\n/).includes(`▸ Running ${['<home>', 'kit', 'tests', 'a.spec.ts'].join(path.sep)} to find failures`), first.stdout);
    assert.match(first.stderr, /^\[verbose\] child: /m);
    // The JSON keeps the path relative to the working folder, as before.
    const j = await runCli([path.join('zbob', 'kit', 'tests'), '--scan', '--dry-run', '--json'], dir, home);
    const doc = JSON.parse(j.stdout);
    assert.ok(doc.locators.some((l) => l.file === 'zbob/kit/tests/a.spec.ts'), j.stdout);
    assert.ok(!j.stderr.includes('zbob'), j.stderr);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows: a console path from above home or from another drive shows <home>', () => {
  const file = 'C:\\Users\\zbob\\kit\\tests\\a.spec.ts';
  // From C:\Users heal used to print zbob\kit\tests\a.spec.ts.
  assert.equal(consolePath('zbob\\kit\\tests\\a.spec.ts', false, 'C:\\Users', WIN_HOME, 'win32'), '<home>\\kit\\tests\\a.spec.ts');
  assert.equal(consolePath('zbob/kit/tests/a.spec.ts', true, 'c:\\users', WIN_HOME, 'win32'), '<home>/kit/tests/a.spec.ts');
  // From D:\work, path.relative gives the absolute C:\ path, which used to show the username.
  assert.equal(consolePath(file, false, 'D:\\work', WIN_HOME, 'win32'), '<home>\\kit\\tests\\a.spec.ts');
  assert.equal(consolePath('C:/Users/zbob/kit/tests/a.spec.ts', true, 'D:\\work', WIN_HOME, 'win32'), '<home>/kit/tests/a.spec.ts');
  // Inside the working folder it stays relative, and a path outside home stays as it is.
  assert.equal(consolePath(file, true, 'C:\\Users\\zbob\\kit', WIN_HOME, 'win32'), 'tests/a.spec.ts');
  assert.equal(consolePath('D:\\ci\\a.spec.ts', false, 'C:\\Users\\zbob\\kit', WIN_HOME, 'win32'), 'D:\\ci\\a.spec.ts');
});

test('POSIX: a console path from above home shows <home>', () => {
  assert.equal(consolePath('zbob/kit/tests/a.spec.ts', true, '/home', '/home/zbob', 'linux'), '<home>/kit/tests/a.spec.ts');
  assert.equal(consolePath('/home/zbob/kit/tests/a.spec.ts', false, '/', '/home/zbob', 'linux'), '<home>/kit/tests/a.spec.ts');
  assert.equal(consolePath('tests/a.spec.ts', true, '/home/zbob/kit', '/home/zbob', 'linux'), 'tests/a.spec.ts');
});

test('hideHome hides every spelling of the home folder in a child command', () => {
  assert.equal(
    hideHome('/usr/bin/node /home/zbob/kit/node_modules/@playwright/test/cli.js test tests/a.spec.ts', '/home/zbob', 'linux'),
    '/usr/bin/node <home>/kit/node_modules/@playwright/test/cli.js test tests/a.spec.ts');
  assert.equal(hideHome('ls /home/zbobx/a /home/zbob', '/home/zbob', 'linux'), 'ls /home/zbobx/a <home>');
  assert.equal(
    hideHome('"C:\\Program Files\\nodejs\\node.exe" c:\\users\\ZBOB\\kit\\node_modules\\@playwright\\test\\cli.js C:/Users/zbob/AppData/Local/Temp/x', WIN_HOME, 'win32'),
    '"C:\\Program Files\\nodejs\\node.exe" <home>\\kit\\node_modules\\@playwright\\test\\cli.js <home>/AppData/Local/Temp/x');
  assert.equal(hideHome('node a.js', '', 'linux'), 'node a.js');
});
