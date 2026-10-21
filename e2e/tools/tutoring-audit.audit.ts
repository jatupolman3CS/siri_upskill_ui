import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Page, test } from '@playwright/test';

import {
  KYC_CASE_ID,
  TUTOR_SLUG,
  type SignedInAs,
  TutoringMockApi,
  bangkokDayPlus,
  bangkokInstant,
} from '../tutoring-mock-api';

/**
 * P13-43 quality audit of the Tutor Marketplace screens: for every page x viewport (375 / 768 / 1280) x theme (light / dark) it MEASURES
 *
 *  - horizontal overflow (document and body scroll width against the viewport),
 *  - touch targets inside the page's `<main>` (the tutoring feature) - the smallest one and every one under 44 px - plus, once, the
 *    shared chrome outside `<main>` (header, sidebar, footer, bottom bar), which belongs to no tutoring page,
 *  - the focus ring on the first Tab and on the first stop inside the page content (computed `outline` / `box-shadow`),
 *  - text contrast: for every visible text element the computed foreground colour is composited over the stack of computed ancestor
 *    backgrounds and compared with WCAG 2.x (4.5:1; 3:1 for text of 24 px or 18.66 px bold). Colours of any CSS syntax (oklch,
 *    color-mix, ...) are resolved to sRGB by the browser's own canvas. Elements over an image / gradient background cannot be resolved
 *    that way; they are counted (`unresolved`) and never reported as passing.
 *
 * Nothing here is a hard-coded token pair: every number is read from the rendered page. No backend is used - the API is the in-memory
 * mock of `../tutoring-mock-api.ts`. Results go to `test-results/tutoring-audit/*.json`; `tutoring-audit-report.cjs` renders the report.
 */

interface Spec {
  readonly id: string;
  readonly title: string;
  readonly who: SignedInAs;
  readonly route: (context: AuditContext) => string;
  /** CSS selector that exists once the page has its data (so the measurement sees the real page, not a skeleton). */
  readonly ready: string;
  readonly area: 'public' | 'learner' | 'tutor' | 'admin';
}

interface AuditContext {
  readonly bookingId: string;
}

const OPEN_DAY = bangkokDayPlus(Date.now(), 2);
const FIRST_SLOT = new Date(bangkokInstant(OPEN_DAY.date, '09:00')).toISOString();
/** A free time the booking page can pre-select (09:00 is taken by the booking every page of the audit already holds). */
const BOOKABLE_SLOT = new Date(bangkokInstant(OPEN_DAY.date, '10:00')).toISOString();

const PAGES: readonly Spec[] = [
  { id: 'tutors', title: '/tutors', who: null, route: () => '/tutors', ready: 'app-tutor-card', area: 'public' },
  { id: 'tutor-profile', title: '/tutors/:slug', who: null, route: () => `/tutors/${TUTOR_SLUG}`, ready: 'app-tutor-booking-panel [role="tabpanel"] button[aria-pressed]', area: 'public' },
  {
    id: 'booking',
    title: '/tutors/:slug/book',
    who: 'Learner',
    route: () => `/tutors/${TUTOR_SLUG}/book?offeringId=0192e2b3-0002-7000-8000-000000000001&startsAtUtc=${encodeURIComponent(BOOKABLE_SLOT)}&durationMinutes=30&format=OneOnOne&trial=true`,
    ready: 'app-lesson-picker [role="tabpanel"] button[aria-pressed]',
    area: 'learner',
  },
  { id: 'my-tutoring', title: '/my-tutoring', who: 'Learner', route: () => '/my-tutoring', ready: 'app-booking-card', area: 'learner' },
  { id: 'checkout', title: '/tutoring/checkout/:id', who: 'Learner', route: (c) => `/tutoring/checkout/${c.bookingId}`, ready: 'app-checkout-outcome', area: 'learner' },
  { id: 'availability', title: '/instructor/tutoring/availability', who: 'Instructor', route: () => '/instructor/tutoring/availability', ready: 'app-availability-preview [role="tabpanel"] button[aria-pressed]', area: 'tutor' },
  { id: 'classes', title: '/instructor/tutoring/classes', who: 'Instructor', route: () => '/instructor/tutoring/classes', ready: 'app-tutor-class-card', area: 'tutor' },
  { id: 'kyc-queue', title: '/admin/tutoring/kyc', who: 'Admin', route: () => '/admin/tutoring/kyc', ready: `a[href$="/admin/tutoring/kyc/${KYC_CASE_ID}"]`, area: 'admin' },
  { id: 'kyc-case', title: '/admin/tutoring/kyc/:id', who: 'Admin', route: () => `/admin/tutoring/kyc/${KYC_CASE_ID}`, ready: 'app-kyc-document-table tbody tr', area: 'admin' },
];

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

