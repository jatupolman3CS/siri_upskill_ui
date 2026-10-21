/// <reference types="node" />
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ResolveFn, Route } from '@angular/router';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import baseEn from '../../../core/i18n/en.json';
import baseTh from '../../../core/i18n/th.json';
import { routes } from '../../../app.routes';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ADMIN_TUTORING_ROUTES } from '../admin/admin-tutoring.routes';
import { TUTOR_ROUTES } from '../tutor/tutor.routes';
import { loadLearnerTutoringDictionary, loadPublicTutoringDictionary, loadTutorTutoringDictionary } from './tutoring-dictionaries';

/**
 * The tutor marketplace's texts are lazy dictionaries, one per audience (see `tutoring-dictionaries.ts`). Three things must never silently
 * break, and a missing text only shows up as a raw key on a screen, so this spec checks them all:
 *  1. every dictionary pair is a faithful pair (same keys, same `{{placeholders}}`, no Thai in English, nothing empty), and a text lives in
 *     exactly one file - base or lazy - so the load order can never change what a screen says;
 *  2. each audience's route resolver really registers its pair (and the shared one) before the first page renders - on the server too;
 *  3. every text a screen can reach (through the files its code imports) is in a dictionary that audience's resolver loads.
 */

const APP_ROOT = join(process.cwd(), 'src', 'app');
const TUTORING_ROOT = join(APP_ROOT, 'features', 'tutoring');

type Flat = ReadonlyMap<string, string>;

function flatten(node: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof node === 'string') {
    out.set(prefix, node);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flatten(value, prefix === '' ? key : `${prefix}.${key}`, out);
    }
  }
  return out;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const holes = (text: string): string[] => Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (match) => match[1]).sort();
const THAI = /[฀-๿]/;

// --- the dictionaries ---------------------------------------------------------------------------------------------------------

/** Every lazy pair (`<name>.th.json` + `<name>.en.json` in an `i18n` folder anywhere under features/tutoring), found on disk so a new one cannot be forgotten. */
const PAIRS = walk(TUTORING_ROOT)
  .filter((file) => file.endsWith('.th.json') && file.split(sep).includes('i18n'))
  .map((thFile) => {
    const enFile = thFile.replace(/\.th\.json$/, '.en.json');
    const name = relative(TUTORING_ROOT, thFile).split(sep).join('/').replace(/\.th\.json$/, '');
    return { name, th: flatten(readJson(thFile)), en: existsSync(enFile) ? flatten(readJson(enFile)) : null };
  });
const pair = (name: string): { readonly th: Flat; readonly en: Flat } => {
  const found = PAIRS.find((entry) => entry.name === name);
  if (found === undefined || found.en === null) {
    throw new Error(`missing dictionary pair ${name}`);
  }
  return { th: found.th, en: found.en };
};

const BASE_TH = flatten(baseTh);
const BASE_EN = flatten(baseEn);

