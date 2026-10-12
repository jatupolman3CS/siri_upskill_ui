# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** siri-upskill
**Decided:** 2026-08-17 (P0-31)
**Category:** Two-sided course marketplace (learner storefront + payment/checkout + instructor/admin dashboards)
**Design Dials:** Variance 4/10 (Balanced / Modern) | Motion 3/10 (Subtle) | Density 4/10 (Standard, dashboards may override higher)

> **Note on how this file was produced:** the `ui-ux-pro-max` skill's automatic
> `--design-system` generator was run twice and both times matched this
> product to a K-12/"kids learning" or "youth/gaming" profile (Claymorphism +
> Comic Neue / Poppins; Vibrant & Block-based) because of surface keyword
> overlap with "course" / "e-learning" / "marketplace" in its product
> dataset. Neither fits a platform whose core promise is trust (payment,
> DRM-protected video) for adult professionals. The values below were
> assembled by hand from the same underlying dataset (`style`, `color`,
> `typography`, `product` domain searches run individually and cross-checked
> against real precedent products — see reasoning per section) rather than
> the auto-picker's product-type shortcut. If re-running `--design-system`
> for a future page, sanity-check its output against this file before
> trusting it wholesale.

---

## Global Rules

### Color Palette

> **Superseded 2026-10-12 (D-24, `docs/DECISIONS.md`):** the whole UI moved to a "Cyber-Pink
> Glassmorphism" theme — slate surfaces + translucent glass layers, light/dark/system switch
> (`data-theme` on `<html>`, cookie `siri_theme`), Prompt font. Where this file below says
> *Flat Design / no glassmorphism / no gradients / IBM Plex Sans Thai*, D-24 wins. Rationale and
> rules for the glass layers: see "Glass theme (D-24)" under Style Guidelines. `tokens.css` is
> still the single source of truth for values.

> **Superseded 2026-08-20:** primary hue changed from trust-blue to magenta/pink
> per a project-owner rebrand directive delivered with the mockup handoff.
> Table below reflects the *current* palette; the reasoning paragraph after it
> is kept as-is because it explains why blue was picked *originally* — it's
> history, not current rationale for the hue itself. The underlying semantic
> role of each token (primary = CTA/links/checkout, accent = achievement-only
> gold) is unchanged, only the primary hex values moved. Source of truth is
> still `frontend/src/app/styles/tokens.css`, not this table.

| Role | Hex | CSS Variable | Used for |
|------|-----|--------------|----------|
| Primary | `#DB2777` | `--color-primary` | CTA buttons, links, active nav, checkout affordances |
| Primary Hover | `#BE185D` | `--color-primary-hover` | — |
| On Primary | `#FFFFFF` | `--color-primary-foreground` | — |
| Accent | `#B45309` | `--color-accent` | Certificates, badges, "featured" — achievement moments only, never a dominant color |
| On Accent | `#FFFFFF` | `--color-accent-foreground` | — |
| Background | `#FFFFFF` | `--color-bg` | — |
| Surface | `#FDF2F7` | `--color-surface` | Cards, panels |
| Surface Muted | `#FAE3EE` | `--color-surface-muted` | — |
| Text | `#2A1220` | `--color-text` | — |
| Text Muted | `#75465E` | `--color-text-muted` | — |
| Border | `#F3CBDD` | `--color-border` | — |
| Success | `#16A34A` | `--color-success` | — |
| Warning | `#D97706` | `--color-warning` | — |
| Danger | `#DC2626` | `--color-danger` | — |
| Focus Ring | `#DB2777` | `--color-focus-ring` | — |

**Color reasoning (historical — explains the original blue choice, kept for context, see superseded-note above):** searched the color domain for "trust confident growth achievement education professional" and cross-checked 8 real product palettes (Micro-Credentials/Badges, LMS, Online Course, B2B Service, CRM, Invoice/Billing, Government Portal, Real Estate). Every payment/credential-adjacent product in the dataset converges on **blue for trust** (government, fintech, CRM, billing all use it) — this is not a stylistic preference, it's the semantic the target audience already associates with "safe to pay here." **Gold/amber as a reserved accent** comes specifically from the Micro-Credentials/Badges Platform entry ("trust blue + achievement gold") — apt for a platform whose product literally includes certificates (LX-05) and whose name is "UpSkill," and this part of the reasoning still holds (accent stayed gold). Full palette lives in `frontend/src/app/styles/tokens.css`, including the dark-mode overrides (not duplicated here — the token file is the source of truth, this table is the rationale).

