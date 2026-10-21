import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The app's own wording for the e2e specs: the same JSON dictionaries the browser loads (`core/i18n/*.json` plus the lazy tutoring
 * pairs), merged and read by key, so a test asks for "the Thai text of `tutoring.booking.reserveFree`" instead of copying a sentence
 * that a copy edit would silently break. Only where a spec proves that the visible language really changed does it name a literal.
 */
export type Locale = 'th' | 'en';

const SOURCES = [
  (l: Locale) => `src/app/core/i18n/${l}.json`,
  (l: Locale) => `src/app/features/tutoring/i18n/tutoring-shared.${l}.json`,
  (l: Locale) => `src/app/features/tutoring/i18n/tutoring-public.${l}.json`,
  (l: Locale) => `src/app/features/tutoring/i18n/tutoring-learner.${l}.json`,
  (l: Locale) => `src/app/features/tutoring/i18n/tutoring-tutor.${l}.json`,
  (l: Locale) => `src/app/features/tutoring/admin/i18n/admin-tutoring.${l}.json`,
];

interface Tree {
  [key: string]: Tree | string;
}

const cache = new Map<Locale, Tree>();

function merge(into: Tree, from: Tree): void {
  for (const [key, value] of Object.entries(from)) {
    const existing = into[key];
    if (typeof value === 'object' && typeof existing === 'object') {
      merge(existing, value);
    } else {
      into[key] = value;
    }
  }
}

function dictionary(locale: Locale): Tree {
  let tree = cache.get(locale);
  if (tree === undefined) {
    tree = {};
    for (const source of SOURCES) {
      merge(tree, JSON.parse(readFileSync(join(process.cwd(), source(locale)), 'utf8')) as Tree);
    }
    cache.set(locale, tree);
  }
  return tree;
}

/** The text of `key` in `locale`, with `{{name}}` placeholders filled. A key that does not exist is a test bug, so it throws. */
export function text(locale: Locale, key: string, params: Readonly<Record<string, string | number>> = {}): string {
  let node: Tree | string | undefined = dictionary(locale);
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') {
    throw new Error(`No ${locale} text for "${key}"`);
  }
  return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(params[name] ?? `{{${name}}}`));
}

/** Thai (the app's default language) shorthand. */
export const th = (key: string, params?: Readonly<Record<string, string | number>>): string => text('th', key, params);
export const en = (key: string, params?: Readonly<Record<string, string | number>>): string => text('en', key, params);
