# Contract: P13-01 `Siri.Modules.Tutoring` — module scaffold, ติวเตอร์ (TUTOR_PROFILE) + state machine ยืนยันตัวตน, วิชา, ราคา/คอร์สที่สอน, การศึกษา/ใบรับรอง, policy `TutorOnly`

Status: FROZEN · วันที่: 2026-10-14 · Module: **`Siri.Modules.Tutoring` ใหม่ — Repository+Service + UPPERCASE entity/property/DB (schema `TUTORING`, D-17/D-25)** · แตะ `Siri.Api` (controller, policy, rate limit) · `Siri.SharedKernel` (policy name) · `Siri.Workers` (wiring) · `tests/*` (wiring) — **ไม่แตะ Catalog / Identity / Live / Payout / Commerce**

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..E)** · ไม่ต้องผ่าน `DESIGN_DATABASE` (§2 ละเอียดระดับคอลัมน์/index/FK/ชื่อ constraint แล้ว) · เหตุผลที่ไม่ส่ง Antigravity: เป็นด่านสิทธิ์ (`TutorOnly`), Contracts ข้ามโมดูลใหม่, ตัวตนที่ผูกกับเงิน (`INSTRUCTOR_PROFILE_ID`) และรากของโมดูลที่ P13-02..17 ต่อยอดทั้งหมด

> **ชุดสัญญา P13 Wave 1-2 ที่ต้องอ่านคู่กัน:** `P13-02` (KYC) · `P13-03` (เวลาว่าง + SlotCalculator + `TutorPriceCalculator`) · `P13-04` (ค้นหา/โปรไฟล์สาธารณะ) · `P13-05` (ผู้เรียน + booking core) · ดัชนีและชื่อกลางที่ทุกสัญญาต้องใช้ตรงกัน → `P13-README.md` · **ถ้าขัดกับ `docs/TUTORING.md` ให้ยึดไฟล์นี้ (ส่วนที่ต่างจาก TUTORING.md ระบุไว้ใน "Deviations" ท้ายไฟล์)**

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body — ไม่เดา) ที่คุมดีไซน์นี้

| # | ข้อเท็จจริง | ผลต่อ contract |
|---|---|---|
| F1 | Persistence สแกน entity เฉพาะ assembly ชื่อ `Siri.Modules.*` ที่ **โหลดแล้ว** (`AppDbContext.GetModuleAssemblies`) — assembly จะถูกโหลดก็ต่อเมื่อ host อ้างถึง type ในนั้น (`AddTutoringModule` ทำหน้าที่นี้) | ต้องเรียก `.AddTutoringModule(...)` ทั้งใน `Siri.Api/Program.cs` และ `Siri.Workers/Program.cs` ไม่งั้น migration/โมเดลไม่เห็นตาราง |
| F2 | `DatabaseIdentifierLengthTests` มี `Assert.Equal(11, moduleCount)` และ `ModuleAssemblyCatalog.Modules` มี 11 โมดูล (Live คือตัวที่ 11) | เพิ่ม Tutoring เป็นตัวที่ 12 และแก้ตัวเลข `11 → 12` (ห้ามลบ assert) |
| F3 | ArchitectureTests ห้าม module อ้าง `*.Domain`/`*.Infrastructure` ของ module อื่น **เท่านั้น** (ไม่ห้าม `*.Application`/`*.Contracts`) และห้าม `Siri.*` ที่ไม่ใช่ module (SharedKernel/Api/Workers/Integrations.*) อ้าง `Microsoft.EntityFrameworkCore` | `Siri.Integrations.Storage` (P13-02) และ `Siri.SharedKernel` ห้ามมี EF; `Tutoring.Domain` ห้ามรู้ EF/ASP.NET |
| F4 | `ThaiSlugGenerator` อยู่ใน `Catalog.Infrastructure` (public static แต่ **อ้างข้ามโมดูลไม่ได้** ตาม F3) และ `IInstructorProfileReader` มีเมธอดเดียว `GetProfileIdByUserIdAsync` (ไม่คืนชื่อ) | Tutoring ถือ slug generator ของตัวเอง (สำเนาตาราง map อักษรไทย — ดู §5.4) และให้ติวเตอร์กรอก `displayName` เอง; ใช้ `IInstructorApprovalReader.IsApprovedAsync` + `IInstructorProfileReader.GetProfileIdByUserIdAsync` (มีอยู่แล้ว **ไม่แก้ Catalog**) |
| F5 | `ApprovedInstructorAuthorizationHandler` ผ่านให้ Admin/SuperAdmin โดยไม่ lookup และ resolve `IInstructorApprovalReader` แบบ lazy ผ่าน `IServiceProvider` (กัน host ที่ไม่ลง Catalog) | `TutorOnly` ใช้แพทเทิร์นเดียวกัน **แต่ Admin ไม่ bypass** (Admin ไม่มี `TUTOR_PROFILE`) |
| F6 | `ISecurityAuditContract.RecordAuditAsync` เรียก `dbContext.SaveChangesAsync` เอง (commit ทุกอย่างที่ stage ไว้บน `AppDbContext` เดียวกันพร้อมกัน) | ในทุก flow ที่มี audit: stage ทุกอย่างให้ครบ **แล้วเรียก audit เป็นขั้นสุดท้าย** — มันคือ commit |
| F7 | `DomainError` → HTTP: `not_found` 404 · `validation` 400 · `forbidden` 403 · `conflict` 409 · `unavailable` 503; sub-code เสถียรอยู่ใน `reason` (ไม่ใช่ `errorCode`) และ `Extensions` ใส่ได้ (key ที่สงวน: traceId/errorCode/reason/type/title/status/detail/instance) | โค้ดข้อผิดพลาด `tutoring.*` ทุกตัวในชุดสัญญานี้คือค่า `reason`; `title` เป็นข้อความไทย |
| F8 | `RateLimiterConfiguration` ลงทะเบียน policy ด้วย `AddPolicy<string>(name, partitioner)` + helper `CreateUserPartition` (private) และ **ไม่มี forwarded-headers** (`RemoteIpAddress` หลัง proxy = IP ของ proxy) | policy ต่อ IP (`tutoring-search`/`tutoring-slots`) ใช้ได้เป็น backstop รวมทั้งแอปเท่านั้น — ตั้งโควตาให้สูงพอและระบุไว้ตรง ๆ (§7) |
| F9 | `Siri.Api.csproj` และ `Siri.Workers.csproj` ต่างมี `ProjectReference` ทุก module; `Siri.Api` อ้าง `Siri.Workers` (เพราะ `RecurringJobsRegistration`) | ต้องเพิ่ม reference ทั้งสองไฟล์ + `RecurringJobIds` อยู่ใน `Siri.Workers` |
| F10 | `src/Siri.Api/Dockerfile` และ `src/Siri.Workers/Dockerfile` ลิสต์ `COPY …csproj` ทีละโปรเจ็ค (layer cache) และ **ขาด Live / Integrations.Google / Integrations.Messaging อยู่แล้ว** (ช่องว่างเดิม); `Dockerfile.api`/`Dockerfile.job` ที่ root `COPY src` ทั้งก้อน (ไม่ต้องแก้) | WP-A เพิ่มบรรทัด Tutoring ในสองไฟล์นั้น **และรายงานช่องว่างเดิม** (ไม่ขยาย scope เอง) |
| F11 | Npgsql EF 10.0.3 **ไม่มี API exclusion constraint** (ตรวจ xml/dll แล้ว) และ modules ไม่ reference Npgsql (provider-agnostic) | ใช้ raw SQL ใน migration (P13-05) และเพิ่ม helper ตรวจ SQLSTATE ที่ `Siri.Persistence` (P13-05 §6.2) |

---

## 1. Scope & task IDs

**ในขอบเขต (P13-01):**
- project ใหม่ `Siri.Modules.Tutoring` + wiring ครบ (§3)
- ตาราง/entity: `SUBJECTS`, `TUTOR_PROFILES`, `TUTOR_OFFERINGS`, `TUTOR_EDUCATIONS`, `TUTOR_CERTIFICATES` + seed วิชา (§2, §4)
- state machine ของ `TUTOR_PROFILE` (§5.1) + `TutorReadiness`
- policy `TutorOnly` + `Tutoring.Contracts.ITutorVerificationReader` (§5.2)
- API ติวเตอร์ (`tutor/profile|offerings|educations|certificates`, รูป, วิดีโอแนะนำ, เปิด/ปิดรับงาน) + API แอดมิน (`subjects`, `tutors` list/detail/suspend/reinstate/commission)
- rate-limit policy + output-cache constants ของ Tutoring (§7, §5.6) · Options `TutoringOptions`/`TutoringProfileOptions` (§8)
- migration `AddTutoringCore`

**นอกขอบเขต (ห้ามทำใน P13-01):** เอกสาร KYC/consent/ตัดสิน (P13-02 — แต่ **domain method** ที่ P13-02 เรียก อยู่ที่นี่) · availability/slots (P13-03) · ค้นหา/โปรไฟล์สาธารณะ/`GET subjects` สาธารณะ (P13-04) · ผู้เรียน/จอง (P13-05) · เงิน/คอมมิชชันจริง (P13-06/07 — ที่นี่แค่เก็บคอลัมน์ `COMMISSION_PERCENT_OVERRIDE` + endpoint แก้ + audit) · รีวิว/คะแนน (P13-08/13 — ที่นี่แค่คอลัมน์ denormalized + updater) · FE

---

## 2. Schema delta — migration `AddTutoringCore` (additive ล้วน)

> กฎร่วม: schema `TUTORING` (UPPERCASE) · ชื่อ table/column UPPER_SNAKE_CASE ผ่าน `ApplyUppercaseNamingConventions` · entity class UPPERCASE เอกพจน์ · property UPPER_SNAKE_CASE **ยกเว้น `IAuditable` (`CreatedAtUtc/CreatedBy/UpdatedAtUtc/UpdatedBy`) ต้อง PascalCase และ map `HasColumnName("CREATED_AT_UTC"…)`** (แบบเดียวกับ `SESSION_MEETING`) · เวลา `timestamptz(3)` `HasPrecision(3)` UTC · PK `uuid` UUIDv7 (`UuidV7.NewId()` ใน factory) · enum เก็บ string `HasConversion<string>()` + `HasMaxLength` · เงิน `HasPrecision(18,2)` · concurrency token = `ROW_VERSION bytea` (`.IsConcurrencyToken().HasColumnType("bytea")` — `ConcurrencyTokenInterceptor` หมุนค่า) · **ไม่มี FK ข้าม schema** · FK ภายใน `TUTORING` ทุกเส้นเป็น `NoAction` (ห้าม cascade) · ตั้งชื่อ constraint/index เองทุกตัว (≤ 63 ไบต์ — `DatabaseIdentifierLengthTests`)
>
> **ชื่อคอลัมน์ PK = ชื่อคอลัมน์ FK ที่ตารางอื่นใช้อ้างถึง** (ตามที่ `TUTORING.md` §2 ใช้ `TUTOR_ID`/`OFFERING_ID`/`SUBJECT_ID`/`SESSION_ID`/`BOOKING_ID`/… ในตารางลูก) — ตาราง PK ทั้งหมดของ Tutoring อยู่ที่ `P13-README.md` §2

### 2.1 `TUTORING.SUBJECTS` (entity `SUBJECT : IAuditable`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `SUBJECT_ID` | uuid PK | no | |
| `SLUG` | varchar(80) | no | UNIQUE · `^[a-z0-9]+(-[a-z0-9]+)*$` · **ห้ามแก้หลังสร้าง** (URL ค้นหาอ้างถึง) |
| `NAME_TH` | varchar(120) | no | |
| `NAME_EN` | varchar(120) | no | |
| `PARENT_ID` | uuid | yes | self-FK → `SUBJECTS` (NoAction) · ลึกสูงสุด 2 ระดับ (กลุ่ม → วิชา) |
| `SORT_ORDER` | int | no | default 0 |
| `IS_ACTIVE` | boolean | no | default true |
| audit | | | PascalCase |

