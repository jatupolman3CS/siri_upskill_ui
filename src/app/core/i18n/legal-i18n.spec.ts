import { describe, expect, it } from 'vitest';

import en from './en.json';
import th from './th.json';

/** Flattens a dictionary subtree into `dot.path -> string` entries. */
function flatten(node: unknown, prefix: string, out: Map<string, string>): Map<string, string> {
  if (typeof node === 'string') {
    out.set(prefix, node);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (match) => match[1]).sort();
}

describe('FAQ / contact / legal copy (th.json + en.json)', () => {
  const namespaces = ['faq', 'contact', 'legal'] as const;

  for (const namespace of namespaces) {
    describe(namespace, () => {
      const thEntries = flatten(th[namespace], namespace, new Map());
      const enEntries = flatten(en[namespace], namespace, new Map());

      it('has exactly the same keys in Thai and English', () => {
        expect([...thEntries.keys()].sort()).toEqual([...enEntries.keys()].sort());
      });

      it('has no empty strings in either language', () => {
        for (const [key, value] of [...thEntries, ...enEntries]) {
          expect(value.trim().length, `${key} is empty`).toBeGreaterThan(0);
        }
      });

      it('uses the same {{placeholders}} in both languages', () => {
        for (const [key, value] of thEntries) {
          expect(placeholders(enEntries.get(key) ?? ''), key).toEqual(placeholders(value));
        }
      });

      it('has no markup or emoji inside the strings (the templates render plain text)', () => {
        for (const [key, value] of [...thEntries, ...enEntries]) {
          expect(value, `${key} contains markup`).not.toMatch(/<[a-z/][^>]*>/i);
          expect(value, `${key} contains an emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
        }
      });
    });
  }

  it('keeps the thing the FAQ page iterates over complete: every question has both a question and an answer', () => {
    const items = th.faq.items as Record<string, { q?: string; a?: string }>;
    expect(Object.keys(items).length).toBe(12);
    for (const [id, item] of Object.entries(items)) {
      expect(item.q, `${id}.q`).toBeTruthy();
      expect(item.a, `${id}.a`).toBeTruthy();
    }
  });
});
