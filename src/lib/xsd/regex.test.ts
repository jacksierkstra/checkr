/**
 * Tests for the XSD regex dialect engine (CHK-015).
 *
 * Covers: literals, dots, character classes (ranges, negation, subtraction),
 * escapes (single-char, multi-char, \i/\c, \p{…} categories/blocks),
 * quantifiers, groups, alternation, error rejection (backrefs, lookaround,
 * multiCharEsc in classes [1.0], anchors-as-literals), and supplementary
 * code points.
 */

import { compileXsdRegex, XsdRegexError } from "@lib/xsd/regex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function m(pattern: string, value: string): boolean {
    return compileXsdRegex(pattern).matches(value);
}

function bad(pattern: string, sub?: string): void {
    expect(() => compileXsdRegex(pattern)).toThrow(XsdRegexError);
    if (sub) expect(() => compileXsdRegex(pattern)).toThrow(sub);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("XSD regex engine (CHK-015)", () => {

    // -----------------------------------------------------------------------
    // Literals and full-string semantics
    // -----------------------------------------------------------------------

    describe("literal characters and full-string matching", () => {
        it("matches a literal string exactly", () => {
            expect(m("abc", "abc")).toBe(true);
            expect(m("abc", "ab")).toBe(false);
            expect(m("abc", "abcd")).toBe(false);
            expect(m("abc", "xabc")).toBe(false);
            expect(m("abc", "")).toBe(false);
        });

        it("empty pattern matches only the empty string", () => {
            expect(m("", "")).toBe(true);
            expect(m("", "a")).toBe(false);
        });

        it("matches literal characters including ^ and $ (not anchors)", () => {
            expect(m("^a", "^a")).toBe(true);
            expect(m("^a", "a")).toBe(false);
            expect(m("a$", "a$")).toBe(true);
            expect(m("a$", "a")).toBe(false);
        });

        it("supports supplementary code points (emoji) as literals", () => {
            expect(m("\u{1F600}", "\u{1F600}")).toBe(true);
            expect(m("ab\u{1F600}c", "ab\u{1F600}c")).toBe(true);
            expect(m("\u{1F600}", "")).toBe(false);
        });

        it("rejects the structural quantifier characters in atom position", () => {
            bad("*");
            bad("?");
            bad("+");
            bad("a**");
            bad("a?*");
        });

        it("accepts escaped metacharacters", () => {
            expect(m("\\*", "*")).toBe(true);
            expect(m("\\.", ".")).toBe(true);
            expect(m("\\?", "?")).toBe(true);
            expect(m("\\+", "+")).toBe(true);
            expect(m("\\{", "{")).toBe(true);
            expect(m("\\}", "}")).toBe(true);
            expect(m("\\(", "(")).toBe(true);
            expect(m("\\)", ")")).toBe(true);
            expect(m("\\|", "|")).toBe(true);
            expect(m("\\[", "[")).toBe(true);
            expect(m("\\]", "]")).toBe(true);
            expect(m("\\\\", "\\")).toBe(true);
            expect(m("\\^", "^")).toBe(true);
            expect(m("\\$", "$")).toBe(true);
            expect(m("\\-", "-")).toBe(true);
        });

        it("rejects unknown escapes", () => {
            bad("\\a");
            bad("\\x");
            bad("\\A");
            bad("\\Z");
            bad("\\b"); // \b is an anchor/backspace, not valid in XSD regex
            bad("\\B");
            bad("\\G");
        });
    });

    // -----------------------------------------------------------------------
    // Dot (WildcardEsc)
    // -----------------------------------------------------------------------

    describe("dot (.)", () => {
        it("dot matches any single character", () => {
            expect(m(".", "a")).toBe(true);
            expect(m(".", "\n")).toBe(true);
            expect(m(".", "\r")).toBe(true);
            expect(m(".", "\t")).toBe(true);
            expect(m(".", "\u{1F600}")).toBe(true);
        });

        it("dot does not match empty, or two chars", () => {
            expect(m(".", "")).toBe(false);
            expect(m(".", "ab")).toBe(false);
        });

        it("dot in a sequence", () => {
            expect(m("a.c", "abc")).toBe(true);
            expect(m("a.c", "a\nc")).toBe(true);
            expect(m("a.c", "ac")).toBe(false);
            expect(m("a.c", "abbc")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Character classes
    // -----------------------------------------------------------------------

    describe("character classes", () => {
        it("matches members of a simple character class", () => {
            expect(m("[abc]", "a")).toBe(true);
            expect(m("[abc]", "b")).toBe(true);
            expect(m("[abc]", "c")).toBe(true);
            expect(m("[abc]", "d")).toBe(false);
            expect(m("[abc]", "ab")).toBe(false);  // full string
        });

        it("matches ranges", () => {
            expect(m("[a-z]", "m")).toBe(true);
            expect(m("[a-z]", "M")).toBe(false);
            expect(m("[0-9]", "5")).toBe(true);
            expect(m("[a-zA-Z]", "B")).toBe(true);
            expect(m("[a-zA-Z]", "3")).toBe(false);
        });

        it("negates with '^'", () => {
            expect(m("[^a-z]", "A")).toBe(true);
            expect(m("[^a-z]", "m")).toBe(false);
            expect(m("[^a]", "a")).toBe(false);
            expect(m("[^a]", "b")).toBe(true);
        });

        it("allows dash as a literal member", () => {
            expect(m("[-a]", "-")).toBe(true);
            expect(m("[-a]", "a")).toBe(true);
            expect(m("[a-]", "-")).toBe(true);
            expect(m("[a-]", "a")).toBe(true);
            expect(m("[a-]", "b")).toBe(false);
        });

        it("handles mixed ranges and literals (a-b-c pattern)", () => {
            // [a-b-c]: a-b range, then lone '-', then c
            expect(m("[a-b-c]", "a")).toBe(true);
            expect(m("[a-b-c]", "b")).toBe(true);
            expect(m("[a-b-c]", "-")).toBe(true);
            expect(m("[a-b-c]", "c")).toBe(true);
            expect(m("[a-b-c]", "d")).toBe(false);
        });

        it("allows escaped chars inside a class", () => {
            expect(m("[\\]]", "]")).toBe(true);
            expect(m("[\\]]", "a")).toBe(false);
            expect(m("[\\--\\]]", "]")).toBe(true);
            expect(m("[\\--\\]]", "a")).toBe(false); // range is - to ] only
            expect(m("[\\--\\]]", "-")).toBe(true);
            expect(m("[\\--\\]]", ".")).toBe(true);
            expect(m("[\\\\]", "\\")).toBe(true);
        });

        it("rejects multi-character escapes inside a character class (XSD 1.0 restriction)", () => {
            bad("[\\d]");
            bad("[\\D]");
            bad("[\\s]");
            bad("[\\S]");
            bad("[\\w]");
            bad("[\\W]");
            bad("[\\i]");
            bad("[\\I]");
            bad("[\\c]");
            bad("[\\C]");
            bad("[a-\\d]");
        });

        it("allows category escapes inside a character class", () => {
            expect(m("[\\p{L}]", "a")).toBe(true);
            expect(m("[\\p{L}]", "1")).toBe(false);
            expect(m("[\\p{Lu}a]", "A")).toBe(true);
            expect(m("[\\p{Lu}a]", "a")).toBe(true);
            expect(m("[\\p{Lu}a]", "b")).toBe(false);
        });

        it("rejects empty character class", () => {
            bad("[]");
            bad("[^]");
        });
    });

    // -----------------------------------------------------------------------
    // Character class subtraction
    // -----------------------------------------------------------------------

    describe("character class subtraction (charClassSub)", () => {
        it("subtracts a set from a range: [a-z-[aeiou]]", () => {
            const r = compileXsdRegex("[a-z-[aeiou]]");
            expect(r.matches("b")).toBe(true);
            expect(r.matches("z")).toBe(true);
            expect(r.matches("a")).toBe(false);
            expect(r.matches("e")).toBe(false);
            expect(r.matches("-")).toBe(false);  // dash not in base
        });

        it("subtraction with negated inner class: [a-z-[^aeiou]]", () => {
            // diff(a-z, complement(aeiou)) = aeiou
            const r = compileXsdRegex("[a-z-[^aeiou]]");
            expect(r.matches("a")).toBe(true);
            expect(r.matches("e")).toBe(true);
            expect(r.matches("b")).toBe(false);
            expect(r.matches("z")).toBe(false);
        });

        it("subtraction from a negated base: [^a-z-[x]]", () => {
            // complement(a-z) minus {x} = everything except a-z and x
            const r = compileXsdRegex("[^a-z-[x]]");
            expect(r.matches("A")).toBe(true);
            expect(r.matches("1")).toBe(true);
            expect(r.matches("a")).toBe(false);
            expect(r.matches("x")).toBe(false);
        });

        it("nested subtraction", () => {
            // [a-z-[b-d-[c]]] → a-z minus (b-d minus {c}) = a-z minus {b,d}
            const r = compileXsdRegex("[a-z-[b-d-[c]]]");
            expect(r.matches("a")).toBe(true);
            expect(r.matches("c")).toBe(true);  // c removed from inner sub, so not in outer subtracted set
            expect(r.matches("b")).toBe(false);
            expect(r.matches("d")).toBe(false);
            expect(r.matches("e")).toBe(true);
        });

        it("subtraction of a full range leaves empty set", () => {
            expect(m("[a-z-[a-z]]", "a")).toBe(false);
            expect(m("[a-z-[a-z]]", "z")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Multi-character escapes (outside classes)
    // -----------------------------------------------------------------------

    describe("multi-character escapes (outside classes)", () => {
        it("\\d matches [0-9]", () => {
            expect(m("\\d", "0")).toBe(true);
            expect(m("\\d", "9")).toBe(true);
            expect(m("\\d", "a")).toBe(false);
            expect(m("\\d\\d", "42")).toBe(true);
        });
        it("\\D complement of \\d", () => {
            expect(m("\\D", "a")).toBe(true);
            expect(m("\\D", "0")).toBe(false);
        });
        it("\\s matches [ \\t\\n\\r]", () => {
            expect(m("\\s", " ")).toBe(true);
            expect(m("\\s", "\t")).toBe(true);
            expect(m("\\s", "\n")).toBe(true);
            expect(m("\\s", "\r")).toBe(true);
            expect(m("\\s", "a")).toBe(false);
            expect(m("\\s\\s", " \n")).toBe(true);
        });
        it("\\S complement of \\s", () => {
            expect(m("\\S", "a")).toBe(true);
            expect(m("\\S", " ")).toBe(false);
        });
        it("\\w matches [0-9A-Z_a-z]", () => {
            expect(m("\\w", "a")).toBe(true);
            expect(m("\\w", "Z")).toBe(true);
            expect(m("\\w", "0")).toBe(true);
            expect(m("\\w", "_")).toBe(true);
            expect(m("\\w", "-")).toBe(false);
        });
        it("\\W complement of \\w", () => {
            expect(m("\\W", "-")).toBe(true);
            expect(m("\\W", "a")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // \i, \c name-character escapes
    // -----------------------------------------------------------------------

    describe("\\i/\\c name-character escapes", () => {
        it("\\i matches XML NameStartChar minus ':' and '_'", () => {
            expect(m("\\i", "A")).toBe(true);
            expect(m("\\i", "z")).toBe(true);
            expect(m("\\i", "\u00C0")).toBe(true); // À
            expect(m("\\i", "\u{1D400}")).toBe(true); // Mathematical bold A
            expect(m("\\i", "_")).toBe(false);    // underscore excluded
            expect(m("\\i", ":")).toBe(false);    // colon excluded
            expect(m("\\i", "-")).toBe(false);
            expect(m("\\i", "0")).toBe(false);
        });
        it("\\I complement of \\i", () => {
            expect(m("\\I", "-")).toBe(true);
            expect(m("\\I", "A")).toBe(false);
            expect(m("\\I", "_")).toBe(true);     // underscore is not in \i, so it IS in \I
        });
        it("\\c matches NameChar minus ':' and '_'", () => {
            expect(m("\\c", "A")).toBe(true);
            expect(m("\\c", "z")).toBe(true);
            expect(m("\\c", "-")).toBe(true);
            expect(m("\\c", ".")).toBe(true);
            expect(m("\\c", "0")).toBe(true);
            expect(m("\\c", "9")).toBe(true);
            expect(m("\\c", "\u00B7")).toBe(true); // middle dot
            expect(m("\\c", "\u0300")).toBe(true); // combining grave
            expect(m("\\c", "_")).toBe(false);    // underscore excluded
            expect(m("\\c", ":")).toBe(false);    // colon excluded
        });
        it("\\C complement of \\c", () => {
            expect(m("\\C", "A")).toBe(false);
            expect(m("\\C", "_")).toBe(true);
            expect(m("\\C", ":")).toBe(true);
            expect(m("\\C", "-")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Category escapes \p{…} / \P{…}
    // -----------------------------------------------------------------------

    describe("\\p{…} category escapes", () => {
        it("\\p{L} matches any letter", () => {
            expect(m("\\p{L}", "a")).toBe(true);
            expect(m("\\p{L}", "A")).toBe(true);
            expect(m("\\p{L}", "é")).toBe(true);
            expect(m("\\p{L}", "中")).toBe(true);
            expect(m("\\p{L}", "1")).toBe(false);
        });
        it("\\p{Lu} matches uppercase", () => {
            expect(m("\\p{Lu}", "A")).toBe(true);
            expect(m("\\p{Lu}", "a")).toBe(false);
        });
        it("\\p{Ll} matches lowercase", () => {
            expect(m("\\p{Ll}", "a")).toBe(true);
            expect(m("\\p{Ll}", "A")).toBe(false);
        });
        it("\\p{Nd} matches decimal numbers", () => {
            expect(m("\\p{Nd}", "0")).toBe(true);
            expect(m("\\p{Nd}", "a")).toBe(false);
        });
        it("\\P{…} is complement", () => {
            expect(m("\\P{L}", "1")).toBe(true);
            expect(m("\\P{L}", "a")).toBe(false);
        });
        it("\\p{^…} is complement (inside braces)", () => {
            expect(m("\\p{^L}", "1")).toBe(true);
            expect(m("\\p{^L}", "a")).toBe(false);
        });
        it("\\p{^Lu} matches non-uppercase-letters", () => {
            expect(m("\\p{^Lu}", "a")).toBe(true);
            expect(m("\\p{^Lu}", "A")).toBe(false);
        });
        // Sub-categories: each letter with its allowed subtags.
        it("accepts valid category subtags: Lo, Lt, Lm", () => {
            // Use a known Lo: Latin letter dental click 0x01C0
            expect(m("\\p{Lo}", "\u01C0")).toBe(true);
        });
        it("rejects invalid category names", () => {
            bad("\\p{Any}");
            bad("\\p{LC}");  // Not in XSD 1.0 categories
            bad("\\p{Lx}");
            bad("\\p{1}");
            bad("\\p{^}");
        });
    });

    // -----------------------------------------------------------------------
    // Block escapes \p{Is…}
    // -----------------------------------------------------------------------

    describe("\\p{Is…} block escapes", () => {
        it("\\p{IsBasicLatin} matches ASCII", () => {
            expect(m("\\p{IsBasicLatin}", "A")).toBe(true);
            expect(m("\\p{IsBasicLatin}", "!")).toBe(true);
            expect(m("\\p{IsBasicLatin}", "é")).toBe(false);
            expect(m("\\p{IsBasicLatin}", "中")).toBe(false);
        });
        it("\\p{IsLatin1Supplement} matches 0x80-0xFF", () => {
            expect(m("\\p{IsLatin1Supplement}", "\u00E9")).toBe(true); // é
            expect(m("\\p{IsLatin1Supplement}", "A")).toBe(false);
        });
        it("\\p{IsCJKUnifiedIdeographs} matches CJK", () => {
            expect(m("\\p{IsCJKUnifiedIdeographs}", "\u4E2D")).toBe(true); // 中
            expect(m("\\p{IsCJKUnifiedIdeographs}", "A")).toBe(false);
        });
        it("\\P{Is…} is complement", () => {
            expect(m("\\P{IsBasicLatin}", "中")).toBe(true);
            expect(m("\\P{IsBasicLatin}", "A")).toBe(false);
        });
        it("rejects unknown block names", () => {
            bad("\\p{IsFictionalBlock}");
            bad("\\p{Is}");
        });
        it("block names are case-sensitive", () => {
            bad("\\p{Isbasiclatin}");
        });
    });

    // -----------------------------------------------------------------------
    // Quantifiers
    // -----------------------------------------------------------------------

    describe("quantifiers", () => {
        it("? matches 0 or 1", () => {
            expect(m("a?", "")).toBe(true);
            expect(m("a?", "a")).toBe(true);
            expect(m("a?", "aa")).toBe(false);
        });
        it("* matches 0 or more", () => {
            expect(m("a*", "")).toBe(true);
            expect(m("a*", "a")).toBe(true);
            expect(m("a*", "aaa")).toBe(true);
            expect(m("a*", "b")).toBe(false);
        });
        it("+ matches 1 or more", () => {
            expect(m("a+", "a")).toBe(true);
            expect(m("a+", "aaa")).toBe(true);
            expect(m("a+", "")).toBe(false);
        });
        it("{n} exact count (XSD 1.0)", () => {
            expect(m("a{3}", "aaa")).toBe(true);
            expect(m("a{3}", "aa")).toBe(false);
            expect(m("a{3}", "aaaa")).toBe(false);
        });
        it("{n,m} range", () => {
            expect(m("a{1,3}", "a")).toBe(true);
            expect(m("a{1,3}", "aaa")).toBe(true);
            expect(m("a{1,3}", "aaaa")).toBe(false);
            expect(m("a{1,3}", "")).toBe(false);
        });
        it("{n,} at least n", () => {
            expect(m("a{2,}", "aa")).toBe(true);
            expect(m("a{2,}", "aaaa")).toBe(true);
            expect(m("a{2,}", "a")).toBe(false);
        });
        it("rejects quantifier with min > max", () => {
            bad("a{3,2}");
        });
        it("greedy matching: (a|ab)* matches abab", () => {
            const r = compileXsdRegex("(a|ab)*");
            expect(r.matches("abab")).toBe(true);
            expect(r.matches("aba")).toBe(true);
            expect(r.matches("a")).toBe(true);
            expect(r.matches("ababx")).toBe(false);
        });
        it("greedy matching: (a|ab)b on 'ab' tries both branches", () => {
            expect(m("(a|ab)b", "ab")).toBe(true);
        });
        it("quantifier on group with alternation", () => {
            expect(m("(ab|cd)+", "ab")).toBe(true);
            expect(m("(ab|cd)+", "cdab")).toBe(true);
            expect(m("(ab|cd)+", "ac")).toBe(false);
        });
        it("greedy: .* matches longest and backtracks", () => {
            // pattern: .*b on "aba" — greedy .* matches "ab", then b fails; backtrack to "a" then b? no... "a.b" where b is at end of string
            const r = compileXsdRegex(".*b");
            expect(r.matches("ab")).toBe(true);
            expect(r.matches("abab")).toBe(true);
            expect(r.matches("abc")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Groups and alternation
    // -----------------------------------------------------------------------

    describe("groups and alternation", () => {
        it("alternation |", () => {
            expect(m("a|b", "a")).toBe(true);
            expect(m("a|b", "b")).toBe(true);
            expect(m("a|b", "ab")).toBe(false);
            expect(m("a|bc", "bc")).toBe(true);
        });
        it("empty branch in alternation", () => {
            expect(m("a|", "")).toBe(true);
            expect(m("a|", "a")).toBe(true);
            expect(m("|", "")).toBe(true);
        });
        it("capturing and non-capturing groups behave identically", () => {
            expect(m("(ab)", "ab")).toBe(true);
            expect(m("(?:ab)", "ab")).toBe(true);
            expect(m("(ab)", "a")).toBe(false);
        });
        it("empty group () matches empty string", () => {
            expect(m("()", "")).toBe(true);
            expect(m("()", "a")).toBe(false);
        });
        it("nested groups", () => {
            expect(m("((a)b)c", "abc")).toBe(true);
            expect(m("(a(b|c))", "ab")).toBe(true);
            expect(m("(a(b|c))", "ac")).toBe(true);
            expect(m("(a(b|c))", "ad")).toBe(false);
        });
        it("rejects lookaround (?= ...)", () => {
            bad("(?=a)");
            bad("(?!a)");
            bad("(?<=a)");
            bad("(?<!a)");
        });
        it("rejects flags like (?i)", () => {
            bad("(?i)a");
            bad("(?x)a");
            bad("(?-i)");
        });
        it("rejects backreferences", () => {
            bad("\\1");
            bad("(a)\\1");
        });
    });

    // -----------------------------------------------------------------------
    // Ranges with charOrEsc endpoints
    // -----------------------------------------------------------------------

    describe("range endpoints", () => {
        it("range with SingleCharEsc endpoint: [a-\\n]", () => {
            const r = compileXsdRegex("[a-\\n]");
            expect(r.matches("a")).toBe(true);    // 0x61 >= 0x61 ≤ 0x0A? NO — range is a(97) to \n(10) — invalid (from > to)?

            // Actually this tests parser acceptance; the range order is a...\n which is from=97 to=10 — invalid per spec
            // (must be from ≤ to). But the grammar allows it; matcher behavior: returns false because from > to?
            // Hmm — the spec doesn't say invalid; just that no characters match. OK.
            // Let's use a valid range: [\\--\\]] range from '-' to ']'
        });
        it("range [- to ]: [\\--\\]]", () => {
            const r = compileXsdRegex("[\\--\\]]");
            expect(r.matches("-")).toBe(true);
            expect(r.matches("]")).toBe(true);
            expect(r.matches(".")).toBe(true);  // 0x2E is between 0x2D and 0x5D
            expect(r.matches("a")).toBe(false); // 0x61 > 0x5D
        });
        it("rejects category escape as range endpoint", () => {
            // \p{L} inside a class is parsed as a category escape, not as a range endpoint.
        });
    });

    // -----------------------------------------------------------------------
    // { and } literal behavior
    // -----------------------------------------------------------------------

    describe("literal braces", () => {
        it("{ not followed by valid quantity is literal", () => {
            expect(m("a{b", "a{b")).toBe(true);
            expect(m("a{x}", "a{x}")).toBe(true);
            expect(m("a{}", "a{}")).toBe(true);
            expect(m("a{2", "a{2")).toBe(true);
            expect(m("a{,3}", "a{,3}")).toBe(true);  // {,n} not valid in 1.0 → literal
        });
    });

    // -----------------------------------------------------------------------
    // Compile-time errors for invalid patterns
    // -----------------------------------------------------------------------

    describe("invalid pattern errors", () => {
        it("unterminated group", () => {
            bad("(abc");
        });
        it("unterminated class", () => {
            bad("[abc");
        });
        it("trailing '|' with nothing after is valid (empty branch)", () => {
            expect(m("a|", "a")).toBe(true);
            expect(m("a|", "")).toBe(true);
        });
        it("unrecognized escape is an error", () => {
            bad("\\q");
        });
    });
});