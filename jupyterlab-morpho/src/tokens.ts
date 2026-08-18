/**
 * Morpho token tables for editor highlighters.
 *
 * Sync with morpho/src/support/lex.c standardtokens[].
 * Keep this file free of CodeMirror / JupyterLab imports so it can move
 * into a shared morpho-syntax package later.
 */

/** Control / declaration keywords (lex.c keyword tokens). */
export const KEYWORDS: readonly string[] = [
  'and',
  'as',
  'break',
  'catch',
  'class',
  'continue',
  'do',
  'else',
  'fn',
  'for',
  'help',
  'if',
  'import',
  'in',
  'is',
  'or',
  'print',
  'return',
  'try',
  'var',
  'while',
  'with'
];

/** Literal / special identifiers. */
export const LITERALS: readonly string[] = [
  'im',
  'false',
  'nil',
  'self',
  'super',
  'true'
];

/**
 * Multi-character operators, longest-first for matching.
 * Single-char ops are handled in the stream parser.
 */
export const OPERATORS_MULTI: readonly string[] = [
  '...',
  '..',
  '+=',
  '-=',
  '*=',
  '/=',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||'
];

export const KEYWORD_SET = new Set(KEYWORDS);
export const LITERAL_SET = new Set(LITERALS);
