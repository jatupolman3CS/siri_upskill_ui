# SIRI UpSkill — Frontend (UI)

E-Learning marketplace (แนว SkillLane / FutureSkill): ผู้เรียนซื้อคอร์สวิดีโอเข้าถึงระยะยาว, instructor สร้างคอร์สเอง, platform หักส่วนแบ่งรายได้ ความปลอดภัยของวิดีโอ (DRM/watermark/กันแชร์บัญชี) เป็น **critical requirement** ไม่ใช่ของแถม

## ⚠️ Repo นี้แยกจาก backend แล้ว (2026-08-25)

| | repo | โฟลเดอร์บนเครื่อง |
|---|---|---|
| **Frontend (repo นี้)** | `https://gitlab.com/Jatuphon.khotsopha/siri_upskill_ui.git` | `C:\ProjectSiriUpSkill\siri_upskill_ui` |
| Backend | `https://gitlab.com/Jatuphon.khotsopha/siri_upskill_backend.git` | `C:\ProjectSiriUpSkill\siri_upskill_backend` |

- โค้ด frontend เดิมอยู่ใต้ `frontend/` ของ monorepo **ตอนนี้ย้ายมาอยู่ที่ root ของ repo นี้แล้ว** (`src/`, `e2e/`, `angular.json`)
- **`docs/*.md` เขียนขึ้นตอนยังเป็น monorepo** — path ที่เขียนว่า `frontend/src/...` ให้อ่านเป็น `src/...` ใน repo นี้ และ path ที่ขึ้นต้นด้วย `backend/` คือไฟล์ใน repo `siri_upskill_backend` ไม่ได้อยู่ที่นี่
- `docs/` ที่นี่เป็น **สำเนาไว้อ่าน** ต้นฉบับอยู่ที่ repo backend — ถ้าต้องแก้เอกสารให้แก้ที่ backend แล้ว copy กลับมา ห้ามแก้ที่นี่ที่เดียว
- **ต้องรัน backend จริงคู่กันถึงจะเห็นข้อมูลจริง**: `dotnet run --project src/Siri.Api --launch-profile http` ที่ `C:\ProjectSiriUpSkill\siri_upskill_backend` (port 5190) แล้ว `proxy.conf.json` ของที่นี่จะ proxy `/api` ไปให้เอง
- อยาก reference สัญญา API จริง: เปิด backend แล้วดู `/openapi/v1.json` หรืออ่านไฟล์ `Endpoint.cs`/`*Endpoints.cs` ใน repo backend ตรง ๆ **ห้ามเดา field เอง**

## Stack (ห้ามเปลี่ยนโดยไม่ถาม)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Angular (standalone + signals + zoneless + SSR) + Tailwind CSS v4 | **22.1.x** (core 22.1.2 / CLI 22.1.4) |
| Player | Shaka Player | latest |
| Icon | `@ng-icons/phosphor-icons` | — |
| Test | Vitest + Playwright | — |
| _(backend — อยู่อีก repo)_ | _ASP.NET Core .NET 10, EF Core 10, SQL Server 2022, Redis, Hangfire, Bunny Stream, Stripe_ | — |

**ห้ามใช้:** NgModule, zone.js pattern

## เอกสารอ้างอิง — อ่านก่อนลงมือ

| ทำงานเรื่อง | อ่านไฟล์ |
|------------|---------|
| **รับ task มาทำ (เริ่มที่นี่)** | **`docs/TASKS.md`** — task ทั้งหมดมี ID เช่น `P1-22` พร้อม dependency, acceptance และคอลัมน์ `Status` |
| ประวัติงานที่ทำไปแล้วโดยละเอียด | `docs/PROGRESS.md` |
| Angular / TypeScript ใด ๆ | `.claude/rules/frontend.md` |
| หน้าจอ, component, สี, layout, a11y | `.claude/rules/ui-design.md` + `design-system/siri-upskill/MASTER.md` |
| mockup ที่เจ้าของโปรเจ็คส่งมา (16 หน้าจอ) | `design-system/siri-upskill/mockups-2026-08-21/` |
| requirement / scope ใด ๆ | `docs/REQUIREMENTS.md` |
| token storage, XSS, ข้อมูลส่วนบุคคล | `.claude/rules/security.md` + `docs/SECURITY.md` |
| ลำดับงาน, commit, PR, definition of done | `.claude/rules/workflow.md` |
| เลือก vendor / ตัดสินใจสถาปัตยกรรม | `docs/DECISIONS.md` |
| แผนงาน, phase, ลำดับความสำคัญ | `docs/ROADMAP.md` |
| C# / API / schema / migration | **อยู่ที่ repo `siri_upskill_backend`** |

## กฎเหล็ก (ใช้กับทุกงาน)

