import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A file path for a console line, so a terminal log or a screenshot does
 * not show the home folder.
 *
 * - A path inside the working folder is printed relative to it, for example
 *   `.auth/state.json` on macOS and Linux and `.auth\state.json` on Windows,
 *   when the working folder is inside the home folder or the file is not.
 * - Any other path inside the home folder has the home folder replaced with
 *   `<home>`, the same mark that qa-core-flaky uses.
 * - A relative path, or any other absolute path, is printed as it is.
 *
 * On Windows the folder checks ignore case and accept `/` or `\`, because
 * Windows paths do. When the files exist, the real path is checked too, so a
 * short 8.3 name such as `C:\Users\ZBOBLO~1\AppData\Local\Temp` still
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
  const inside = (root: string, target: string): string | null => {
    if (!root || !p.isAbsolute(root)) return null;
    const targets = withReal(p.normalize(target), platform);
    for (const base of withReal(p.resolve(root), platform)) {
      for (const abs of targets) {
        const rel = p.relative(base, abs);
        if (rel === '') return '';
        if (rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel)) continue;
        return rel;
      }
    }
    return null;
  };
  const inHome = inside(home, file);
  const inCwd = inside(cwd, file);
  // The relative form is safe only when it cannot carry the username: the
  // working folder is inside home, or the file is not in home at all. From
  // a folder above home (C:\, C:\Users, /, /home) a home file gets <home>.
  if (inCwd !== null && inCwd !== '' && (inHome === null || inside(home, cwd) !== null)) return inCwd;
  if (inHome !== null) return inHome === '' ? '<home>' : `<home>${p.sep}${inHome}`;
  return file;
}

/**
 * A console copy of an error message that names `file`, for example Node's
 * "EACCES: permission denied, open '/home/zbob/kit/tests/b.spec.ts'". Every
 * spelling of the path is replaced with displayPath(file): the absolute
 * path as given, its resolved and real paths, and on Windows the other slash and
 * any letter case. Only console text uses this. Result files keep the full
 * message.
 */
export function displayMessage(
  message: string,
  file: string,
  cwd: string = process.cwd(),
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const abs = p.isAbsolute(file) ? p.normalize(file) : p.resolve(cwd, file);
  const shown = displayPath(abs, cwd, home, platform);
  const forms = new Set<string>([abs, ...withReal(abs, platform)]);
  if (p.isAbsolute(file)) forms.add(file);
  if (platform === 'win32') {
    for (const f of [...forms]) {
      forms.add(f.replace(/\\/g, '/'));
      forms.add(f.replace(/\//g, '\\'));
    }
  }
  const list = [...forms].filter((f) => f && f !== shown).sort((a, b) => b.length - a.length);
  if (list.length === 0) return message;
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return message.replace(new RegExp(list.map(esc).join('|'), platform === 'win32' ? 'gi' : 'g'), shown);
}

/**
 * A file path for a console line, from any form heal has: absolute, or
 * relative to the working folder (for example `tests/a.spec.ts`, or
 * `C:/Users/zbob/kit/a.spec.ts` when the file is on another drive). The path
 * is resolved against the working folder and then shown with displayPath(),
 * so a run from a folder above the home folder, or from another drive, shows
 * `<home>` instead of the username. With `slash`, the separators are `/`,
 * for the lines that always printed `/`. Only console text uses this.
 */
export function consolePath(
  file: string,
  slash = false,
  cwd: string = process.cwd(),
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (!file) return file;
  const shown = displayPath(p.resolve(cwd, file), cwd, home, platform);
  return slash ? shown.split(p.sep).join('/') : shown;
}

/**
 * A console copy of a text that can name any file, such as the child
 * command under --verbose. Every spelling of the home folder that is
 * followed by a separator, a quote, a space or the end of the text becomes
 * `<home>`. On Windows that includes either slash and any letter case.
 * `/home/zbobx` stays as it is when the home folder is `/home/zbob`.
 */
export function hideHome(
  text: string,
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (!text || !home || !p.isAbsolute(home)) return text;
  const trim = (x: string): string => x.replace(/[\\/]+$/, '');
  const forms = new Set<string>(withReal(p.normalize(home), platform).map(trim));
  if (platform === 'win32') {
    for (const f of [...forms]) {
      forms.add(f.replace(/\\/g, '/'));
      forms.add(f.replace(/\//g, '\\'));
    }
  }
  // A drive or the file system root alone is not a home folder to hide.
  const list = [...forms].filter((f) => f.length > 3).sort((a, b) => b.length - a.length);
  if (list.length === 0) return text;
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:${list.map(esc).join('|')})(?=[\\\\/'"\\s]|$)`, platform === 'win32' ? 'gi' : 'g');
  return text.replace(re, '<home>');
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
