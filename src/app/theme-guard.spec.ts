/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Theme guard (D-24). The look of the app is defined in tokens.css; component code must reach colours
 * through tokens (`var(--color-*)`, `tone-*`, `.glass-*`), never through raw Tailwind palette classes
 * or literal colours — otherwise light/dark switching and future re-theming silently break for that
 * element. This spec fails the build when a new violation slips in.
 *
 * What is NOT checked on purpose: `text-white` / `bg-white` / `bg-black` (legitimate over photos, video
 * and QR quiet zones), and `.ts` files for hex (they hold data, e.g. chart or QR options).
 * Allowlist = paths where a fixed colour is the point, each with the reason.
 */

const APP_ROOT = join(process.cwd(), 'src', 'app');

type Check = 'palette' | 'hex' | 'rgb';

const ALLOWLIST: readonly { readonly path: string; readonly checks: readonly Check[]; readonly reason: string }[] = [
  // Player chrome is drawn over the video frame: it must look identical in light and dark.
  { path: 'features/learning/video-player/', checks: ['palette', 'hex', 'rgb'], reason: 'controls overlaid on video' },
  // Third-party brand colour (LinkedIn "add to profile" button).
  { path: 'features/learning/certificate-verify-page/', checks: ['hex'], reason: 'LinkedIn brand colour' },
];

const PALETTE_FAMILIES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:[a-z0-9-]+:)*(?:text|bg|border|ring|from|to|via|divide|fill|stroke|outline|decoration|placeholder|shadow|accent|caret)-(?:${PALETTE_FAMILIES})-\\d{2,3}(?![\\d])`,
  'g',
);
/** A hex colour inside a Tailwind arbitrary value, e.g. `bg-[#0A66C2]`. */
const ARBITRARY_HEX = /\[#[0-9a-fA-F]{3,8}\]/g;
/** rgb()/rgba() inside a Tailwind arbitrary value, e.g. `bg-[rgb(15_23_42_/_0.6)]`. */
const ARBITRARY_RGB = /\[(?:[a-z-]+:)?rgba?\(/g;
/** Any literal colour in a stylesheet. */
const STYLESHEET_HEX = /#[0-9a-fA-F]{3,8}\b/g;
const STYLESHEET_RGB = /\brgba?\(/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function isAllowlisted(file: string, check: Check): boolean {
  const rel = relative(APP_ROOT, file).split(sep).join('/');
  return ALLOWLIST.some((entry) => rel.startsWith(entry.path) && entry.checks.includes(check));
}

function sourceFiles(extensions: readonly string[], check: Check): string[] {
  return walk(APP_ROOT).filter(
    (file) =>
      extensions.some((ext) => file.endsWith(ext)) &&
      !file.endsWith('.spec.ts') &&
      !file.endsWith(`${sep}tokens.css`) &&
      !isAllowlisted(file, check),
  );
}

function findMatches(files: readonly string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      hits.push(`${relative(APP_ROOT, file).split(sep).join('/')}:${line}  ${match[0]}`);
    }
  }
  return hits;
}

describe('theme guard', () => {
  it('finds the source tree (guards against a silently empty scan)', () => {
    expect(sourceFiles(['.html'], 'palette').length).toBeGreaterThan(50);
  });

  it('uses no raw Tailwind palette colour classes in templates, components or stylesheets', () => {
    const hits = findMatches(sourceFiles(['.html', '.ts', '.css', '.scss'], 'palette'), PALETTE_CLASS);
    expect(hits).toEqual([]);
  });

  it('uses no literal hex colours in Tailwind arbitrary values', () => {
    const hits = findMatches(sourceFiles(['.html', '.ts'], 'hex'), ARBITRARY_HEX);
    expect(hits).toEqual([]);
  });

  it('uses no literal rgb()/rgba() in Tailwind arbitrary values', () => {
    const hits = findMatches(sourceFiles(['.html', '.ts'], 'rgb'), ARBITRARY_RGB);
    expect(hits).toEqual([]);
  });

  it('uses no literal colours in component stylesheets (use tokens.css variables)', () => {
    expect([
      ...findMatches(sourceFiles(['.css', '.scss'], 'hex'), STYLESHEET_HEX),
      ...findMatches(sourceFiles(['.css', '.scss'], 'rgb'), STYLESHEET_RGB),
    ]).toEqual([]);
  });
});
