/**
 * Many tests check the Unicode report symbols (▸ · → ✓ ✗). On Windows the
 * CLI prints ASCII by default when its output is piped, which is how the
 * tests read it. Keep the symbols for the suite unless a test asks for
 * ASCII itself. tests/glyphs.test.mjs covers the ASCII output.
 */
process.env.QA_CORE_HEAL_ASCII ??= '0';