Index/constraint: `PK_SUBJECTS` · `UQ_SUBJECTS_SLUG` (`SLUG`) · `IX_SUBJECTS_PARENT_SORT` (`PARENT_ID`,`SORT_ORDER`) · FK `FK_SUBJECTS_PARENT` (`PARENT_ID`→`SUBJECTS.SUBJECT_ID`, NoAction)
กติกา: วิชา **ทุกแถว (กลุ่มหรือไม่) เลือกเป็น offering ได้**; `PARENT_ID` ใช้จัดกลุ่ม/กรอง (กรองด้วยกลุ่ม = กลุ่มนั้น + ลูกทั้งหมด — P13-04) · ไม่มี DELETE (แอดมินปิดด้วย `IS_ACTIVE=false`) · วิชาที่ปิดแล้ว: เลือกใหม่ใน offering ไม่ได้ แต่ offering เดิมยังใช้ได้

### 2.2 `TUTORING.TUTOR_PROFILES` (entity `TUTOR_PROFILE : IAuditable`) — **aggregate root ของติวเตอร์**

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `TUTOR_ID` | uuid PK | no | |
| `USER_ID` | uuid | no | `identity.Users.Id` (ไม่มี FK) · **UNIQUE** |
| `INSTRUCTOR_PROFILE_ID` | uuid | no | `catalog.InstructorProfiles.Id` (ไม่มี FK) — คีย์ของเงิน/payout · **UNIQUE** |
| `SLUG` | varchar(100) | no | UNIQUE · ไม่เปลี่ยนหลังสร้าง |
| `DISPLAY_NAME` | varchar(80) | no | **เพิ่มจาก TUTORING.md** (ดู Deviations D1) — ชื่อที่แสดงสาธารณะ/ค้นหา |
| `HEADLINE` | varchar(120) | yes | |
| `BIO` | varchar(4000) | no | default `''` · **plain text** |
| `GENDER` | varchar(16) | no | `TutorGender`: `Male\|Female\|Other\|Undisclosed` (default `Undisclosed`) |
| `PHOTO_STORAGE_KEY` | varchar(500) | yes | key ใน bucket `Storage:R2` (private) |
| `INTRO_VIDEO_ASSET_ID` | uuid | yes | `media.MediaAssets` id (ไม่มี FK) |
| `YEARS_EXPERIENCE` | int | no | default 0 · CHECK 0–60 |
| `STATUS` | varchar(24) | no | `TutorStatus` (§5.1) default `Draft` |
| `STATUS_REASON` | varchar(1000) | yes | **เพิ่ม** (D2) เหตุผล NeedsInfo/Rejected/Suspended ที่ติวเตอร์เห็น |
| `STATUS_CHANGED_AT_UTC` | timestamptz(3) | no | **เพิ่ม** (D2) |
| `IS_LISTED` | boolean | no | default false · true ได้เฉพาะ `STATUS=Verified` |
| `MIN_NOTICE_HOURS` | int | no | default 24 · CHECK 1–168 (P13-03 เป็นผู้เปิด endpoint แก้) |
| `BUFFER_MINUTES` | int | no | default 10 · CHECK 0–60 |
| `MAX_ADVANCE_DAYS` | int | no | default 60 · CHECK 7–180 |
| `COMMISSION_PERCENT_OVERRIDE` | numeric(5,2) | yes | null = ใช้ `Tutoring:DefaultCommissionPercent` · CHECK 0–50 · **แก้ได้เฉพาะ admin + audit** |
| `RATING_AVERAGE` | numeric(3,2) | no | default 0 · **denormalized** |
| `RATING_COUNT` | int | no | default 0 · **denormalized** |
| `COMPLETED_SESSIONS_COUNT` | int | no | default 0 · **denormalized** |
| `RELIABILITY_SCORE` | int | no | default 100 · **denormalized** (ความหมาย/สูตรเป็นของ P13-08) |
| `NEXT_AVAILABLE_AT_UTC` | timestamptz(3) | yes | **denormalized** (เขียนโดย job P13-03) |
| `VERIFIED_AT_UTC` | timestamptz(3) | yes | ครั้งแรกที่ Verified (ไม่ล้างเมื่อ Suspended) |
| `ROW_VERSION` | bytea | no | concurrency token |
| audit | | | PascalCase |

Index/constraint ใน `AddTutoringCore`: `PK_TUTOR_PROFILES` · `UQ_TUTOR_PROFILES_USER_ID` · `UQ_TUTOR_PROFILES_INSTR_PROFILE` · `UQ_TUTOR_PROFILES_SLUG` · `IX_TUTOR_PROFILES_STATUS` (`STATUS`,`STATUS_CHANGED_AT_UTC`) (admin queue) · CHECK `CK_TUTOR_PROFILES_SETTINGS` (`MIN_NOTICE_HOURS` BETWEEN 1 AND 168 AND `BUFFER_MINUTES` BETWEEN 0 AND 60 AND `MAX_ADVANCE_DAYS` BETWEEN 7 AND 180 AND `YEARS_EXPERIENCE` BETWEEN 0 AND 60) · CHECK `CK_TUTOR_PROFILES_COMMISSION` (`COMMISSION_PERCENT_OVERRIDE` IS NULL OR BETWEEN 0 AND 50) · CHECK `CK_TUTOR_PROFILES_LISTED` (`IS_LISTED` = false OR `STATUS` = 'Verified') ← invariant ระดับ DB สำรองจาก domain · CHECK `CK_TUTOR_PROFILES_RELIABILITY` (`RELIABILITY_SCORE` BETWEEN 0 AND 100 AND `RATING_COUNT` >= 0 AND `COMPLETED_SESSIONS_COUNT` >= 0 AND `RATING_AVERAGE` BETWEEN 0 AND 5)
**Index ค้นหา (partial/GIN) เป็นของ P13-04 (`AddTutorSearch`) — ห้ามเพิ่มที่นี่** (กันชนกันของ migration)
**ค่า denormalized** (`RATING_*`, `COMPLETED_SESSIONS_COUNT`, `RELIABILITY_SCORE`, `NEXT_AVAILABLE_AT_UTC`): `private set` + **เขียนผ่าน `TutorProfileStatsUpdater` (Infrastructure, `ExecuteUpdateAsync`) เท่านั้น** (database.md "ห้ามเขียนจากหลายที่") — entity ไม่มี method แก้ค่าเหล่านี้ (เทสต์ §9 ตรวจ)

### 2.3 `TUTORING.TUTOR_OFFERINGS` (entity `TUTOR_OFFERING : IAuditable`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `OFFERING_ID` | uuid PK | no | |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` NoAction |
| `SUBJECT_ID` | uuid | no | FK → `SUBJECTS` NoAction |
| `LEVEL` | varchar(24) | no | `TutorLevel`: `Primary\|LowerSecondary\|UpperSecondary\|University\|Competitive\|Adult` |
| `CURRICULUM` | varchar(16) | no | `TutorCurriculum`: `Thai\|EP\|International` |
| `HOURLY_RATE_ONE_ON_ONE` | numeric(18,2) | no | ต่อ 60 นาที |
| `GROUP_HOURLY_RATE_PER_SEAT` | numeric(18,2) | yes | null = ไม่เปิดกลุ่ม · ต้องตั้งคู่กับ `GROUP_MAX_SEATS` |
| `GROUP_MAX_SEATS` | int | yes | 2–6 (`Tutoring:Profile:MaxGroupSeats`) |
| `TRIAL_ENABLED` | boolean | no | default false |
| `TRIAL_MINUTES` | int | yes | 15 หรือ 30 (null เมื่อ `TRIAL_ENABLED=false`) |
| `TRIAL_PRICE` | numeric(18,2) | yes | 0 = ฟรี · ราคาเต็มของ trial (ไม่ใช่ต่อชั่วโมง) |
| `IS_ACTIVE` | boolean | no | default true |
| audit | | | |

Index/constraint: `PK_TUTOR_OFFERINGS` · FK `FK_TUTOR_OFFERINGS_TUTOR` (`TUTOR_ID`) · FK `FK_TUTOR_OFFERINGS_SUBJECT` (`SUBJECT_ID`) · **UQ `UQ_TUTOR_OFFERINGS_COMBO`** (`TUTOR_ID`,`SUBJECT_ID`,`LEVEL`,`CURRICULUM`) · `IX_TUTOR_OFFERINGS_SUBJECT_ACTIVE` (`SUBJECT_ID`,`LEVEL`,`CURRICULUM`) `HasFilter("\"IS_ACTIVE\" = true")` · CHECK `CK_TUTOR_OFFERINGS_GROUP` ((`GROUP_HOURLY_RATE_PER_SEAT` IS NULL AND `GROUP_MAX_SEATS` IS NULL) OR (`GROUP_HOURLY_RATE_PER_SEAT` IS NOT NULL AND `GROUP_MAX_SEATS` BETWEEN 2 AND 6)) · CHECK `CK_TUTOR_OFFERINGS_TRIAL` ((`TRIAL_ENABLED` = false AND `TRIAL_MINUTES` IS NULL AND `TRIAL_PRICE` IS NULL) OR (`TRIAL_ENABLED` = true AND `TRIAL_MINUTES` IN (15,30) AND `TRIAL_PRICE` >= 0)) · CHECK `CK_TUTOR_OFFERINGS_RATES` (`HOURLY_RATE_ONE_ON_ONE` > 0)
**ไม่มี DELETE** (booking/session อ้างถึงภายหลัง) — ปิดด้วย `IS_ACTIVE=false` · ราคาแก้ได้ → มีผลกับ booking ใหม่เท่านั้น (booking snapshot ราคาเอง — P13-05)

### 2.4 `TUTORING.TUTOR_EDUCATIONS` (entity `TUTOR_EDUCATION : IAuditable`)
`EDUCATION_ID` PK · `TUTOR_ID` FK (NoAction, `FK_TUTOR_EDUCATIONS_TUTOR`) · `INSTITUTION` varchar(160) not null · `DEGREE` varchar(120) not null · `FIELD` varchar(120) null · `YEAR_FROM` int not null · `YEAR_TO` int null (null = กำลังศึกษา) · `SORT_ORDER` int default 0 · CHECK `CK_TUTOR_EDUCATIONS_YEARS` (`YEAR_FROM` BETWEEN 1950 AND 2100 AND (`YEAR_TO` IS NULL OR `YEAR_TO` >= `YEAR_FROM`)) · `IX_TUTOR_EDUCATIONS_TUTOR` (`TUTOR_ID`,`SORT_ORDER`) · **hard delete ได้** (ไม่ใช่ข้อมูลเงิน/สิทธิ์)

### 2.5 `TUTORING.TUTOR_CERTIFICATES` (entity `TUTOR_CERTIFICATE : IAuditable`)
`CERTIFICATE_ID` PK · `TUTOR_ID` FK (`FK_TUTOR_CERTIFICATES_TUTOR`) · `TITLE` varchar(160) not null · `ISSUER` varchar(160) null · `YEAR` int not null (CHECK 1950–2100) · `DOCUMENT_ID` uuid null — **สงวนชื่อไว้ตาม TUTORING.md (รูปใบรับรองที่โชว์สาธารณะ) v1 เป็น null เสมอ ไม่มี FK ไม่มี endpoint** · `SORT_ORDER` int · `IX_TUTOR_CERTIFICATES_TUTOR` (`TUTOR_ID`,`SORT_ORDER`) · hard delete ได้

