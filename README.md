# SIRI UpSkill — Web (Angular)

**The Angular frontend for a video-course marketplace, built zoneless/signals-first with SSR for SEO.**

SIRI UpSkill is an e-learning marketplace (SkillLane/FutureSkill style): learners browse and buy long-term access to video courses, instructors publish their own content, and the platform takes a revenue share. This repository is the standalone-component, signal-based Angular client — public pages (home, catalog, course detail) are server-rendered for SEO, while `/learn`, `/instructor` and `/admin` are CSR-only and `noindex`.

> Backend (ASP.NET Core / .NET 10) lives in the sibling repository [`siri_upskill_backend`](https://github.com/jatupolman3CS/siri_upskill_backend).

## Key features

- **Catalog & discovery** — mega-menu category navigation, filterable/sortable course search backed by Thai-aware full-text search, course detail with syllabus and free-preview episodes, all URL-driven (filters survive back/forward)
- **Auth** — register/confirm-email/login/forgot-password/reset-password/device-management, access token kept in memory only (never `localStorage`), refresh token in an httpOnly cookie
- **Learner workspace** (`/learn`) — video playback, progress tracking, quizzes/assignments, discussions
- **Instructor Studio** (`/instructor`) — drag-and-drop course builder with autosave, resumable video upload, revenue/payout views
- **Admin console** (`/admin`) — course/instructor moderation, CMS, user & role management
- **SEO service** — canonical/Open Graph/hreflang/JSON-LD (`Course`, `BreadcrumbList`, `AggregateRating`) centralized in one service so every public route stays consistent

## Architecture

- Angular 22 **standalone components only**, zoneless change detection (`OnPush` everywhere), no `NgModule`
- State via **signals** (`signal()`/`computed()`/`linkedSignal()`/`resource()`/`rxResource()`) — RxJS is reserved for genuine event streams (debounce, websocket, player events), not state storage
- Data access funnels through a `*ApiService` per feature under `features/*/data/`; components never call `HttpClient` directly
- New control-flow syntax (`@if`/`@for`/`@switch`/`@defer`) throughout; `@defer` gates heavy blocks (video player, charts) with sized placeholders to avoid layout shift
- Design tokens in `src/app/styles/tokens.css` (light + dark from day one); icons via `@ng-icons/phosphor-icons`; all user-facing copy goes through i18n keys, never hardcoded strings

## Project status

Actively developed as a portfolio/capstone project alongside the backend — task-by-task status is tracked in the backend repo's `docs/TASKS.md`. Phase 0–1 (design system, UI kit, auth flow, public layout, catalog, course detail, SEO) is built and unit-tested; several Phase 2–6 screens (learner workspace, instructor studio, admin console) are still wired against mock data pending their backend contracts.

## Architecture & code quality notes

Honest self-review, not a polish claim. The earliest-built pages (catalog, home, course detail, auth) are a clean reference implementation of the target architecture: URL-as-source-of-truth filters, `resource()`/`rxResource()` with `hasValue()` guards, SSR-safe `afterNextRender()` gating, a dedicated `SeoService` for canonical/OG/JSON-LD, strict TypeScript with zero `any` and zero `NgModule` anywhere in the tree, and a shared `Pagination` component reused across admin tables instead of every page reinventing it.

The later scaffold wave (Commerce/Learning/Instructor/Admin, built faster against an evolving backend contract) introduced real, tracked inconsistencies against this repo's own `frontend.md` rules:

- **`course-builder-page.ts` is ~1,270 lines** (6× the project's own 200-line guideline) with no child-component decomposition — the highest-priority refactor candidate, since it's also the most interaction-heavy screen (drag-and-drop, autosave).
- **Two data-fetching styles coexist**: `resource()`/`rxResource()` (the intended default, used in 6 files) vs. classic `OnInit` + manual `.subscribe()` (used in ~29 later-wave components), each hand-rolling its own loading/error state instead of getting it for free.
- **Template-driven `[(ngModel)]` forms in ~23 templates**, contradicting the typed-reactive-forms-only rule — concentrated in the same later wave.
- **`<img>` without `NgOptimizedImage` in 10 templates**, including checkout and cart.
- **4 components missing `ChangeDetectionStrategy.OnPush`**, notably the quiz/assignment surfaces where it matters most for the zoneless model.
- **`CategoryMegaMenu`/`CategoryAccordionItem` resolve icon names dynamically but never register them via `provideIcons()`** — a known, tracked gap.

`TranslatePipe`, `CurrencyThbPipe` and `DurationPipe` were previously `pure: true` while reading signals (silently stale on language switch); all three are now `pure: false` and covered by regression tests.

## Development server

To start only the UI after the API and its dependencies are running (skip this if `dev.ps1` already started it):

```bash
npm start -- --port 4202
```

Open `http://localhost:4202/`. The application automatically reloads when source files change. In Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