describe('tutoring dictionaries: pairs and ownership', () => {
  it('finds the five lazy pairs (shared, public, learner, tutor and the administrator one)', () => {
    expect(PAIRS.map((entry) => entry.name).sort()).toEqual([
      'admin/i18n/admin-tutoring',
      'i18n/tutoring-learner',
      'i18n/tutoring-public',
      'i18n/tutoring-shared',
      'i18n/tutoring-tutor',
    ]);
    expect(PAIRS.every((entry) => entry.en !== null)).toBe(true);
  });

  it.each(PAIRS.map((entry) => entry.name))('%s: Thai and English have the same keys, the same {{placeholders}}, nothing empty and no Thai in English', (name) => {
    const { th, en } = pair(name);
    expect([...th.keys()].filter((key) => !en.has(key))).toEqual([]);
    expect([...en.keys()].filter((key) => !th.has(key))).toEqual([]);
    expect([...th].filter(([key, text]) => JSON.stringify(holes(text)) !== JSON.stringify(holes(en.get(key) ?? ''))).map(([key]) => key)).toEqual([]);
    expect([...th, ...en].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([]);
    expect([...en].filter(([, text]) => THAI.test(text)).map(([key]) => key)).toEqual([]);
  });

  it('keeps every text in exactly one file: a key is never defined twice, in the base dictionaries or across the lazy ones', () => {
    for (const language of ['th', 'en'] as const) {
      const owners = new Map<string, string[]>();
      const add = (key: string, owner: string): void => void owners.set(key, [...(owners.get(key) ?? []), owner]);
      for (const key of (language === 'th' ? BASE_TH : BASE_EN).keys()) {
        add(key, 'base');
      }
      for (const entry of PAIRS) {
        for (const key of (language === 'th' ? entry.th : entry.en ?? new Map<string, string>()).keys()) {
          add(key, entry.name);
        }
      }
      expect([...owners].filter(([, where]) => where.length > 1).map(([key, where]) => `${key}: ${where.join(', ')}`)).toEqual([]);
    }
  });

  it('keeps in the base dictionaries only the three tutoring labels the always-loaded layouts render', () => {
    const inBase = [...BASE_TH.keys()].filter((key) => key.startsWith('tutoring.')).sort();
    expect(inBase).toEqual(['tutoring.learner.my.nav', 'tutoring.learner.nav', 'tutoring.tutor.nav.label']);
    expect([...BASE_EN.keys()].filter((key) => key.startsWith('tutoring.')).sort()).toEqual(inBase);
  });
});

// --- the resolvers ------------------------------------------------------------------------------------------------------------

describe('tutoring dictionaries: route resolvers', () => {
  const SHARED_SAMPLE = 'tutoring.errors.generic';
  const SAMPLES = {
    public: 'tutoring.public.search.heading' /* shared on purpose (the booking page uses it too) */,
    publicOnly: [...pair('i18n/tutoring-public').en.keys()][0],
    learnerOnly: [...pair('i18n/tutoring-learner').en.keys()][0],
    tutorOnly: [...pair('i18n/tutoring-tutor').en.keys()][0],
  };

  function run(resolver: ResolveFn<boolean>, platform: 'browser' | 'server' = 'browser'): Promise<boolean> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return Promise.resolve(TestBed.runInInjectionContext(() => resolver({} as never, {} as never))) as Promise<boolean>;
  }

  const t = (key: string, locale: 'th' | 'en'): string => {
    const translation = TestBed.inject(TranslationService);
    translation.setLocale(locale);
    return translation.t(key);
  };

  it('leaves every tutoring text as its bare key until a resolver has run (so the specs below prove the resolver, not the base dictionary)', () => {
    TestBed.resetTestingModule();
    for (const key of [SHARED_SAMPLE, SAMPLES.publicOnly, SAMPLES.learnerOnly, SAMPLES.tutorOnly]) {
      expect(t(key, 'en')).toBe(key);
    }
  });

  it('public: registers the shared texts and the public ones - and only those - in both languages', async () => {
    await expect(run(loadPublicTutoringDictionary)).resolves.toBe(true);
    expect(t(SHARED_SAMPLE, 'en')).not.toBe(SHARED_SAMPLE);
    expect(t(SHARED_SAMPLE, 'th')).not.toBe(SHARED_SAMPLE);
    expect(t(SAMPLES.publicOnly, 'en')).not.toBe(SAMPLES.publicOnly);
    expect(t(SAMPLES.publicOnly, 'th')).not.toBe(SAMPLES.publicOnly);
    expect(t(SAMPLES.learnerOnly, 'en')).toBe(SAMPLES.learnerOnly);
    expect(t(SAMPLES.tutorOnly, 'en')).toBe(SAMPLES.tutorOnly);
  });

  it('public: works on the server (the two public pages are server-rendered, so the resolver runs there before the page renders)', async () => {
    await expect(run(loadPublicTutoringDictionary, 'server')).resolves.toBe(true);
    expect(t('tutoring.public.search.heading', 'th')).not.toBe('tutoring.public.search.heading');
    expect(t(SAMPLES.publicOnly, 'th')).not.toBe(SAMPLES.publicOnly);
    expect(THAI.test(t(SAMPLES.publicOnly, 'th'))).toBe(true);
  });

  it('learner: registers the shared texts and the learner ones - and only those', async () => {
    await expect(run(loadLearnerTutoringDictionary)).resolves.toBe(true);
    expect(t(SHARED_SAMPLE, 'en')).not.toBe(SHARED_SAMPLE);
    expect(t(SAMPLES.learnerOnly, 'en')).not.toBe(SAMPLES.learnerOnly);
    expect(t(SAMPLES.learnerOnly, 'th')).not.toBe(SAMPLES.learnerOnly);
    expect(t(SAMPLES.publicOnly, 'en')).toBe(SAMPLES.publicOnly);
    expect(t(SAMPLES.tutorOnly, 'en')).toBe(SAMPLES.tutorOnly);
  });

  it('tutor portal: registers the shared texts and the tutor ones - and only those', async () => {
    await expect(run(loadTutorTutoringDictionary)).resolves.toBe(true);
    expect(t(SHARED_SAMPLE, 'en')).not.toBe(SHARED_SAMPLE);
    expect(t(SAMPLES.tutorOnly, 'en')).not.toBe(SAMPLES.tutorOnly);
    expect(t(SAMPLES.tutorOnly, 'th')).not.toBe(SAMPLES.tutorOnly);
    expect(t(SAMPLES.learnerOnly, 'en')).toBe(SAMPLES.learnerOnly);
  });

  it('is idempotent: a repeat visit registers nothing twice and changes no text', async () => {
    await run(loadLearnerTutoringDictionary);
    const before = t(SAMPLES.learnerOnly, 'en');
    await Promise.resolve(TestBed.runInInjectionContext(() => loadLearnerTutoringDictionary({} as never, {} as never)));
    expect(t(SAMPLES.learnerOnly, 'en')).toBe(before);
  });

  it('admin: the administrator resolver loads the shared texts too (enum labels, validation messages)', async () => {
    const wrapper = ADMIN_TUTORING_ROUTES[0];
    TestBed.resetTestingModule();
    await TestBed.runInInjectionContext(() => (wrapper.resolve!['dictionary'] as ResolveFn<boolean>)({} as never, {} as never));
    expect(t(SHARED_SAMPLE, 'en')).not.toBe(SHARED_SAMPLE);
    expect(t('tutoring.admin.kyc.heading', 'en')).not.toBe('tutoring.admin.kyc.heading');
  });
});

