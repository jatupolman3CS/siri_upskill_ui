import { Injectable, computed, signal } from '@angular/core';

import en from './en.json';
import th from './th.json';

export type Locale = 'th' | 'en';

type TranslationDictionary = typeof th;

/**
 * A feature's own text, per language, added at run time by {@link TranslationService.extend}. The base dictionaries above are
 * bundled into the initial download of every visitor; a feature that only a small audience opens (the administrator screens) keeps
 * its text in a lazy-loaded pair of files instead and registers it when its routes load. Keys are full paths, exactly as in the
 * base dictionaries (`tutoring.admin.kyc.heading`), and the two languages must have the same keys.
 */
export interface DictionaryExtension {
  readonly th: object;
  readonly en: object;
}

const DICTIONARIES: Record<Locale, TranslationDictionary> = { th, en };
const DEFAULT_LOCALE: Locale = 'th';

/**
 * Lightweight runtime i18n for TH/EN.
 *
 * INTENTIONAL DESIGN CHOICE — not an oversight: this project does NOT use
 * Angular's built-in `@angular/localize` compile-time i18n. `@angular/localize`
 * bakes exactly one locale into a given build (you ship a separate bundle
 * per locale, chosen at build/deploy time). SIRI UpSkill needs learners and
 * instructors to switch between Thai and English at runtime, in a single
 * build/deploy, without a page reload hitting a different bundle — so a
 * small signal-based dictionary service is the deliberate choice here.
 *
 * Usage: inject `TranslationService` and call `t('common.loading')`, or use
 * the `translate` pipe in templates: `{{ 'common.loading' | translate }}`.
 * Per frontend.md, no user-facing Thai/English string may be hardcoded
 * directly in a component template or .ts file — it must go through a key
 * in th.json / en.json instead.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly _locale = signal<Locale>(DEFAULT_LOCALE);

  /** Current active locale. */
  readonly locale = this._locale.asReadonly();

  /** Active dictionary, recomputed whenever locale changes. */
  readonly dictionary = computed(() => DICTIONARIES[this._locale()]);

  private readonly extensions = signal<readonly DictionaryExtension[]>([]);

  /**
   * Adds a lazy-loaded feature's dictionary (see {@link DictionaryExtension}). Idempotent for the same object, so a route
   * resolver may call it on every visit. The base dictionary always wins for a key both define; a key found in neither still
   * comes back as itself. Reading a text inside a template or a `computed()` re-evaluates once the extension arrives.
   */
  extend(extension: DictionaryExtension): void {
    if (!this.extensions().includes(extension)) {
      this.extensions.update((current) => [...current, extension]);
    }
  }

  // TODO: once there's a settled UX for it, initialize from a saved user
  // preference / Accept-Language and persist changes (cookie, not
  // localStorage, so SSR can read it too). Deliberately not done yet to
  // keep this scaffold SSR-safe with zero browser API access.
  setLocale(locale: Locale): void {
    this._locale.set(locale);
  }

  /**
   * Resolves a dot-path key against the active dictionary, e.g.
   * `t('common.loading')`. Returns the key itself when not found, so a
   * missing translation is visible in the UI instead of silently blank.
   *
   * `params`, when given, fills `{{placeholder}}` tokens in the resolved
   * string (e.g. dictionary value `"Go to page {{page}}"` +
   * `t('shared.pagination.goToPage', { page: 3 })` → `"Go to page 3"`).
   * Added for P0-34's shared UI kit (Pagination, etc.) — several built-in
   * component defaults need a translated string with a dynamic value, and
   * the dictionary must stay word-order-correct for Thai, which ruled out
   * assembling the string via string concatenation in the component.
   */
  t(key: string, params?: Readonly<Record<string, string | number>>): string {
    const resolved = this.lookup(key) ?? key;
    return params ? interpolate(resolved, params) : resolved;
  }

  /** The text of `key` in the active language: the base dictionary first, then the extensions in the order they arrived. */
  private lookup(key: string): string | undefined {
    const base = resolveKey(this.dictionary(), key);
    if (typeof base === 'string') {
      return base;
    }
    const locale = this._locale();
    for (const extension of this.extensions()) {
      const found = resolveKey(extension[locale], key);
      if (typeof found === 'string') {
        return found;
      }
    }
    return undefined;
  }
}

function interpolate(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token: string) =>
    token in params ? String(params[token]) : match,
  );
}

function resolveKey(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}