### 2.6 Seed วิชา (ใน `AddTutoringCore` — `migrationBuilder.Sql`/`InsertData` เขียนมือ ไม่ผ่าน `HasData`)
เหตุผล: `HasData` จะเก็บ seed ใน model snapshot และ migration ถัดไปอาจ UPDATE ทับสิ่งที่แอดมินแก้ใน production · ใช้ `INSERT … ON CONFLICT ("SLUG") DO NOTHING` (idempotent) · `PARENT_ID` หาจาก slug (`(SELECT "SUBJECT_ID" FROM … WHERE "SLUG"='math')`) · `SUBJECT_ID` = **UUIDv7 literal ที่ generate ครั้งเดียวแล้ว paste** (ห้ามใช้ `gen_random_uuid()` ซึ่งเป็น v4) · `CREATED_AT_UTC` = `2026-10-14T00:00:00Z` · `IS_ACTIVE=true` · ข้อความภาษาไทยเป็น UTF-8 ตรง ๆ ในไฟล์ migration

| sort | slug | NAME_TH | NAME_EN | parent |
|---|---|---|---|---|
| 10 | `math` | คณิตศาสตร์ | Mathematics | — |
| 11-15 | `algebra` · `geometry` · `trigonometry` · `calculus` · `statistics` | พีชคณิต · เรขาคณิต · ตรีโกณมิติ · แคลคูลัส · สถิติและความน่าจะเป็น | Algebra · Geometry · Trigonometry · Calculus · Statistics & Probability | `math` |
| 20 | `science` | วิทยาศาสตร์ | Science | — |
| 21-25 | `physics` · `chemistry` · `biology` · `earth-science` · `general-science` | ฟิสิกส์ · เคมี · ชีววิทยา · วิทยาศาสตร์โลกและอวกาศ · วิทยาศาสตร์ทั่วไป | Physics · Chemistry · Biology · Earth & Space Science · General Science | `science` |
| 30 | `languages` | ภาษา | Languages | — |
| 31-37 | `english` · `thai-language` · `chinese` · `japanese` · `korean` · `french` · `german` | ภาษาอังกฤษ · ภาษาไทย · ภาษาจีน · ภาษาญี่ปุ่น · ภาษาเกาหลี · ภาษาฝรั่งเศส · ภาษาเยอรมัน | English · Thai Language · Chinese · Japanese · Korean · French · German | `languages` |
| 40 | `social-studies` | สังคมศึกษา | Social Studies | — |
| 41-43 | `history` · `geography` · `economics` | ประวัติศาสตร์ · ภูมิศาสตร์ · เศรษฐศาสตร์ | History · Geography · Economics | `social-studies` |
| 50 | `business` | ธุรกิจและการเงิน | Business & Finance | — |
| 51-53 | `accounting` · `business-admin` · `finance` | การบัญชี · บริหารธุรกิจ · การเงินและการลงทุน | Accounting · Business Administration · Finance & Investing | `business` |
| 60 | `computing` | คอมพิวเตอร์และเทคโนโลยี | Computing & Technology | — |
| 61-65 | `programming` · `python` · `data-analysis` · `computer-basics` · `office-skills` | การเขียนโปรแกรม · ไพธอน · การวิเคราะห์ข้อมูล · คอมพิวเตอร์พื้นฐาน · โปรแกรมสำนักงาน (Excel/Word) | Programming · Python · Data Analysis · Computer Basics · Office Skills | `computing` |
| 70 | `arts-music` | ศิลปะและดนตรี | Arts & Music | — |
| 71-75 | `drawing` · `piano` · `guitar` · `singing` · `music-theory` | วาดภาพและศิลปะ · เปียโน · กีตาร์ · ขับร้อง · ทฤษฎีดนตรี | Drawing & Art · Piano · Guitar · Singing · Music Theory | `arts-music` |
| 80 | `exam-prep` | เตรียมสอบ | Exam Preparation | — |
| 81-89 | `tgat` · `tpat` · `a-level` · `ielts` · `toeic` · `toefl` · `sat` · `academic-olympiad` · `school-entrance-exam` | TGAT · TPAT · A-Level · IELTS · TOEIC · TOEFL · SAT · โอลิมปิกวิชาการ · สอบเข้าโรงเรียน (ม.1/ม.4) | TGAT · TPAT · A-Level · IELTS · TOEIC · TOEFL · SAT · Academic Olympiad · School Entrance Exams | `exam-prep` |

รวม 8 กลุ่ม + 42 วิชา = **50 แถว** · integration test ตรวจ: จำนวน 50, slug ไม่ซ้ำ, ทุก parent มีอยู่และ `PARENT_ID IS NULL` ที่ระดับกลุ่ม, ชื่อไม่ว่าง, รันซ้ำ (`INSERT … ON CONFLICT`) ไม่เพิ่มแถว

### 2.7 ชื่อ migration & ข้อควรระวัง
`AddTutoringCore` · อ่านไฟล์ทั้งหมดก่อนส่ง (additive ล้วน ไม่มี shadow column/FK ซ้ำ — ระวังบทเรียน P1-02: navigation ที่ไม่ระบุ `.WithMany(nav)` ทำให้เกิด shadow FK) · ชื่อ ≤ 63 ไบต์ · **ไม่ apply ขึ้น DB จริง** · migration ต่อไปของ Wave 1 (`AddTutorKyc` → `AddTutorAvailability` → `AddTutorSearch` → `AddTutorBookingCore`) สร้างตามลำดับ **ทีละตัวโดยผู้ลงมือคนเดียว** (เช็ค `git status` + snapshot ก่อนทุกครั้ง — มีงาน Meilisearch ค้างที่ Catalog/SharedKernel.Search ห้ามแตะ)

---

## 3. Module wiring checklist (ต้องครบทุกข้อ — ไม่งั้น model/เทสต์/deploy พัง)

| # | ไฟล์ | การเปลี่ยนแปลง |
|---|---|---|
| 1 | `src/Siri.Modules.Tutoring/Siri.Modules.Tutoring.csproj` (ใหม่) | สำเนารูปแบบ `Siri.Modules.Live.csproj`: `net10.0`, `ImplicitUsings`, `Nullable`; `FrameworkReference Microsoft.AspNetCore.App`; `PackageReference` `Microsoft.EntityFrameworkCore`, `Microsoft.EntityFrameworkCore.Relational`, `Hangfire.Core`, `FluentValidation` (มีใน `Directory.Packages.props` แล้ว **ไม่เพิ่ม package ใหม่**); `InternalsVisibleTo Siri.UnitTests`. ProjectReference **เท่านั้น**: `Siri.SharedKernel`, `Siri.Persistence`, `Siri.Integrations.Storage`, `Siri.Modules.Catalog` (Contracts: `IInstructorApprovalReader`/`IInstructorProfileReader`), `Siri.Modules.Identity` (`IUserContactReader`/`ISecurityAuditContract`), `Siri.Modules.Notification` (`IEmailOutbox`/`IUserNotificationOutbox`/`EmailTemplateRenderer`). **ผู้เพิ่ม ProjectReference ภายหลัง = task ที่เริ่มใช้เป็นคนแรก (ไม่ใส่ล่วงหน้า):** `Siri.Integrations.Payment` (+ ใช้ `SharedKernel.Contracts.IPaymentIntentEventListener`) → **P13-06** · `Siri.Modules.Payout` (`Payout.Contracts`) → **P13-06/07** (ผู้ที่ถึงก่อนเพิ่ม) · `Siri.Modules.Live` (`Live.Contracts`) → **P13-09** · `Identity.Contracts`/`Notification.Contracts` เป็น namespace ใน project ที่ P13-01 อ้างอยู่แล้ว — **ไม่ต้องเพิ่ม reference** · `Siri.Modules.Media` ไม่ต้องอ้าง (ใช้ `SharedKernel.Contracts`). **ห้าม** อ้าง Commerce/Analytics/Learning/Media/Cms/Community |
| 2 | `SiriUpSkill.sln` | `dotnet sln add src/Siri.Modules.Tutoring/Siri.Modules.Tutoring.csproj` |
| 3 | `src/Siri.Api/Siri.Api.csproj` · `src/Siri.Workers/Siri.Workers.csproj` | `<ProjectReference Include="..\Siri.Modules.Tutoring\Siri.Modules.Tutoring.csproj" />` (Workers ต้องมีเพราะ `RecurringJobsRegistration` ใช้ job class และ `AddTutoringModule`) |
| 4 | `tests/Siri.ArchitectureTests/*.csproj` · `tests/Siri.UnitTests/*.csproj` · `tests/Siri.IntegrationTests/*.csproj` | ProjectReference เหมือนที่ Live ทำ (Architecture: ใช้ `typeof(TutoringModule).Assembly` ใน catalog) |
| 5 | `src/Siri.Api/Program.cs` (บรรทัด ~312-322) · `src/Siri.Workers/Program.cs` (บรรทัด ~170-181) | `.AddTutoringModule(builder.Configuration)` ต่อท้าย `.AddLiveModule(...)` (ก่อน `.AddAnalyticsModule()` ก็ได้) · Api เพิ่ม `using Siri.Modules.Tutoring;` |
| 6 | `tests/Siri.ArchitectureTests/ModuleAssemblyCatalog.cs` | เพิ่ม `new("Siri.Modules.Tutoring", typeof(Siri.Modules.Tutoring.TutoringModule).Assembly)` ใน `Modules` |
| 7 | `tests/Siri.ArchitectureTests/DatabaseIdentifierLengthTests.cs` | `Assert.Equal(11, moduleCount)` → **`12`** |
| 8 | `src/Siri.Api/Dockerfile` · `src/Siri.Workers/Dockerfile` | เพิ่ม `COPY src/Siri.Modules.Tutoring/Siri.Modules.Tutoring.csproj src/Siri.Modules.Tutoring/` ก่อนบรรทัด `Siri.Workers.csproj`/`Siri.Api.csproj`. **รายงานช่องว่างเดิม** (ขาด Live/Integrations.Google/Integrations.Messaging จาก COPY list — `dotnet restore` ของ Dockerfile เหล่านี้น่าจะล้มอยู่แล้ว) ให้ owner ตัดสินว่าไฟล์นี้ยังใช้อยู่ไหม ไม่แก้เกิน Tutoring ในงานนี้ |
| 9 | `src/Siri.Workers/RecurringJobIds.cs` + `RecurringJobsRegistration.cs` | P13-01 **ไม่มี job** — แต่ P13-02/03/04/05 เพิ่ม id ต่อท้ายตามลำดับ (ดู `P13-README.md` §4) |
| 10 | `src/Siri.Api/Configuration/RateLimiterConfiguration.cs` | เพิ่ม constants + policy ของ Tutoring (§7) |
| 11 | `src/Siri.Api/Authorization/` + `Siri.SharedKernel/AuthorizationPolicyNames.cs` | `TutorOnly` (§5.2) |
| 12 | `src/Siri.Api/Configuration/ProductionConfigurationGuard.cs` · `src/Siri.Workers/WorkersProductionRequirements.cs` | เพิ่ม `TutoringProductionRequirements.GetProblems(configuration)` (§8) ทั้งสองที่ (แพทเทิร์นเดียวกับ `LiveProductionRequirements`) |
| 13 | `src/Siri.Api/appsettings.json` · `src/Siri.Workers/appsettings.json` | section `Tutoring` placeholder (ไม่มี secret) ทั้งสองไฟล์ (Workers มี appsettings ของตัวเอง — ค่าต้องตรงกัน) |
| 14 | `docs/DATABASE.md` | แทนบล็อกสรุป TUTORING เดิมด้วยคอลัมน์จริงของ 5 ตาราง + หมายเหตุ deviation |

