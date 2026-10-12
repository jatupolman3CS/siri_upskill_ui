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

## Follow-up bug-fix plan (UI-FIX)

Open bugs found after the theme migration, in the order they should be fixed. Each phase is independent, small enough for one review, and has an acceptance check. Do phases in order unless noted; do NOT commit or push — leave the working tree for the owner to review (report `git diff --stat` per phase).

Ground rules: read `.claude/rules/frontend.md`, `ui-design.md`, `workflow.md` first; class/markup/i18n changes only unless a phase says otherwise; keep the hook classes specs depend on (`.app-modal-*`, `.fixed`, `motion-reduce:*`); no raw palette/hex (`theme-guard.spec.ts`); `npm run build`, `npm run test`, `npm run lint` must stay green after every phase (lint is fully clean now). **Never start `Siri.Api` by hand** (the backend `.env` points at the PRODUCTION database; `scripts/dev.ps1` refuses to start while `.env` holds an `sk_live_` Stripe key — the owner must put a test key or blank there). Use `npx ng serve --port 4210` for the UI, never 4200/4201/4202.

Visual check without a backend: `node e2e/tools/visual-sweep.cjs` (mocked API, light + dark; contrast / overflow / page errors / focus rings — see the file header). It cannot show data-rich states.

### Phase 1 — Admin modals without dialog semantics (accessibility bug)
Seven admin pages hand-roll `fixed inset-0` overlays with no `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap or Escape: `contact-messages` (1), `course-moderation` (1), `marketing` (3), `menus` (1), `payments` (3), `payouts` (3), `users` (3). Replace each with the shared `app-modal` (`src/app/shared/modal`: `[(open)]`, `titleText`, `showCloseButton`, `closeOnOverlayClick` — pass `false` for destructive confirmations — and a `[modalFooter]` slot; it already provides role/aria-modal/labelledby, `CdkTrapFocus`, Escape, scroll lock and focus return). Keep the page state signals and handlers; only move the markup. Update the specs that query the old markup (`admin-users-page.spec.ts` queries `.fixed`; the shared modal's overlay keeps `fixed`). Acceptance: every modal has role=dialog + an accessible name, Tab stays inside, Escape closes and focus returns to the opener; specs green.

### Phase 2 — Missing ARIA semantics
- `role="progressbar"` + `aria-valuenow/min/max` + an accessible name on the progress bars driven by `[style.width.%]`: `home-page.html` (continue learning), `learn-page.html`, `curriculum-sidebar.html`, `my-courses-page.html`, `instructor-analytics-page.html` (completion rate), `course-builder-page.html` (trailer upload). The rating-distribution bars in `course-detail-page.html` are not progress: give the row a text label instead.
- `aria-expanded` (+ `aria-controls`) on disclosure triggers that lack it: the order-history "expand order" button and the curriculum-sidebar section header; check the 13 files that already use it for consistency.
- `aria-pressed` on two-state toggle buttons: the admin-menus active/inactive toggle and any filter chip that behaves as a toggle (admin payments ops filter). Order-history status tabs should be a proper `role="tablist"`/`tab`/`aria-selected` if that is what they are — check what the markup already claims.
Acceptance: no unnamed progress bars, collapsed/expanded state announced, toggle state announced.

### Phase 3 — Controls that do nothing (needs a decision per item)
- `instructor-earnings-page.html`: the "ใบหักภาษี 50 ทวิ" button has no `(click)`. Check `features/payout/data/payout-api.service.ts` and the backend (`siri_upskill_backend`) for a withholding-tax certificate endpoint; if it exists, wire it through the API service with loading/error states; if it does not, hide the button and tell the owner (do not invent an endpoint).
- `blog-detail-page.html`: the "แชร์บทความ" button has no `(click)`. Implement with `navigator.share` when available (guard `isPlatformBrowser`), else copy the URL and show a toast; the strings come from i18n.
Acceptance: no focusable control without behaviour.

### Phase 4 — Nested interactive elements
`home-course-card.html` puts the wishlist `<button>` inside the card's `<a>` (invalid HTML, double-activation risk). Restructure with the stretched-link pattern: the card is a `div`, the title is the `<a>` with an `after:absolute after:inset-0` overlay, and the wishlist button sits above it (`relative z-10`). Check the same pattern in `wishlist-page`, `courses-page` and the learning-path cards. Keep the card's `glow-border`/hover look and the 44px hit area. Acceptance: no `<button>`/`<a>` nested inside another interactive element; Tab order is title link, then wishlist button.

### Phase 5 — Video player i18n, touch targets, error mapper
`features/learning/video-player`: 8 hardcoded English `aria-label`s (Play, Pause, seek bar …) → i18n keys (`learn.player.*`, Thai + English); the seek/volume sliders are 6px tall — wrap each in a 44px-high padded container so the pointer target is 44px without changing the visual track; the speed/quality menu items are 36px — raise to 44px from `sm` up and keep the menu scrollable on short mobile screens. `shaka-error-mapper.ts` has 26 hardcoded Thai strings → i18n keys. Acceptance: keyboard shortcuts unchanged, specs green.

### Phase 6 — Emoji icons → Phosphor
`shared/consent-banner` (🍪), `learning/learn-page` (🎓 ★), `quiz-taking` and `assignment-submission` templates (📝 🎯 📋 ⏱️ 📦 📄 📁 ⟳). Replace with `@ng-icons/phosphor-icons` (`provideIcons` on the component); decorative icons get `aria-hidden="true"`. Acceptance: no emoji left in templates.

### Phase 7 — Hardcoded user-facing text → i18n (largest; split by folder)
About 712 lines of Thai (and some English) text sit outside i18n, by area: admin 416 (marketing 72, payments 71, payouts 61 …), instructor 87, learning 85, commerce 40, auth 24 (account-privacy), catalog 19, shared 19 (consent-banner), blog 14, home 5, layouts 2. Per folder: add keys to `th.json` (the Thai text, verbatim) and `en.json` (a real English translation) under the feature's existing namespace (`admin.<page>.*`, `instructor.*`, `cart.*` …); replace the literal with `{{ 'key' | translate }}` (params via `translate: { … }`, never string concatenation — Thai word order differs); for attributes use `[attr.aria-label]`, `[attr.title]`, `[placeholder]`. Dictionary edits are a conflict hotspot: only one worker edits `th.json`/`en.json` at a time (or workers write key snippets that one person merges, as was done for `a11y.*`). Finish with a guard: a spec like `theme-guard.spec.ts` that fails when a `.html` template contains Thai characters outside comments (explicit allowlist), plus a th/en key-parity spec for the whole dictionary (today only the legal/FAQ namespaces have one). Acceptance: guard + parity specs green; an English page shows no Thai.

### Phase 8 — Verify with real data (blocked on the owner)
Needs a working local stack: the owner replaces the Stripe key in `siri_upskill_backend/.env` with a test key (or blanks it), then `scripts/dev.ps1 Start`, and the seed accounts are used for login (see the backend CLAUDE.md). Then walk the learner flows with data — `/learn/:slug` with the video player, cart → checkout (the PromptPay QR tile must stay white in dark mode), order history, certificates — and the admin/instructor tables in both themes. Until that is unblocked, report this phase as not done.

### Also open (smaller)
- The initial-bundle raw size warning (830 kB vs the 500 kB budget; gzip about 191 kB) has not been compared with the pre-theme baseline — measure commit `2bdf1aa` in an isolated `git archive` copy before deciding whether it is a regression.
- The blog article body uses `[innerHTML]` with a `prose` class, but the Tailwind typography plugin is not installed, so headings and lists are unstyled — decide between installing `@tailwindcss/typography` (new dependency: ask the owner) and styling the article container by hand.