/** Screenshots kept in the repo (docs/audit/p13-43/): 375 dark and 1280 light for every page, plus 768 light for the first four. */
const keepScreenshot = (spec: Spec, width: number, theme: string): boolean =>
  (width === 375 && theme === 'dark') || (width === 1280 && theme === 'light') || (width === 768 && theme === 'light' && PAGES.indexOf(spec) < 4);

const OUT = join(process.cwd(), 'test-results', 'tutoring-audit');
const SHOTS = join(process.cwd(), 'docs', 'audit', 'p13-43');

// --- In-page measurements (each function is serialised into the page, so it can use nothing from this file) ---------------------

function measureOverflow(): { readonly document: boolean; readonly body: boolean; readonly scrollWidth: number; readonly clientWidth: number; readonly offenders: readonly string[] } {
  const root = document.documentElement;
  const limit = root.clientWidth;
  const offenders: string[] = [];
  if (root.scrollWidth > limit + 1) {
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || style.display === 'none') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > limit + 1) {
        let scroller = false;
        for (let up = element.parentElement; up && up !== document.body; up = up.parentElement) {
          const overflowX = getComputedStyle(up).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') scroller = true;
        }
        if (!scroller) offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)} right=${Math.round(rect.right)}`);
      }
    }
  }
  return { document: root.scrollWidth > limit + 1, body: document.body.scrollWidth > limit + 1, scrollWidth: root.scrollWidth, clientWidth: limit, offenders: offenders.slice(0, 5) };
}

interface TargetRecord {
  readonly label: string;
  readonly tag: string;
  readonly width: number;
  readonly height: number;
  /** A link that sits inside running text: WCAG 2.5.8 exempts it, the project's 44 px rule does not. */
  readonly inline: boolean;
}

function measureTargets(): { readonly main: readonly TargetRecord[]; readonly chrome: readonly TargetRecord[] } {
  const selector =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="checkbox"], [role="switch"], [role="link"]';
  const mainElement = document.querySelector('main');
  const main: TargetRecord[] = [];
  const chrome: TargetRecord[] = [];
  const nameOf = (element: Element): string => {
    const labelled = element.getAttribute('aria-label') ?? (element.getAttribute('aria-labelledby') ? document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent : null);
    const text = labelled ?? element.textContent ?? (element as HTMLInputElement).placeholder ?? '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 48) || `<${element.tagName.toLowerCase()}>`;
  };
  for (const element of Array.from(document.querySelectorAll(selector))) {
    if ((element as HTMLButtonElement).disabled || element.closest('[aria-hidden="true"], [inert]')) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    let box = element.getBoundingClientRect();
    let named = element;
    // A checkbox / radio / visually hidden control is pressed through its <label>: that is the target a finger meets.
    const label = element.closest('label');
    if (label && (element instanceof HTMLInputElement) && (box.width < 24 || box.height < 24)) {
      box = label.getBoundingClientRect();
      named = label;
    }
    if (box.width < 2 || box.height < 2) continue; // sr-only
    if (box.right < 0 || box.bottom < 0) continue;
    // "Stretched link": a link whose ::after is absolutely positioned and covers its card is pressed anywhere on the card.
    const pseudo = getComputedStyle(element, '::after');
    let width = box.width;
    let height = box.height;
    if (pseudo.position === 'absolute' && pseudo.content !== 'none' && pseudo.content !== 'normal') {
      width = Math.max(width, parseFloat(pseudo.width) || 0);
      height = Math.max(height, parseFloat(pseudo.height) || 0);
    }
    const parent = element.parentElement;
    const inline =
      element.tagName === 'A' &&
      style.display === 'inline' &&
      !!parent &&
      Array.from(parent.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0);
    const record: TargetRecord = { label: nameOf(named), tag: element.tagName.toLowerCase(), width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10, inline };
    (mainElement && mainElement.contains(element) ? main : chrome).push(record);
  }
  return { main, chrome };
}

interface PairRecord {
  readonly ratio: number;
  readonly need: number;
  readonly text: string;
  readonly fg: string;
  readonly bg: string;
  readonly sizePx: number;
  readonly large: boolean;
  readonly inMain: boolean;
}

function measureContrast(): { readonly pairs: readonly PairRecord[]; readonly unresolved: number } {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('no 2d canvas');
  const SENTINEL = '#010203';
  const toRgba = (css: string): { r: number; g: number; b: number; a: number } | null => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = SENTINEL;
    context.fillStyle = css;
    if (css !== SENTINEL && context.fillStyle === SENTINEL) return null;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
  };
  const over = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number }): { r: number; g: number; b: number; a: number } => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const linear = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c: { r: number; g: number; b: number }): number => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
  const hex = (c: { r: number; g: number; b: number }): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  const pageBackground = toRgba(getComputedStyle(document.documentElement).backgroundColor);
  const base = pageBackground && pageBackground.a >= 1 ? pageBackground : { r: 255, g: 255, b: 255, a: 1 };
  const backgroundOf = (element: Element): { r: number; g: number; b: number; a: number } | null => {
    const layers: { r: number; g: number; b: number; a: number }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null;
      const colour = toRgba(style.backgroundColor);
      if (colour && colour.a > 0) {
        layers.push(colour);
        if (colour.a >= 1) break;
      }
    }
    let accumulated = base;
    for (let i = layers.length - 1; i >= 0; i--) accumulated = over(layers[i], accumulated);
    return accumulated;
  };

  const mainElement = document.querySelector('main');
  const pairs: PairRecord[] = [];
  let unresolved = 0;
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').trim();
    const element = node.parentElement;
    if (!text || !element || seen.has(element)) continue;
    seen.add(element);
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (element.closest('.sr-only, [aria-hidden="true"], script, style, noscript')) continue;
    const foreground = toRgba(style.color);
    const background = backgroundOf(element);
    if (!foreground || !background) {
      unresolved += 1;
      continue;
    }
    const mixed = over(foreground, background);
    const a = luminance(mixed);
    const b = luminance(background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const sizePx = parseFloat(style.fontSize);
    const large = sizePx >= 24 || (sizePx >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
    pairs.push({
      ratio: Math.round(ratio * 100) / 100,
      need: large ? 3 : 4.5,
      text: text.slice(0, 40),
      fg: hex(mixed),
      bg: hex(background),
      sizePx,
      large,
      inMain: !!mainElement && mainElement.contains(element),
    });
  }
  return { pairs, unresolved };
}

interface FocusStop {
  readonly tag: string;
  readonly label: string;
  readonly inMain: boolean;
  readonly ring: boolean;
}

async function focusStop(page: Page, settle = true): Promise<FocusStop | null> {
  // The focus ring is drawn through a CSS transition (colour / box-shadow, 150-300 ms): read it after it has finished, not mid-way.
  if (settle) await page.waitForTimeout(350);
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const style = getComputedStyle(element);
    // A "ring" is a box-shadow layer with a spread (4th length) of at least `minSpread` px and a colour that is not fully transparent.
    const hasRing = (shadow: string, minSpread: number): boolean =>
      shadow.split(/,(?![^(]*\))/).some((part) => {
        const colour = part.match(/(?:rgba?|color|oklch|oklab|lab|lch|hsla?)\([^)]*\)|#[0-9a-f]{3,8}/i);
        if (!colour) return false;
        const channels = colour[0].replace(/^[a-z]+\(|\)$/gi, '').split(/[\s,/]+/).filter(Boolean);
        const alphaSource = colour[0].includes('/') ? channels[channels.length - 1] : colour[0].startsWith('rgba') ? channels[3] : undefined;
        const alpha = alphaSource === undefined ? 1 : parseFloat(alphaSource);
        const lengths = part.replace(colour[0], '').trim().split(/\s+/).map((value) => parseFloat(value));
        return alpha > 0 && lengths.length >= 4 && lengths[3] >= minSpread;
      });
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const ownRing = hasRing(style.boxShadow, 0.5);
    // A control may show its ring on the box that holds it (an input's wrapper, a card with `has-[a:focus-visible]:ring-2`): look at the
    // nearest few ancestors, and only count a real ring (2 px or more) there so a 1 px hairline border drawn as a shadow is not mistaken for one.
    let ancestorRing = false;
    for (let up = element.parentElement, depth = 0; up && depth < 4 && !ancestorRing; up = up.parentElement, depth += 1) {
      ancestorRing = hasRing(getComputedStyle(up).boxShadow, 2);
    }
    const label = (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const main = document.querySelector('main');
    return { tag: element.tagName.toLowerCase(), label: label || `<${element.tagName.toLowerCase()}>`, inMain: !!main && main.contains(element), ring: outline || ownRing || ancestorRing };
  });
}

// --- The audit ----------------------------------------------------------------------------------------------------------------

for (const spec of PAGES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${spec.id} @${viewport.width} ${theme}`, async ({ browser, baseURL }) => {
        const mock = new TutoringMockApi({ rules: [{ dayOfWeek: OPEN_DAY.dayOfWeek, startLocal: '09:00', endLocal: '12:00' }] });
        const booking = mock.seedFreeTrial(FIRST_SLOT);

        // deviceScaleFactor 0.5: the screenshots are written at half size (the repository keeps them small); layout is in CSS pixels, so
        // none of the measurements depends on it. reducedMotion: the entrance animations would otherwise change colours mid-measurement.
        const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 0.5 });
        await context.addCookies([{ name: 'siri_theme', value: theme, url: baseURL ?? 'http://localhost:4200' }]);
        await context.addInitScript(() => {
          if (location.protocol.startsWith('http') && location.hostname === 'localhost') {
            localStorage.setItem('siri_pdpa_consent', JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: '2026-10-01T00:00:00.000Z' }));
          }
        });
        await mock.attach(context, spec.who);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));

        await page.goto(spec.route({ bookingId: booking.bookingId }));
        await page.locator(spec.ready).first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(600);

        const finalPath = new URL(page.url()).pathname;
        const theTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const overflow = await page.evaluate(measureOverflow);
        const targets = await page.evaluate(measureTargets);
        const contrast = await page.evaluate(measureContrast);

        // Focus: the very first Tab, then keep tabbing until the page content (inside <main>) is reached, and look at a few stops there.
        await page.keyboard.press('Tab');
        const firstTab = await focusStop(page);
        let firstInContent: FocusStop | null = firstTab !== null && firstTab.inMain ? firstTab : null;
        let tabsToContent = firstInContent === null ? 0 : 1;
        for (let press = 2; firstInContent === null && press <= 60; press += 1) {
          await page.keyboard.press('Tab');
          if ((await focusStop(page, false))?.inMain) {
            firstInContent = await focusStop(page);
            tabsToContent = press;
          }
        }
        const contentStops: FocusStop[] = firstInContent === null ? [] : [firstInContent];
        for (let press = 0; press < 8 && firstInContent !== null; press += 1) {
          await page.keyboard.press('Tab');
          const stop = await focusStop(page);
          if (stop?.inMain) contentStops.push(stop);
        }

        if (keepScreenshot(spec, viewport.width, theme)) {
          mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: join(SHOTS, `${spec.id}-${viewport.width}-${theme}.png`), scale: 'device' });
        }

        mkdirSync(OUT, { recursive: true });
        writeFileSync(
          join(OUT, `${spec.id}-${viewport.width}-${theme}.json`),
          JSON.stringify({ page: spec.id, title: spec.title, area: spec.area, width: viewport.width, theme, finalPath, dataTheme: theTheme, overflow, targets, contrast, firstTab, firstInContent, tabsToContent, contentStops, errors }, null, 1),
        );
        await context.close();
      });
    }
  }
}