โครงโฟลเดอร์ `src/Siri.Modules.Tutoring/`:
```
TutoringModule.cs                     ← AddTutoringModule(IServiceCollection, IConfiguration) — ไม่มี Map…Endpoints (controller อยู่ใน Siri.Api, D-19)
Contracts/    ITutorVerificationReader.cs
Domain/       SUBJECT.cs TUTOR_PROFILE.cs TUTOR_OFFERING.cs TUTOR_EDUCATION.cs TUTOR_CERTIFICATE.cs + enums (TutorStatus, TutorGender, TutorLevel, TutorCurriculum, **SessionFormat** `OneOnOne|Group` — ประกาศที่ P13-01 เพราะ P13-03/04 (Wave 1) ใช้ก่อน P13-05; enum อื่นของ session/booking ประกาศที่ P13-05 — ดู `P13-README.md` §3 คอลัมน์ "ประกาศที่")
Infrastructure/  *Configuration.cs (IEntityTypeConfiguration ต่อ entity) · AppDbContextTutoringExtensions.cs (DbSet accessor เช่น TutorProfiles()) · *Repository.cs · TutorProfileStatsUpdater.cs · Contracts/TutorVerificationReader.cs · TutorPublicCacheInvalidator.cs · TutoringOutputCache.cs
Application/  I*Repository.cs · TutorProfileService.cs · TutorOfferingService.cs · TutorEducationService.cs · TutorCertificateService.cs · SubjectService.cs · TutorModerationService.cs · TutorReadinessCalculator.cs · TutorSlugGenerator.cs · TutoringReasons.cs/TutoringErrors.cs · TutoringOptions.cs · TutoringProfileOptions.cs · ITutorLifecycleHook.cs · ITutorStatsWriter.cs · ITutorPublicCacheInvalidator.cs · ImageFileValidator.cs · DTO/command records + FluentValidation validators
```
Controller (ใน `Siri.Api/Controllers/Tutoring/`): `TutorProfileController`, `TutorOfferingsController`, `TutorCredentialsController` (educations+certificates), `TutoringAdminController` (subjects + tutors) — `[ApiController]` `[Tags("Tutoring")]`, ทุก action มี `[Authorize]`/policy **ชัดเจน** (ไม่มี fallback policy), คืน `IResult`, error → `Error.ToProblemHttpResult(HttpContext)`, `[EndpointName]` ขึ้นต้น `Tutoring…`

`AddTutoringModule` ลงทะเบียน: Options (`TutoringOptions`, `TutoringProfileOptions` — `IValidateOptions` + `ValidateOnStart`, `PostConfigure` ให้ `PublicBaseUrl` fallback `Seo:PublicBaseUrl` แบบเดียวกับ `LiveOptions.ApplyDefaults`) · `services.AddFileStorage(configuration)` (idempotent — `TryAddSingleton`; ใช้เก็บรูปติวเตอร์) · repositories (Scoped) · services (Scoped, **ไม่มี** `I…Service`) · validators `IValidator<T>` ต่อ request record · `ITutorVerificationReader` → `TutorVerificationReader` (Scoped) · `ITutorPublicCacheInvalidator` → `TutorPublicCacheInvalidator` (Scoped) · `TutorProfileStatsUpdater` (Scoped) · `IEnumerable<ITutorLifecycleHook>` (ว่างได้)

---

## 4. Contracts ข้ามโมดูล (additive)

### 4.1 `Tutoring.Contracts.ITutorVerificationReader` (ใหม่)
```csharp
namespace Siri.Modules.Tutoring.Contracts;

/// <summary>"ผู้ใช้นี้เป็นติวเตอร์ที่ Verified อยู่ตอนนี้หรือไม่" — ใช้โดย policy TutorOnly (Siri.Api) เท่านั้น.
/// อ่านจาก DB ทุกครั้ง ไม่ cache ใน token เพื่อให้การระงับมีผลทันที.</summary>
public interface ITutorVerificationReader
{
    /// <summary>true เมื่อ userId เป็นเจ้าของ TUTOR_PROFILE ที่ STATUS = Verified เท่านั้น.
    /// Suspended/Draft/Pending/NeedsInfo/Rejected/ไม่มีโปรไฟล์/Guid.Empty ⇒ false. ไม่ throw กับ user ที่ไม่รู้จัก.</summary>
    Task<bool> IsVerifiedAsync(Guid userId, CancellationToken cancellationToken);
}
```
Impl `Infrastructure/Contracts/TutorVerificationReader` — `AsNoTracking().AnyAsync(p => p.USER_ID == userId && p.STATUS == TutorStatus.Verified)` (ใช้ `UQ_TUTOR_PROFILES_USER_ID`).

### 4.2 `Siri.SharedKernel.AuthorizationPolicyNames` — เพิ่มค่าเดียว
```csharp
/// <summary>Instructor ที่ผู้ดูแลอนุมัติแล้ว <b>และ</b> มี TUTOR_PROFILE ที่ Verified. Admin/SuperAdmin ไม่ bypass.</summary>
public const string TutorOnly = "TutorOnly";
```

### 4.3 `ITutorStatsWriter` — ทางเข้า Application ของ "ผู้เขียนเดียว" ของค่า denormalized (ประกาศที่ P13-01 เพื่อให้ P13-03/08/10/13 ไม่ต้องประกาศเอง)
```csharp
namespace Siri.Modules.Tutoring.Application;
/// <summary>เขียนค่า denormalized ของ TUTOR_PROFILE — implement เพียงคลาสเดียวคือ Infrastructure.TutorProfileStatsUpdater (ExecuteUpdateAsync; join ธุรกรรมที่มีอยู่ของ DbContext โดยอัตโนมัติ).
/// ไม่หมุน ROW_VERSION โดยตั้งใจ (ไม่ให้การแก้โปรไฟล์ของติวเตอร์ชนกับงานเบื้องหลัง; EF อัปเดตเฉพาะคอลัมน์ที่เปลี่ยนจึงไม่มี lost update). ติวเตอร์ไม่พบ ⇒ no-op (ไม่ throw).</summary>
public interface ITutorStatsWriter
{
    Task SetNextAvailableAsync(Guid tutorId, DateTime? nextAvailableAtUtc, CancellationToken cancellationToken);        // P13-03 (เขียนเฉพาะเมื่อค่าเปลี่ยน: WHERE col IS DISTINCT FROM @v)
    Task IncrementCompletedSessionsAsync(Guid tutorId, CancellationToken cancellationToken);                            // P13-10 (+1 ต่อ session ที่จบแบบ Completed)
    Task SetReliabilityScoreAsync(Guid tutorId, int score, CancellationToken cancellationToken);                        // P13-08 (clamp 0..100; ผู้ "คำนวณ" คือ TutorReliabilityUpdater ของ P13-08)
    Task SetRatingAsync(Guid tutorId, decimal average, int count, CancellationToken cancellationToken);                 // P13-13 (updater เดียวของ RATING_*; ปัดเฉลี่ย 2 ตำแหน่ง)
}
```
source-scan test (§9): ไม่มีไฟล์ใดนอก `TutorProfileStatsUpdater.cs` เขียนคอลัมน์ทั้งห้านี้

### 4.4 hooks ภายในโมดูล (ไม่ใช่ Contracts ข้ามโมดูล แต่เป็นจุดต่อที่ P13-08 ใช้)
```csharp
namespace Siri.Modules.Tutoring.Application;
public interface ITutorLifecycleHook
{
    /// <summary>เรียกใน transaction เดียวกับการระงับ (stage เท่านั้น ห้าม SaveChanges). P13-08 ใช้ยกเลิก+คืนเงินคลาสอนาคต.</summary>
    Task OnSuspendedAsync(Guid tutorId, string reason, CancellationToken cancellationToken) => Task.CompletedTask;
}
```
ลงทะเบียนแบบ `IEnumerable<ITutorLifecycleHook>` (ว่างได้) · `TutorModerationService.SuspendAsync` เรียกทุกตัวก่อน commit

---

## 5. Domain, สิทธิ์, services (พฤติกรรมที่ต้องตรง)

### 5.1 `TUTOR_PROFILE` state machine (domain method เท่านั้น — ไม่มี setter ภายนอก)

`TutorStatus`: `Draft` · `PendingVerification` · `NeedsInfo` · `Verified` · `Rejected` · `Suspended`

| Method (public) | From → To | Guard (ผิด ⇒ `InvalidOperationException` ที่ domain; service ตรวจก่อนแล้วคืน `Result` 409) | Effects |
|---|---|---|---|
| `static Create(userId, instructorProfileId, slug, displayName, headline, bio, gender, yearsExperience, clock)` | — → `Draft` | ค่าไม่ว่าง/ในช่วง | `IS_LISTED=false`, ค่า default ตาม §2.2, `STATUS_CHANGED_AT_UTC=now` |
| `UpdateDetails(displayName, headline, bio, gender, yearsExperience, clock)` | ทุกสถานะ **ยกเว้น `Suspended`** | | |
| `SubmitForVerification(int activeOfferingCount, IClock)` | `Draft`/`NeedsInfo`/`Rejected` → `PendingVerification` | `TutorReadinessCalculator` ระดับโปรไฟล์ผ่าน (display name, headline, `BIO` ≥ `MinBioLength`, `activeOfferingCount ≥ 1`) | ล้าง `STATUS_REASON`, `IS_LISTED=false` |
| `RequestMoreInfo(reason, clock)` | `PendingVerification` → `NeedsInfo` | `reason` ไม่ว่าง ≤1000 | `STATUS_REASON=reason` |
| `Verify(clock)` | `PendingVerification` → `Verified` | | `VERIFIED_AT_UTC ??= now`, ล้าง reason; **`IS_LISTED` ยัง false** (ติวเตอร์เปิดเอง) |
| `Reject(reason, clock)` | `PendingVerification` → `Rejected` | `reason` | `IS_LISTED=false` |
| `RequireReverification(reason, clock)` | `Verified` → `NeedsInfo` | `reason` | `IS_LISTED=false` (P13-02 expiry job ใช้เมื่อ `ExpiryAction=RequireReverification`) |
| `Suspend(reason, clock)` | `Verified` → `Suspended` | `reason` | `IS_LISTED=false` (admin / P13-08 อัตโนมัติ) |
| `Reinstate(clock)` | `Suspended` → `Verified` | `VERIFIED_AT_UTC != null` | `IS_LISTED` ยัง false |
| `SetListed(bool listed, int activeOfferingCount)` | `Verified` เท่านั้น | listed=true ⇒ `activeOfferingCount ≥ 1` | |
| `ForceUnlist()` | ทุกสถานะ | | ใช้เมื่อ offering active สุดท้ายถูกปิด |
| `ApplyAvailabilitySettings(minNoticeHours, bufferMinutes, maxAdvanceDays)` | ทุกสถานะ **ยกเว้น `Suspended`** | ช่วงตาม §2.2 | (P13-03 เรียก) |
| `SetCommissionOverride(decimal? percent)` | ทุกสถานะ | `0 ≤ p ≤ 50`, ปัด 2 ตำแหน่ง | (admin เท่านั้น ผ่าน service) |
| `SetPhoto(key)` / `ClearPhoto()` / `SetIntroVideo(assetId)` / `ClearIntroVideo()` | ไม่ใช่ `Suspended` | | |

**Invariants (เทสต์ทุกข้อ):** (I1) `IS_LISTED ⇒ STATUS=Verified` (domain + CHECK DB) · (I2) ทุกการเปลี่ยน `STATUS` เขียน `STATUS_CHANGED_AT_UTC` · (I3) `Suspended` แก้ข้อมูลไม่ได้ · (I4) `Reinstate` ได้เฉพาะที่เคย Verified · (I5) ไม่มี method เขียน `RATING_*`/`COMPLETED_SESSIONS_COUNT`/`RELIABILITY_SCORE`/`NEXT_AVAILABLE_AT_UTC` บน entity · (I6) transition ที่ไม่อยู่ในตาราง ⇒ throw (ตารางครบทุกคู่ 6×6 ใน theory test)

