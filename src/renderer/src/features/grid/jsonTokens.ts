/** One piece of pretty-printed JSON, classified for colouring. */
export interface JsonToken {
  text: string;
  kind: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'space';
}

// A string (optionally followed by a colon, which makes it a key), a literal, a number,
// or structural punctuation. Anything unmatched between hits is whitespace.
const TOKEN = /"(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]/g;

/**
 * Splits `JSON.stringify(value, null, 2)` output into coloured tokens.
 *
 * Tokenising the rendered text rather than re-walking the value keeps the exact pretty-print
 * layout (indentation, commas, key order) that the reader is looking at.
 */
export function tokenizeJson(text: string): JsonToken[] {
  const out: JsonToken[] = [];
  let last = 0;
  for (let m = TOKEN.exec(text); m !== null; m = TOKEN.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: 'space' });
    const raw = m[0];
    if (raw.startsWith('"')) {
      if (m[1] !== undefined) {
        // `"name":` — split so the colon is punctuation, not part of the key.
        const colonAt = raw.lastIndexOf(':');
        out.push({ text: raw.slice(0, colonAt).trimEnd(), kind: 'key' });
        const gap = raw.slice(colonAt).length - 1;
        if (gap > 0) out.push({ text: ' '.repeat(gap), kind: 'space' });
        out.push({ text: ':', kind: 'punct' });
      } else {
        out.push({ text: raw, kind: 'string' });
      }
    } else if (raw === 'true' || raw === 'false') out.push({ text: raw, kind: 'boolean' });
    else if (raw === 'null') out.push({ text: raw, kind: 'null' });
    else if (/^[-\d]/.test(raw)) out.push({ text: raw, kind: 'number' });
    else out.push({ text: raw, kind: 'punct' });
    last = m.index + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'space' });
  return out;
}

/** The quoted contents of a string token, or null when it is not a string. */
export function stringTokenValue(t: JsonToken): string | null {
  if (t.kind !== 'string') return null;
  try {
    return JSON.parse(t.text) as string;
  } catch {
    return null;
  }
}