describe('tutoring dictionaries: route wiring', () => {
  const find = (list: readonly Route[], path: string, parent = ''): Route | undefined => {
    for (const route of list) {
      const full = [parent, route.path ?? ''].filter((part) => part !== '').join('/');
      if (full === path) {
        return route;
      }
      const inChildren = route.children ? find(route.children, path, full) : undefined;
      if (inChildren) {
        return inChildren;
      }
    }
    return undefined;
  };

  it.each(['tutors', 'tutors/:slug'])('%s (server-rendered) loads the public dictionary before it renders', (path) => {
    expect(find(routes, path)?.resolve?.['dictionary']).toBe(loadPublicTutoringDictionary);
  });

  it.each([
    'tutors/:slug/book',
    'tutors/:slug/packages/:packageId',
    'tutoring/checkout/:bookingId',
    'tutoring/checkout/package/:purchaseId',
    'my-tutoring/packages',
    'my-tutoring/packages/:purchaseId',
    'tutoring/sessions/:sessionId/join',
    'my-tutoring',
    'my-tutoring/bookings/:bookingId',
    'my-tutoring/disputes/:disputeId',
    'account/learner-profiles',
  ])('%s loads the learner dictionary before it renders', (path) => {
    expect(find(routes, path)?.resolve?.['dictionary']).toBe(loadLearnerTutoringDictionary);
  });

  it('wraps the whole Tutor Portal in one route that loads the tutor dictionary, so no page of it can render a raw key', () => {
    expect(TUTOR_ROUTES).toHaveLength(1);
    expect(TUTOR_ROUTES[0].path).toBe('');
    expect(TUTOR_ROUTES[0].resolve?.['dictionary']).toBe(loadTutorTutoringDictionary);
    expect(TUTOR_ROUTES[0].children?.length).toBeGreaterThan(5);
  });
});

// --- every screen only uses texts its resolver loads --------------------------------------------------------------------------

const GROUPS = 'errors|enums|slots|public|tutor|kyc|learner|booking|checkout|join|review|dispute';
/**
 * API `reason` codes that look like a text key: no underscore, and used as a value (`reason === 'tutoring.kyc.disabled'`), not only as an object key.
 * Each is checked below to NOT be a text, so a real key can never hide in this list.
 */
const REASON_CODES: ReadonlySet<string> = new Set(['tutoring.kyc.disabled']);

/**
 * `'tutoring.x.y'` is a text; `'tutoring.x.y.' + z` and a template `tutoring.x.y.${z}` name a family of texts (a prefix). The API's `reason` codes look
 * alike and must not match: those with an underscore (`tutoring.kyc.file_rejected`) fail the segment rule, and those without one
 * (`tutoring.kyc.disabled`) only ever appear as an object key (`'tutoring.kyc.disabled': '...'`), which the `(?!\s*:)` lookahead skips.
 */
const KEY_PATTERN = new RegExp(`(['"\`])(tutoring\\.(?:${GROUPS})(?:\\.[A-Za-z0-9]+)*)(\\.?)(?=\\1(?!\\s*:)|\\$\\{)`, 'g');