### 5.2 Policy `TutorOnly` (ใน `Siri.Api/Authorization/`)
```csharp
public sealed class VerifiedTutorRequirement : IAuthorizationRequirement { }

// resolve ITutorVerificationReader แบบ lazy ผ่าน IServiceProvider (เหมือน ApprovedInstructorAuthorizationHandler — host ที่ไม่ลง Tutoring ต้องไม่พัง)
public sealed class VerifiedTutorAuthorizationHandler(IServiceProvider services) : AuthorizationHandler<VerifiedTutorRequirement> { … }

options.AddPolicy(AuthorizationPolicyNames.TutorOnly, policy => policy
    .RequireAuthenticatedUser()
    .AddRequirements(new ApprovedInstructorRequirement(), new VerifiedTutorRequirement()));
```
- `VerifiedTutorAuthorizationHandler`: ผ่านก็ต่อเมื่อ **มี role `Instructor`** (`ROLE.InstructorName`) **และ** `IsVerifiedAsync(userId)` = true · **Admin/SuperAdmin ที่ไม่มีโปรไฟล์ติวเตอร์ไม่ผ่าน** (requirement แรกผ่านให้ Admin แต่ requirement ที่สองไม่ผ่าน ⇒ policy ไม่ผ่าน — ทุก requirement ต้อง Succeed) · Owner bootstrap ที่ได้ทุก role + Approved profile และมี `TUTOR_PROFILE` Verified ผ่านได้ตามปกติ
- ใช้ `[Authorize(Policy = AuthorizationPolicyNames.TutorOnly)]` กับ endpoint ที่ต้อง Verified **และต้องเปิดรับ/ดำเนินการคลาสได้**: availability (P13-03), packages (P13-12), classes — list/start/complete/summary/attendance/room/materials (P13-10) · **ใช้ `InstructorOnly` โดยตั้งใจ** กับ: onboarding/โปรไฟล์/offering/KYC (P13-01/02 — ติวเตอร์ยังไม่ Verified ต้องแก้ได้) และ **wallet (P13-07 §8), `classes/{id}/cancel` + `cancellation-quote` (P13-08 §5.5)** — ติวเตอร์ที่ถูกระงับต้องยังเห็นเงินที่ค้างและยกเลิกคลาสที่ค้างได้ · ตารางเต็ม "route group → policy" อยู่ `P13-README.md` §5.1
- เทสต์ใน `AuthorizationPolicyTests` (แพทเทิร์นเดิม): Admin ไม่มีโปรไฟล์ ✗ · Instructor ไม่ approved ✗ · Instructor approved + Draft ✗ · + PendingVerification ✗ · + Verified ✓ · + Suspended ✗ · Verified แล้วถูก Suspend ⇒ request ถัดไป ✗ (ไม่ cache)

### 5.3 Services (Repository+Service ต่อ aggregate — ห้าม god service)
`TutorProfileService` (create/get/update/listing/photo/intro-video) · `TutorOfferingService` · `TutorEducationService` · `TutorCertificateService` · `SubjectService` · `TutorModerationService` (admin suspend/reinstate/commission/list/detail) · ทุก method รับ `userId` จาก controller (มาจาก `IUserContext` เท่านั้น) — **ไม่มี `tutorId` ใน route ของ endpoint ติวเตอร์** (หาโปรไฟล์จาก `USER_ID` เสมอ ⇒ ไม่มีพื้นผิว IDOR ของโปรไฟล์)

