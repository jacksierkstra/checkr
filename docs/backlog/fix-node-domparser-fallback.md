# fix-node-domparser-fallback: Node runtime lacks a DOMParser fallback

| Field    | Value                               |
|----------|-------------------------------------|
| Type     | bug                                 |
| Priority | high                                |
| Status   | done                                |

## Problem
`XMLParserImpl` assumes a global `DOMParser` exists. That works in browsers and jsdom, but plain Node.js consumers can hit `ReferenceError: DOMParser is not defined` during XML/XSD parsing.

## Acceptance Criteria
- `Checkr.validate()` works in a plain Node.js runtime without requiring the consumer to inject a DOM implementation.
- Malformed XML/XSD still returns `PARSE_ERROR`.
- A regression test covers the Node fallback path.

## Implementation Hints
1. Use a browser-native `DOMParser` when present.
2. Fall back to a Node-compatible XML DOM parser when the global is missing.
3. Keep the public API unchanged.
