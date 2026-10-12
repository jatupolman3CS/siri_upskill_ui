/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from './core/i18n/en.json';
import th from './core/i18n/th.json';

/**
 * i18n guard. frontend.md: no user-facing text in a template or component — it lives in th.json / en.json and is
 * reached through `{{ 'key' | translate }}` or `TranslationService.t('key')`. This spec fails the build when
 *  - a template (or a non-spec `.ts` under features/shared/layouts/core) contains Thai text outside a comment,
 *  - a template contains an emoji (icons come from `@ng-icons/phosphor-icons`),
 *  - the two dictionaries drift apart (missing key, empty value, different `{{placeholders}}`, Thai left in `en`),
 *  - a template or component asks for a static key that does not exist.
 */

const APP_ROOT = join(process.cwd(), 'src', 'app');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (file: string): string => relative(APP_ROOT, file).split(sep).join('/');
const ALL_FILES = walk(APP_ROOT);
const TEMPLATES = ALL_FILES.filter((f) => f.endsWith('.html'));
const COMPONENT_SOURCES = ALL_FILES.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

/** Blank out comments but keep line numbers. */
function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => '\n'.repeat(m.split('\n').length - 1));
}
function stripTsComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat(m.split('\n').length - 1))
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(?<=[;,{)\s])\/\/[^\n'"`]*$/gm, '');
}

// U+0E3F is the baht currency sign, not Thai script.
const THAI = /[\u0e00-\u0e3e\u0e40-\u0e7f]/;
// Pictographs only (the check mark U+2713, bullet and return arrow used as decoration are not pictographs).
const EMOJI = /\p{Extended_Pictographic}/u;

/** Files whose Thai is not user-facing text (regex character classes for Thai script handling). */
const THAI_TS_ALLOWLIST: readonly { readonly path: string; readonly reason: string }[] = [
  { path: 'core/auth/initials.util.ts', reason: 'regex of Thai leading vowels' },
  { path: 'features/blog/reading-time.pipe.ts', reason: 'regex of Thai base characters' },
];

function findLines(file: string, text: string, pattern: RegExp): string[] {
  return text
    .split('\n')
    .map((line, index) => (pattern.test(line) ? `${rel(file)}:${index + 1}  ${line.trim().slice(0, 110)}` : ''))
    .filter(Boolean);
}

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

const TH = flatten(th, '', new Map());
const EN = flatten(en, '', new Map());
const placeholders = (text: string): string[] => Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1]).sort();

describe('i18n guard: no hardcoded text in code', () => {
  it('finds the source tree (guards against a silently empty scan)', () => {
    expect(TEMPLATES.length).toBeGreaterThan(80);
    expect(COMPONENT_SOURCES.length).toBeGreaterThan(150);
  });

  it('has no Thai text in templates (use an i18n key)', () => {
    const hits = TEMPLATES.flatMap((f) => findLines(f, stripHtmlComments(readFileSync(f, 'utf8')), THAI));
    expect(hits).toEqual([]);
  });

  it('has no Thai string literals in components, services or pages (use TranslationService.t)', () => {
    const allowed = new Set(THAI_TS_ALLOWLIST.map((entry) => entry.path));
    const hits = COMPONENT_SOURCES.filter((f) => !allowed.has(rel(f))).flatMap((f) =>
      findLines(f, stripTsComments(readFileSync(f, 'utf8')), THAI),
    );
    expect(hits).toEqual([]);
  });

  it('has no emoji in templates (use a Phosphor icon with aria-hidden)', () => {
    const hits = TEMPLATES.flatMap((f) => findLines(f, stripHtmlComments(readFileSync(f, 'utf8')), EMOJI));
    expect(hits).toEqual([]);
  });
});

describe('i18n guard: dictionaries', () => {
  it('has exactly the same keys in Thai and English', () => {
    const missingInEn = [...TH.keys()].filter((k) => !EN.has(k));
    const missingInTh = [...EN.keys()].filter((k) => !TH.has(k));
    expect({ missingInEn, missingInTh }).toEqual({ missingInEn: [], missingInTh: [] });
  });

  it('has no empty strings', () => {
    const empty = [...TH, ...EN].filter(([, value]) => value.trim().length === 0).map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('uses the same {{placeholders}} in both languages', () => {
    const mismatched = [...TH]
      .filter(([key, value]) => JSON.stringify(placeholders(EN.get(key) ?? '')) !== JSON.stringify(placeholders(value)))
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('keeps Thai script out of the English dictionary (except the language names themselves)', () => {
    const allowed = new Set(['nav.languageThai']);
    const leaked = [...EN].filter(([key, value]) => THAI.test(value) && !allowed.has(key)).map(([key]) => key);
    expect(leaked).toEqual([]);
  });
});

describe('i18n guard: static keys exist', () => {
  const PIPE_KEY = /'([A-Za-z][\w]*(?:\.[\w]+)+)'\s*\|\s*translate/g;
  const SERVICE_KEY = /\.t\(\s*'([A-Za-z][\w]*(?:\.[\w]+)+)'/g;

  function missing(files: readonly string[], pattern: RegExp, strip: (text: string) => string): string[] {
    const out: string[] = [];
    for (const file of files) {
      const text = strip(readFileSync(file, 'utf8'));
      for (const match of text.matchAll(pattern)) {
        const key = match[1];
        if (!TH.has(key) || !EN.has(key)) {
          out.push(`${rel(file)}  ${key}`);
        }
      }
    }
    return out;
  }

  it('resolves every `\'key\' | translate` used in a template in both languages', () => {
    expect(missing(TEMPLATES, PIPE_KEY, stripHtmlComments)).toEqual([]);
  });

  it('resolves every `.t(\'key\')` used in a component or service in both languages', () => {
    expect(missing(COMPONENT_SOURCES, SERVICE_KEY, stripTsComments)).toEqual([]);
  });
});
