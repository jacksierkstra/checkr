/**
 * XSD regex dialect engine — XSD 1.0 Part 2 Appendix E (CHK-015).
 *
 * Parses and evaluates regular expressions in the XSD regex dialect:
 * character-class subtraction, \p{…} / \P{…} category and block escapes,
 * \i / \c name-character escapes, multi-character escapes (\d, \s, \w),
 * and the 1.0 restriction: no multi-character escapes inside character classes.
 *
 * The engine compiles a pattern into an immutable XsdRegex object with a
 * `matches(value: string)` method.
 *
 * Unicode categories are delegated to the JS engine's \p{…} property escapes.
 * Unicode blocks use an embedded table from Unicode 17.0.0 (see unicode-blocks.ts).
 */

import { UNICODE_BLOCKS, UNICODE_BLOCKS_VERSION } from "@lib/xsd/unicode-blocks";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class XsdRegexError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} (at position ${position})`);
    this.name = "XsdRegexError";
  }
}

// ---------------------------------------------------------------------------
// AST types
// ---------------------------------------------------------------------------

interface AltNode {
  readonly kind: "alt";
  readonly branches: readonly SeqNode[];
}

interface SeqNode {
  readonly kind: "seq";
  readonly pieces: readonly Piece[];
}

interface Piece {
  readonly atom: Atom;
  readonly quant: Quantifier | null;
}

type Atom = CharAtom | ClassAtom | GroupAtom;

interface CharAtom {
  readonly kind: "char";
  readonly cp: number;
}

interface ClassAtom {
  readonly kind: "class";
  readonly matcher: CharMatcher;
}

interface GroupAtom {
  readonly kind: "group";
  readonly node: AltNode;
}

interface Quantifier {
  readonly min: number;
  readonly max: number; // Infinity for unbounded
}

// ---------------------------------------------------------------------------
// Character matchers
// ---------------------------------------------------------------------------

type CharMatcher =
  | { readonly kind: "any" }
  | { readonly kind: "range"; readonly from: number; readonly to: number }
  | { readonly kind: "union"; readonly members: readonly CharMatcher[] }
  | { readonly kind: "diff"; readonly left: CharMatcher; readonly right: CharMatcher }
  | { readonly kind: "complement"; readonly inner: CharMatcher }
  | { readonly kind: "property"; readonly regex: RegExp };

// ---------------------------------------------------------------------------
// Code-point helpers
// ---------------------------------------------------------------------------

function toCodePoints(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) out.push(ch.codePointAt(0)!);
  return out;
}

// ---------------------------------------------------------------------------
// Constants (code points for structural characters)
// --------------------------------------------------------------------------

const CHAR_LBRACE = 0x7b; // {
const CHAR_RBRACE = 0x7d; // }
const CHAR_LBRACKET = 0x5b; // [
const CHAR_RBRACKET = 0x5d; // ]
const CHAR_LPAREN = 0x28; // (
const CHAR_RPAREN = 0x29; // )
const CHAR_BACKSLASH = 0x5c; // "\"
const CHAR_DOT = 0x2e; // .
const CHAR_OR = 0x7c; // |
const CHAR_QUESTION = 0x3f; // ?
const CHAR_STAR = 0x2a; // *
const CHAR_PLUS = 0x2b; // +
const CHAR_DASH = 0x2d; // -
const CHAR_CARET = 0x5e; // ^
const CHAR_COMMA = 0x2c; // ,
const CHAR_AMP = 0x26; // &
const CHAR_LT = 0x3c; // <

// SingleCharEsc map: backslash-followed char → code point
const SINGLE_CHAR_ESCAPES: Readonly<Record<number, number>> = {
  0x6e /* n */: 0x0a,
  0x72 /* r */: 0x0d,
  0x74 /* t */: 0x09,
  0x7c /* | */: 0x7c,
  0x2e /* . */: 0x2e,
  0x3f /* ? */: 0x3f,
  0x2a /* * */: 0x2a,
  0x2b /* + */: 0x2b,
  0x7b /* { */: 0x7b,
  0x7d /* } */: 0x7d,
  0x24 /* $ */: 0x24,
  0x5e /* ^ */: 0x5e,
  0x5b /* [ */: 0x5b,
  0x5d /* ] */: 0x5d,
  0x28 /* ( */: 0x28,
  0x29 /* ) */: 0x29,
  0x2d /* - */: 0x2d,
  0x5c /* \ */: 0x5c,
};

// Multi-character escapes (allowed only OUTSIDE character classes in XSD 1.0)
function multiCharMatcher(cp: number): CharMatcher {
  switch (cp) {
    case 0x64 /* d */:
      return { kind: "range", from: 0x30, to: 0x39 };
    case 0x44 /* D */:
      return { kind: "complement", inner: { kind: "range", from: 0x30, to: 0x39 } };
    case 0x73 /* s */:
      return { kind: "union", members: [{ kind: "range", from: 0x09, to: 0x09 }, { kind: "range", from: 0x0a, to: 0x0a }, { kind: "range", from: 0x0d, to: 0x0d }, { kind: "range", from: 0x20, to: 0x20 }] };
    case 0x53 /* S */:
      return { kind: "complement", inner: { kind: "union", members: [{ kind: "range", from: 0x09, to: 0x09 }, { kind: "range", from: 0x0a, to: 0x0a }, { kind: "range", from: 0x0d, to: 0x0d }, { kind: "range", from: 0x20, to: 0x20 }] } };
    case 0x77 /* w */:
      return {
        kind: "union",
        members: [
          { kind: "range", from: 0x30, to: 0x39 },
          { kind: "range", from: 0x41, to: 0x5a },
          { kind: "range", from: 0x5f, to: 0x5f },
          { kind: "range", from: 0x61, to: 0x7a },
        ],
      };
    case 0x57 /* W */:
      return { kind: "complement", inner: multiCharMatcher(0x77) };
    case 0x69 /* i */:
      return nameStartMatcher(false);
    case 0x49 /* I */:
      return { kind: "complement", inner: nameStartMatcher(false) };
    case 0x63 /* c */:
      return nameContinuationMatcher();
    case 0x43 /* C */:
      return { kind: "complement", inner: nameContinuationMatcher() };
    default:
      // Should never happen for valid multiCharEsc chars; the caller validates.
      throw new Error(`Invalid multi-character escape: code point ${cp}`);
  }
}

/** \i = NameStartChar minus ':' (0x3A) and '_' (0x5F). */
function nameStartMatcher(_excluded: false): CharMatcher {
  // NameStartChar ranges from XML 1.0 §2.2 (2nd ed+).
  const ranges: CharMatcher[] = [
    { kind: "range", from: 0x41, to: 0x5a },
    { kind: "range", from: 0x61, to: 0x7a },
    { kind: "range", from: 0xc0, to: 0xd6 },
    { kind: "range", from: 0xd8, to: 0xf6 },
    { kind: "range", from: 0xf8, to: 0x2ff },
    { kind: "range", from: 0x370, to: 0x37d },
    { kind: "range", from: 0x37f, to: 0x1fff },
    { kind: "range", from: 0x200c, to: 0x200d },
    { kind: "range", from: 0x2070, to: 0x218f },
    { kind: "range", from: 0x2c00, to: 0x2fef },
    { kind: "range", from: 0x3001, to: 0xd7ff },
    { kind: "range", from: 0xf900, to: 0xfdcf },
    { kind: "range", from: 0xfdf0, to: 0xfffd },
    { kind: "range", from: 0x10000, to: 0xeffff },
  ];
  // Explicit single chars ':' (0x3A) and '_' (0x5F) are excluded.
  return { kind: "union", members: ranges };
}

/** \c = NameChar \ NameStartChar = '-', '.', '0'-'9', #xB7, #x300-#x36F, #x203F-#x2040 */
function nameContinuationMatcher(): CharMatcher {
  return {
    kind: "union",
    members: [
      { kind: "range", from: 0x2d, to: 0x2d }, // '-'
      { kind: "range", from: 0x2e, to: 0x2e }, // '.'
      { kind: "range", from: 0x30, to: 0x39 }, // '0'-'9'
      { kind: "range", from: 0xb7, to: 0xb7 }, // middle dot
      { kind: "range", from: 0x300, to: 0x36f }, // combining marks
      { kind: "range", from: 0x203f, to: 0x2040 }, // underscore-like
    ],
  };
}

// XSD category letter → allowed subtag characters
const CATEGORY_SUBTAGS: Readonly<Record<number, string>> = {
  0x4c /* L */: "ultmo", // Lu Ll Lt Lm Lo
  0x4d /* M */: "ncer", // Mn Mc Me
  0x4e /* N */: "dlo", // Nd Nl No
  0x50 /* P */: "cdseifo", // Pc Pd Ps Pe Pi Pf Po
  0x5a /* Z */: "slp", // Zs Zl Zp
  0x53 /* S */: "mcko", // Sm Sc Sk So
  0x43 /* C */: "cfon", // Cc Cf Co Cn
};

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class RegexParser {
  private readonly cps: number[];
  private pos = 0;

  constructor(pattern: string) {
    this.cps = toCodePoints(pattern);
  }

  parse(): AltNode {
    const node = this.parseRegExp();
    if (this.pos < this.cps.length) {
      this.fail(`Unexpected character after complete pattern`);
    }
    return node;
  }

  /** [1] regExp ::= branch ( '|' branch )* */
  private parseRegExp(): AltNode {
    const branches: SeqNode[] = [this.parseBranch()];
    while (this.consumeIf(CHAR_OR)) {
      branches.push(this.parseBranch());
    }
    return { kind: "alt", branches };
  }

  /** [2] branch ::= piece* */
  private parseBranch(): SeqNode {
    const pieces: Piece[] = [];
    while (this.pos < this.cps.length) {
      const c = this.cps[this.pos];
      if (c === CHAR_OR || c === CHAR_RPAREN) break;
      const atom = this.parseAtom();
      const quant = this.tryQuantifier();
      pieces.push({ atom, quant });
    }
    return { kind: "seq", pieces };
  }

  /** [9] atom ::= Char | charClass | ( '(' regExp ')' ) | ( '(' '?:' regExp ')' ) */
  private parseAtom(): Atom {
    const c = this.peek();
    if (c === null) this.fail("Expected an atom");
    if (c === CHAR_LBRACKET) return this.parseClassAtom();
    if (c === CHAR_DOT) {
      this.pos++;
      return { kind: "class", matcher: { kind: "any" } };
    }
    if (c === CHAR_LPAREN) return this.parseGroupAtom();
    if (c === CHAR_BACKSLASH) return this.parseEscapeAtom();
    // Literal char (atom ::= Char). A lone `{` in atom position is literal
    // per the spec note: if not followed by a valid quantity, treated as literal.
    // `?`, `*`, `+` in atom position are schema errors (the grammar requires a
    // preceding atom). `|` and `)` are handled by the branch loop.
    if (c === CHAR_QUESTION || c === CHAR_STAR || c === CHAR_PLUS) {
      this.fail(`Unexpected '${String.fromCodePoint(c)}' — requires a preceding atom`);
    }
    this.pos++;
    return { kind: "char", cp: c };
  }

  /** parseAtom for `\` escapes */
  private parseEscapeAtom(): Atom {
    this.pos++; // consume backslash
    const c = this.peek();
    if (c === null) this.fail("Unterminated backslash escape");

    // Single-char escape
    const single = SINGLE_CHAR_ESCAPES[c];
    if (single !== undefined) {
      this.pos++;
      return { kind: "char", cp: single };
    }

    // Category/block escape \p{…} / \P{…}
    if (c === 0x70 /* p */ || c === 0x50 /* P */) {
      const matcher = this.parsePropertyMatcher(c === 0x50 /* P = negated */);
      return { kind: "class", matcher };
    }

    // Multi-character escapes (allowed only OUTSIDE character classes in XSD 1.0)
    const multi = this.tryMultiCharEscape(c);
    if (multi !== null) {
      this.pos++;
      return { kind: "class", matcher: multi };
    }

    // Digits after backslash = backreference → error (AC2)
    if (c >= 0x30 && c <= 0x39) {
      this.fail(`Backreference '\\${String.fromCodePoint(c)}' is not valid in XSD regular expressions`);
    }

    this.fail(`Invalid escape '\\${String.fromCodePoint(c)}'`);
  }

  /** Try a multi-character escape (outside class). null = not a valid multi-char escape. */
  private tryMultiCharEscape(c: number): CharMatcher | null {
    switch (c) {
      case 0x64: case 0x44: // d, D
      case 0x73: case 0x53: // s, S
      case 0x77: case 0x57: // w, W
      case 0x69: case 0x49: // i, I
      case 0x63: case 0x43: // c, C
        return multiCharMatcher(c);
      default:
        return null;
    }
  }

  /** \p{…} / \P{…}. `negated` is true for \P{…}. Inside the braces, `^` also negates. */
  private parsePropertyMatcher(negated: boolean): CharMatcher {
    this.pos++; // consume p/P
    if (!this.consumeIf(CHAR_LBRACE)) this.fail("Expected '{' after '\\p' / '\\P'");
    let innerNegated = false;
    if (this.consumeIf(CHAR_CARET)) innerNegated = true;

    let matcher: CharMatcher;
    const c = this.peek();
    if (c === null) this.fail("Expected character property inside \\p{…}");

    // IsBlock ::= 'Is' BlockName
    if (c === 0x49 /* I */ && this.peekAt(1) === 0x73 /* s */) {
      this.pos += 2; // consume "Is"
      const name = this.consumeBlockName();
      if (name.length === 0) this.fail("Expected a Unicode block name after 'Is'");
      const range = UNICODE_BLOCKS[name];
      if (range === undefined) {
        this.fail(
          `Unknown Unicode block 'Is${name}' (table: Unicode ${UNICODE_BLOCKS_VERSION})`,
        );
      }
      matcher = { kind: "range", from: range[0], to: range[1] };
    } else {
      // IsCategory
      const cat = this.consumeCategory();
      if (cat === null) this.fail(`Invalid character property name`);
      try {
        matcher = { kind: "property", regex: new RegExp(`\\p{${cat}}`, "u") };
      } catch (e) {
        this.fail(`Unsupported character property '\\p{${cat}}': ${(e as Error).message}`);
      }
    }

    if (!this.consumeIf(CHAR_RBRACE)) this.fail("Expected '}' to close \\p{…}");
    if (negated || innerNegated) return { kind: "complement", inner: matcher };
    return matcher;
  }

  /** [22]-[30] IsCategory: a letter from {L,M,N,P,S,Z,C} + optional subtag. */
  private consumeCategory(): string | null {
    const letter = this.peek();
    if (letter === null) return null;
    const allowed = CATEGORY_SUBTAGS[letter];
    if (allowed === undefined) return null;
    this.pos++;
    // Optional subtag (single letter from the allowed set)
    const sub = this.peek();
    if (sub !== null && allowed.includes(String.fromCodePoint(sub))) {
      this.pos++;
      return String.fromCodePoint(letter, sub);
    }
    return String.fromCodePoint(letter);
  }

  /** Consume alphanumeric characters matching [A-Za-z0-9]+ for block name */
  private consumeBlockName(): string {
    const start = this.pos;
    while (this.pos < this.cps.length) {
      const c = this.cps[this.pos];
      if (
        (c >= 0x41 && c <= 0x5a) ||
        (c >= 0x61 && c <= 0x7a) ||
        (c >= 0x30 && c <= 0x39)
      ) {
        this.pos++;
      } else {
        break;
      }
    }
    return String.fromCodePoint(...this.cps.slice(start, this.pos));
  }

  /** Parse quantifier [4] after an atom: `?` `*` `+` `{quantity}` */
  private tryQuantifier(): Quantifier | null {
    const c = this.peek();
    if (c === CHAR_QUESTION) {
      this.pos++;
      return { min: 0, max: 1 };
    }
    if (c === CHAR_STAR) {
      this.pos++;
      return { min: 0, max: Infinity };
    }
    if (c === CHAR_PLUS) {
      this.pos++;
      return { min: 1, max: Infinity };
    }
    if (c === CHAR_LBRACE) {
      return this.tryBraceQuantifier();
    }
    return null;
  }

  /** {quantity} ::= {n} | {n,} | {n,m} (XSD 1.0: no {,n}) */
  private tryBraceQuantifier(): Quantifier | null {
    const save = this.pos;
    this.pos++; // consume '{'
    const n1 = this.parseDigits();
    if (n1 === null) {
      this.pos = save;
      return null; // not a quantifier → literal '{'
    }
    if (this.consumeIf(CHAR_RBRACE)) return { min: n1, max: n1 };

    if (!this.consumeIf(CHAR_COMMA)) {
      this.pos = save;
      return null;
    }

    // {n,}  or  {n,m}
    const n2 = this.parseDigits();
    if (n2 === null) {
      // {n,}
      if (!this.consumeIf(CHAR_RBRACE)) {
        this.pos = save;
        return null;
      }
      return { min: n1, max: Infinity };
    }

    if (!this.consumeIf(CHAR_RBRACE)) {
      this.pos = save;
      return null;
    }

    if (n2 < n1) this.fail(`Invalid quantifier {${n1},${n2}}: minimum exceeds maximum`);
    return { min: n1, max: n2 };
  }

  /** Parse [0-9]+ */
  private parseDigits(): number | null {
    const start = this.pos;
    while (this.pos < this.cps.length) {
      const c = this.cps[this.pos];
      if (c >= 0x30 && c <= 0x39) this.pos++;
      else break;
    }
    if (this.pos === start) return null;
    return Number.parseInt(String.fromCodePoint(...this.cps.slice(start, this.pos)), 10);
  }

  /** [10] charClass ::= charClassEsc | charClassExpr | WildcardEsc — but here only '[' starts a class. */
  private parseClassAtom(): ClassAtom {
    this.pos++; // consume '['
    const group = this.parseCharGroup();
    if (!this.consumeIf(CHAR_RBRACKET)) this.fail("Unterminated character class: expected ']'");
    return { kind: "class", matcher: group };
  }

  /** [12] charGroup ::= posCharGroup | negCharGroup | charClassSub */
  private parseCharGroup(): CharMatcher {
    let group: CharMatcher;
    if (this.consumeIf(CHAR_CARET)) {
      // [^…] — negCharGroup
      group = { kind: "complement", inner: this.parsePosCharGroup() };
    } else {
      group = this.parsePosCharGroup();
    }
    // charClassSub: (posCharGroup | negCharGroup) '-' charClassExpr
    if (this.peek() === CHAR_DASH && this.peekAt(1) === CHAR_LBRACKET) {
      this.pos += 2; // consume '-[' — the inner '[' will be consumed by parseCharGroup
      const subGroup = this.parseCharGroup();
      if (!this.consumeIf(CHAR_RBRACKET)) this.fail("Unterminated subtracted character class: expected ']'");
      group = { kind: "diff", left: group, right: subGroup };
    }
    return group;
  }

  /** [13] posCharGroup ::= (charRange | charClassEsc)+ */
  private parsePosCharGroup(): CharMatcher {
    const members: CharMatcher[] = [];
    let prevSingle = false;
    let prevCp = -1;

    while (this.pos < this.cps.length) {
      const c = this.cps[this.pos];

      // Stop at ']' or at '-' that starts subtraction ('-[')
      if (c === CHAR_RBRACKET) break;
      if (c === CHAR_DASH && this.peekAt(1) === CHAR_LBRACKET) break;

      if (c === CHAR_DASH) {
        // Try to form a range if prev is single and next is a charOrEsc.
        const nextIsSingle = this.isCharOrEscAt(1);
        if (prevSingle && nextIsSingle) {
          this.pos++; // consume '-'
          const right = this.parseCharOrEsc();
          members.push({ kind: "range", from: prevCp, to: right });
          // The range itself is not a "single" for further range detection.
          prevSingle = false;
          continue;
        }
        // Lone dash (XmlCharIncDash)
        this.pos++;
        members.push({ kind: "range", from: CHAR_DASH, to: CHAR_DASH });
        prevSingle = false;
        continue;
      }

      if (c === CHAR_BACKSLASH) {
        const result = this.parseClassEscape();
        if (result.kind === "single") {
          members.push({ kind: "range", from: result.cp, to: result.cp });
          prevCp = result.cp;
          prevSingle = true;
        } else {
          members.push(result.matcher);
          prevSingle = false;
        }
        continue;
      }

      // XmlChar — any XML char except structural ones.
      if (
        c === CHAR_LBRACKET ||
        c === CHAR_AMP ||
        c === CHAR_LT ||
        c === CHAR_BACKSLASH
      ) {
        this.fail(
          `'${String.fromCodePoint(c)}' is not allowed as a literal character inside a character class`,
        );
      }
      this.pos++;
      members.push({ kind: "range", from: c, to: c });
      prevCp = c;
      prevSingle = true;
    }

    if (members.length === 0) this.fail("Character class must contain at least one member");
    if (members.length === 1) return members[0];
    return { kind: "union", members };
  }

  /** SingleCharEsc | XmlChar (inside class). Returns the matched code point. */
  private parseCharOrEsc(): number {
    const c = this.peek();
    if (c === null) this.fail("Expected a character");
    if (c === CHAR_BACKSLASH) {
      this.pos++; // consume backslash
      const e = this.peek();
      if (e === null) this.fail("Unterminated escape inside character class");
      // SingleCharEsc only (multiCharEsc error per 1.0 restriction)
      const single = SINGLE_CHAR_ESCAPES[e];
      if (single !== undefined) {
        this.pos++;
        return single;
      }
      // catEsc/complEsc as a range endpoint? Not allowed per grammar (charOrEsc ::= XmlChar | SingleCharEsc only).
      if (e === 0x70 /* p */ || e === 0x50 /* P */) {
        this.fail("Category/block escape cannot be a range endpoint");
      }
      this.fail(`Invalid escape inside character class`);
    }
    if (c === CHAR_DASH || c === CHAR_RBRACKET || c === CHAR_AMP || c === CHAR_LT) {
      this.fail(`'${String.fromCodePoint(c)}' is not a valid character here`);
    }
    this.pos++;
    return c;
  }

  /** Inside a class: \  → SingleCharEsc | catEsc/complEsc. multiCharEsc → error (1.0). */
  private parseClassEscape():
    | { readonly kind: "single"; readonly cp: number }
    | { readonly kind: "matcher"; readonly matcher: CharMatcher } {
    this.pos++; // consume backslash
    const c = this.peek();
    if (c === null) this.fail("Unterminated escape inside character class");

    // SingleCharEsc
    const single = SINGLE_CHAR_ESCAPES[c];
    if (single !== undefined) {
      this.pos++;
      return { kind: "single", cp: single };
    }

    // catEsc/complEsc inside class — allowed
    if (c === 0x70 /* p */ || c === 0x50 /* P */) {
      const matcher = this.parsePropertyMatcher(c === 0x50);
      return { kind: "matcher", matcher };
    }

    // multiCharEsc inside class → error (XSD 1.0 restriction)
    if (
      c === 0x64 /* d */ || c === 0x44 /* D */ ||
      c === 0x73 /* s */ || c === 0x53 /* S */ ||
      c === 0x77 /* w */ || c === 0x57 /* W */ ||
      c === 0x69 /* i */ || c === 0x49 /* I */ ||
      c === 0x63 /* c */ || c === 0x43 /* C */
    ) {
      this.fail("Multi-character escapes are not allowed inside character classes (XSD 1.0 restriction)");
    }

    this.fail(`Invalid escape inside character class`);
  }

  /** (…) or (?:…) */
  private parseGroupAtom(): GroupAtom {
    this.pos++; // consume '('
    let nonCapturing = false;
    if (this.consumeIf(CHAR_QUESTION)) {
      if (this.consumeIf(0x3a /* : */)) {
        nonCapturing = true;
      } else {
        this.fail("Only non-capturing groups (?: …) are supported; lookaround and flags are not valid in XSD regex");
      }
    }
    const node = this.parseRegExp();
    if (!this.consumeIf(CHAR_RPAREN)) this.fail("Unterminated group: expected ')'");
    return { kind: "group", node };
  }

  /** Is the char at offset (from current pos) a charOrEsc (XmlChar or SingleCharEsc)? */
  private isCharOrEscAt(offset: number): boolean {
    const idx = this.pos + offset;
    if (idx >= this.cps.length) return false;
    const c = this.cps[idx];
    if (c === CHAR_BACKSLASH) {
      // Must be followed by a SingleCharEsc char (not multiCharEsc, not catEsc)
      const next = idx + 1;
      if (next >= this.cps.length) return false;
      return SINGLE_CHAR_ESCAPES[this.cps[next]] !== undefined;
    }
    // XmlChar: not one of the structural chars excluded from XmlChar
    return (
      c !== CHAR_DASH &&
      c !== CHAR_LBRACKET &&
      c !== CHAR_RBRACKET &&
      c !== CHAR_AMP &&
      c !== CHAR_LT &&
      c !== CHAR_BACKSLASH
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private peek(): number | null {
    return this.pos < this.cps.length ? this.cps[this.pos] : null;
  }

  private peekAt(offset: number): number | null {
    return this.pos + offset < this.cps.length ? this.cps[this.pos + offset] : null;
  }

  private consumeIf(cp: number): boolean {
    if (this.pos < this.cps.length && this.cps[this.pos] === cp) {
      this.pos++;
      return true;
    }
    return false;
  }

  private fail(message: string): never {
    throw new XsdRegexError(message, this.pos);
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Check whether a char matches a matcher.
 * 'any' matches every code point (the XSD dot, `.`).
 */
function matchMatcher(m: CharMatcher, cp: number): boolean {
  switch (m.kind) {
    case "any":
      return true;
    case "range":
      return cp >= m.from && cp <= m.to;
    case "union":
      for (const x of m.members) {
        if (matchMatcher(x, cp)) return true;
      }
      return false;
    case "diff":
      return matchMatcher(m.left, cp) && !matchMatcher(m.right, cp);
    case "complement":
      return !matchMatcher(m.inner, cp);
    case "property":
      return m.regex.test(String.fromCodePoint(cp));
  }
}

/**
 * Match an alternation node. Tries branches in order; the continuation `cont`
 * is called when a branch consumes a prefix, so that the remainder can be
 * matched by subsequent pieces and the caller.
 */
function matchNode(
  node: AltNode,
  input: readonly number[],
  pos: number,
  cont: (newPos: number) => boolean,
): boolean {
  for (const branch of node.branches) {
    if (matchSeq(branch, input, pos, cont)) return true;
  }
  return false;
}

function matchSeq(
  seq: SeqNode,
  input: readonly number[],
  pos: number,
  cont: (newPos: number) => boolean,
): boolean {
  return matchPieces(seq.pieces, 0, input, pos, cont);
}

function matchPieces(
  pieces: readonly Piece[],
  i: number,
  input: readonly number[],
  pos: number,
  cont: (newPos: number) => boolean,
): boolean {
  if (i >= pieces.length) return cont(pos);
  return matchPiece(pieces[i], input, pos, (p) => matchPieces(pieces, i + 1, input, p, cont));
}

function matchPiece(
  piece: Piece,
  input: readonly number[],
  pos: number,
  cont: (newPos: number) => boolean,
): boolean {
  const { atom, quant } = piece;
  if (quant === null) {
    return matchAtomCont(atom, input, pos, cont);
  }

  const { min, max } = quant;

  // Group atoms need continuation-based matching (multiple branch end positions).
  if (atom.kind === "group") {
    const attempt = (p: number, count: number): boolean => {
      if (count < max) {
        const consumed = matchAtomCont(atom, input, p, (end) => {
          // Guard: if atom matched empty (no progress), don't recurse deeper.
          if (end === p) return false;
          return attempt(end, count + 1);
        });
        if (consumed) return true;
      }
      return count >= min && cont(p);
    };
    return attempt(pos, 0);
  }

  // Single-character atoms (char or class): iterative greedy with backtracking.
  const positions: number[] = [pos];
  let p = pos;
  let count = 0;
  while (count < max && p < input.length) {
    const ok =
      atom.kind === "char"
        ? input[p] === atom.cp
        : matchMatcher(atom.matcher, input[p]);
    if (!ok) break;
    p++;
    count++;
    positions.push(p);
  }
  for (let c = count; c >= min; c--) {
    if (cont(positions[c])) return true;
  }
  return false;
}

/**
 * Match an atom and call `cont` with the new position on success.
 * Returns true if cont accepts the new position.
 */
function matchAtomCont(
  atom: Atom,
  input: readonly number[],
  pos: number,
  cont: (newPos: number) => boolean,
): boolean {
  switch (atom.kind) {
    case "char":
      return pos < input.length && input[pos] === atom.cp && cont(pos + 1);
    case "class":
      return pos < input.length && matchMatcher(atom.matcher, input[pos]) && cont(pos + 1);
    case "group":
      return matchNode(atom.node, input, pos, cont);
  }
}

/**
 * Top-level match: full-string semantics — the entire input must be consumed.
 */
function fullMatch(node: AltNode, input: readonly number[]): boolean {
  return matchNode(node, input, 0, (p) => p === input.length);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A compiled XSD regular expression.
 */
export interface XsdRegex {
  readonly source: string;
  /**
   * Returns `true` if `value` is completely matched by this regex
   * (full-string semantics; XSD regex is always anchored).
   */
  matches(value: string): boolean;
}

/**
 * Compile an XSD regex pattern string into an `XsdRegex`.
 *
 * @throws XsdRegexError if the pattern does not conform to the
 *   XSD 1.0 Part 2 Appendix E grammar.
 */
export function compileXsdRegex(pattern: string): XsdRegex {
  const parser = new RegexParser(pattern);
  const node = parser.parse();
  return {
    source: pattern,
    matches(value: string): boolean {
      return fullMatch(node, toCodePoints(value));
    },
  };
}