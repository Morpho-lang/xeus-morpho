/**
 * CodeMirror 6 StreamLanguage for Morpho.
 * Lab-specific adapter over the shared token tables in tokens.ts.
 */

import { StreamLanguage } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import {
  KEYWORD_SET,
  LITERAL_SET,
  OPERATORS_MULTI
} from './tokens';

type MorphoState = {
  tokenize: ((stream: StringStream, state: MorphoState) => string | null) | null;
};

/** Minimal stream interface matching CodeMirror StringStream. */
interface StringStream {
  eol(): boolean;
  sol(): boolean;
  peek(): string | undefined;
  next(): string | undefined;
  eat(match: string | RegExp | ((ch: string) => boolean)): string | undefined;
  eatWhile(match: string | RegExp | ((ch: string) => boolean)): boolean;
  eatSpace(): boolean;
  skipToEnd(): void;
  match(
    pattern: string | RegExp,
    consume?: boolean,
    caseInsensitive?: boolean
  ): string | RegExpMatchArray | null;
  current(): string;
}

function tokenComment(stream: StringStream, state: MorphoState): string {
  let maybeEnd = false;
  let ch: string | undefined;
  while ((ch = stream.next()) != null) {
    if (maybeEnd && ch === '/') {
      state.tokenize = null;
      break;
    }
    maybeEnd = ch === '*';
  }
  return 'comment';
}

function tokenString(stream: StringStream, state: MorphoState): string {
  let escaped = false;
  let ch: string | undefined;
  while ((ch = stream.next()) != null) {
    if (!escaped && ch === '"') {
      state.tokenize = null;
      break;
    }
    // Skip ${...} interpolation bodies as string for MVP.
    if (!escaped && ch === '$' && stream.peek() === '{') {
      stream.next();
      let depth = 1;
      while ((ch = stream.next()) != null) {
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            break;
          }
        }
      }
      escaped = false;
      continue;
    }
    escaped = !escaped && ch === '\\';
  }
  return 'string';
}

function tokenBase(stream: StringStream, state: MorphoState): string | null {
  if (stream.eatSpace()) {
    return null;
  }

  const ch = stream.next();
  if (ch == null) {
    return null;
  }

  // Line comment
  if (ch === '/' && stream.eat('/')) {
    stream.skipToEnd();
    return 'comment';
  }

  // Block comment
  if (ch === '/' && stream.eat('*')) {
    state.tokenize = tokenComment;
    return tokenComment(stream, state);
  }

  // String
  if (ch === '"') {
    state.tokenize = tokenString;
    return tokenString(stream, state);
  }

  // Number: 123, 1.2, .5, 1e-3, 2im
  if (/\d/.test(ch) || (ch === '.' && stream.match(/^\d/))) {
    if (ch !== '.') {
      stream.eatWhile(/\d/);
      if (stream.peek() === '.' && !stream.match(/^\.\./, false)) {
        stream.match(/^\.\d*/);
      }
    } else {
      stream.eatWhile(/\d/);
    }
    stream.match(/^[eE][+-]?\d+/);
    stream.match(/^im\b/);
    return 'number';
  }

  // Multi-char operators (longest first), then single-char
  if ('+-*/=<>!&|.?:@#^'.includes(ch)) {
    for (const op of OPERATORS_MULTI) {
      if (op[0] === ch && stream.match(op.slice(1))) {
        return 'operator';
      }
    }
    return 'operator';
  }

  if (ch === ',') {
    return null;
  }

  // Brackets / semicolon — structural, unstyled
  if ('()[]{};'.includes(ch)) {
    return null;
  }

  // Identifier / keyword / literal
  if (/[A-Za-z_]/.test(ch)) {
    stream.eatWhile(/[A-Za-z0-9_]/);
    const word = stream.current();
    if (KEYWORD_SET.has(word)) {
      return 'keyword';
    }
    if (LITERAL_SET.has(word)) {
      if (word === 'true' || word === 'false') {
        return 'bool';
      }
      if (word === 'nil') {
        return 'null';
      }
      return 'atom';
    }
    // Imaginary unit suffix used as a keyword-like token in lex.c
    if (word === 'im') {
      return 'number';
    }
    return 'variable';
  }

  return null;
}

export const morphoStreamParser = {
  name: 'morpho',
  startState(): MorphoState {
    return { tokenize: null };
  },
  token(stream: StringStream, state: MorphoState): string | null {
    if (state.tokenize) {
      return state.tokenize(stream, state);
    }
    return tokenBase(stream, state);
  },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', '"'] }
  },
  tokenTable: {
    keyword: t.keyword,
    string: t.string,
    comment: t.comment,
    number: t.number,
    bool: t.bool,
    // Lab's jupyterHighlightStyle omits bare t.null / t.variableName, and its
    // markdown highlight() drops a final unstyled character (e.g. "a*b" → "a*").
    // Map to themed tags here; xhelp.cpp also pads ```morpho fences with a
    // trailing blank line so unstyled closers (e.g. ')') are not clipped.
    null: t.atom,
    atom: t.atom,
    operator: t.operator,
    variable: t.propertyName
  }
};

export function morpho(): ReturnType<typeof StreamLanguage.define> {
  return StreamLanguage.define(morphoStreamParser as Parameters<typeof StreamLanguage.define>[0]);
}