### Typography

- **Family:** Prompt (single family for both heading and body — vary weight, not typeface). *Replaced IBM Plex Sans Thai on 2026-10-12 (D-24); the "why one family" reasoning below still applies unchanged.*
- **Weights loaded:** 300, 400, 500, 600, 700
- **Mood:** clean, modern, professional, readable, full Thai + Latin coverage
- **Google Fonts:** [Prompt](https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap) — loaded via `<link>` in `src/index.html`, not `@import`, for earlier discovery/preconnect
- **Why one family, not a heading/body pair:** this app ships a bilingual TH/EN interface (`core/i18n/`). Pairing a Latin-only display font (Poppins, DM Sans, etc.) with a separate Thai body font means every heading silently reverts to a different, unpaired fallback the moment it renders Thai text — the two scripts would visibly not belong to the same design. IBM Plex Sans Thai avoids that failure mode entirely and is this codebase's own pre-existing top recommendation (`.claude/rules/ui-design.md`).
- **Verify before shipping any real Thai copy:** line-height at body size (16px) with real Thai text containing tone marks/vowels above and below the baseline — the placeholder token comment this file replaces flagged this as unverified; still true, do it once real Thai content exists.

### Spacing Variables

*Density: 4/10 — Standard (dashboards/data tables may use a denser scale locally — see `pages/` overrides when those pages are built)*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Token | Usage |
|-------|-------|-------|
| Subtle lift | `--shadow-sm` | Inputs, small controls |
| Cards, buttons | `--shadow-md` | Default card elevation |
| Modals, dropdowns | `--shadow-lg` | Overlays |

Restrained on purpose — see Style Guidelines below. No neumorphic double-shadows; shadows communicate elevation, not decoration. *(D-24 adds the `--glass-shadow` and `--shadow-glow` tokens for glass layers and the primary CTA glow — the only decorative shadows allowed.)*

---

## Style Guidelines

**Style (current, D-24):** Cyber-Pink Glassmorphism — translucent glass surfaces over a soft ambient pink/violet background, with the Flat/Minimalism spacing and grid discipline below kept for layout.

**Style (original, P0-31 — superseded):** Flat Design, with Minimalism & Swiss Style-influenced spacing/grid discipline. Keywords: Clean, functional, generous white space, high contrast, limited palette, grid-based, no gradients/glassmorphism/claymorphism/neumorphism

**Why this over the alternatives the dataset offered:** the product has two very different surfaces that both need the *same* style to hold up — a consumer storefront + checkout (needs to read as trustworthy and calm, not playful) and instructor/admin dashboards (needs to be data-dense and legible). Flat Design is explicitly tagged "Best For: SaaS, dashboards, corporate" and Minimalism is explicitly tagged "Best For: Enterprise apps, dashboards, SaaS platforms, professional tools" — both fit both surfaces. Claymorphism (chunky/toy-like), Glassmorphism (blur, harder to keep accessible), Vibrant & Block-based (youth/gaming-coded), and Aurora UI (decorative gradients) were all considered and rejected — none fit a payment-and-credential product for working adults.

**Icons:** SVG only (Phosphor or Lucide, per `.claude/rules/ui-design.md`) — never emoji.

### Glass theme (D-24)