**5.3.1 `CreateAsync` (POST tutor/profile):**
```
1. IInstructorApprovalReader.IsApprovedAsync(userId)  false → Forbidden reason tutoring.instructor_not_approved   (Admin ที่ไม่มี INSTRUCTOR_PROFILE ตกตรงนี้)
2. instructorProfileId = IInstructorProfileReader.GetProfileIdByUserIdAsync(userId)   null → Forbidden (เหตุผลเดียวกัน)
3. มี TUTOR_PROFILE ของ USER_ID แล้ว → Conflict tutoring.tutor_profile_exists
4. slug = TutorSlugGenerator.Generate(displayName) → ตรวจซ้ำแบบ batch (query เดียว "slug หรือ slug-N") → เลือกว่าง
5. TUTOR_PROFILE.Create(...) → SaveChanges
   DbUpdateException ชน UQ_TUTOR_PROFILES_USER_ID / _INSTR_PROFILE → 409 tutoring.tutor_profile_exists
   ชน UQ_TUTOR_PROFILES_SLUG → retry ใหม่ทั้ง step 4-5 ได้สูงสุด 3 ครั้ง แล้ว 409 tutoring.slug_conflict
6. ITutorPublicCacheInvalidator (no-op จริงเพราะ Draft ไม่เป็นสาธารณะ — เรียกเพื่อความสม่ำเสมอไม่ได้) → 201
```
**5.3.2 อัปเดต/ส่งต่อ:** ทุก PUT รับ `rowVersion` (base64) → `entry.Property(ROW_VERSION).OriginalValue = decoded` ก่อน SaveChanges (แพทเทิร์น `AutosaveCourseHandler`) · `DbUpdateConcurrencyException` → 409 `tutoring.concurrent_update` (ส่งข้อมูลล่าสุดให้ FE โหลดใหม่) · หลังเขียนที่กระทบหน้าสาธารณะ (โปรไฟล์ที่ `Verified`, offering, education, certificate, รูป, วิดีโอ, listing) → `ITutorPublicCacheInvalidator.InvalidateProfilesAsync()` (หลัง commit; ล้มเหลวไม่ทำให้ request ล้ม — log warning)
**5.3.3 offering:** หลังสร้าง/แก้/ปิด offering ให้ตรวจ `activeOfferingCount`; ถ้าเหลือ 0 และ `IS_LISTED` ⇒ `ForceUnlist()` ใน transaction เดียวกัน · `activeOfferingCount` สูงสุด `MaxOfferingsPerTutor` (30) รวมแถวที่ปิดแล้ว (นับทุกแถว) · POST ที่ชน `UQ_TUTOR_OFFERINGS_COMBO` ⇒ 409 `tutoring.offering_duplicate` (ถ้าแถวเดิม `IS_ACTIVE=false` ใส่ extension `offeringId` เพื่อให้ FE เสนอ "เปิดใช้งานอีกครั้ง" ผ่าน PUT) · วิชาที่ `IS_ACTIVE=false` หรือไม่มี ⇒ 400 `tutoring.subject_not_found` (ข้อความเดียวกัน)
**5.3.4 intro video:** `PUT tutor/profile/intro-video {mediaAssetId}`:
```
summary = IMediaAssetContract.GetAssetSummaryAsync(mediaAssetId)   (SharedKernel.Contracts — มีอยู่แล้ว; ไม่เพิ่ม contract ใหม่ที่นี่)
null หรือ summary.UploadedByUserId != userId → NotFound reason tutoring.media_asset_not_found   (ข้อความเดียวกันทั้งสองกรณี — ไม่บอกว่ามีอยู่ของคนอื่น)
summary.Status != "Ready"                    → Conflict reason tutoring.intro_video_not_ready
summary.DurationSeconds is null || < 5 || > Tutoring:Profile:MaxIntroVideoSeconds (180) → Validation reason tutoring.intro_video_duration_invalid
SetIntroVideo(assetId) → SaveChanges → invalidate cache
```
อัปโหลดวิดีโอใช้ flow เดิมของ Media (`/api/media/assets` + TUS upload-session, `InstructorOnly`) — **P13-01 ไม่สร้าง endpoint อัปโหลด** · การเล่นสาธารณะของวิดีโอ = P13-04 §6.5
**5.3.5 รูปโปรไฟล์:** `PUT tutor/profile/photo` multipart `file`: `ImageFileValidator` (jpg/png/webp: magic bytes `FF D8 FF` / `89 50 4E 47 0D 0A 1A 0A` / `RIFF….WEBP`; ต้องตรงกับ content-type; ขนาด 1..`PhotoMaxBytes` 2 MiB; ชื่อไฟล์ไม่ถูกเก็บ/log) → `IFileStorage.UploadAsync(key = "tutoring/photos/{tutorId:N}/{guid:N}.{ext}", …, downloadFileName: null)` (ไม่ตั้ง `Content-Disposition`) → ตั้ง `PHOTO_STORAGE_KEY` → commit → ลบ object เก่าแบบ best-effort (`IFileStorage.DeleteAsync`) · ล้มที่ DB หลังอัปโหลด ⇒ ลบ object ใหม่ best-effort · `DELETE tutor/profile/photo` ล้าง key + ลบ object · ไม่มี EXIF stripping (ไม่มี image library; ความเสี่ยงที่เหลือ → "Open decisions" #4) · `GET tutor/profile` คืน `photoUrl` = presigned GET TTL `PhotoSignedUrlSeconds` (600) **สร้างใหม่ทุกครั้ง** (เจ้าของดูเอง); URL สาธารณะเป็นของ P13-04
**5.3.6 `TutorReadinessCalculator`** (pure, `Application/`): คืน `TutorReadiness { CanSubmitForVerification, Blockers[] }` โดย blocker เป็นรหัสเสถียร: `display_name_missing`, `headline_missing`, `bio_too_short`, `no_active_offering` (+ `photo_missing` เมื่อ `RequirePhotoToSubmit=true`) · P13-02 ต่อยอด calculator ตัวเดียวกันเพิ่มรหัส `kyc_*`
**5.3.7 admin `TutorModerationService`:** `SuspendAsync(adminUserId, tutorId, reason)` ⇒ ตรวจ `Verified` → `Suspend` → เรียก `ITutorLifecycleHook`s → stage อีเมล/แจ้งเตือนติวเตอร์ (`tutoring-tutor-suspended`) → **`ISecurityAuditContract.RecordAuditAsync("tutoring.tutor.suspended", adminUserId, json{tutorId, reason}, ip)` เป็นขั้นสุดท้าย (F6)** → evict cache · `ReinstateAsync` (`tutoring.tutor.reinstated`) · `SetCommissionAsync(adminUserId, tutorId, percent?, reason)` (`tutoring.tutor.commission_changed`, detail มี `old`/`new`) · ทุกตัวไม่พบ ⇒ 404 `tutoring.tutor_not_found` · เหตุผล (reason) ≤ 1000 ตัวอักษร ห้ามว่าง (suspend/commission)

### 5.4 `TutorSlugGenerator` (Application, pure)
สำเนาตาราง map อักษรไทย→ละติน **ของ `Catalog.Infrastructure.ThaiSlugGenerator`** (อ้างข้ามโมดูลไม่ได้ — F3/F4; รวมเข้า `SharedKernel` เป็นงานแยกที่ต้องแตะ Catalog ซึ่งตอนนี้มี session อื่นแก้ค้างอยู่ ⇒ **ไม่ทำใน P13-01**, บันทึกเป็น follow-up) · `Generate(displayName)`: แปลง → lower → `[a-z0-9]` + `-` เดี่ยว → ตัดที่ 60 ตัวอักษรที่ขอบคำ → ว่าง ⇒ `"tutor"` · **สงวน slug**: `admin`,`me`,`new`,`search`,`subjects`,`tutor`,`tutors`,`book`,`photo`,`slots`,`reviews` ⇒ ต่อท้าย `-tutor` · unique: service หา `slug`, `slug-2`, `slug-3`… ใน query เดียวแล้วเลือกตัวแรกที่ว่าง (แบบเดียวกับ `CreateCourseHandler`) + UQ เป็น backstop · unit test เทียบกับเวกเตอร์เดียวกับ `ThaiSlugGeneratorTests` ของ Catalog (ผลต้องเท่ากันสำหรับอินพุตเดียวกัน) กัน drift

### 5.5 Validation (FluentValidation ต่อ request record — ผูกผ่าน `ValidationActionFilter`)
| field | กฎ |
|---|---|
| `displayName` | 2–80, trim, ไม่มี control char, ไม่มี `<` `>` |
| `headline` | ≤120 หรือ null |
| `bio` | ≤4000; **plain text** — ปฏิเสธเมื่อตรง `<\s*[a-zA-Z/!]` (กัน HTML) → 400 reason `tutoring.text_contains_markup` (เทียบ `live.session_text_contains_meeting_link`: ใช้ `.WithErrorCode("tutoring.text_contains_markup")` ให้ filter ยก reason ขึ้น) |
| `gender` | enum `TutorGender` |
| `yearsExperience` | 0–60 |
| offering rates | `hourlyRateOneOnOne` ∈ [`MinHourlyRate`,`MaxHourlyRate`] (100–20000 ค่าเริ่มต้น) ทศนิยม ≤2 · group: (rate,maxSeats) ต้องมาคู่/ไม่มาคู่ · `groupHourlyRatePerSeat` ∈ [MinHourlyRate, hourlyRateOneOnOne] (ต่อที่นั่งต้องไม่แพงกว่าตัวต่อตัว) · `groupMaxSeats` 2–`MaxGroupSeats` · trial: `trialEnabled` ⇒ `trialMinutes` ∈ {15,30}, `trialPrice` = 0 หรือ ∈ [`MinChargeAmount`, `hourlyRateOneOnOne`]; ไม่เปิด ⇒ ทั้งสองต้อง null |
| `level`/`curriculum` | enum |
| education/certificate | ตามช่วงใน §2.4/2.5, `yearFrom/year` ≤ ปีปัจจุบัน (Bangkok), `yearTo` ≤ ปีปัจจุบัน+8 |
| list endpoints | `page ≥ 1`, `pageSize` 1–100 (default 50) — **คืน `PagedResult<T>` ทุก list** (ทุก list ของติวเตอร์มีเพดานจำนวนอยู่แล้ว แต่ใช้ shape เดียวกันตามกฎ pagination) |

### 5.6 Output-cache constants + invalidator (P13-01 ส่งของจริง; P13-04/03 ลงทะเบียน policy)
```csharp
// Infrastructure/TutoringOutputCache.cs
public static class TutoringOutputCache
{
    public const string ProfilePolicyName = "TutoringPublicProfile";  public const string ProfileTag = "tutoring-profile";
    public const string SlotsPolicyName   = "TutoringSlots";          public const string SlotsTag   = "tutoring-slots";
    public const string SitemapPolicyName = "TutoringSitemap";        public const string SitemapTag = "tutoring-sitemap";
}
public interface ITutorPublicCacheInvalidator            // Application
{
    Task InvalidateProfilesAsync(CancellationToken ct);  // evict ProfileTag + SitemapTag
    Task InvalidateSlotsAsync(CancellationToken ct);     // evict SlotsTag
}
```
Impl ใช้ `IOutputCacheStore.EvictByTagAsync` (ASP.NET Core, ไม่ต้องมี policy ลงทะเบียนก่อน — evict tag ที่ไม่มีไม่เป็นไร) · เป็นแค่ best-effort ต่อ process (in-memory store; หลาย replica ⇒ พึ่ง TTL สั้น — บันทึกใน P13-04)

---

## 6. Endpoint ที่ FROZEN

ทุก endpoint: error = RFC 9457 + `traceId` + `errorCode` + `reason` · เวลา UTC `…Z` · JSON camelCase · enum เป็น string · `[ProducesResponseType]` + `[EndpointName]` + `[EndpointSummary]` ครบ · base `/api/tutoring` · ตัวเลข HTTP ตามตาราง

### 6.1 ติวเตอร์ (`[Authorize(Policy = InstructorOnly)]`, rate limit `tutoring-user`; อัปโหลด = `tutoring-upload`)

| # | Method + path | Request | สำเร็จ | Error |
|---|---|---|---|---|
| 1 | `GET /tutor/profile` | — | 200 `TutorProfileResponse` | 404 `tutoring.tutor_profile_not_found` (ยังไม่เริ่ม onboarding) |
| 2 | `POST /tutor/profile` | `CreateTutorProfileRequest` | 201 `TutorProfileResponse` + `Location: /api/tutoring/tutor/profile` | 403 `tutoring.instructor_not_approved` · 409 `tutoring.tutor_profile_exists` / `tutoring.slug_conflict` · 400 validation |
| 3 | `PUT /tutor/profile` | `UpdateTutorProfileRequest` (+`rowVersion`) | 200 `TutorProfileResponse` | 404 · 409 `tutoring.tutor_suspended` / `tutoring.concurrent_update` · 400 |
| 4 | `PUT /tutor/profile/listing` | `{ "isListed": true, "rowVersion": "…" }` | 200 `TutorProfileResponse` | 409 `tutoring.tutor_not_verified` / `tutoring.no_active_offering` / `tutoring.concurrent_update` |
| 5 | `PUT /tutor/profile/photo` | multipart `file` (≤`PhotoMaxBytes` 2 MiB ตรวจที่ validator ; `[RequestSizeLimit]`/`[RequestFormLimits]` เป็น**ค่าคงที่ compile-time** = เพดานสูงสุดของ config (5 MiB + 64 KiB) เหมือน `EpisodeAttachmentOptions.MaxUploadRequestBodyBytes` — attribute รับค่าจาก config ไม่ได้) | 200 `{ "photoUrl": "…" }` | 400 `tutoring.image_invalid` · 409 `tutoring.tutor_suspended` · 503 `storage.provider_not_configured` |
| 6 | `DELETE /tutor/profile/photo` | — | 204 (idempotent) | 404 |
| 7 | `PUT /tutor/profile/intro-video` | `{ "mediaAssetId": "…" }` | 200 `TutorProfileResponse` | 404 `tutoring.media_asset_not_found` · 409 `tutoring.intro_video_not_ready` · 400 `tutoring.intro_video_duration_invalid` |
| 8 | `DELETE /tutor/profile/intro-video` | — | 204 | 404 |
| 9 | `GET /tutor/offerings?page&pageSize` | — | 200 `PagedResult<TutorOfferingResponse>` (รวมที่ปิดแล้ว) | 404 `tutoring.tutor_profile_not_found` |
| 10 | `POST /tutor/offerings` | `UpsertOfferingRequest` | 201 `TutorOfferingResponse` | 400 `tutoring.subject_not_found` · 409 `tutoring.offering_duplicate` (+`offeringId` ถ้าซ้ำกับแถวที่ปิด) / `tutoring.offering_limit` / `tutoring.tutor_suspended` |
| 11 | `PUT /tutor/offerings/{offeringId}` | `UpsertOfferingRequest` (+`isActive`) | 200 | 404 `tutoring.not_found` (ไม่ใช่ของตัวเอง = ไม่พบ ข้อความเดียวกัน) · 409 `tutoring.offering_duplicate` |
| 12-15 | `GET/POST /tutor/educations` · `PUT/DELETE /tutor/educations/{educationId}` | `UpsertEducationRequest` | 200/201/204 | 404 `tutoring.not_found` · 409 `tutoring.education_limit` |
| 16-19 | `GET/POST /tutor/certificates` · `PUT/DELETE /tutor/certificates/{certificateId}` | `UpsertCertificateRequest` | 200/201/204 | 404 · 409 `tutoring.certificate_limit` |

### 6.2 แอดมิน (`[Authorize(Policy = AdminOnly)]`, rate limit `tutoring-user`) — base `/api/tutoring/admin`

| # | Method + path | Request | สำเร็จ | Error |
|---|---|---|---|---|
| 20 | `GET /subjects?includeInactive=true&page&pageSize` | — | 200 `PagedResult<AdminSubjectResponse>` (เรียง parent→sort) | |
| 21 | `POST /subjects` | `{ slug, nameTh, nameEn, parentId?, sortOrder }` | 201 | 409 `tutoring.subject_slug_exists` · 400 `tutoring.subject_parent_invalid` (parent ต้องเป็นกลุ่มระดับบน; ลึกเกิน 2 ระดับไม่ได้) |
| 22 | `PUT /subjects/{subjectId}` | `{ nameTh, nameEn, parentId?, sortOrder, isActive }` (**ไม่มี slug**) | 200 | 404 · 400 `tutoring.subject_parent_invalid` |
| 23 | `GET /tutors?status&q&page&pageSize` | — | 200 `PagedResult<AdminTutorListItem>` (`q` = DISPLAY_NAME ILIKE, escape `% _ \`) | |
| 24 | `GET /tutors/{tutorId}` | — | 200 `AdminTutorDetail` | 404 `tutoring.tutor_not_found` |
| 25 | `POST /tutors/{tutorId}/suspend` | `{ "reason": "…" }` | 200 `AdminTutorDetail` | 404 · 409 `tutoring.invalid_transition` |
| 26 | `POST /tutors/{tutorId}/reinstate` | `{ "reason"?: "…" }` | 200 | 404 · 409 `tutoring.invalid_transition` |
| 27 | `PUT /tutors/{tutorId}/commission` | `{ "commissionPercentOverride": 15.00 \| null, "reason": "…" }` | 200 | 404 · 400 (นอก 0–50) |

กฎร่วม: ownership ตัดสินจาก `IUserContext.UserId` เท่านั้น (ไม่รับ `userId`/`tutorId` ของตัวเองจาก body/query) · Admin **ไม่** bypass endpoint ติวเตอร์ (`InstructorOnly` ผ่านให้ Admin แต่ service หา `TUTOR_PROFILE` ด้วย `USER_ID` ของ Admin ⇒ ไม่พบ ⇒ 404/403 ตามขั้นตอน) · `403` ใช้เฉพาะ `instructor_not_approved`; "ไม่ใช่ของฉัน" ทุกกรณี = 404 `tutoring.not_found` ข้อความเดียวกัน (กัน probe id)

### 6.3 DTO (C#)
```csharp
public sealed record CreateTutorProfileRequest(string DisplayName, string? Headline, string Bio, TutorGender Gender, int YearsExperience);
public sealed record UpdateTutorProfileRequest(string DisplayName, string? Headline, string Bio, TutorGender Gender, int YearsExperience, string RowVersion);
public sealed record SetListingRequest(bool IsListed, string RowVersion);
public sealed record SetIntroVideoRequest(Guid MediaAssetId);

public sealed record TutorReadiness(bool CanSubmitForVerification, IReadOnlyList<string> Blockers);
public sealed record TutorProfileResponse(
    Guid TutorId, string Slug, string DisplayName, string? Headline, string Bio, TutorGender Gender, int YearsExperience,
    TutorStatus Status, string? StatusReason, bool IsListed, string? PhotoUrl, Guid? IntroVideoAssetId,
    int MinNoticeHours, int BufferMinutes, int MaxAdvanceDays, DateTime? VerifiedAtUtc,
    TutorReadiness Readiness, string RowVersion);                         // ไม่มี userId/instructorProfileId/commission/คะแนน

public sealed record UpsertOfferingRequest(
    Guid SubjectId, TutorLevel Level, TutorCurriculum Curriculum, decimal HourlyRateOneOnOne,
    decimal? GroupHourlyRatePerSeat, int? GroupMaxSeats, bool TrialEnabled, int? TrialMinutes, decimal? TrialPrice, bool IsActive);
public sealed record OfferingSubjectRef(Guid SubjectId, string Slug, string NameTh, string NameEn);
public sealed record TutorOfferingResponse(
    Guid OfferingId, OfferingSubjectRef Subject, TutorLevel Level, TutorCurriculum Curriculum, decimal HourlyRateOneOnOne,
    decimal? GroupHourlyRatePerSeat, int? GroupMaxSeats, bool TrialEnabled, int? TrialMinutes, decimal? TrialPrice, bool IsActive);

public sealed record UpsertEducationRequest(string Institution, string Degree, string? Field, int YearFrom, int? YearTo, int SortOrder);
public sealed record TutorEducationResponse(Guid EducationId, string Institution, string Degree, string? Field, int YearFrom, int? YearTo, int SortOrder);
public sealed record UpsertCertificateRequest(string Title, string? Issuer, int Year, int SortOrder);
public sealed record TutorCertificateResponse(Guid CertificateId, string Title, string? Issuer, int Year, int SortOrder);

public sealed record AdminSubjectResponse(Guid SubjectId, string Slug, string NameTh, string NameEn, Guid? ParentId, int SortOrder, bool IsActive);
public sealed record AdminTutorListItem(
    Guid TutorId, string Slug, string DisplayName, TutorStatus Status, bool IsListed, decimal RatingAverage, int RatingCount,
    int CompletedSessionsCount, int ReliabilityScore, decimal? CommissionPercentOverride, DateTime? VerifiedAtUtc, DateTime StatusChangedAtUtc);
public sealed record AdminTutorDetail(
    Guid TutorId, Guid UserId, Guid InstructorProfileId, string Slug, string DisplayName, string? Headline, string Bio, TutorGender Gender,
    int YearsExperience, TutorStatus Status, string? StatusReason, bool IsListed, decimal? CommissionPercentOverride, decimal EffectiveCommissionPercent,
    decimal RatingAverage, int RatingCount, int CompletedSessionsCount, int ReliabilityScore, DateTime? NextAvailableAtUtc,
    DateTime? VerifiedAtUtc, DateTime StatusChangedAtUtc, IReadOnlyList<TutorOfferingResponse> Offerings,
    IReadOnlyList<TutorEducationResponse> Educations, IReadOnlyList<TutorCertificateResponse> Certificates);   // P13-02 เพิ่ม latestKycCase แบบ additive
```
`EffectiveCommissionPercent` = override ?? `TutoringOptions.DefaultCommissionPercent` · `RowVersion` = base64 ของ `ROW_VERSION` (8 ไบต์)

---

## 7. Rate limit (เพิ่มใน `RateLimiterConfiguration` + `Program.cs` `AddRateLimiter` ผ่าน `Configure` เดียวกัน)
| ค่าคงที่ / ชื่อ | โควตา | partition | ใช้กับ |
|---|---|---|---|
| `TutoringSearchPolicyName` = `tutoring-search` | 120 / 60 วิ | IP (`RemoteIpAddress`; fallback `"anonymous"`) | public read (P13-04: search, profile, subjects, photo, intro-video, sitemap) — **หลัง reverse proxy ทุกคนใช้ IP เดียวกัน ⇒ โควตานี้คือเพดานรวมของแอป ไม่ใช่ต่อผู้ใช้** (F8) จึงตั้งสูงและพึ่ง output cache ลดภาระ |
| `TutoringSlotsPolicyName` = `tutoring-slots` | 240 / 60 วิ | IP | `GET tutors/{slug}/slots` (P13-03) |
| `TutoringUserPolicyName` = `tutoring-user` | 60 / 60 วิ | ผู้ใช้ (`NameIdentifier`) | endpoint ที่ login แล้วทั่วไปของ Tutoring (CRUD ติวเตอร์/ผู้เรียน/อ่านรายการ/แอดมิน) |
| `TutoringBookingPolicyName` = `tutoring-booking` | 10 / 60 วิ | ผู้ใช้ | `POST bookings` (P13-05) และ `POST bookings/{id}/payment` (P13-06) |
| `TutoringUploadPolicyName` = `tutoring-upload` | 10 / 10 นาที | ผู้ใช้ | อัปโหลดรูป/เอกสาร (P13-01, P13-02) |
| `TutoringKycViewPolicyName` = `tutoring-kyc-view` | 30 / 60 วิ | ผู้ใช้ | admin ดูเอกสาร KYC (P13-02) |
`tutoring-join` เป็นของ P13-10 (เพิ่มต่อท้ายไฟล์เดียวกัน — ทำเรียงตาม wave ไม่ขนาน) · helper ใหม่ `CreateIpPartition(HttpContext, string policy, int permit, TimeSpan window)` · ห้ามใช้ `default`/`auth`/`webhook` กับ Tutoring · เทสต์แพทเทิร์น `HeartbeatRateLimitIntegrationTests` (ผู้ใช้ A เต็มโควตา ผู้ใช้ B ผ่าน)

## 8. Config keys + Options (`AddOptions<T>().Bind().ValidateDataAnnotations/IValidateOptions().ValidateOnStart()`)

| Key (env `A__B`) | Default | หมายเหตุ |
|---|---|---|
| `Tutoring:PublicBaseUrl` | = `Seo:PublicBaseUrl` | origin ของ FE · absolute https (http เฉพาะ loopback) · ใช้ใน sitemap/ICS/อีเมล |
| `Tutoring:DefaultCommissionPercent` | `20` | 0–50 · อ่านโดย P13-07 (เจ้าของตอบแล้ว 20%) |
| `Tutoring:Profile:MinBioLength` | `50` | ขั้นต่ำเพื่อส่งตรวจ |
| `Tutoring:Profile:RequirePhotoToSubmit` | `false` | |
| `Tutoring:Profile:MaxOfferingsPerTutor` / `MaxEducationsPerTutor` / `MaxCertificatesPerTutor` | `30` / `10` / `20` | |
| `Tutoring:Profile:MinHourlyRate` / `MaxHourlyRate` | `100` / `20000` | บาท/ชม. |
| `Tutoring:Profile:MaxGroupSeats` | `6` | 2–6 (TUTORING.md §1) |
| `Tutoring:Profile:MinChargeAmount` | `10.00` | ขั้นต่ำที่ Stripe THB เรียกเก็บได้ — **ต้องยืนยันกับ Stripe dashboard (Q14.4)**; ใช้ตรวจ `trialPrice` และราคาที่คำนวณได้ |
| `Tutoring:Profile:MaxIntroVideoSeconds` | `180` | |
| `Tutoring:Profile:PhotoMaxBytes` | `2097152` | |
| `Tutoring:Profile:PhotoSignedUrlSeconds` | `600` | |
**โครง Options:** `TutoringOptions` (ราก, section `Tutoring`) เป็นที่อยู่ของ key แบบ flat ตาม `TUTORING.md` §1 — P13-01 ใส่ `PublicBaseUrl`, `DefaultCommissionPercent`; task ถัดไปเพิ่ม property ของตัวเองพร้อมกฎใน validator ตัวเดียวกัน**ตามลำดับ wave** (P13-06 `DisputeWindowHours`, P13-10 `JoinWindowMinutes`/`TutorJoinWindowMinutes`, …) · ค่าที่เป็นกลุ่มใช้ section ย่อยของ task นั้นเอง (`Tutoring:Profile`, `Tutoring:Slots`, `Tutoring:Kyc`, `Tutoring:Search`, `Tutoring:Booking`, `Tutoring:LearnerProfiles`, `Tutoring:Payment`, …) คนละคลาส ไม่แย่งไฟล์กัน
`TutoringProductionRequirements.GetProblems(IConfiguration)` (แพทเทิร์น `LiveProductionRequirements`; ไม่ echo ค่า secret): Production ⇒ `PublicBaseUrl` (หลัง default) ต้อง https · `DefaultCommissionPercent` ∈ [0,50] · เรียกจาก `ProductionConfigurationGuard.ValidateProductionConfiguration` **และ** `WorkersProductionRequirements.GetProblems` · P13-02 เพิ่ม `TutoringKycProductionRequirements` แยกคลาส

---

## 9. Test checklist

**Unit** (`tests/Siri.UnitTests/Tutoring/`): state machine ครบ 6×6 (theory: ทุกคู่ที่อยู่ในตาราง §5.1 ผ่าน / ทุกคู่นอกตารางโยน) · I1-I6 · `TutorReadinessCalculator` ทุก blocker · `TutorSlugGenerator` (ไทย/อังกฤษ/ว่าง/สงวน/ตัด 60/เวกเตอร์เดียวกับ Catalog) · validators ทุก field (ขอบ 100/20000, trial 0/9.99/10, group คู่, bio มี `<a`, ปี) · `ImageFileValidator` (magic bytes ตรง/ไม่ตรง content-type, 0 ไบต์, 2 MiB+1, svg/html ปลอมเป็น .png) · `TutorModerationService` (audit เป็นขั้นสุดท้าย, hooks ถูกเรียก, reason ว่างถูกปฏิเสธ) · `TutorOnly` policy matrix (§5.2) · `TutoringOptions` validator · **source-scan test**: ไม่มีไฟล์ใดนอก `TutorProfileStatsUpdater.cs` ที่เขียน `RATING_AVERAGE`/`RATING_COUNT`/`COMPLETED_SESSIONS_COUNT`/`RELIABILITY_SCORE`/`NEXT_AVAILABLE_AT_UTC` · reflection: entity ไม่มี public setter
**Integration** (`SiriApiFactory`, Testcontainers PostgreSQL 17 + Redis; ห้าม InMemory): onboarding ครบ: สมัครผู้สอน→approve→สร้างโปรไฟล์→เพิ่ม offering→อัปรูป (fake `IFileStorage`)→linking วิดีโอ (seed MEDIA_ASSET Ready ของตัวเอง/ของคนอื่น/Processing/ยาวเกิน) · **IDOR**: ติวเตอร์ B แก้/อ่าน offering-education-certificate ของ A ⇒ 404 `tutoring.not_found` เท่ากับ id ที่ไม่มีจริงทุกฟิลด์ (หลังตัด traceId) · Admin ที่ไม่มี INSTRUCTOR_PROFILE เรียก `POST tutor/profile` ⇒ 403 · Instructor ที่ยังไม่ approved ⇒ 403 (จาก `InstructorOnly`) · `PUT profile` rowVersion เก่า ⇒ 409 `tutoring.concurrent_update` · listing: Draft ⇒ 409, Verified+ไม่มี offering ⇒ 409, ปิด offering สุดท้ายขณะ listed ⇒ unlisted อัตโนมัติ · CHECK ระดับ DB: insert `IS_LISTED=true` กับ `STATUS='Draft'` ด้วย SQL ตรง ⇒ ล้ม · admin suspend ⇒ `TutorOnly` ถัดไป 403 ทันที + `SECURITY_AUDIT` มีแถว · commission ออกนอก 0–50 ⇒ 400 + audit เฉพาะที่สำเร็จ · seed วิชา (§2.6) · rate limit (`tutoring-upload` ครั้งที่ 11 ใน 10 นาที ⇒ 429, ผู้ใช้อื่นผ่าน) · ทุก action ของ 4 controller มี `[Authorize]`/`[AllowAnonymous]` (reflection test แบบ `IdentityEndpointAuthorizationTests`) · **migration**: `Up()` บน PG17 ว่างผ่าน, ตรวจ CHECK/UQ/FK `NoAction`, ไม่มี shadow column (เทียบ model)

## 10. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | §3 ข้อ 1-7,14 + entity/enum/configuration 5 ตาราง + `AppDbContextTutoringExtensions` + migration `AddTutoringCore` + seed §2.6 | build 0 warning · architecture เขียว (รวม identifier length, count 12) · ไม่ apply DB จริง · migration ไม่มี shadow column |
| **B** | `backend-developer` | §4 contracts + policy `TutorOnly` (+ unit) + domain methods §5.1 + unit | unit เขียว · `AuthorizationPolicyTests` ขยายแล้ว |
| **C** | `backend-developer` | repositories/services/validators/slug/readiness/hooks/invalidator/Options/ProductionRequirements | unit §9 |
| **D** | `backend-developer` | 4 controller + rate-limit + wiring Program/appsettings | ไม่มี action ไร้ attribute auth |
| **E** | `backend-developer` | integration tests §9 | เขียนครบ (รายงานว่ายังไม่เคยรันถ้าไม่มี Docker) |
ขนานได้: A ∥ B(contract/policy) · C หลัง A · D หลัง C · `DONE` ตั้งโดย integrator-qa · **ห้าม commit เอง**

## 11. FE notes (สร้างขนานได้จาก DTO ข้างล่าง)
- เส้นทาง: `/instructor/tutoring/*` (ผ่าน `instructorStudioGuard` อยู่แล้ว) — **onboarding/โปรไฟล์/offering เข้าได้ตั้งแต่ Draft**; หน้าที่เรียก `TutorOnly` (P13-03+) ต้อง guard เพิ่มด้วย `profile.status === 'Verified'` (ดึงจาก `GET tutor/profile`) · FE **ไม่ตัดสินสิทธิ์** — server ตอบ 403 ก็ต้องแสดงตาม
- `GET /api/tutoring/subjects` (สาธารณะ) เป็นของ P13-04 — form offering ใช้ตัวนั้น (ถ้ายังไม่พร้อมให้ทำ loading/error จริง ไม่ใส่ข้อมูลปลอม)
- อัปโหลดวิดีโอแนะนำ: ใช้ flow Media เดิม (สร้าง asset → TUS → รอ `Ready`) แล้วเรียก `PUT tutor/profile/intro-video`
- กล่อง "ความพร้อมส่งตรวจ": แสดง `readiness.blockers` เป็นรายการ i18n (`tutoring.tutor.readiness.<code>`) · ปุ่ม "เปิดรับงาน" disabled เมื่อ `status !== 'Verified'` พร้อมคำอธิบาย
- i18n key `tutoring.tutor.profile.*`, `tutoring.tutor.offering.*`, `tutoring.errors.<reason ตัดคำนำหน้า tutoring.>` (th+en) · ใช้ token/`tone-*` เท่านั้น · loading/error/empty ครบ · ปุ่ม submit กันกดซ้ำ · แสดงเวลาเป็น `Asia/Bangkok`

## Deviations from TUTORING.md (สำหรับ architect คนอื่น/orchestrator)
| # | ใน TUTORING.md | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | `TUTOR_PROFILES` ไม่มีชื่อแสดงผล (มีแต่ SLUG/HEADLINE/BIO) แต่ค้นหาด้วย "ชื่อ" | **เพิ่ม `DISPLAY_NAME varchar(80)`** | ต้องใช้ในค้นหา (`pg_trgm`), slug, หน้าสาธารณะ; ไม่มีทางอ่านจาก `INSTRUCTOR_PROFILE` ได้โดยไม่แก้ Catalog contract (`IInstructorProfileReader` คืนแค่ id) |
| D2 | `STATUS` ไม่มีคอลัมน์เหตุผล/เวลา | **เพิ่ม `STATUS_REASON varchar(1000)`, `STATUS_CHANGED_AT_UTC`** | ติวเตอร์ต้องเห็นเหตุผล NeedsInfo/Rejected/Suspended; admin queue เรียงตามเวลา |
| D3 | `TUTOR_CERTIFICATES.DOCUMENT_ID?` | คงชื่อไว้ แต่ null เสมอ ไม่มี FK/endpoint ใน v1 | เลี่ยงสร้าง pipeline รูปใบรับรองสาธารณะที่ยังไม่มี requirement |
| D4 | §5 ระบุ path ผู้ดูแลเป็น `admin/tutoring/…` ภายใต้ base `/api/tutoring` | ใช้ **`/api/tutoring/admin/…`** ทุกตัว | ตรงแบบแผนโมดูลอื่น (`/api/catalog/admin/…`, `/api/payout/admin/…`) และกันเส้นทางซ้ำซ้อน `…/tutoring/admin/tutoring/…` |
| D5 | §5 ไม่ระบุ endpoint `GET subjects` อยู่ task ไหน; TASKS ให้ P13-04 | ตาราง+admin CRUD อยู่ P13-01, **public `GET subjects` อยู่ P13-04** | ตรง TASKS |
| D6 | เปิด/ปิดรับงาน (`IS_LISTED`) ไม่มี endpoint ระบุ | เพิ่ม `PUT tutor/profile/listing` | จำเป็นต่อ flow §3.1 ข้อ 6 |

## Open decisions (defaulted — ปรับด้วย config/revision ได้)
1. `MinChargeAmount = 10.00` ฿ — ยังไม่ได้ยืนยันกับ Stripe (Q14.4) · 2. ราคาขั้นต่ำ/สูงสุดต่อชั่วโมง 100–20000 ฿ (กันพิมพ์ผิด) · 3. กลุ่มย่อยต่อที่นั่งต้องไม่แพงกว่าตัวต่อตัว · 4. **รูปโปรไฟล์ไม่ตัด EXIF** (ไม่มี image library; จะเพิ่ม package = ต้องถาม) — ความเสี่ยง: พิกัด GPS ในรูป; mitigation: ข้อความเตือนใน UI + ToS · 5. `Admin` เรียก endpoint ติวเตอร์ไม่ได้ผล (ไม่มีโปรไฟล์) — ไม่มี "impersonate tutor" · 6. ไม่ cache สถานะ Verified ใน token (DB 1 query/request ของ `TutorOnly`)

## Frontend DTO appendix (TypeScript)
```ts
type Guid = string; type IsoUtc = string;
interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number; totalPages: number; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: 'not_found'|'validation'|'forbidden'|'conflict'|'unavailable'|string; reason?: string; offeringId?: Guid; errors?: Record<string,string[]>; }

type TutorStatus = 'Draft'|'PendingVerification'|'NeedsInfo'|'Verified'|'Rejected'|'Suspended';
type TutorGender = 'Male'|'Female'|'Other'|'Undisclosed';
type TutorLevel = 'Primary'|'LowerSecondary'|'UpperSecondary'|'University'|'Competitive'|'Adult';
type TutorCurriculum = 'Thai'|'EP'|'International';

interface TutorReadiness { canSubmitForVerification: boolean; blockers: string[]; }     // blockers: display_name_missing|headline_missing|bio_too_short|no_active_offering|photo_missing|(kyc_* จาก P13-02)
interface TutorProfile {
  tutorId: Guid; slug: string; displayName: string; headline: string|null; bio: string; gender: TutorGender; yearsExperience: number;
  status: TutorStatus; statusReason: string|null; isListed: boolean; photoUrl: string|null; introVideoAssetId: Guid|null;
  minNoticeHours: number; bufferMinutes: number; maxAdvanceDays: number; verifiedAtUtc: IsoUtc|null;
  readiness: TutorReadiness; rowVersion: string;
}
interface CreateTutorProfileRequest { displayName: string; headline?: string|null; bio: string; gender: TutorGender; yearsExperience: number; }
interface UpdateTutorProfileRequest extends CreateTutorProfileRequest { rowVersion: string; }
interface SetListingRequest { isListed: boolean; rowVersion: string; }
interface SetIntroVideoRequest { mediaAssetId: Guid; }
interface PhotoUploadResponse { photoUrl: string; }

interface OfferingSubjectRef { subjectId: Guid; slug: string; nameTh: string; nameEn: string; }
interface UpsertOfferingRequest {
  subjectId: Guid; level: TutorLevel; curriculum: TutorCurriculum; hourlyRateOneOnOne: number;
  groupHourlyRatePerSeat: number|null; groupMaxSeats: number|null; trialEnabled: boolean; trialMinutes: 15|30|null; trialPrice: number|null; isActive: boolean;
}
interface TutorOffering extends Omit<UpsertOfferingRequest,'subjectId'> { offeringId: Guid; subject: OfferingSubjectRef; }
interface UpsertEducationRequest { institution: string; degree: string; field?: string|null; yearFrom: number; yearTo?: number|null; sortOrder: number; }
interface TutorEducation extends UpsertEducationRequest { educationId: Guid; }
interface UpsertCertificateRequest { title: string; issuer?: string|null; year: number; sortOrder: number; }
interface TutorCertificate extends UpsertCertificateRequest { certificateId: Guid; }

// Admin
interface AdminSubject { subjectId: Guid; slug: string; nameTh: string; nameEn: string; parentId: Guid|null; sortOrder: number; isActive: boolean; }
interface AdminTutorListItem { tutorId: Guid; slug: string; displayName: string; status: TutorStatus; isListed: boolean; ratingAverage: number; ratingCount: number; completedSessionsCount: number; reliabilityScore: number; commissionPercentOverride: number|null; verifiedAtUtc: IsoUtc|null; statusChangedAtUtc: IsoUtc; }
interface AdminTutorDetail extends Omit<AdminTutorListItem,'ratingAverage'|'ratingCount'> { userId: Guid; instructorProfileId: Guid; headline: string|null; bio: string; gender: TutorGender; yearsExperience: number; statusReason: string|null; effectiveCommissionPercent: number; ratingAverage: number; ratingCount: number; nextAvailableAtUtc: IsoUtc|null; offerings: TutorOffering[]; educations: TutorEducation[]; certificates: TutorCertificate[]; }
```
`reason` → i18n: `tutoring.instructor_not_approved`, `tutoring.tutor_profile_not_found`, `tutoring.tutor_profile_exists`, `tutoring.slug_conflict`, `tutoring.tutor_suspended`, `tutoring.tutor_not_verified`, `tutoring.no_active_offering`, `tutoring.concurrent_update`, `tutoring.not_found`, `tutoring.offering_duplicate`/`_limit`, `tutoring.subject_not_found`, `tutoring.education_limit`, `tutoring.certificate_limit`, `tutoring.media_asset_not_found`, `tutoring.intro_video_not_ready`/`_duration_invalid`, `tutoring.image_invalid`, `tutoring.text_contains_markup`, `tutoring.invalid_transition`, `tutoring.subject_slug_exists`, `tutoring.subject_parent_invalid`, `tutoring.tutor_not_found`

## Changelog
- **2026-10-14 รอบ 2 (cross-contract review):** (1) ประกาศ `SessionFormat` (`OneOnOne|Group`) ใน `Tutoring.Domain` ที่ P13-01 (§3 โครงโฟลเดอร์) (2) §3#1 ระบุว่า task ที่เริ่มใช้เป็นผู้เพิ่ม ProjectReference (Payment→P13-06, Payout→P13-06/07, Live→P13-09) (3) §5.2 แก้รายการ endpoint ที่ใช้ `TutorOnly` vs `InstructorOnly` ให้ตรง P13-07 §8 / P13-08 §5.5 / P13-10 (wallet + class cancel/quote = `InstructorOnly`) (4) i18n key convention อ้างอิง README §6 (ไม่ใช่ `tutoring.<audience>.<screen>.<element>`)

- **Changelog 2026-10-15 hardening (P13-33):** (L3) ทุก list endpoint ของ Tutoring จำกัด `page` ไว้ที่ **1..100000** (`TutoringPaging.MaxPage`; เกิน = 400 `invalid paging` แทนที่ offset จะ overflow เป็น 500) และคำนวณ offset แบบ 64-bit (`TutoringPaging.Offset`) · (L1) `TutorModerationService.Suspend/Reinstate/SetCommission` ปฏิเสธ **403 `tutoring.admin_self_action`** เมื่อ `adminUserId == profile.USER_ID` (ไม่มี ext key) · (L7) `TutoringProductionRequirements` ปฏิเสธ `Tutoring:DefaultCommissionPercent` = 0 หรือ > 50 ใน Production (Options validator ยังอนุญาต 0 นอก Production)

### rev (2026-10-20) — B-1 (D-25.1)
- §5.3.3 reason ใหม่: `tutoring.offering_has_open_credits` (409, ไม่มี ext) จากการปิด offering ที่ยังมีเครดิตแพ็กเกจค้าง — ดู P13-12 changelog rev 2
