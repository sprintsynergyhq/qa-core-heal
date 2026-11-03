import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A file path for a console line, so a terminal log or a screenshot does
 * not show the home folder.
 *
 * - A path inside the working folder is printed relative to it, for example
 *   `.auth/state.json` on macOS and Linux and `.auth\state.json` on Windows.
 * - Any other path inside the home folder has the home folder replaced with
 *   `<home>`, the same mark that qa-core-flaky uses.
 * - A relative path, or any other absolute path, is printed as it is.
 *
 * On Windows the folder checks ignore case and accept `/` or `\`, because
 * Windows paths do. When the files exist, the real path is checked too, so a
 * short 8.3 name such as `C:\Users\ABDULR~1\AppData\Local\Temp` still
 * matches the long home folder. Only console text uses this. Result files
 * and the findings contract keep the paths they had.
 */
export function displayPath(
  file: string,
  cwd: string = process.cwd(),
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (!p.isAbsolute(file)) return file;
  const files = withReal(p.normalize(file), platform);
  const inside = (root: string): string | null => {
    if (!root || !p.isAbsolute(root)) return null;
    for (const base of withReal(p.resolve(root), platform)) {
      for (const abs of files) {
        const rel = p.relative(base, abs);
        if (rel === '') return '';
        if (rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel)) continue;
        return rel;
      }
    }
    return null;
  };
  const inCwd = inside(cwd);
  if (inCwd !== null && inCwd !== '') return inCwd;
  const inHome = inside(home);
  if (inHome !== null) return inHome === '' ? '<home>' : `<home>${p.sep}${inHome}`;
  return file;
}

/** The path, then its real path when it exists on this machine and differs. */
function withReal(value: string, platform: NodeJS.Platform): string[] {
  if (platform !== process.platform) return [value];
  try {
    const real = fs.realpathSync.native(value);
    return real === value ? [value] : [value, real];
  } catch {
    return [value];
  }
}