- **Layers** (`styles.css`, values from `tokens.css`): `.glass-panel` = translucent + `backdrop-filter` blur — header, sidebar, modal, hero panel only (a handful per screen, it is the expensive one). `.glass-card` = translucent, **no blur** — safe on every card and table row group. `.glass-pill` = nav/chip container. They sit in `@layer components`, so a Tailwind utility on the same element still overrides them.
- **Fallbacks are mandatory and built in:** no `backdrop-filter` support, or `prefers-reduced-transparency: reduce` → solid `--color-surface`. Never put text on a glass layer whose contrast was not computed in both themes (text on glass-card: 13.3:1 dark, 14:1 light).
- **Pink text** uses `--color-primary-text`, not `--color-primary` (4.4:1 on the light page background). `--color-primary` is for fills, focus rings and the CTA; `--color-brand-500` (`#ec4899`) is decoration only (white on it is ~3.5:1).
- **Violet** (`--color-secondary`) is the gradient partner only — never a CTA or a status colour. Status colours are `tone-*` pairs, not raw Tailwind palette classes.
- **Ambient background:** one `<app-ambient-background>` in `app.html`. Do not add per-page blobs. Motion is transform-only, slow, off under `prefers-reduced-motion`, and static + lighter blur on mobile.
- **Reveal / glow / shimmer:** `.reveal` is CSS-only (scroll-driven animation, content visible without it), `.glow-border` is a hover/focus ring drawn inside the element, `.text-shimmer` runs 3 passes then stops — the single sanctioned non-transform/opacity animation, on the home hero headline only.
- **Colour mode:** light / dark / system via `data-theme`; never branch on `prefers-color-scheme` in component CSS — use the tokens or `dark:` (wired to the attribute).

### Page Pattern (marketing/landing pages)

**Pattern Name:** Hero + Feature Showcase + Social Proof + CTA

- **Conversion strategy:** lead with the value proposition (learn a skill, build a career), show concrete course/category breadth, then social proof (learner counts, instructor credibility, ratings) before the CTA — social proof matters more here than a generic SaaS pitch because the purchase is a personal, often skeptical decision ("will this course actually help me").
- **CTA placement:** hero (primary) + repeated after social proof (secondary conversion point)
- **Section order:** Hero → category/value overview → featured courses → social proof (ratings/testimonials) → CTA

This pattern is a starting point for the home/landing page (P1) — `learn`/`instructor`/`admin` surfaces are dashboards, not landing pages, and should NOT follow this pattern; they follow standard dashboard layout conventions (sidebar nav + content area, per the existing `layouts/` scaffolding).

---

## Motion

**Guideline:** subtle, functional motion only (Motion dial 3/10) — this is a trust-sensitive product, not an entertainment one. Fades and small (8–16px) position shifts on scroll-reveal and state changes; no bouncy/overshoot easing, no decorative looping animation.

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

- Requires `ScrollTrigger` registered once via `gsap.registerPlugin(ScrollTrigger)`.
- Always gate with `matchMedia('(prefers-reduced-motion: reduce)')` — skip non-essential motion and render the final state immediately.
- Keep the `y` offset small (8–16px) so it reads as a fade, not a slide.
- Don't reveal below-the-fold SEO-relevant content as invisible-by-default without a no-JS fallback (this app is SSR — content must be in the initial render regardless of animation state).

---

## Anti-Patterns (Do NOT Use)

- ❌ Low trust signals (anything that makes checkout/payment feel uncertain)
- ❌ Confusing layout
- ❌ Emojis as icons — use SVG (Phosphor/Lucide)
- ❌ Missing `cursor: pointer` on clickable elements
- ❌ Layout-shifting hovers (avoid scale transforms that shift surrounding content)
- ❌ Low contrast text — 4.5:1 minimum
- ❌ Instant state changes — always transition (150–300ms)
- ❌ Invisible focus states
- ❌ Playful/bouncy easing (`back.out`, elastic) on informational or transactional UI — reserve for nothing in this product; it reads as sloppy on payment/credential flows
- ❌ Claymorphism, neumorphism — still out. (Glassmorphism and the pink→violet brand gradient are now allowed *within the D-24 rules above*; anything outside them — blur on every card, gradients on body text, glow on data tables — is still out.)

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (Phosphor/Lucide SVG only)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Light mode: text contrast 4.5:1 minimum (verify against the real token values, not assumed)
- [ ] Dark mode: same contrast check against the dark token overrides
- [ ] Focus states visible for keyboard navigation, ≥3:1 against both light and dark surfaces
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px — no horizontal scroll on mobile
- [ ] No content hidden behind fixed navbars
- [ ] Colors/spacing/radius/shadows referenced via `var(--token)`, never raw hex or ad-hoc pixel values