function stripComments(text: string, isHtml: boolean): string {
  return isHtml
    ? text.replace(/<!--[\s\S]*?-->/g, '')
    : text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/(?<=[;,{)\s])\/\/[^\n'"`]*$/gm, '');
}

interface Reference {
  readonly key: string;
  readonly prefix: boolean;
  readonly file: string;
}

function referencesIn(file: string): Reference[] {
  const text = stripComments(readFileSync(file, 'utf8'), file.endsWith('.html'));
  return Array.from(text.matchAll(KEY_PATTERN), (match) => ({ key: match[2], prefix: match[3] === '.', file: relative(APP_ROOT, file).split(sep).join('/') })).filter(
    (reference) => reference.prefix || !REASON_CODES.has(reference.key),
  );
}

const isSource = (file: string): boolean =>
  (file.endsWith('.ts') || file.endsWith('.html')) && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts') && !file.split(sep).includes('testing');

/** The files `entry` pulls in through relative `import` / `export ... from` / `import()` inside the tutoring feature, plus the template of each component. */
function reachableFrom(entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    if (!file.endsWith('.ts')) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const targets = [
      ...Array.from(text.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']*)'/g), (match) => match[1]),
      ...Array.from(text.matchAll(/templateUrl:\s*'(\.\/[^']*)'/g), (match) => match[1]),
    ];
    for (const target of targets) {
      const base = resolve(dirname(file), target);
      const candidates = [base, `${base}.ts`, join(base, 'index.ts')];
      const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile() && isSource(candidate));
      if (found !== undefined && found.startsWith(TUTORING_ROOT)) {
        queue.push(found);
      }
    }
  }
  return seen;
}

const AUDIENCE_DICTIONARIES: Readonly<Record<string, readonly string[]>> = {
  public: ['i18n/tutoring-shared', 'i18n/tutoring-public'],
  learner: ['i18n/tutoring-shared', 'i18n/tutoring-learner'],
  tutor: ['i18n/tutoring-shared', 'i18n/tutoring-tutor'],
  admin: ['i18n/tutoring-shared', 'admin/i18n/admin-tutoring'],
};

describe('tutoring dictionaries: each audience only uses texts its resolver loads', () => {
  const everything = new Map<string, string>(); // every text, by key, with the file that owns it (th only; parity is checked above)
  for (const key of BASE_TH.keys()) {
    everything.set(key, 'base');
  }
  for (const entry of PAIRS) {
    for (const key of entry.th.keys()) {
      everything.set(key, entry.name);
    }
  }

  it.each(Object.keys(AUDIENCE_DICTIONARIES))('%s: every literal key and every dynamic family its code can reach is in the base or in a dictionary it loads', (audience) => {
    const available = new Set(['base', ...AUDIENCE_DICTIONARIES[audience]]);
    const entries = walk(join(TUTORING_ROOT, audience)).filter(isSource);
    expect(entries.length).toBeGreaterThan(5);
    const problems = new Set<string>();

    for (const file of reachableFrom(entries)) {
      for (const reference of referencesIn(file)) {
        if (reference.prefix) {
          const family = [...everything].filter(([key]) => key.startsWith(`${reference.key}.`));
          const missing = family.filter(([, owner]) => !available.has(owner));
          if (family.length === 0) {
            problems.add(`${reference.file}  ${reference.key}.*  (no such texts)`);
          } else if (missing.length > 0) {
            problems.add(`${reference.file}  ${reference.key}.*  (${missing.length} of ${family.length} texts are in ${[...new Set(missing.map(([, owner]) => owner))].join(', ')})`);
          }
        } else {
          const owner = everything.get(reference.key);
          const isGroup = [...everything.keys()].some((key) => key.startsWith(`${reference.key}.`));
          if (owner === undefined && !isGroup) {
            problems.add(`${reference.file}  ${reference.key}  (no such text)`);
          } else if (owner !== undefined && !available.has(owner)) {
            problems.add(`${reference.file}  ${reference.key}  (lives in ${owner})`);
          }
        }
      }
    }
    expect([...problems].sort()).toEqual([]);
  });

  it('keeps real texts out of the list of look-alike reason codes', () => {
    expect([...REASON_CODES].filter((code) => everything.has(code))).toEqual([]);
  });

  it('the always-loaded layouts and shells only use tutoring texts that stay in the base dictionaries', () => {
    const outside = walk(APP_ROOT).filter((file) => isSource(file) && !file.startsWith(TUTORING_ROOT));
    const problems = outside
      .flatMap((file) => referencesIn(file))
      .filter((reference) => !reference.prefix)
      .filter((reference) => everything.get(reference.key) !== 'base')
      .map((reference) => `${reference.file}  ${reference.key}`);
    expect(problems).toEqual([]);
  });
});
