# Theme refactor — "Premium Cyber-Pink Glassmorphism" (D-24)

Mission: migrate the whole UI to the Cyber-Pink Glassmorphism theme **without touching business logic, signals, bindings, i18n keys or routes** — only HTML structure, CSS classes and style configuration.
Decision record: `docs/DECISIONS.md` D-24. Rules for new code: `.claude/rules/ui-design.md` and `design-system/siri-upskill/MASTER.md` ("Glass theme (D-24)").
Reference look (visual language only, never copy its code — it breaks SSR, i18n, token and a11y rules): the owner's example `siri_upskill_angular_app.ts`.

> History: the first version of this file stopped mid-code-block after Phase 1 step 1 and referenced a `tailwind.config` file. This repo uses Tailwind CSS v4 (CSS-first), so "Tailwind config" means the `@theme` block in `src/app/styles/tokens.css`. The remaining phases below were written from the approved plan and are all done (2026-10-12).

## Execution protocol (per phase)

1. Read the files you are about to change and their neighbours; follow the existing pattern.
2. Change classes/markup only. Never rename ids, aria attributes, i18n keys, `@if`/`@for` structure, or the hook classes specs depend on (`.app-modal-*`, `.app-mobile-nav-*`, `.studio-mobile-nav-*`, `.fixed`, `motion-reduce:*`, `animate-spin*`, `min-h-11`).
3. Colours come from tokens only — never raw Tailwind palette classes, hex or `rgba()`. Status colours use `tone-*`. `src/app/theme-guard.spec.ts` enforces this.
4. Verify before reporting: `npm run build`, `npm run test`, `npm run lint`, then look at the page in light **and** dark (and mobile 375px) in the browser. Report what was *not* verified.
5. Do not commit or push unless the owner asks.

## Phase 1 — Global configuration (B0)

- Tailwind v4 theme extension in `tokens.css`: `@theme static { --font-sans: 'Prompt', …; --color-brand-50 … 900 }` (pink scale: 500 `#ec4899`, 600 `#db2777`, 700 `#be185d`).
- `index.html`: load **Prompt** (300–700) via `<link>`; no `@import` in CSS.
- `styles.css`: base glass classes (superseded by Phase 2's token-driven versions).

## Phase 2 — Foundation (B1)

- `tokens.css`: light tokens on `:root`, dark overrides under `:root[data-theme='dark']` (no `prefers-color-scheme` block); new tokens `--glass-*`, `--gradient-brand`, `--shadow-glow`, `--blob-*`, `--overlay-scrim`, `--skeleton-sheen`, `--color-secondary`, `--color-primary-text`, `--color-primary-pressed`, `--hue-red-*` / `.tone-red`.
- `styles.css`: `@custom-variant dark` bound to `data-theme`; `html` carries the page colour (body transparent so the ambient background shows); utilities `.glass-panel` (blur, a handful per screen), `.glass-card` (translucent, no blur — every card), `.glass-pill`, `.text-gradient-brand`, `.text-shimmer`, `.reveal` (CSS-only scroll reveal), `.glow-border`, `.app-blob`; fallbacks for no `backdrop-filter` and `prefers-reduced-transparency`; reduced-motion coverage.
- Theme switch (light / dark / system): `core/theme/theme.service.ts` + cookie `siri_theme`; inline bootstrap script in `index.html` sets `data-theme` before first paint; `shared/theme-toggle` (radio group, 44px targets in the comfortable size); i18n `theme.*`.
- `shared/ambient-background` mounted once in `app.html`.

## Phase 3 — Shared kit and layouts (B2)

Button (pill, glow, `--color-primary-pressed`), input/select (glass fill), modal/toast/consent banner (glass panel + `--overlay-scrim`), pagination, breadcrumb, skeleton, flash-sale banner; site header (glass panel + pill nav), footer, bottom nav, mobile/studio drawers, language/account menus, mega menu; admin/instructor layouts (glass header + sidebar, `tone-*` chips, toggle in header and drawer). Global rule applied everywhere: pink text → `--color-primary-text`, primary hover fills → `--color-primary-pressed`.

## Phase 4 — Feature folders (B3–B6)

Mechanical sweep first: `border + bg-surface|bg` card strings → `glass-card` (291 sites). Then per folder: palette classes → `tone-*` / neutral tokens, opaque page wrappers → transparent, scrims → `--overlay-scrim`.
Folders: public (home, catalog, auth, legal, blog, notification) · commerce, learning, live · instructor, payout · admin.
Intentional exceptions (also the guard's allowlist): `features/learning/video-player` (controls drawn over the video — identical in both themes), the LinkedIn brand hex on the certificate page, the white PromptPay QR tile.

## Phase 5 — Close-out (B7)

- `quiz-taking` / `assignment-submission` `.scss` rewritten with tokens only (they had ~100 hex values and no dark mode).
- `src/app/theme-guard.spec.ts` (unit) and `e2e/theme-toggle.spec.ts` (Playwright, no backend needed).

## Known follow-ups (out of theme scope)

Hardcoded Thai strings in several pages; inputs/tab buttons whose only focus indicator is a 1px border (admin forms, course-builder tabs); icon buttons under 44px or without `aria-label`; plain `<img>` instead of `NgOptimizedImage` (home banner, wishlist, blog, cart, my-courses); undefined `animate-bounce-subtle`; unused i18n key `home.hero.heading`; `home-page.ts` reads a resource `.value()` without `hasValue()`; blog `[innerHTML]` uses `prose` but the typography plugin is not installed; initial-bundle raw size warning (830 kB vs 500 kB budget, gzip 191 kB) not compared against the pre-theme baseline.
