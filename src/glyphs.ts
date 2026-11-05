/**
 * Plain ASCII output for consoles that cannot show the report symbols.
 *
 * Windows PowerShell 5.1 decodes a program's output with the console code
 * page (often 437 or 850), not UTF-8. When the output is piped, redirected,
 * or read back with Get-Content, symbols such as ▸ and · turn into text
 * like "â–¸". The human report then swaps those symbols for ASCII.
 * Machine output (--json) is never changed.
 */

export interface GlyphEnv {
  /** --ascii on the command line. */
  flag: boolean;
  env: Record<string, string | undefined>;
  platform: string;
  /** Whether stdout is an interactive console. */
  isTTY: boolean;
}

/**
 * The decision, in order:
 * 1. --ascii always wins.
 * 2. QA_CORE_HEAL_ASCII=1 forces ASCII, QA_CORE_HEAL_ASCII=0 forces the symbols.
 * 3. Outside Windows the symbols are kept.
 * 4. On Windows the symbols are kept only for an interactive Windows
 *    Terminal, VS Code or ConEmu console, which show UTF-8 correctly.
 *    Every other case (classic console, pipe, file) gets ASCII.
 */
export function useAsciiGlyphs(o: GlyphEnv): boolean {
  if (o.flag) return true;
  const v = (o.env.QA_CORE_HEAL_ASCII ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (o.platform !== 'win32') return false;
  if (!o.isTTY) return true;
  const modern = (o.env.WT_SESSION ?? '') !== ''
    || o.env.TERM_PROGRAM === 'vscode'
    || o.env.ConEmuANSI === 'ON';
  return !modern;
}

const MAP: ReadonlyArray<[RegExp, string]> = [
  [/▸/g, '>'],
  [/›/g, '>'],
  [/·/g, '-'],
  [/→/g, '->'],
  [/✓/g, '[ok]'],
  [/✗/g, '[x]'],
  [/…/g, '...'],
  [/[—–]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
];

/**
 * Swaps the report symbols for ASCII. Any other character, such as a
 * non-English test title, is kept as written.
 */
export function toAsciiGlyphs(text: string): string {
  let out = text;
  for (const [re, to] of MAP) out = out.replace(re, to);
  return out;
}

/**
 * Wraps console.log (human mode only) and console.error so every printed
 * string goes through toAsciiGlyphs. Returns a function that undoes it.
 */
export function installAsciiConsole(opts: { stdout: boolean }): () => void {
  const origLog = console.log;
  const origErr = console.error;
  const map = (args: unknown[]): unknown[] => args.map((a) => (typeof a === 'string' ? toAsciiGlyphs(a) : a));
  if (opts.stdout) console.log = (...args: unknown[]) => origLog(...map(args));
  console.error = (...args: unknown[]) => origErr(...map(args));
  return () => { console.log = origLog; console.error = origErr; };
}