1. **ภาษา** — คุยกับ user เป็นภาษาไทย; โค้ด, ชื่อตัวแปร, comment, commit message, ชื่อไฟล์ เป็นภาษาอังกฤษเสมอ ข้อความที่ผู้ใช้ปลายทางเห็นต้องอยู่ในไฟล์ i18n ห้าม hardcode ในโค้ด
2. **ห้ามเดา version / API** — ถ้าไม่แน่ใจว่า Angular 22 มี API นั้นจริงไหม ให้ค้นหาหรือเช็คจาก `package.json` ก่อน **ห้ามแต่ง API ขึ้นมาเอง** และห้ามเดา response shape ของ backend
3. **Security เป็น acceptance criteria** — access token เก็บใน memory เท่านั้น (ห้าม localStorage), refresh อยู่ใน httpOnly cookie, ห้าม `bypassSecurityTrustHtml` โดยไม่ sanitize
4. **ห้ามคิดราคา / ตัดสินสิทธิ์ที่ frontend** — server เท่านั้นที่คำนวณราคา ส่วนลด และตัดสินว่าใครดูอะไรได้ การซ่อนปุ่มไม่นับเป็นการป้องกัน
5. **จัดการ loading / error / empty state ให้ครบทุกหน้าที่ดึงข้อมูล** ไม่ใช่แค่ happy path — `resource()`/`rxResource()` ต้อง `hasValue()` guard ก่อนอ่าน `.value()` เสมอ (`.value()` throw จริงตอน error ไม่ว่าจะตั้ง `defaultValue` ไว้หรือไม่ — เคยทำทั้งเว็บพังมาแล้ว)
6. **ทำตาม scope ที่สั่ง** — เห็นปัญหานอกขอบเขตให้บอก อย่าไปแก้เอง
7. **ห้ามสร้างไฟล์ที่ไม่จำเป็น** โดยเฉพาะ README / summary / doc ซ้ำซ้อน แก้ไฟล์เดิมก่อนเสมอ
8. **ห้าม commit / push เอง** เว้นแต่ user สั่งชัดเจน
9. **ห้ามใส่ secret ลงในโค้ดหรือ config ที่ commit**
10. **เขียน test มาพร้อมโค้ด** สำหรับ service ที่มี logic, computed signal, guard, interceptor (ไม่ใช่ค่อยเขียนทีหลัง)
11. **บอกความจริงเรื่องผลลัพธ์** — build ไม่ผ่าน test แดง หรือทำไม่ครบ ให้บอกตรง ๆ พร้อม output ห้ามสรุปว่า "เสร็จแล้ว" ถ้ายังไม่ได้รัน
12. **ก่อนแตะโค้ดที่มีอยู่** — อ่าน pattern รอบข้างแล้วทำตาม อย่าเอา style ใหม่มายัด

## คำสั่งที่ใช้บ่อย

```bash
npm run start
```
```bash
npm run test
```
```bash
npm run lint
```
```bash
npm run build
```
```bash
# E2E smoke (P0-36) — ต้องมี backend จริงรันอยู่ที่ localhost:5190 ก่อน
# (dotnet run --project src/Siri.Api --launch-profile http ที่ C:\ProjectSiriUpSkill\siri_upskill_backend)
# แล้ว proxy.conf.json ของที่นี่ต่อให้เอง
# concurrent-session-eviction.spec.ts ต้องตั้ง env E2E_SEED_EMAIL/E2E_SEED_PASSWORD ก่อนถึงจะไม่ skip
# ⚠️ register.spec.ts's happy-path สร้าง user row จริงบน DB ที่ backend ต่ออยู่ — เช็คก่อนว่าไม่ใช่ DB จริงที่แชร์กับใคร
npm run e2e
```

## สถานะโปรเจ็คปัจจุบัน

> **แหล่งความจริงเรื่อง "task ไหนเสร็จแล้ว" คือคอลัมน์ `Status` ใน `docs/TASKS.md` เท่านั้น** · บันทึกรายละเอียดของงานที่ทำไปแล้วทั้งหมดอยู่ที่ `docs/PROGRESS.md` (ยกออกมาจากไฟล์นี้ตอนแยก repo 2026-08-25)
>
> ฝั่ง UI ทำถึง P1 แล้ว (`P0-31`…`P0-35`, `P1-20`…`P1-24`): design system + UI kit 10 ตัว + หน้า auth 6 หน้า + public layout + mega menu + catalog/filter + course detail + home + SEO service ทั้งหมดต่อ API จริง — build/lint สะอาด, unit test 168/168 ผ่าน
> - **หน้า FE 6 หน้าที่ Antigravity ทำใน P2–P6 ยังเป็น mock ไม่ต่อ API จริง** — ดู `docs/TASKS.md` § "สถานะจริงของงานที่ยังไม่ปิด"
> - `P2-20` ยังไม่มี Shaka Player จริง (ใช้ `<video>` ธรรมดาอยู่)
> - **สีหลักรีแบรนด์เป็นชมพู `#DB2777` แล้ว** (D-17 ทับมติเดิมของ P0-31 ที่เป็นน้ำเงิน) — `src/app/styles/tokens.css` เป็นแหล่งความจริง ห้ามเขียน hex ดิบใน component

**หนี้ที่รู้แล้ว ยังไม่แก้**
- `TranslatePipe` / `CurrencyThbPipe` ยังเป็น `pure: true` ทั้งที่อ่าน signal ข้างใน → สลับภาษา TH/EN ระหว่างอยู่หน้าเดิมไม่ทำงานจริง (ต้องเปลี่ยนเป็น `pure: false` แบบเดียวกับที่ `DurationPipe` แก้ไปแล้ว)
- `CategoryMegaMenu` / `CategoryAccordionItem` ไม่เคยเรียก `provideIcons()` ให้ไอคอนที่ตัวเองใช้จริง
- `CoursesPage` การ์ดคอร์สยังใช้ `<img>` ธรรมดา ไม่ใช่ `NgOptimizedImage` (ผิด hard rule ใน `.claude/rules/frontend.md`)
- `CoursesPage` ยังไม่มี canonical/OG เป็นของตัวเอง — ต้องตัดสินก่อนว่า URL ที่มี filter (`?category=x&sort=y`) จะ canonicalize ไปที่ไหน (แนะนำกลับไป `/courses` เปล่า ๆ)
- 3 spec flaky อยู่ก่อนแล้ว: `mobile-nav` / `category-mega-menu` / `category-accordion-item` (async router-navigation race)
