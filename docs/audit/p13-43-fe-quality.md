# P13-43 - Tutor Marketplace front-end quality audit

Measured on 2026-10-21 by `e2e/tools/tutoring-audit.audit.ts` (Playwright, Chromium) in the UI repo. Screenshots are in the UI repo under `docs/audit/p13-43/` (the links below resolve there; this file is copied unchanged to the backend repo's `docs/audit/`, where the images are not).

## Summary

- **Horizontal overflow:** none - 54 of 54 measurements fit their viewport exactly.
- **Touch targets (>= 44 px) inside the tutoring pages:** 2 offender(s): "หน้าแรก" 43.8 x 44; "ติวเตอร์" 39.6 x 44. The shared header / shell / footer has more (see below) and belongs to no tutoring page.
- **Focus ring:** visible on the first Tab and on the first content stops in 54 of 54 measurements.
- **Contrast:** lowest measured text ratio 4.57:1 (#15803d on #dcfce7, 14px) - 0 of 3086 samples below WCAG AA.

## How it was measured

- **Pages:** the tutoring screens a person actually uses - public search and profile, the booking page, checkout (a confirmed trial), "My tutoring", the tutor portal (availability, classes) and the admin KYC queue and case. 9 pages x 3 viewports (375 / 768 / 1280 px) x 2 themes (light / dark) = **54 measurements**. The theme is the `siri_theme` cookie, i.e. the real switch; motion is reduced so entrance animations do not change colours mid-measurement.
- **Data:** no backend. The API is the in-memory mock of `e2e/tutoring-mock-api.ts`, whose bodies are typed against the app models and compared field by field with the C# records; the pages hold a booking, a class and a pending KYC case, so the layouts are measured with data, not as empty states.
- **Overflow:** `documentElement.scrollWidth` and `body.scrollWidth` against the viewport width (+1 px tolerance).
- **Touch targets:** every visible interactive element inside the page's `<main>` (links, buttons, inputs, selects, tabs, radios...). A checkbox / radio is measured by its `<label>` (that is what a finger meets); a "stretched link" (`::after` covering its card) by the pseudo-element. Under 44 px in either direction is listed as an offender. The shared chrome outside `<main>` (header, sidebar, footer, bottom bar) belongs to no tutoring page and is listed once, in its own section.
- **Focus ring:** one real `Tab` key press, then the element that has focus is inspected after the ring's CSS transition has finished: a visible `outline`, or a `box-shadow` layer with spread > 0 that is not transparent on the element - or >= 2 px on one of its four nearest ancestors (cards and input wrappers draw the ring on the box). Then the same for the first stop inside `<main>` and the next eight stops there.
- **Contrast:** for every visible text element the *computed* foreground colour is composited over the stack of *computed* ancestor background colours (translucent glass is blended over the page background) and compared with the WCAG 2.x ratio: 4.5:1, or 3:1 for text of 24 px / 18.66 px bold. CSS colours of any syntax (`oklch`, `color-mix`, ...) are resolved to sRGB by the browser's own canvas. No token pair is typed into the script.

**Limits of the contrast number.** The decorative, blurred "ambient" background (`app-ambient-background`) is a separate fixed layer, not an ancestor of the text, so translucent glass is blended over the plain page colour and not over the blobs; elements over a CSS image/gradient cannot be resolved this way and are counted as `unresolved` (below) instead of being reported as passing. Placeholder text, input values and SVG icons are not text nodes and are not sampled.

## Result by page (all six viewport/theme combinations of the page)

| Page | Horizontal overflow (6 of 6 measured) | Smallest target in `<main>` | Targets under 44 px | Ring on first Tab | Ring at first content stop | Lowest contrast | Text pairs failing WCAG AA |
|---|---|---|---|---|---|---|---|
| `/tutors` | no | 44 px - ตัวกรอง (343x44) | none | 6 of 6 | 6 of 6 | 4.57:1 (#15803d on #dcfce7) | 0 |
| `/tutors/:slug` | no | 39.6 px - ติวเตอร์ (39.6x44) | หน้าแรก 43.8x44; ติวเตอร์ 39.6x44 | 6 of 6 | 6 of 6 | 4.57:1 (#15803d on #dcfce7) | 0 |
| `/tutors/:slug/book` | no | 39.6 px - ติวเตอร์ (39.6x44) | หน้าแรก 43.8x44; ติวเตอร์ 39.6x44 | 6 of 6 | 6 of 6 | 4.6:1 (#ffffff on #db2777) | 0 |
| `/my-tutoring` | no | 44 px - กำลังจะมาถึง (110.4x44) | none | 6 of 6 | 6 of 6 | 4.6:1 (#ffffff on #db2777) | 0 |
| `/tutoring/checkout/:id` | no | 48 px - คลาสของฉัน (109.4x48) | none | 6 of 6 | 6 of 6 | 4.6:1 (#ffffff on #db2777) | 0 |
| `/instructor/tutoring/availability` | no | 44 px - ภาพรวม (85.3x44) | none | 6 of 6 | 6 of 6 | 4.57:1 (#15803d on #dcfce7) | 0 |
| `/instructor/tutoring/classes` | no | 44 px - ภาพรวม (85.3x44) | none | 6 of 6 | 6 of 6 | 4.57:1 (#15803d on #dcfce7) | 0 |
| `/admin/tutoring/kyc` | no | 44 px - ยืนยันตัวตน (105.4x44) | none | 6 of 6 | 6 of 6 | 4.57:1 (#15803d on #dcfce7) | 0 |
| `/admin/tutoring/kyc/:id` | no | 44 px - กลับไปคิวตรวจ (89.3x44) | none | 6 of 6 | 6 of 6 | 4.57:1 (#15803d on #dcfce7) | 0 |

## Every measurement

Overflow: `scrollWidth` vs viewport. Smallest target: the smaller side of the smallest interactive element inside `<main>` (and which one). Ring: yes/no for the element that took focus (first Tab = the skip link, or the "open menu" button of the studio shells at 375 px). Contrast: the lowest ratio among the sampled text pairs, and how many pairs were sampled / failed.

| Page | Viewport | Theme | Overflow | Smallest target in `<main>` | < 44 px | Ring, 1st Tab | Ring, 1st content stop (Tab #) | Lowest contrast | Pairs / failing / unresolved | Screenshot |
|---|---|---|---|---|---|---|---|---|---|---|
| `/tutors` | 375 | light | no (375 = 375) | 343x44 ตัวกรอง | 0 | yes | yes (#8) | 4.57:1 | 37 / 0 / 0 | - |
| `/tutors` | 375 | dark | no (375 = 375) | 343x44 ตัวกรอง | 0 | yes | yes (#8) | 4.6:1 | 37 / 0 / 0 | [png](p13-43/tutors-375-dark.png) |
| `/tutors` | 768 | light | no (768 = 768) | 736x44 ตัวกรอง | 0 | yes | yes (#11) | 4.57:1 | 40 / 0 / 0 | [png](p13-43/tutors-768-light.png) |
| `/tutors` | 768 | dark | no (768 = 768) | 736x44 ตัวกรอง | 0 | yes | yes (#11) | 4.6:1 | 40 / 0 / 0 | - |
| `/tutors` | 1280 | light | no (1280 = 1280) | 81.2x44 ใช้ตัวกรอง | 0 | yes | yes (#20) | 4.57:1 | 61 / 0 / 0 | [png](p13-43/tutors-1280-light.png) |
| `/tutors` | 1280 | dark | no (1280 = 1280) | 81.2x44 ใช้ตัวกรอง | 0 | yes | yes (#20) | 4.6:1 | 61 / 0 / 0 | - |
| `/tutors/:slug` | 375 | light | no (375 = 375) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#8) | 4.57:1 | 64 / 0 / 0 | - |
| `/tutors/:slug` | 375 | dark | no (375 = 375) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#8) | 4.6:1 | 64 / 0 / 0 | [png](p13-43/tutor-profile-375-dark.png) |
| `/tutors/:slug` | 768 | light | no (768 = 768) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#11) | 4.57:1 | 67 / 0 / 0 | [png](p13-43/tutor-profile-768-light.png) |
| `/tutors/:slug` | 768 | dark | no (768 = 768) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#11) | 4.6:1 | 67 / 0 / 0 | - |
| `/tutors/:slug` | 1280 | light | no (1280 = 1280) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#20) | 4.57:1 | 71 / 0 / 0 | [png](p13-43/tutor-profile-1280-light.png) |
| `/tutors/:slug` | 1280 | dark | no (1280 = 1280) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#20) | 4.6:1 | 71 / 0 / 0 | - |
| `/tutors/:slug/book` | 375 | light | no (375 = 375) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#9) | 4.6:1 | 57 / 0 / 0 | - |
| `/tutors/:slug/book` | 375 | dark | no (375 = 375) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#9) | 4.6:1 | 57 / 0 / 0 | [png](p13-43/booking-375-dark.png) |
| `/tutors/:slug/book` | 768 | light | no (768 = 768) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#12) | 4.6:1 | 60 / 0 / 0 | [png](p13-43/booking-768-light.png) |
| `/tutors/:slug/book` | 768 | dark | no (768 = 768) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#12) | 4.6:1 | 60 / 0 / 0 | - |
| `/tutors/:slug/book` | 1280 | light | no (1280 = 1280) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#20) | 4.6:1 | 64 / 0 / 0 | [png](p13-43/booking-1280-light.png) |
| `/tutors/:slug/book` | 1280 | dark | no (1280 = 1280) | 39.6x44 ติวเตอร์ | 2 | yes | yes (#20) | 4.6:1 | 64 / 0 / 0 | - |
| `/my-tutoring` | 375 | light | no (375 = 375) | 110.4x44 กำลังจะมาถึง | 0 | yes | yes (#9) | 4.6:1 | 39 / 0 / 0 | - |
| `/my-tutoring` | 375 | dark | no (375 = 375) | 110.4x44 กำลังจะมาถึง | 0 | yes | yes (#9) | 4.6:1 | 39 / 0 / 0 | [png](p13-43/my-tutoring-375-dark.png) |
| `/my-tutoring` | 768 | light | no (768 = 768) | 110.4x44 กำลังจะมาถึง | 0 | yes | yes (#12) | 4.6:1 | 42 / 0 / 0 | [png](p13-43/my-tutoring-768-light.png) |
| `/my-tutoring` | 768 | dark | no (768 = 768) | 110.4x44 กำลังจะมาถึง | 0 | yes | yes (#12) | 4.6:1 | 42 / 0 / 0 | - |
| `/my-tutoring` | 1280 | light | no (1280 = 1280) | 110.4x44 กำลังจะมาถึง | 0 | yes | yes (#20) | 4.6:1 | 46 / 0 / 0 | [png](p13-43/my-tutoring-1280-light.png) |
| `/my-tutoring` | 1280 | dark | no (1280 = 1280) | 110.4x44 กำลังจะมาถึง | 0 | yes | yes (#20) | 4.6:1 | 46 / 0 / 0 | - |
| `/tutoring/checkout/:id` | 375 | light | no (375 = 375) | 109.4x48 คลาสของฉัน | 0 | yes | yes (#1) | 4.6:1 | 47 / 0 / 0 | - |
| `/tutoring/checkout/:id` | 375 | dark | no (375 = 375) | 109.4x48 คลาสของฉัน | 0 | yes | yes (#1) | 4.6:1 | 47 / 0 / 0 | [png](p13-43/checkout-375-dark.png) |
| `/tutoring/checkout/:id` | 768 | light | no (768 = 768) | 109.4x48 คลาสของฉัน | 0 | yes | yes (#1) | 4.6:1 | 50 / 0 / 0 | - |
| `/tutoring/checkout/:id` | 768 | dark | no (768 = 768) | 109.4x48 คลาสของฉัน | 0 | yes | yes (#1) | 4.6:1 | 50 / 0 / 0 | - |
| `/tutoring/checkout/:id` | 1280 | light | no (1280 = 1280) | 109.4x48 คลาสของฉัน | 0 | yes | yes (#1) | 4.6:1 | 54 / 0 / 0 | [png](p13-43/checkout-1280-light.png) |
| `/tutoring/checkout/:id` | 1280 | dark | no (1280 = 1280) | 109.4x48 คลาสของฉัน | 0 | yes | yes (#1) | 4.6:1 | 54 / 0 / 0 | - |
| `/instructor/tutoring/availability` | 375 | light | no (375 = 375) | 85.3x44 ภาพรวม | 0 | yes | yes (#3) | 4.6:1 | 75 / 0 / 0 | - |
| `/instructor/tutoring/availability` | 375 | dark | no (375 = 375) | 85.3x44 ภาพรวม | 0 | yes | yes (#3) | 4.6:1 | 75 / 0 / 0 | [png](p13-43/availability-375-dark.png) |
| `/instructor/tutoring/availability` | 768 | light | no (768 = 768) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.57:1 | 87 / 0 / 0 | - |
| `/instructor/tutoring/availability` | 768 | dark | no (768 = 768) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.6:1 | 87 / 0 / 0 | - |
| `/instructor/tutoring/availability` | 1280 | light | no (1280 = 1280) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.57:1 | 88 / 0 / 0 | [png](p13-43/availability-1280-light.png) |
| `/instructor/tutoring/availability` | 1280 | dark | no (1280 = 1280) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.6:1 | 88 / 0 / 0 | - |
| `/instructor/tutoring/classes` | 375 | light | no (375 = 375) | 85.3x44 ภาพรวม | 0 | yes | yes (#3) | 4.6:1 | 39 / 0 / 0 | - |
| `/instructor/tutoring/classes` | 375 | dark | no (375 = 375) | 85.3x44 ภาพรวม | 0 | yes | yes (#3) | 4.6:1 | 39 / 0 / 0 | [png](p13-43/classes-375-dark.png) |
| `/instructor/tutoring/classes` | 768 | light | no (768 = 768) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.57:1 | 51 / 0 / 0 | - |
| `/instructor/tutoring/classes` | 768 | dark | no (768 = 768) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.6:1 | 51 / 0 / 0 | - |
| `/instructor/tutoring/classes` | 1280 | light | no (1280 = 1280) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.57:1 | 52 / 0 / 0 | [png](p13-43/classes-1280-light.png) |
| `/instructor/tutoring/classes` | 1280 | dark | no (1280 = 1280) | 85.3x44 ภาพรวม | 0 | yes | yes (#13) | 4.6:1 | 52 / 0 / 0 | - |
| `/admin/tutoring/kyc` | 375 | light | no (375 = 375) | 105.4x44 ยืนยันตัวตน | 0 | yes | yes (#3) | 4.6:1 | 30 / 0 / 0 | - |
| `/admin/tutoring/kyc` | 375 | dark | no (375 = 375) | 105.4x44 ยืนยันตัวตน | 0 | yes | yes (#3) | 4.6:1 | 30 / 0 / 0 | [png](p13-43/kyc-queue-375-dark.png) |
| `/admin/tutoring/kyc` | 768 | light | no (768 = 768) | 105.4x44 ยืนยันตัวตน | 0 | yes | yes (#24) | 4.57:1 | 53 / 0 / 0 | - |
| `/admin/tutoring/kyc` | 768 | dark | no (768 = 768) | 105.4x44 ยืนยันตัวตน | 0 | yes | yes (#24) | 4.6:1 | 53 / 0 / 0 | - |
| `/admin/tutoring/kyc` | 1280 | light | no (1280 = 1280) | 105.4x44 ยืนยันตัวตน | 0 | yes | yes (#24) | 4.57:1 | 54 / 0 / 0 | [png](p13-43/kyc-queue-1280-light.png) |
| `/admin/tutoring/kyc` | 1280 | dark | no (1280 = 1280) | 105.4x44 ยืนยันตัวตน | 0 | yes | yes (#24) | 4.6:1 | 54 / 0 / 0 | - |
| `/admin/tutoring/kyc/:id` | 375 | light | no (375 = 375) | 89.3x44 กลับไปคิวตรวจ | 0 | yes | yes (#3) | 4.6:1 | 56 / 0 / 0 | - |
| `/admin/tutoring/kyc/:id` | 375 | dark | no (375 = 375) | 89.3x44 กลับไปคิวตรวจ | 0 | yes | yes (#3) | 4.6:1 | 56 / 0 / 0 | [png](p13-43/kyc-case-375-dark.png) |
| `/admin/tutoring/kyc/:id` | 768 | light | no (768 = 768) | 89.3x44 กลับไปคิวตรวจ | 0 | yes | yes (#24) | 4.57:1 | 79 / 0 / 0 | - |
| `/admin/tutoring/kyc/:id` | 768 | dark | no (768 = 768) | 89.3x44 กลับไปคิวตรวจ | 0 | yes | yes (#24) | 4.6:1 | 79 / 0 / 0 | - |
| `/admin/tutoring/kyc/:id` | 1280 | light | no (1280 = 1280) | 89.3x44 กลับไปคิวตรวจ | 0 | yes | yes (#24) | 4.57:1 | 80 / 0 / 0 | [png](p13-43/kyc-case-1280-light.png) |
| `/admin/tutoring/kyc/:id` | 1280 | dark | no (1280 = 1280) | 89.3x44 กลับไปคิวตรวจ | 0 | yes | yes (#24) | 4.6:1 | 80 / 0 / 0 | - |

## Findings

### Horizontal overflow

None: 54 of 54 measurements have `scrollWidth` equal to the viewport width.

### Touch targets (project rule: at least 44 x 44 px)

Offenders inside the tutoring pages (`<main>`), de-duplicated across viewports and themes:

| Element | Size (w x h) | Seen on |
|---|---|---|
| `<a>` "หน้าแรก" | 43.8 x 44 | `/tutors/:slug`, `/tutors/:slug/book` |
| `<a>` "ติวเตอร์" | 39.6 x 44 | `/tutors/:slug`, `/tutors/:slug/book` |

**Shared chrome outside `<main>`** (header, studio / admin shell, footer, bottom bar - not part of the tutoring feature, listed once):

| Element | Size (w x h) | Layout |
|---|---|---|
| `<button>` "สว่าง" | 32 x 44 | public, learner, tutor, admin |
| `<button>` "มืด" | 32 x 44 | public, learner, tutor, admin |
| `<button>` "ตามระบบ" | 32 x 44 | public, learner, tutor, admin |
| `<a>` "หน้าแรก" | 93.8 x 39 | public, learner |
| `<a>` "คอร์สเรียน" | 93.8 x 39 | public, learner |
| `<a>` "คอร์สของฉัน" | 93.8 x 39 | public, learner |
| `<a>` "เข้าสู่ระบบ" | 93.8 x 39 | public |
| `<a>` "หน้าแรก" | 192 x 39 | public, learner |
| `<a>` "คอร์สเรียน" | 192 x 39 | public, learner |
| `<a>` "คอร์สของฉัน" | 192 x 39 | public, learner |
| `<a>` "เข้าสู่ระบบ" | 192 x 39 | public |
| `<a>` "ประวัติคำสั่งซื้อ" | 93.8 x 39 | learner |
| `<a>` "ประวัติคำสั่งซื้อ" | 192 x 39 | learner |
| `<a>` "ติวเตอร์" | 39.6 x 44 | public, learner |
| `<button>` "เลือกภาษา:TH" | 74.7 x 42 | public, learner |

### Focus ring

A visible ring was found on the first Tab and on the first 6 stops inside `<main>` in all 54 measurements.

### Contrast

3086 text samples (57 distinct colour pairs) were measured; **0 are below their WCAG AA threshold** (4.5:1, or 3:1 for large text); 0 elements sat on an image/gradient and could not be resolved.

The tightest pairs (lowest first):

| Ratio | Text colour on background | Size | Example text | First seen on |
|---|---|---|---|---|
| 4.57:1 | `#15803d` on `#dcfce7` | 14px | ทดลองเรียนฟรี | /tutors @375 light |
| 4.6:1 | `#ffffff` on `#db2777` | 14px | ค้นหา | /tutors @375 light |
| 4.86:1 | `#0f766e` on `#ccfbf1` | 14px | หลักสูตรไทย | /tutors/:slug @375 light |
| 5.3:1 | `#b91c1c` on `#fee2e2` | 12px | ผู้ดูแลระบบ (Admin) | /admin/tutoring/kyc @1280 light |
| 5.49:1 | `#1d4ed8` on `#dbeafe` | 14px | สถิติและความน่าจะเป็น | /tutors @375 light |
| 5.51:1 | `#be185d` on `#f1f5f9` | 14px | หมวดหมู่ | /tutors @1280 light |
| 5.77:1 | `#be185d` on `#f8fafc` | 14px | กลับไปคิวตรวจ | /admin/tutoring/kyc/:id @375 light |
| 5.91:1 | `#94a3b8` on `#1c2637` | 14px | ติวเตอร์ได้รับสถานะยืนยันตัวตนแล้ว | /admin/tutoring/kyc/:id @375 dark |

### Page errors

No uncaught page error in any of the measurements.

## Static checks of `src/app/features/tutoring`

- **`track $index`:** 2 occurrence(s): `src/app/features/tutoring/public/tutor-profile-page/tutor-profile-page.html:176`, `src/app/features/tutoring/public/tutor-profile-page/tutor-profile-page.html:197`. Both iterate the public profile's `educations` / `certificates`, whose C# records (`PublicEducation`, `PublicCertificate`) carry no id; the lists are read-only, server-ordered and never reordered on the client, so index identity is stable. Every other `@for` in the feature tracks a real id (or a constant enum / number).
- **Class names with no CSS definition** (every class used in a tutoring template or its component, looked up in the compiled `styles-FAYTXA5O.css`; Tailwind marker classes `group`/`peer` excluded): **none**.

