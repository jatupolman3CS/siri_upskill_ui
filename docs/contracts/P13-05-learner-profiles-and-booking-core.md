# Contract: P13-05 โปรไฟล์ผู้เรียน (`LEARNER_PROFILES`) + แกนการจอง (`TUTOR_SESSIONS` / `TUTOR_BOOKINGS`) — ล็อกเวลาด้วย exclusion constraint, ที่นั่งกลุ่ม atomic, hold 15 นาที, trial ฟรี

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE) + `Siri.Persistence` (**แก้ 2 จุด additive**: `HasPostgresExtension("btree_gist")` + helper `PostgresViolations`) + `Siri.Api` (controller, rate limit) + `Siri.Workers` (1 job)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A, ต้องอ่าน §2.4 และ §2.6 อย่างละเอียด) → `backend-developer` (WP-B..E)** · ควรให้ `integrator-qa` รัน integration test แข่งกันบน PostgreSQL 17 จริง (Testcontainers/external mode) ก่อนตั้ง `DONE` · ไม่ต้อง `DESIGN_DATABASE` — §2 ระบุ DDL/SQL/ชื่อ constraint ครบแล้ว · **ห้ามส่ง Antigravity**: แตะ "การล็อกเวลา = ป้องกันการขายซ้อน" และเป็นฐานของเงิน (P13-06/07/08)

Dependency: **P13-01** (ตาราง/enum/ชื่อ), **P13-03** (`SlotCalculator.IsStartAvailable`, `TutorPriceCalculator`, `ITutorBusyIntervalReader` seam, `ITutorNextAvailableRefresher`) · **ผู้ใช้ต่อ:** P13-06 (จ่ายเงิน), P13-08 (ยกเลิก/คืนเงิน), P13-09 (ห้อง Meet), P13-10 (เข้าเรียน/ปิดคลาส), P13-11 (เตือน), P13-12 (แพ็กเกจ) — **พื้นผิวที่คนเหล่านั้นต้องพึ่งอยู่ที่ §7 และ `P13-README.md`**

---

## 0. ข้อเท็จจริงจากโค้ดจริง + ผลต่อดีไซน์

| # | ข้อเท็จจริง | ผล |
|---|---|---|
| F1 | Npgsql EF 10.0.3 **ไม่มี API exclusion constraint** (ตรวจ xml/dll แล้ว: ไม่มีคำว่า Exclusion) | สร้างด้วย `migrationBuilder.Sql` — EF ไม่รู้จัก constraint นี้ ⇒ **model snapshot ไม่เปลี่ยน** ⇒ `migrations add` ครั้งถัดไปไม่พยายามแก้/ลบมัน (ข้อควรระวัง: ใครเปลี่ยนชื่อ/ลบคอลัมน์ที่อยู่ในนิยาม constraint ต้องเขียน SQL เอง) · ชื่อ constraint ไม่ถูกตรวจโดย `DatabaseIdentifierLengthTests` ⇒ ตั้ง 28 ไบต์เองและมีเทสต์ยืนยันว่า constraint มีอยู่จริง |
| F2 | ตัวอย่างเดียวของ extension ในโมเดลคือ `modelBuilder.HasPostgresExtension("pg_trgm")` ใน `AppDbContext.OnModelCreating` ⇒ migration `InitialCreatePostgres` ปล่อย `Npgsql:PostgresExtension:pg_trgm` เป็น `AlterDatabase` ต้นไฟล์ | เพิ่มบรรทัดเดียวกันสำหรับ `btree_gist` ⇒ EF ปล่อย `CREATE EXTENSION IF NOT EXISTS btree_gist` ที่**ต้นไฟล์ `Up()`** (ก่อน `CreateTable`) · **ต้องคงลำดับ: AlterDatabase(extension) → CreateTable → Sql(EXCLUDE)** |
| F3 | `btree_gist` เป็น **trusted extension** ตั้งแต่ PostgreSQL 13 (role ที่เป็น owner ของ database สร้างได้โดยไม่ต้อง superuser) · role `siriupskill_app` เป็น owner ไม่ใช่ superuser · image เทสต์ `postgres:17-alpine` มี contrib อยู่แล้ว (`pg_trgm` ใช้อยู่) | **ยืนยันบน instance จริงก่อน apply** (read-only): `SELECT name, trusted FROM pg_available_extension_versions WHERE name='btree_gist';` และ role มีสิทธิ์ `CREATE` บน database — agent ห้ามรันเอง (owner สั่ง) |
| F4 | โมดูลไม่ reference Npgsql (provider-agnostic) และไม่มีโมดูลไหนตรวจ SQLSTATE; โค้ดเดิมจับ `DbUpdateException` กว้าง ๆ | เพิ่ม helper ใน **`Siri.Persistence`** (รู้ provider อยู่แล้ว): `DbUpdateException.IsUniqueViolation(constraint?)` / `IsExclusionViolation(constraint?)` (§6.2) |
| F5 | `OrderRepository.ExecuteInTransactionAsync` (Commerce) เป็นแพทเทิร์น transaction ที่ใช้งานจริงแล้ว (ไม่มี retry strategy; rollback เมื่อ `Result` ล้ม/exception) · `AuditableEntityInterceptor`/`ConcurrencyTokenInterceptor` ทำงานเฉพาะ `SaveChanges` — **`ExecuteSql*`/`ExecuteUpdate*` ข้ามทั้งสอง** | repository ของ Tutoring ทำเมธอดเดียวกัน; raw SQL ต้อง **หมุน `ROW_VERSION` และเซ็ต `UPDATED_AT_UTC` เอง** (§5.3) |
| F6 | `DomainError.WithReason(reason, extensions)` + `ToProblemHttpResult` ⇒ status จาก `Code`, sub-code ใน `reason`; `Extensions` ใส่ `bookingId` ฯลฯ ได้ | error code `tutoring.*` ทั้งหมดเป็น `reason` (§8) |
| F7 | `OrderService` สร้างเลขออเดอร์ `SU-yyMMdd-{6}` + UQ · `ORDER` ใช้ UUID เป็น PK | `BOOKING_NO` = `TB-yyMMdd-{6 hex CSPRNG}` + `UQ_TUTOR_BOOKINGS_NO` + retry ≤3 เมื่อชน |

---

## 1. Scope & task IDs
**ใน:** `LEARNER_PROFILES` CRUD · `TUTOR_SESSIONS` + `TUTOR_BOOKINGS` + exclusion constraint + trial UQ + migration `AddTutorBookingCore` · `POST /bookings`, `GET /bookings/my`, `GET /bookings/{id}` · การล็อกเวลา/ที่นั่งกลุ่ม/hold/expire/reopen/trial ฟรี (service ที่ P13-06+ เรียก) · เครื่องสถานะ session/booking ครบทุก transition (§3) · `ITutoringUnitOfWork` + `ISessionRoomSync`/`NullSessionRoomSync` + `BookingConfirmedNotifier` + `IBookingExpiryService`/`IBookingReopenService`/`IBookingHoldExpiredHandler` · `ITutorBusyIntervalReader` ตัวจริง (แทน Null ของ P13-03) · job `tutoring-hold-expiry` · `PostgresViolations` + `btree_gist` · rate-limit ใช้ `tutoring-booking`/`tutoring-user`
**นอก:** จ่ายเงิน/PaymentIntent/`TUTORING.PAYMENTS`/webhook seam (P13-06) · revenue split/escrow (P13-07) · ยกเลิก/คืนเงิน/no-show/คะแนน (P13-08) · ห้อง Meet/ICS (P13-09) · join/เช็กชื่อ/ปิดคลาส (P13-10) · เตือน (P13-11) · แพ็กเกจ (P13-12) · รีวิว/ข้อพิพาท · FE

---

## 2. Schema delta — migration `AddTutorBookingCore`
> กฎเดียวกับ P13-01 §2 · ทุก FK ภายใน `TUTORING` = `NoAction` · **ห้าม cascade/hard delete** (`TUTOR_BOOKINGS`/`TUTOR_SESSIONS` เกี่ยวกับเงิน) · เวลา `timestamptz(3)` UTC · enum เก็บ string · เงิน `numeric(18,2)`

### 2.1 `TUTORING.LEARNER_PROFILES` (entity `LEARNER_PROFILE : IAuditable`)
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `LEARNER_PROFILE_ID` | uuid PK | no | |
| `OWNER_USER_ID` | uuid | no | ผู้ปกครอง/บัญชีที่จ่ายเงิน (`identity.Users.Id`, ไม่มี FK) |
| `NICKNAME` | varchar(40) | no | **ไม่ใช่ชื่อจริง** — ติวเตอร์เห็นเฉพาะค่านี้ |
| `GRADE_LEVEL` | varchar(24) | no | `LearnerGrade`: `Primary1`…`Primary6`, `Secondary1`…`Secondary6`, `Vocational`, `University`, `Adult`, `Other` |
| `IS_MINOR` | boolean | no | server บังคับ true สำหรับ `Primary*`/`Secondary*` |
| `GUARDIAN_CONSENT_AT_UTC` | timestamptz(3) | yes | จำเป็นเมื่อ `IS_MINOR` |
| `GUARDIAN_CONSENT_VERSION` | varchar(32) | yes | **เพิ่ม** (D2) เวอร์ชันข้อความยินยอมของผู้ปกครอง |
| `IS_ACTIVE` | boolean | no | default true (ปิด = ลบแบบ soft) |
| audit | | | |
Index/constraint: `PK_LEARNER_PROFILES` · `IX_LEARNER_PROFILES_OWNER` (`OWNER_USER_ID`,`IS_ACTIVE`) · CHECK `CK_LEARNER_PROFILES_CONSENT` (`IS_MINOR` = false OR (`GUARDIAN_CONSENT_AT_UTC` IS NOT NULL AND `GUARDIAN_CONSENT_VERSION` IS NOT NULL)) · **ไม่เก็บวันเกิด/บัตร/โรงเรียน/เบอร์/อีเมล**

### 2.2 `TUTORING.TUTOR_SESSIONS` (entity `TUTOR_SESSION : IAuditable`) — หน่วยที่ "ล็อกเวลา" ของติวเตอร์
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `SESSION_ID` | uuid PK | no | UUIDv7 |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` NoAction (`FK_TUTOR_SESSIONS_TUTOR`) |
| `OFFERING_ID` | uuid | no | FK → `TUTOR_OFFERINGS` NoAction (`FK_TUTOR_SESSIONS_OFFERING`) |
| `STARTS_AT_UTC` | timestamptz(3) | no | |
| `ENDS_AT_UTC` | timestamptz(3) | no | |
| `BLOCK_ENDS_AT_UTC` | timestamptz(3) | no | = `ENDS_AT_UTC` + `BUFFER_MINUTES` ของติวเตอร์ **ณ ตอนจอง (snapshot)** |
| `FORMAT` | varchar(12) | no | `SessionFormat`: `OneOnOne\|Group` |
| `CAPACITY` | int | no | OneOnOne = 1 · Group = `GROUP_MAX_SEATS` ณ ตอนเปิดกลุ่ม |
| `SEATS_TAKEN` | int | no | นับเฉพาะ booking ที่ `PendingPayment` (hold ยังไม่หมด) + `Confirmed` + หลังจากนั้น (ไม่รวมที่ยกเลิก/หมดอายุ) |
| `IS_TRIAL` | boolean | no | trial เป็น OneOnOne เท่านั้น |
| `STATUS` | varchar(16) | no | `SessionStatus`: `Held\|Scheduled\|Cancelled\|Completed\|NoShowTutor\|NoShowBoth` |
| `MEETING_ROOM_ID` | uuid | yes | `LIVE.ADHOC_MEETINGS` id — **P13-09 เป็นผู้เซ็ต** (ไม่มี FK) |
| `TUTOR_JOINED_AT_UTC` / `TUTOR_CONFIRMED_AT_UTC` / `FINALIZED_AT_UTC` | timestamptz(3) | yes | **P13-10 เป็นผู้เซ็ต** |
| `ROW_VERSION` | bytea | no | |
| audit | | | |
Index/constraint ของตารางนี้:
- `PK_TUTOR_SESSIONS` · `IX_TUTOR_SESSIONS_TUTOR_STARTS` (`TUTOR_ID`,`STARTS_AT_UTC`) · `IX_TUTOR_SESSIONS_ACTIVE_STARTS` (`STARTS_AT_UTC`) `HasFilter("\"STATUS\" IN ('Held','Scheduled')")` (jobs P13-10/11) · `IX_TUTOR_SESSIONS_OFFERING` (`OFFERING_ID`)
- CHECK `CK_TUTOR_SESSIONS_TIME` (`ENDS_AT_UTC` > `STARTS_AT_UTC` AND `BLOCK_ENDS_AT_UTC` >= `ENDS_AT_UTC`) · CHECK `CK_TUTOR_SESSIONS_SEATS` (`CAPACITY` >= 1 AND `SEATS_TAKEN` >= 0 AND `SEATS_TAKEN` <= `CAPACITY`) · CHECK `CK_TUTOR_SESSIONS_FORMAT` (`FORMAT` <> 'OneOnOne' OR `CAPACITY` = 1) · CHECK `CK_TUTOR_SESSIONS_TRIAL` (`IS_TRIAL` = false OR `FORMAT` = 'OneOnOne')
- **`EX_TUTOR_SESSIONS_NO_OVERLAP` (exclusion — SQL ใน §2.4 เท่านั้น)**

### 2.3 `TUTORING.TUTOR_BOOKINGS` (entity `TUTOR_BOOKING : IAuditable`)
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `BOOKING_ID` | uuid PK | no | |
| `BOOKING_NO` | varchar(24) | no | `TB-yyMMdd-XXXXXX` (6 hex CSPRNG, ตัวพิมพ์ใหญ่) · UNIQUE |
| `SESSION_ID` | uuid | no | FK → `TUTOR_SESSIONS` NoAction (`FK_TUTOR_BOOKINGS_SESSION`) |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` NoAction (`FK_TUTOR_BOOKINGS_TUTOR`) — **เพิ่ม (D1)** denormalize จาก session (ใช้ใน partial UQ ของ trial + query ฝั่งติวเตอร์/กระเป๋าเงิน) |
| `LEARNER_USER_ID` | uuid | no | ผู้จอง/ผู้จ่ายเงิน — จาก `IUserContext` เท่านั้น (ไม่มี FK) |
| `LEARNER_PROFILE_ID` | uuid | no | FK → `LEARNER_PROFILES` NoAction (`FK_TUTOR_BOOKINGS_LEARNER`) |
| `PACKAGE_PURCHASE_ID` | uuid | yes | คอลัมน์สร้างที่นี่ (**P13-12 ห้ามเพิ่มซ้ำ** — เพิ่มเฉพาะ FK `FK_TUTOR_BOOKINGS_PACKAGE_PURCHASE`) · `BookingService.CreateAsync` ไม่เขียนค่านี้ (null เสมอ); มีค่าเฉพาะ booking ที่สร้างด้วย `CreateFromPackage` (§3.2) |
| `IS_TRIAL` | boolean | no | |
| `PRICE_AMOUNT` | numeric(18,2) | no | ราคาที่ server คิดตอนจอง (snapshot) · 0 = trial ฟรี |
| `STATUS` | varchar(24) | no | `BookingStatus`: `PendingPayment\|Confirmed\|CancelledByLearner\|CancelledByTutor\|Completed\|NoShowLearner\|NoShowTutor\|NoShowBoth\|Disputed\|Expired` |
| `HOLD_EXPIRES_AT_UTC` | timestamptz(3) | yes | ตั้งเมื่อ `PendingPayment`; ล้างเมื่อ Confirmed/Expired |
| `PAYMENT_ID` | uuid | yes | P13-06 เพิ่ม FK → `TUTORING.PAYMENTS` |
| `CANCELLED_AT_UTC` | timestamptz(3) | yes | P13-08 |
| `CANCEL_REASON` | varchar(500) | yes | P13-08 (ความยาวตาม P13-08 §2.3) |
| `REFUNDED_AMOUNT` | numeric(18,2) | no | default 0 · ≤ `PRICE_AMOUNT` |
| `ESCROW_STATE` | varchar(12) | no | `EscrowState`: `None\|Held\|Released\|Reversed\|Frozen` default `None` (P13-06/07 เขียน) |
| `CONFIRMED_AT_UTC` | timestamptz(3) | yes | **เพิ่ม (D2)** เซ็ตโดย `Confirm` |
| `COMPLETED_AT_UTC` | timestamptz(3) | yes | **เพิ่ม (D2)** เซ็ตโดย domain `MarkCompleted` (P13-08 `SettleCompleted`) — **P13-08/10 ห้ามเพิ่มคอลัมน์ซ้ำ** (P13-10 ใช้ `holdStartedAtUtc` ของตัวเองสำหรับ escrow ไม่พึ่งคอลัมน์นี้) |
| `LEARNER_JOINED_AT_UTC` / `LEARNER_CONFIRMED_AT_UTC` | timestamptz(3) | yes | P13-10 |
| `REMINDER_24H_SENT_AT_UTC` / `REMINDER_15M_SENT_AT_UTC` | timestamptz(3) | yes | P13-11 |
| `ROW_VERSION` | bytea | no | |
| audit | | | |
Index/constraint:
- `PK_TUTOR_BOOKINGS` · `UQ_TUTOR_BOOKINGS_NO` (`BOOKING_NO`) · `IX_TUTOR_BOOKINGS_LEARNER_STATUS` (`LEARNER_USER_ID`,`STATUS`) · `IX_TUTOR_BOOKINGS_TUTOR_STATUS` (`TUTOR_ID`,`STATUS`) · `IX_TUTOR_BOOKINGS_SESSION` (`SESSION_ID`) · `IX_TUTOR_BOOKINGS_LEARNER_PROFILE` (`LEARNER_PROFILE_ID`)
- `IX_TUTOR_BOOKINGS_HOLD_EXPIRY` (`HOLD_EXPIRES_AT_UTC`) `HasFilter("\"STATUS\" = 'PendingPayment'")` (job หมดเวลา)
- **partial UQ `UQ_TUTOR_BOOKINGS_TRIAL`** (`TUTOR_ID`,`LEARNER_PROFILE_ID`) `HasFilter("\"IS_TRIAL\" = true AND \"STATUS\" NOT IN ('CancelledByLearner','CancelledByTutor','Expired')")` — ทดลองเรียนได้ครั้งเดียวต่อ (ติวเตอร์, โปรไฟล์ผู้เรียน)
- **partial UQ `UQ_TUTOR_BOOKINGS_SESSION_LEARNER`** (`SESSION_ID`,`LEARNER_PROFILE_ID`) `HasFilter("\"STATUS\" NOT IN ('CancelledByLearner','CancelledByTutor','Expired')")` — โปรไฟล์ผู้เรียนเดียวกันจองกลุ่มเดียวกันซ้ำไม่ได้
- CHECK `CK_TUTOR_BOOKINGS_AMOUNTS` (`PRICE_AMOUNT` >= 0 AND `REFUNDED_AMOUNT` >= 0 AND `REFUNDED_AMOUNT` <= `PRICE_AMOUNT`) · CHECK `CK_TUTOR_BOOKINGS_HOLD` (`STATUS` <> 'PendingPayment' OR `HOLD_EXPIRES_AT_UTC` IS NOT NULL)

### 2.4 Exclusion constraint + extension — **raw SQL (ตรงตามนี้)**
`AppDbContext.OnModelCreating` (`Siri.Persistence`, เพิ่มต่อจาก `pg_trgm`):
```csharp
// btree_gist backs TUTORING.TUTOR_SESSIONS' exclusion constraint (uuid = + range &&) — trusted extension (PG13+), created by the migration.
modelBuilder.HasPostgresExtension("btree_gist");
```
ใน `AddTutorBookingCore.Up()` — **ต่อท้าย `CreateTable`/`CreateIndex` ของ `TUTOR_SESSIONS` และ `TUTOR_BOOKINGS`** (ก่อนหรือหลัง `TUTOR_BOOKINGS` ก็ได้ ขอแค่หลังสร้าง `TUTOR_SESSIONS`):
```csharp
migrationBuilder.Sql("""
    ALTER TABLE "TUTORING"."TUTOR_SESSIONS"
      ADD CONSTRAINT "EX_TUTOR_SESSIONS_NO_OVERLAP"
      EXCLUDE USING gist (
        "TUTOR_ID" WITH =,
        tstzrange("STARTS_AT_UTC", "BLOCK_ENDS_AT_UTC") WITH &&
      )
      WHERE ("STATUS" IN ('Held', 'Scheduled', 'Completed'));
    """);
```
`Down()`: `ALTER TABLE "TUTORING"."TUTOR_SESSIONS" DROP CONSTRAINT "EX_TUTOR_SESSIONS_NO_OVERLAP";` ก่อน `DropTable` (ไม่ drop extension — ตารางอื่นอาจใช้ในอนาคต)
- ความหมาย: ช่วง `[STARTS, BLOCK_ENDS)` (ปิดซ้าย-เปิดขวา ค่า default ของ `tstzrange`) ของ session สถานะ `Held/Scheduled/Completed` ของ **ติวเตอร์คนเดียวกัน** ห้ามทับกัน — คลาสที่ชนกันพอดีที่ขอบ (จบ 11:10 / เริ่ม 11:10) ได้ · session ที่ `Cancelled/NoShowTutor/NoShowBoth` ออกจากเงื่อนไข ⇒ **คืนเวลาอัตโนมัติ**
- constraint ตรวจ**ทันทีทุก statement** (ไม่ DEFERRABLE) และ **session สองธุรกรรมที่ชนกัน ตัวที่สองจะรอธุรกรรมแรก commit/rollback แล้วจึงตัดสิน** ⇒ ต้องเก็บ transaction ให้สั้น (§5.2)
- ผลข้างเคียงที่ต้องรู้: `UPDATE … SET STATUS='Held'` ของแถวที่กำลังกลับเข้าเงื่อนไข (reopen) ก็ถูกตรวจ ⇒ ใช้ได้ (§5.5)
- `tstzrange(timestamptz, timestamptz)` เป็น IMMUTABLE จึงใช้ในนิยาม constraint ได้ · ประเภท `timestamp(3) with time zone` ใช้กับ `tstzrange` โดยตรง
- **เทสต์ที่ต้องมี:** integration ตรวจ `pg_constraint` มี `EX_TUTOR_SESSIONS_NO_OVERLAP` (`contype='x'`) และ `pg_extension` มี `btree_gist`

---

## 3. Domain (ไม่รู้ EF/ASP.NET; `private set`; เปลี่ยนสถานะผ่าน method เท่านั้น)

> **P13-05 เป็นเจ้าของ "เครื่องสถานะ" ทั้งหมดของ session/booking** — ทำเมธอด transition **ครบทุกตัวที่ task อื่นต้องเรียก** (ตารางล่าง) พร้อม guard + unit test ทุกคู่; task ถัดไป (P13-06/08/10/12/14) **เรียกเมธอดเหล่านี้เท่านั้น ไม่เพิ่มเส้นทางสถานะนอกตาราง** (ชื่อเมธอดตรงกับที่ P13-06 §6.2 และ P13-08 §2.3 ระบุไว้แล้ว) · ส่วน "attendance/reminder members" (`RecordTutorJoined`, `RecordLearnerJoined`, `MarkReminderSent`, …) เป็นของ P13-09/10/11 ตามที่สัญญานั้นประกาศ — ไม่ซ้ำที่นี่
>
> **Enum ที่ P13-05 เป็นผู้ประกาศ** (ตาม P13-README §3 "ประกาศที่"): `SessionStatus`, `BookingStatus`, `EscrowState`, `LearnerGrade`, `NoShowKind` — task อื่นใช้ได้ แต่**ห้ามประกาศซ้ำ/เพิ่มสมาชิกเอง** · `SessionFormat` (`OneOnOne|Group`) เป็นของ **P13-01** (P13-05 ใช้เท่านั้น) · ลำดับ lock และเวลาปล่อยเงินตามมติกลาง D-B/D-A (README §5) — P13-05 ไม่นิยามสูตรเวลาปล่อยเงิน (เป็นของ P13-08)

### 3.1 `TUTOR_SESSION`
| Method | From → To | ผู้เรียกหลัก |
|---|---|---|
| `static CreateHeld(tutorId, offeringId, startsAtUtc, endsAtUtc, bufferMinutes, format, capacity, isTrial, IClock)` | — → `Held` (`SEATS_TAKEN = 1`, `BLOCK_ENDS = ends + buffer`) | P13-05 |
| `MarkScheduled(IClock)` | `Held` → `Scheduled` (`Scheduled` อยู่แล้ว = no-op; สถานะอื่นโยน) | P13-05 (trial), P13-06 (`Confirm`) |
| `ClaimSeat(IClock)` | `Held`/`Scheduled` (กลุ่ม): `SEATS_TAKEN++` เมื่อ `< CAPACITY` มิฉะนั้นโยน | P13-05 (หลังล็อกแถว), P13-12 |
| `ReleaseSeat(IClock)` | `Held`/`Scheduled`: `SEATS_TAKEN--`; ถึง 0 ⇒ `Cancelled` | P13-05 (expire), P13-08 (ยกเลิก booking กลุ่ม) |
| `Cancel(IClock)` | `Held`/`Scheduled` → `Cancelled` (`SEATS_TAKEN = 0`) | P13-05 (expire 1:1), P13-08 (ติวเตอร์ยกเลิกทั้งคลาส) |
| `Revive(IClock)` | `Cancelled` → `Held` (`SEATS_TAKEN = 1`) — ใช้**ทางเดียว**ผ่าน reopen (§5.5) | P13-05 |
| `MarkCompleted(IClock)` / `MarkNoShowTutor(IClock)` / `MarkNoShowBoth(IClock)` | `Scheduled` → `Completed` / `NoShowTutor` / `NoShowBoth` | P13-10 (`Finalize`) |
`Completed`, `NoShowTutor`, `NoShowBoth` เป็น terminal · transition ที่ไม่อยู่ในตาราง ⇒ `InvalidOperationException` (ทดสอบทุกคู่ 6×6) · การแก้ในหน่วยความจำ (`ClaimSeat`/`ReleaseSeat`/`Cancel`/`Revive`) ใช้เมื่อ**ล็อกแถวด้วย `FOR UPDATE` แล้ว** (§5.0); การจองใหม่ที่ไม่ได้ล็อกใช้ SQL แบบมีเงื่อนไข (§5.3) — สองเส้นทางให้ผลสอดคล้องกัน (READ COMMITTED: UPDATE ที่รอล็อกจะประเมิน `WHERE` ใหม่หลังได้ล็อก)

### 3.2 `TUTOR_BOOKING`
| From → To | Method | ผู้เรียกหลัก |
|---|---|---|
| — → `PendingPayment` / `Confirmed`(ราคา 0) | `static Create(...)` | P13-05 |
| — → `Confirmed` (จองด้วยเครดิตแพ็กเกจ — "funded", ไม่ผ่าน `Quote`/hold) | `static CreateFromPackage(bookingNo, sessionId, tutorId, learnerUserId, learnerProfileId, packagePurchaseId, paymentId, priceAmount, IClock)` ⇒ `STATUS=Confirmed`, `IS_TRIAL=false`, `PRICE_AMOUNT=priceAmount` (>0 = สัดส่วนของครั้งนั้นจาก `TUTOR_PACKAGE_CREDITS.GROSS_AMOUNT`), `PAYMENT_ID=paymentId` (payment ของแพ็กเกจ), `PACKAGE_PURCHASE_ID=packagePurchaseId`, `ESCROW_STATE=Held`, `CONFIRMED_AT_UTC=now`, `HOLD_EXPIRES_AT_UTC=null` · invariant B1–B6 ครบ · **เมทริกซ์ transition 10×10 ไม่เปลี่ยน** (ออกจาก `Confirmed` ใช้เมธอดเดิมทั้งหมด) · **guard "tutor ต้อง `Verified`" (มติ D-C) อยู่ที่ P13-12 ก่อนเรียก — factory ไม่ตรวจสถานะติวเตอร์เอง** · ลายเซ็นตรงกับ P13-12 §0.2 จุดที่ 1 (P13-05 เป็นผู้ลงมือเพิ่ม factory นี้เลย ไม่ใช่ P13-12) | P13-12 |
| `PendingPayment` → `Confirmed` | `Confirm(IClock clock, Guid? paymentId)` : ล้าง `HOLD_EXPIRES_AT_UTC`, `CONFIRMED_AT_UTC ??= now`; มี `paymentId` ⇒ `PAYMENT_ID = paymentId` และ `ESCROW_STATE = Held`; ไม่มี (trial ฟรี) ⇒ `ESCROW_STATE` คง `None` | P13-05 (trial), P13-06 |
| `PendingPayment` → `Expired` | `Expire(IClock clock)` : ล้าง `HOLD_EXPIRES_AT_UTC` | P13-05, P13-06 |
| `Expired` → `PendingPayment` | `Reopen(IClock clock, DateTime holdUntilUtc)` — **เรียกจาก `TryReopenAsync` เท่านั้น** แล้วผู้เรียกตามด้วย `Confirm` ในธุรกรรมเดียว (P13-06 §6.2 ข้อ 6a เขียน "Expired(reopened)" ⇒ ที่ P13-05 booking เป็น `PendingPayment` แล้วตอนเรียก `Confirm` — เปลี่ยนเชิงกลไก) | P13-05 |
| `PendingPayment`/`Confirmed` → `CancelledByLearner` / `CancelledByTutor` | `CancelByLearner(DateTime nowUtc, string? reason)` / `CancelByTutor(DateTime nowUtc, string? reason)` : เซ็ต `CANCELLED_AT_UTC`, `CANCEL_REASON` (ตัด 500), ล้าง hold | P13-08 |
| `Confirmed` → `Completed` | `MarkCompleted(DateTime nowUtc)` : เซ็ต `COMPLETED_AT_UTC` | P13-08 (`SettleCompleted`) |
| `Confirmed` → `NoShowLearner` / `NoShowTutor` / `NoShowBoth` | `MarkNoShow(NoShowKind kind, DateTime nowUtc)` (`enum NoShowKind { Learner, Tutor, Both }` **ประกาศที่ P13-05** — P13-08 ใช้ตัวนี้) | P13-08 (`SettleXNoShow`) |
| `Completed` / `NoShowLearner` / `NoShowTutor` / `NoShowBoth` → `Disputed` | `MarkDisputed()` (ทางออกจาก `Disputed` ให้ P13-14 เพิ่ม method เอง) | P13-14 |
| (ไม่เปลี่ยนสถานะ) | `AttachPayment(Guid paymentId)` (เฉพาะ `PendingPayment`; ทับ `PAYMENT_ID` ได้ — แต่ละความพยายามจ่ายได้ PI ใหม่ขณะ hold ยังอยู่; ประวัติอยู่ใน `PAYMENTS`) · `SetEscrowState(EscrowState)` (ค่าเดิมซ้ำ = no-op) · `SetRefundedAmount(decimal total)` (`0 ≤ total ≤ PRICE_AMOUNT`; เจ้าของการเขียนคือ P13-08 `TutoringRefundService` ที่เดียว) | P13-06/07/08 |
| อื่น ๆ ทั้งหมด | — | ห้าม (โยน `InvalidOperationException`) |
- invariants: (B1) `PendingPayment ⇒ HOLD_EXPIRES_AT_UTC != null` (domain + CHECK) · (B2) `Confirm`/`Expire`/`Cancel*` ล้าง `HOLD_EXPIRES_AT_UTC` · (B3) `REFUNDED_AMOUNT ≤ PRICE_AMOUNT` · (B4) `PRICE_AMOUNT` ไม่มี setter หลังสร้าง · (B5) `CONFIRMED_AT_UTC`/`COMPLETED_AT_UTC` เซ็ตครั้งเดียว (`??=`) · (B6) ไม่มี method ใดแก้ `SESSION_ID`/`TUTOR_ID`/`LEARNER_USER_ID`/`LEARNER_PROFILE_ID`/`IS_TRIAL`
- เมทริกซ์ต้องมี unit test ครบทุกคู่ (10×10): อยู่ในตาราง ⇒ ผ่าน · นอกตาราง ⇒ โยน

### 3.3 `LEARNER_PROFILE`
`static Create(ownerUserId, nickname, grade, isMinor, guardianConsentAt?, guardianConsentVersion?)` · `Update(nickname, grade, isMinor, consent…)` · `Deactivate()` · invariant: `IS_MINOR=false` ไม่ได้สำหรับเกรด `Primary*`/`Secondary*`; `IS_MINOR=true ⇒ consent มีค่า` · เปลี่ยนจากผู้เยาว์เป็นผู้ใหญ่ทำได้โดยแก้เกรด+`isMinor` (ไม่ล้าง consent เดิม)

---

## 4. โปรไฟล์ผู้เรียน — endpoint
ทุกตัว `[Authorize]` (ผู้ใช้ที่ login ทุกคน — ระบบสมัครด้วยรหัสผ่านไม่ได้ role Learner จึง**ห้ามบังคับ role**) · rate `tutoring-user` · base `/api/tutoring`

| # | Method + path | Request | สำเร็จ | Error |
|---|---|---|---|---|
| 1 | `GET /learner-profiles?includeInactive=false&page=1&pageSize=50` | — | 200 `PagedResult<LearnerProfileResponse>` | |
| 2 | `POST /learner-profiles` | `UpsertLearnerProfileRequest` | 201 `LearnerProfileResponse` | 400 `tutoring.learner_nickname_invalid` / `tutoring.guardian_consent_required` · 409 `tutoring.learner_profile_limit` |
| 3 | `PUT /learner-profiles/{learnerProfileId}` | `UpsertLearnerProfileRequest` | 200 | 404 `tutoring.not_found` · 400 |
| 4 | `DELETE /learner-profiles/{learnerProfileId}` | — | 204 (soft: `IS_ACTIVE=false`; ใช้ซ้ำได้) | 404 · 409 `tutoring.learner_profile_in_use` (มี booking `PendingPayment`/`Confirmed` ที่ยังไม่จบ **หรือมี `PACKAGE_PURCHASES` สถานะ `Active` ผูกอยู่** — ตารางหลังเป็นของ P13-12: P13-05 เรียกผ่าน seam `ILearnerProfileUsageReader` (default: คืน false จนกว่า P13-12 ลงทะเบียน impl)) |
- ownership: `WHERE LEARNER_PROFILE_ID=@id AND OWNER_USER_ID=@caller` ใน query เดียว; ไม่พบ/ไม่ใช่ของฉัน ⇒ 404 `tutoring.not_found` ข้อความเดียวกัน · `ownerUserId` ไม่มีใน body/query
- **นิยาม "in use" (ข้อ 4):** `LearnerProfileService.DeactivateAsync` ปฏิเสธเมื่อ (ก) มี booking `PendingPayment`/`Confirmed` ที่ยังไม่จบ (query ในโมดูลนี้) **หรือ** (ข) `ILearnerProfileUsageReader.HasActivePackageAsync(learnerProfileId, ct)` คืน true — seam ใน `Application/` ที่ P13-05 ประกาศ พร้อม `NullLearnerProfileUsageReader` (คืน false) ลงทะเบียนเป็นค่าเริ่มต้น; **P13-12 §0.2 จุดที่ 2 ทำสำเร็จโดยลงทะเบียน impl ของตน (ตรวจ `PACKAGE_PURCHASES.STATUS='Active'` ของโปรไฟล์นั้น) แทนที่ null — ไม่ต้องแก้ `LearnerProfileService`** · ไม่ตรวจ `PendingPayment` ของแพ็กเกจ (ยังไม่มีเครดิต)
- `nickname`: 1–40 ตัวอักษร, trim, ห้ามมี `<` `>`, ห้ามตรงรูปแบบอีเมล/เลขโทรศัพท์ (มี `@` หรือเลขติดกัน ≥7 หลัก) ⇒ 400 `tutoring.learner_nickname_invalid` (FE แสดงคำเตือน "ห้ามใช้ชื่อจริง/เบอร์โทร")
- consent: ถ้า `isMinor` (หรือเกรดเป็น `Primary*/Secondary*`) ต้อง `guardianConsent=true` และ `guardianConsentVersion == Tutoring:LearnerProfiles:GuardianConsentVersion` ⇒ server เซ็ต `GUARDIAN_CONSENT_AT_UTC = now` · ไม่ครบ ⇒ 400 `tutoring.guardian_consent_required` (ext `currentVersion`)
- `learner_profile_limit`: โปรไฟล์ active ต่อเจ้าของ ≤ `MaxActivePerOwner` (10)

---

## 5. การจอง — พฤติกรรมที่ต้องตรง

### 5.0 โครงพื้นฐานร่วม (P13-05 เป็น**เจ้าของการประกาศ**; P13-06 §6.0/§7 และ P13-09/10 อ้างถึง — ที่ P13-06 เขียนว่า "ประกาศที่นี่ถ้า P13-05 ยังไม่มี" ให้ถือว่า **P13-05 ประกาศแล้ว ข้ามของ P13-06**)
**(ก) `ITutoringUnitOfWork`** (`Tutoring.Application`; impl `Infrastructure/TutoringUnitOfWork` Scoped):
```csharp
public readonly record struct SavepointOutcome<T>(bool Succeeded, T? Value, Exception? Error);
public interface ITutoringUnitOfWork
{
    /// <summary>semantics เดียวกับ OrderRepository.ExecuteInTransactionAsync: มีธุรกรรมอยู่แล้ว (CurrentTransaction != null) ⇒ รัน operation ตรง ๆ ไม่ commit/rollback เอง;
    /// ไม่มี ⇒ เปิดใหม่ (ReadCommitted) : operation คืน Result ที่ IsSuccess=false ⇒ rollback ; throw ⇒ rollback แล้ว throw ต่อ ; สำเร็จ ⇒ commit.</summary>
    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken);
    Task ExecuteInTransactionAsync(Func<Task> operation, CancellationToken cancellationToken);

    /// <summary>ต้องเรียกภายในธุรกรรม (ไม่มี ⇒ InvalidOperationException). สร้าง SAVEPOINT (IDbContextTransaction.CreateSavepointAsync) แล้วรัน operation :
    /// สำเร็จ ⇒ release ; exception ใด ๆ (ยกเว้น OperationCanceledException ที่เกิดจาก cancellationToken ⇒ ปล่อยออกไป) ⇒ RollbackToSavepointAsync + คืน ChangeTracker ให้เท่าก่อนรัน
    /// (entry ที่เพิ่มหลัง savepoint ⇒ Detach ; entry เดิมที่ถูกแก้ ⇒ คืนค่าปัจจุบัน+สถานะจาก snapshot ก่อนรัน) + log Warning (ชนิด exception เท่านั้น) ⇒ SavepointOutcome(false, default, ex).
    /// จำเป็นเพราะ unique/exclusion violation (23505/23P01) ทำให้ธุรกรรม PostgreSQL ทั้งก้อน aborted ถ้าไม่มี savepoint.</summary>
    Task<SavepointOutcome<T>> TryInSavepointAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken);
    /// <summary>ทางลัดสำหรับ operation ที่ไม่คืนค่า (เลี่ยง overload ambiguity ของ lambda): true = สำเร็จ.</summary>
    Task<bool> TryRunInSavepointAsync(Func<Task> operation, CancellationToken cancellationToken);
}
```
test: join ธุรกรรมเดิมไม่ commit เอง · Result.Failure rollback เฉพาะเมื่อเป็นเจ้าของ · savepoint สำเร็จ/ล้ม (จำลอง 23505 ด้วย insert ซ้ำ) แล้วธุรกรรมใช้ต่อได้ และ tracker สะอาด · เรียกนอกธุรกรรมโยน
**(ข) ลำดับ lock canonical (มติกลาง D-B — README §5; P13-06 §6.0 / P13-08 / P13-12 F8 ใช้ชุดเดียวกัน):** `TUTOR_SESSIONS → TUTOR_BOOKINGS (BOOKING_ID ASC) → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS (SEQ_NO ASC) → PAYMENTS → REFUNDS → Payout splits → TUTOR_PROFILES` (ข้ามชั้นที่ไม่ใช้ได้ แต่ห้ามกลับลำดับ) — P13-05 ล็อกเพียง session → booking · อ่านแถวแบบไม่ล็อกก่อนเพื่อหา id ที่ต้องล็อก (ใช้เป็นด่าน ownership) แล้วล็อกตามลำดับและ **อ่านสถานะซ้ำหลังล็อก** · repository มี `LockSessionAsync(sessionId)` / `LockBookingAsync(bookingId)` = `FromSqlInterpolated($"""SELECT * FROM "TUTORING"."TUTOR_SESSIONS" WHERE "SESSION_ID" = {id} FOR UPDATE""")` ที่ **คืนค่าสดเสมอ** (ถ้า entity นี้ถูก track อยู่แล้ว ต้อง `Reload()` ให้ตรงค่าที่ล็อก ไม่ใช่ค่าเก่า) · ข้อยกเว้นที่ไม่ล็อกคือการสร้างใหม่ (§5.1) ซึ่งพึ่ง SQL แบบมีเงื่อนไข (§5.3) + exclusion constraint
**(ค) `ISessionRoomSync`** (Application): `Task ConvergeAsync(Guid sessionId, CancellationToken ct)` — stage-only, idempotent (สัญญาตาม P13-09 §9) · `NullSessionRoomSync` (no-op) ลงทะเบียน `TryAddScoped<ISessionRoomSync, NullSessionRoomSync>()` ใน `AddTutoringModule` · **P13-10 แทนที่ด้วย `SessionRoomSync` จริง** · P13-05 เรียกที่: trial ฟรี (ข้อ 13), expire/ปล่อยที่นั่งกลุ่ม (`ExpireAsync`), `TryReopenAsync` สำเร็จ — ทุกครั้ง**ครอบ `TryInSavepointAsync`** และล้มต้องไม่ทำให้การจอง/คืนเวลาล้ม

### 5.1 `POST /api/tutoring/bookings` — ลำดับ **บังคับ** (`BookingService.CreateAsync(userId, request, ct)`)
Request:
```json
{ "offeringId": "…", "startsAtUtc": "2026-10-20T11:00:00Z", "durationMinutes": 60, "format": "OneOnOne", "learnerProfileId": "…", "isTrial": false }
```
`startsAtUtc` เป็น `DateTimeOffset` → `.UtcDateTime` (Kind=Utc) · **ราคา/ผู้ติวเตอร์/สิทธิ์ ไม่รับจาก client** · ไม่มี `userId`/`tutorId`/`sessionId`/`amount` ใน body

**Preflight (ไม่อยู่ใน transaction — อ่านอย่างเดียว):**
```
1. [Authorize] userId จาก IUserContext ; rate limit tutoring-booking
2. validate (FluentValidation) : offeringId/learnerProfileId ≠ Empty ; durationMinutes ∈ AllowedDurationsMinutes (หรือ = TRIAL_MINUTES เมื่อ isTrial) ; format enum
   startsAtUtc : วินาที=0, มิลลิวินาที=0, นาทีท้องถิ่น (Bangkok = UTC+7) mod GridMinutes = 0   → 400 tutoring.slot_not_on_grid
3. learner = WHERE LEARNER_PROFILE_ID=@lp AND OWNER_USER_ID=@userId AND IS_ACTIVE      ไม่พบ → 404 tutoring.learner_profile_not_found   (ของคนอื่น = ไม่พบ ข้อความเดียวกัน)
4. offering+tutor = JOIN WHERE OFFERING_ID=@o AND offering.IS_ACTIVE AND tutor.STATUS='Verified' AND tutor.IS_LISTED   ไม่พบ → 404 tutoring.offering_not_found (เหตุผลเดียวกันทุกกรณี: ไม่มี/ปิด/ติวเตอร์ถูกระงับ/ไม่ listed)
5. tutor.USER_ID == userId → 409 tutoring.cannot_book_self
6. quote = TutorPriceCalculator.Quote(offering, format, durationMinutes, isTrial, minChargeAmount)   ล้ม → 409 ตาม reason (trial_not_available / format_not_offered / price_below_minimum)
   - `minChargeAmount` = `Tutoring:Profile:MinChargeAmount` (อ่านจาก options ที่ P13-01 ประกาศ; ผู้เรียกทุกจุด — booking นี้, slots P13-03, `PackagePricing` P13-12 — ต้องส่งค่าเดียวกัน)
   - การจองด้วยเครดิตแพ็กเกจ (P13-12 `POST package-purchases/{id}/bookings`) **ไม่ผ่าน `BookingService.CreateAsync` และไม่เรียก `Quote` ที่นี่** (ราคามาจากเครดิตที่จ่ายแล้ว; ราคาแพ็กเกจตอนขายคิดโดย `PackagePricing` ซึ่งเรียก `Quote` ด้วย `minChargeAmount` เดียวกัน) · ต้องเป็นติวเตอร์ `Verified` (D-C) — guard อยู่ที่ P13-12 · unit test ของขั้นนี้: `minChargeAmount` ต่ำ/สูงกว่าราคาฐานให้ครบทั้งสองทาง
7. เวลา : now = IClock ; start ≥ now + tutor.MIN_NOTICE_HOURS → มิฉะนั้น 400 tutoring.slot_too_soon ; start ≤ now + MAX_ADVANCE_DAYS → มิฉะนั้น 400 tutoring.slot_too_far
8. availability : หา session กลุ่มที่เปิดอยู่ (เฉพาะ format=Group) ที่ (TUTOR_ID, OFFERING_ID, STARTS_AT_UTC, ENDS_AT_UTC) ตรง และ STATUS ∈ {Held,Scheduled}
      พบ → ข้ามการตรวจ availability (ติวเตอร์ผูกพันแล้ว — P13-03 D4) ; ไม่พบ → SlotCalculator.IsStartAvailable(Busy=[]) ต้องเป็น true มิฉะนั้น 409 tutoring.slot_unavailable
9. trial : isTrial → ไม่มี booking ที่ (TUTOR_ID, LEARNER_PROFILE_ID, IS_TRIAL, STATUS ∉ {CancelledBy*, Expired}) มิฉะนั้น 409 tutoring.trial_already_used   (UQ ข้อ 2.3 คือ backstop ของ race)
10. hold cap : COUNT(booking ของ userId ที่ PendingPayment ∧ HOLD_EXPIRES_AT_UTC > now) < MaxOpenHoldsPerUser (3) มิฉะนั้น 409 tutoring.too_many_pending_holds
```
**ธุรกรรม (`ITutoringUnitOfWork.ExecuteInTransactionAsync`, ReadCommitted — ต้องสั้น: ไม่มี HTTP/Stripe/Google ภายใน; การอ่าน `IUserContactReader` ใน notifier เป็นการอ่าน DB บน context เดียวกัน อนุญาต):**
```
11. OneOnOne :  session = TUTOR_SESSION.CreateHeld(tutor, offering, start, end = start+dur, bufferMinutes = tutor.BUFFER_MINUTES, OneOnOne, capacity 1, isTrial) → INSERT (SaveChanges)
                ← exclusion violation (23P01 EX_TUTOR_SESSIONS_NO_OVERLAP) = ชนกับคลาสอื่นของติวเตอร์ → ปล่อย DbUpdateException ออกนอก transaction (rollback ทั้งก้อน) → §5.2
    Group    :  (ก) ถ้าข้อ 8 พบ session → atomic claim (§5.3 ก) ; rows=0 → Conflict tutoring.seats_full
                (ข) ไม่พบ → ห่อด้วย uow.TryInSavepointAsync : INSERT session Group (CAPACITY = offering.GROUP_MAX_SEATS, SEATS_TAKEN = 1, Held) + SaveChanges
                    ← 23P01 (มีคนเปิดกลุ่มเวลานั้นพร้อมกัน) : savepoint rollback → ค้นหา session ที่ผู้ชนะเพิ่งเปิด (STATUS ∈ {Held,Scheduled}, ตรง tutor/offering/เวลา) → เส้นทาง (ก) **ในธุรกรรมเดิม** ;
                      ไม่พบ/claim ไม่ได้ ⇒ Conflict tutoring.slot_taken ; exception ชนิดอื่น ⇒ throw
12. booking = TUTOR_BOOKING.Create(BOOKING_NO, session.SESSION_ID, tutor.TUTOR_ID, userId, learnerProfileId, isTrial, quote.Amount,
                                   quote.Amount == 0 ? Confirmed : PendingPayment, HOLD_EXPIRES_AT_UTC = now + HoldMinutes(15) เมื่อ PendingPayment) → INSERT
13. quote.Amount == 0 (trial ฟรี) — **ยืนยันทันที ไม่มี payment/escrow/split**: session.MarkScheduled(clock) ; booking เป็น Confirmed (CONFIRMED_AT_UTC = now, ESCROW_STATE = None) ; SaveChanges ;
      ISessionRoomSync.ConvergeAsync(sessionId) ครอบ uow.TryInSavepointAsync (ล้ม ⇒ log Error + metric — booking ยัง Confirmed, self-heal ที่ P13-10 ขั้น 0) ;
      BookingConfirmedNotifier.Stage(...) (§5.6 — อีเมล+แจ้งเตือนในแอปถึงผู้เรียกและติวเตอร์)
14. SaveChanges → commit
```
**หลัง commit (best-effort, ล้มเหลวไม่ทำให้ request ล้ม — log warning):** `ITutorPublicCacheInvalidator.InvalidateSlotsAsync()` · `ITutorNextAvailableRefresher.TryRefreshAsync(tutorId)`
**ตอบ** `201 Created` + `Location: /api/tutoring/bookings/{id}` + `BookingResponse` (`requiresPayment = status==PendingPayment`)

### 5.2 การจับ exception → HTTP (นอก transaction — ธุรกรรมถูก rollback แล้ว; ถ้าต้องค้น DB ต่อให้ `ChangeTracker.Clear()` ก่อน)
| จับได้ | แปลงเป็น |
|---|---|
| `DbUpdateException.IsExclusionViolation("EX_TUTOR_SESSIONS_NO_OVERLAP")` (OneOnOne; หรือ Group ที่ savepoint-recovery ไม่สำเร็จ) | ถ้ามี booking `PendingPayment` ของ **ผู้ใช้คนเดียวกัน** ที่ (TUTOR_ID, STARTS_AT_UTC เดียวกัน) ⇒ 409 `tutoring.slot_already_held_by_you` ext `{ bookingId }` (ช่วยเมื่อกดซ้ำ/เครือข่ายหลุด) · ไม่งั้น 409 `tutoring.slot_taken` |
| `IsUniqueViolation("UQ_TUTOR_BOOKINGS_TRIAL")` | 409 `tutoring.trial_already_used` |
| `IsUniqueViolation("UQ_TUTOR_BOOKINGS_SESSION_LEARNER")` | 409 `tutoring.already_booked_this_session` |
| `IsUniqueViolation("UQ_TUTOR_BOOKINGS_NO")` | สร้าง `BOOKING_NO` ใหม่ + retry ≤3 แล้ว 500 (ไม่คาดว่าเกิด) |
| `DbUpdateConcurrencyException` | 409 `tutoring.concurrent_update` (ผู้ใช้ลองใหม่) |
| exception อื่น | ปล่อยให้ global handler (500) — ห้ามกลืน |

### 5.3 SQL ที่ต้องใช้ตรงตัว (`ExecuteSqlInterpolatedAsync` ใน transaction เดียวกับ DbContext — identifier + alias ใน double quote; ค่าเป็นพารามิเตอร์)
**หมุน token (ใช้นิพจน์เดียวกันทุกที่ ไม่ต้องมี extension):** `"ROW_VERSION" = decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex')` (8 ไบต์ เท่ากับ `ConcurrencyTokenInterceptor.TokenLengthBytes`)
```sql
-- (ก) claim ที่นั่งกลุ่ม — rows affected = 1 สำเร็จ ; 0 = เต็ม/ไม่ใช่กลุ่มที่เปิดอยู่ (ห้ามอ่านนับใน memory แล้วเขียน)
UPDATE "TUTORING"."TUTOR_SESSIONS"
SET "SEATS_TAKEN" = "SEATS_TAKEN" + 1, "UPDATED_AT_UTC" = {now},
    "ROW_VERSION" = decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex')
WHERE "SESSION_ID" = {sessionId} AND "FORMAT" = 'Group' AND "STATUS" IN ('Held', 'Scheduled') AND "SEATS_TAKEN" < "CAPACITY";

-- (ข) คืนที่นั่ง (hold หมดอายุ / ยกเลิก) — ถ้าเหลือ 0 ⇒ session Cancelled ในคำสั่งเดียว (ออกจากเงื่อนไข exclusion ⇒ คืนเวลา)
UPDATE "TUTORING"."TUTOR_SESSIONS"
SET "SEATS_TAKEN" = "SEATS_TAKEN" - 1,
    "STATUS" = CASE WHEN "SEATS_TAKEN" - 1 = 0 THEN 'Cancelled' ELSE "STATUS" END,
    "UPDATED_AT_UTC" = {now},
    "ROW_VERSION" = decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex')
WHERE "SESSION_ID" = {sessionId} AND "SEATS_TAKEN" > 0 AND "STATUS" IN ('Held', 'Scheduled');

-- (ค) Held → Scheduled เมื่อมี booking ยืนยันตัวแรก (idempotent: กลุ่มที่เป็น Scheduled อยู่แล้วไม่ถูกแตะ)
UPDATE "TUTORING"."TUTOR_SESSIONS"
SET "STATUS" = 'Scheduled', "UPDATED_AT_UTC" = {now},
    "ROW_VERSION" = decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex')
WHERE "SESSION_ID" = {sessionId} AND "STATUS" = 'Held';

-- (ง) reopen — session ที่ Cancelled กลับเป็น Held (ถูกตรวจ exclusion เมื่อกลับเข้าเงื่อนไข ⇒ 23P01 ถ้าเวลาถูกยึดไปแล้ว)
UPDATE "TUTORING"."TUTOR_SESSIONS"
SET "STATUS" = 'Held', "SEATS_TAKEN" = 1, "UPDATED_AT_UTC" = {now},
    "ROW_VERSION" = decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex')
WHERE "SESSION_ID" = {sessionId} AND "STATUS" = 'Cancelled';
```
- **ห้ามโหลด session เข้า change tracker ก่อน raw UPDATE ในธุรกรรมเดียวกันแล้วเซฟต่อ** (entity ค้างเก่า) — ใช้ `AsNoTracking` หรือ `Reload` หลัง UPDATE · ใน (ก)/(ข) `SEATS_TAKEN` อยู่ใต้ CHECK `CK_TUTOR_SESSIONS_SEATS` เป็น backstop
- (ค) ใช้กับ OneOnOne ด้วย (เรียกตอน confirm)

### 5.4 หมดอายุ hold — `IBookingExpiryService` + job `tutoring-hold-expiry`
```csharp
public interface IBookingExpiryService     // ผู้เรียก: job ของ P13-05 และ P13-06 (payment_intent.canceled / flag ExpireBookingOnPaymentFailed)
{
    /// <summary>ทำงานใน transaction ของผู้เรียก (join ถ้ามี, เปิดเองถ้าไม่มี) — SaveChanges ภายใน. Idempotent : booking ไม่ใช่ PendingPayment ⇒ คืน false ไม่ทำอะไร.
    /// ลำดับ (ล็อกตาม §5.0 ข): อ่าน booking ไม่ล็อกเพื่อหา SESSION_ID → LockSession → LockBooking → อ่านสถานะซ้ำ ;
    /// booking.Expire(clock) ; 1:1 ⇒ session.Cancel(clock) ; กลุ่ม ⇒ session.ReleaseSeat(clock) (เหลือ 0 ⇒ Cancelled → คืนเวลาของติวเตอร์ผ่านเงื่อนไข exclusion) ;
    /// ISessionRoomSync.ConvergeAsync ครอบ TryInSavepoint ; SaveChanges. true = หมดอายุจริง.</summary>
    Task<bool> ExpireAsync(Guid bookingId, CancellationToken cancellationToken);
}
public sealed class BookingHoldExpiryService : IBookingExpiryService
{
    /// <summary>รายการที่ถึงเวลา: STATUS='PendingPayment' AND HOLD_EXPIRES_AT_UTC <= now − HoldExpiryGraceSeconds ORDER BY HOLD_EXPIRES_AT_UTC TAKE batchSize
    /// → (BookingId, PaymentId?) — อ่านอย่างเดียว ใช้ IX_TUTOR_BOOKINGS_HOLD_EXPIRY.</summary>
    Task<IReadOnlyList<DueHold>> FindDueAsync(int batchSize, CancellationToken cancellationToken);
}
public sealed record DueHold(Guid BookingId, Guid? PaymentId);

/// <summary>หลัง commit ของ "job หมด hold" เท่านั้น (ไม่ถูกเรียกจาก ExpireAsync ที่ผู้เรียกอื่นเป็นเจ้าของ txn) — best-effort, ล้มเหลว = log ไม่ rollback.
/// P13-06 implement เพื่อเรียก TutoringPaymentService.CancelPendingIntentsAsync(bookingId) (ปิดช่องที่ PI ค้างหลัง hold หมด; job reconcile ของ P13-06 เป็นตาข่ายชั้นสอง).</summary>
public interface IBookingHoldExpiredHandler { Task OnHoldExpiredAsync(Guid bookingId, Guid? paymentId, CancellationToken cancellationToken); }   // ลงทะเบียนแบบ IEnumerable (ว่างได้)
```
Job `TutoringHoldExpiryJob(IServiceScopeFactory)` : `FindDueAsync(ExpiryBatchSize)` แล้ว**ต่อรายการ**: `CreateAsyncScope()` ใหม่ → `IBookingExpiryService.ExpireAsync` (ธุรกรรมเดียวของรายการนั้น) → commit แล้วค่อยเรียก `IBookingHoldExpiredHandler`s ใน try/catch → `InvalidateSlotsAsync` + `TryRefreshAsync(tutorId)` ; ล้มรายการเดียว ⇒ log (`bookingId`) แล้วไปต่อ · `DbUpdateConcurrencyException` (แข่งกับ confirm/ยกเลิก) ⇒ reload+ตัดสินใหม่ **หนึ่งครั้ง** (เป็น Confirmed แล้ว ⇒ `false`)
id `tutoring-hold-expiry`, `Cron.Minutely()`, `[DisableConcurrentExecution(timeoutInSeconds: 50)]`
```csharp
// RecurringJobIds.cs :  public const string TutoringHoldExpiry = "tutoring-hold-expiry";   (+ ใน All)
recurringJobManager.AddOrUpdate<TutoringHoldExpiryJob>(RecurringJobIds.TutoringHoldExpiry, job => job.RunAsync(CancellationToken.None), Cron.Minutely());
```

### 5.5 จ่ายสำเร็จหลัง hold หมด — `IBookingReopenService` (ชื่อ/ผลลัพธ์ตรงตาม P13-06 §6.3 ซึ่งเป็นผู้เรียก)
```csharp
public enum ReopenResult { Reopened, SlotTaken, SessionTooSoon, TutorUnavailable, NotReopenable }
public interface IBookingReopenService
{
    /// <summary>ทำงานใน transaction ของผู้เรียก (webhook host/UoW) ; ล็อก session → booking ตาม §5.0 ข. ผลที่ไม่ใช่ Reopened ⇒ **ไม่มีผลข้างเคียงค้างอยู่เลย** (การ re-claim ที่เสี่ยง 23P01/23505 ห่อ TryInSavepointAsync เสมอ).
    ///   NotReopenable    : booking ไม่ใช่ Expired / ราคา 0 / session เป็น Completed|NoShow*
    ///   SessionTooSoon   : session.STARTS_AT_UTC < nowUtc + minLead   (`Tutoring:Booking:ReopenMinLeadMinutes`, default 60 — option ของ P13-05 §9; P13-06/08 อ่านค่านี้ ไม่ประกาศ `LateReopenMinLeadMinutes` ซ้ำ)
    ///   TutorUnavailable : tutor.STATUS != Verified (ไม่ตรวจ IS_LISTED/availability rule — booking เกิดตอน slot ถูกต้องแล้ว)
    ///   SlotTaken        : precheck พบบล็อกทับ / 23P01 จาก Revive / กลุ่มเต็ม (claim ไม่ได้)
    ///   Reopened         : 1:1 ⇒ session.Revive (SQL ง/entity) ; กลุ่ม ⇒ ClaimSeat (หรือ Revive ถ้า session Cancelled) ; booking Expired→PendingPayment (Reopen, HOLD_EXPIRES_AT_UTC = nowUtc + 5 นาที ชั่วคราว)
    ///                      — **ผู้เรียกต้องเรียก booking.Confirm(clock, paymentId) ในธุรกรรมเดียวกันทันที** (P13-06 §6.2 ข้อ 6a)</summary>
    Task<ReopenResult> TryReopenAsync(Guid bookingId, DateTime nowUtc, TimeSpan minLead, CancellationToken cancellationToken);
}
```
- ขั้นตอนใน impl : (1) อ่านไม่ล็อกหา `SESSION_ID` (2) `LockSessionAsync` → `LockBookingAsync` → อ่านซ้ำ (3) ตรวจ NotReopenable → TutorUnavailable → SessionTooSoon ตามลำดับนี้ (4) precheck overlap (query `TUTOR_SESSIONS` ที่ `STATUS IN ('Held','Scheduled','Completed')` ของติวเตอร์ ทับ `[STARTS, BLOCK_ENDS)` ที่ไม่ใช่ session นี้ ⇒ SlotTaken) (5) `TryInSavepointAsync`: re-claim (6) สำเร็จ ⇒ `booking.Reopen(clock, now+5m)` ; `ISessionRoomSync` **ไม่เรียกที่นี่** (ผู้เรียกเรียกหลัง `Confirm`)
- `session.Revive` ใช้ SQL (ง) ได้เมื่อ session ถูกล็อกแล้ว หรือเรียก entity method + SaveChanges ภายใน savepoint — ผลต้องเท่ากัน

### 5.6 `BookingConfirmedNotifier` — อีเมล/แจ้งเตือนเมื่อ booking กลายเป็น Confirmed (concrete class, Application)
`Stage(BookingConfirmedNotification n)` (stage ผ่าน `IEmailOutbox.Enqueue` / `IUserNotificationOutbox.Stage` — **ไม่ `SaveChanges`**) — ใช้โดย trial ฟรี (ข้อ 13) และ **P13-06 §6.2 ข้อ 6d ควรเรียกตัวเดียวกัน** (แทนที่จะสร้างเทมเพลตซ้ำ; เปลี่ยนเชิงกลไก) :
- ผู้เรียน (`IUserContactReader.GetEmailAsync(LearnerUserId)`): templateKey `tutoring-booking-confirmed`, in-app type `tutoring.booking.confirmed`, ลิงก์ `{PublicBaseUrl}/my-tutoring`
- ติวเตอร์ (อีเมลของ `TutorUserId`): templateKey `tutoring-booking-new`, in-app type `tutoring.booking.new`, ลิงก์ `{PublicBaseUrl}/instructor/tutoring/classes` — **เห็นเฉพาะ `nickname` + ระดับชั้นของผู้เรียน** (ไม่มีอีเมล/ชื่อผู้ปกครอง/userId)
- เนื้อหา: วิชา, เวลา (แสดงเป็น Asia/Bangkok), รูปแบบ, ราคา/"ทดลองเรียนฟรี", เลขที่การจอง — **ไม่มี URL ห้องจริง** (ลิงก์ join ของแพลตฟอร์ม `{PublicBaseUrl}/tutoring/sessions/{sessionId}/join` ได้; ICS มาจาก Live ผ่าน `ISessionRoomSync` ตาม P13-09) · ทุกค่าจาก DB ผ่าน `HtmlEncode` ก่อนใส่ `EmailTemplateRenderer.RenderLayout`
```csharp
public sealed record BookingConfirmedNotification(Guid BookingId, string BookingNo, Guid SessionId, Guid LearnerUserId, string LearnerNickname, LearnerGrade LearnerGrade,
    Guid TutorUserId, string TutorDisplayName, string SubjectNameTh, SessionFormat Format, DateTime StartsAtUtc, DateTime EndsAtUtc, decimal PriceAmount, bool IsTrial);
```
**ไม่มี hook ทั่วไป `ITutoringBookingLifecycleHook`** (ถูกถอดออกใน revision ก่อน freeze เพราะ P13-06/08/09/10 ออกแบบเรียก service/interface โดยตรงแล้ว — ดู Deviations D6): จุดต่อของคนอื่นคือ `IBookingExpiryService`, `IBookingReopenService`, `IBookingHoldExpiredHandler`, `ISessionRoomSync`, `ITutoringUnitOfWork`, domain methods §3, และ `BookingConfirmedNotifier`

### 5.7 `ITutorBusyIntervalReader` ตัวจริง (แทน `NullTutorBusyIntervalReader` ของ P13-03 — `AddScoped<ITutorBusyIntervalReader, TutorBusyIntervalReader>()`)
`GetAsync(tutorId, offeringId, fromUtc, toUtc)`: `Blocks` = `SELECT STARTS_AT_UTC, BLOCK_ENDS_AT_UTC FROM TUTOR_SESSIONS WHERE TUTOR_ID=@t AND STATUS IN ('Held','Scheduled','Completed') AND STARTS_AT_UTC < @to + 6h AND BLOCK_ENDS_AT_UTC > @from` (ใช้ `IX_TUTOR_SESSIONS_TUTOR_STARTS`; `AsNoTracking`, projection) · `OpenGroups` = เฉพาะ `FORMAT='Group' AND STATUS IN ('Held','Scheduled') AND OFFERING_ID=@o AND SEATS_TAKEN < CAPACITY` ในช่วงเดียวกัน · session ที่ `Held` ของ hold ที่**หมดเวลาแล้วแต่ job ยังไม่ทำงาน** ยังนับเป็น busy (ความถูกต้องมาก่อน; ล่าช้าสูงสุด ~1 นาที)

---

## 6. Query ฝั่งผู้เรียน + ชิ้นส่วนร่วม

### 6.1 Endpoint (`[Authorize]`, ownership ใน query เดียว)
| # | Method + path | Rate | สำเร็จ | Error |
|---|---|---|---|---|
| 5 | `POST /bookings` | `tutoring-booking` | 201 `BookingResponse` | ตาม §5.1-5.2 + 429 |
| 6 | `GET /bookings/my?scope=upcoming\|past\|all&status=&page=1&pageSize=20` | `tutoring-user` | 200 `PagedResult<BookingListItem>` | 400 (enum ผิด) |
| 7 | `GET /bookings/{bookingId}` | `tutoring-user` | 200 `BookingResponse` | 404 `tutoring.booking_not_found` (ไม่มี/ไม่ใช่ของฉัน — ข้อความเดียวกัน) |
- `scope=upcoming` : `ENDS_AT_UTC >= now` ∧ STATUS ∈ {PendingPayment, Confirmed} เรียง `STARTS_AT_UTC` ASC · `past` : ที่เหลือ เรียง `STARTS_AT_UTC` DESC · `all` : เรียง `CREATED_AT` DESC · pageSize ≤50 · `status` กรองเพิ่มได้ · query เดียวแบบ projection (booking ⋈ session ⋈ tutor ⋈ offering ⋈ subject ⋈ learner profile) — ไม่ N+1 · ดัชนี `IX_TUTOR_BOOKINGS_LEARNER_STATUS`
- field คำนวณ (map ใน `ToResponse()` ไม่ใช่ SQL): `joinOpensAtUtc = status==Confirmed ? STARTS_AT_UTC − JoinWindowMinutes : null` · `canJoin = status==Confirmed ∧ joinOpensAtUtc ≤ nowUtc < ENDS_AT_UTC` (`IClock`) · `requiresPayment = status==PendingPayment` (ตาม §5.1) · `packagePurchaseId` = คอลัมน์ตรง ๆ · unit test ขอบ: พอดี `joinOpensAtUtc` ⇒ true, `ENDS_AT_UTC` ⇒ false, `PendingPayment` ⇒ false
- ตัวอ่านที่ "ติวเตอร์เห็นผู้เรียน": **`TutorVisibleLearner(string Nickname, LearnerGrade? GradeLevel, bool IsMinor)`** (TS: `{ nickname; gradeLevel: string|null; isMinor: boolean }` — **ไม่มีอีเมล/เบอร์/userId ของผู้ปกครอง**) · **ต้นฉบับอยู่ที่นี่ (P13-05)**; P13-10 `TutorAttendanceResponse.learners[]` = `bookingId` + field เหล่านี้ + field attendance ของตน (เพิ่มได้แบบ additive เท่านั้น ห้ามลด/เปลี่ยนชื่อ) · การ query (join booking→learner profile) เป็นของ P13-10; P13-05 กำหนดเฉพาะรูปทรงเพื่อให้คงที่

### 6.2 `Siri.Persistence/PostgresViolations.cs` (ใหม่ — additive)
```csharp
namespace Siri.Persistence;
public static class PostgresViolations
{
    public const string UniqueViolationSqlState = "23505";
    public const string ExclusionViolationSqlState = "23P01";
    /// <summary>true เมื่อ InnerException เป็น Npgsql.PostgresException ที่ SqlState ตรง (และ ConstraintName ตรงถ้าระบุ; เทียบไม่สนตัวพิมพ์). ไม่ throw.</summary>
    public static bool IsUniqueViolation(this DbUpdateException exception, string? constraintName = null);
    public static bool IsExclusionViolation(this DbUpdateException exception, string? constraintName = null);
}
```
`Siri.Persistence` เป็น non-module assembly ที่ผูก Npgsql อยู่แล้ว ⇒ ไม่ละเมิด `NonModuleAssemblies_DoNotReferenceEntityFrameworkCore` (Persistence ถูกยกเว้น) · โมดูลเรียกผ่าน extension นี้เท่านั้น (ไม่ reference Npgsql) · unit test (สร้าง `PostgresException` ผ่าน ctor สาธารณะถ้ามี; ไม่งั้นพิสูจน์ผ่าน integration)

### 6.3 `BOOKING_NO`
`$"TB-{clock.UtcNow:yyMMdd}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(3))}"` (6 hex ตัวพิมพ์ใหญ่) — ไม่ทำนายได้ (ไม่ใช้ลำดับ) · ชน UQ ⇒ สร้างใหม่ ≤3 ครั้ง

---

## 7. พื้นผิวที่ task อื่นพึ่ง (stable — เปลี่ยนต้องออก revision)
| ใช้โดย | สิ่งที่ P13-05 ให้ | รายละเอียด |
|---|---|---|
| P13-06 | `TUTOR_BOOKING.AttachPayment/Confirm(clock, paymentId)/Expire`, `IBookingExpiryService.ExpireAsync`, `IBookingReopenService.TryReopenAsync` (+`ReopenResult`), `IBookingHoldExpiredHandler`, `ITutoringUnitOfWork`, `ISessionRoomSync`+`NullSessionRoomSync`, `BookingConfirmedNotifier`, `LockSessionAsync/LockBookingAsync` | **hand-off:** P13-05 หยุดที่ `PendingPayment` + `HOLD_EXPIRES_AT_UTC` + `PRICE_AMOUNT`. P13-06 `POST bookings/{id}/payment` อ่าน booking (`WHERE BOOKING_ID=@id AND LEARNER_USER_ID=@caller`), ตรวจ `PendingPayment` ∧ hold ไม่หมด (หมด ⇒ 409 `tutoring.hold_expired`), **ใช้ `PRICE_AMOUNT` จาก DB เป็นยอด Stripe** (ไม่รับจาก client), สร้าง PaymentIntent, `AttachPayment`. webhook `succeeded` (ใน txn ของ webhook host — ตาราง race R1-R5 ของ P13-06 §6.3 ตัดสินด้วย*สถานะ* ไม่ใช่นาฬิกา): R1 ⇒ `booking.Confirm(clock, paymentId)` + `session.MarkScheduled` + escrow + `ConvergeAsync` + `BookingConfirmedNotifier.Stage` ; R2 ⇒ `TryReopenAsync` = `Reopened` แล้ว `Confirm` ; R3 (`ReopenResult` อื่น) ⇒ refund เต็ม. `payment_failed`/`canceled` ⇒ `IBookingExpiryService.ExpireAsync`. หลัง job หมด hold ⇒ `IBookingHoldExpiredHandler` ของ P13-06 เรียก `CancelPendingIntentsAsync`. P13-05 **ไม่** เรียก Stripe ไม่เขียน `PAYMENTS` ไม่เขียน revenue split |
| P13-07 | `TUTOR_BOOKING.PRICE_AMOUNT`, `ESCROW_STATE`, `COMPLETED_AT_UTC`, `TUTOR_ID`, `SetEscrowState` | คอลัมน์พร้อมใช้; `SOURCE_REF_ID = BOOKING_ID` |
| P13-08 | domain matrix §3.1/§3.2 ครบ (`CancelByLearner/ByTutor`, `MarkCompleted`, `MarkNoShow(NoShowKind,…)`, `MarkDisputed`, `SetRefundedAmount`, `SetEscrowState`, `ReleaseSeat`, `Cancel`), `ITutoringUnitOfWork`, `ISessionRoomSync`, `CANCELLED_AT_UTC`, `CANCEL_REASON(500)`, `REFUNDED_AMOUNT` | ยกเลิก booking กลุ่ม ⇒ ล็อก session แล้ว `ReleaseSeat`; 1:1 ⇒ `session.Cancel` (คืนเวลาผ่านเงื่อนไข exclusion) |
| P13-09 | `ISessionRoomSync` (จุดเรียก: trial ฟรี, expire/ปล่อยที่นั่ง, reopen), `TUTOR_SESSION.MEETING_ROOM_ID` | `ConvergeAsync` ต้อง stage-only/idempotent และอยู่ใน `TryInSavepointAsync` ทุกจุด |
| P13-10 | คอลัมน์ `LEARNER_*`/`TUTOR_*` timestamps (มีแล้ว), `MarkCompleted/NoShow*` ของ session (§3.1), `ITutoringUnitOfWork`, lock order | attendance members (`RecordTutorJoined` ฯลฯ) P13-10 เพิ่มเอง |
| P13-11 | `REMINDER_*_SENT_AT_UTC` (booking, มีแล้ว), `CONFIRMED_AT_UTC` (มีแล้ว; `Confirm` เซ็ตให้), `IX_TUTOR_SESSIONS_ACTIVE_STARTS` | P13-11 เพิ่มเฉพาะ `TUTOR_REMINDER_*` บน session |
| P13-12 | `PACKAGE_PURCHASE_ID` (คอลัมน์มีแล้ว nullable ไม่มี FK ที่นี่), `TUTOR_SESSION.CreateHeld`/`MarkScheduled` (+`ISessionRoomSync.ConvergeAsync`), `TUTOR_BOOKING.CreateFromPackage` (§3.2), `BookingConfirmedNotifier`, `ITutoringUnitOfWork` (lock chain D-B), `ILearnerProfileUsageReader` (§4) | เพิ่ม FK `FK_TUTOR_BOOKINGS_PACKAGE_PURCHASE` + ตัดเครดิตในเส้นทางของตน · **การจองด้วยเครดิตเป็น 1:1 เสมอ (แพ็กเกจไม่รองรับกลุ่ม ตาม P13-12) ⇒ สร้าง session ใหม่ด้วย `CreateHeld`+`MarkScheduled` ไม่เรียก `ClaimSeat`** · booking ที่ได้มี `PRICE_AMOUNT>0`, `PAYMENT_ID`=payment แพ็กเกจ, `ESCROW_STATE=Held` (ผ่าน `CreateFromPackage`) · ต้อง tutor `Verified` (D-C) |
| P13-03 | `TutorBusyIntervalReader` ตัวจริง | §5.7 |
repository (`Application`/`Infrastructure`): `ITutorBookingRepository` (`GetByIdAsync` tracked, `GetOwnedAsync(id, userId)` no-tracking projection, `LockBookingAsync(id)`, `CountOpenHoldsAsync`, `Add`) · `ITutorSessionRepository` (`GetByIdAsync`, `LockSessionAsync(id)`, `FindJoinableGroupAsync`, `HasOverlapAsync(tutorId, start, blockEnd, excludeSessionId?)`, `Add`, `ExecuteClaimSeatAsync`/`ExecuteReleaseSeatAsync`/`ExecuteScheduleAsync`/`ExecuteReviveAsync` = SQL §5.3) · `ILearnerProfileRepository` · `ITutoringUnitOfWork` แทนการมี `ExecuteInTransactionAsync` ในแต่ละ repository

---

## 8. ตารางรหัสข้อผิดพลาด (`reason`; `errorCode` เป็นหมวด SharedKernel)
| reason | HTTP | เมื่อ |
|---|---|---|
| `tutoring.learner_profile_not_found` | 404 | ไม่มี/ไม่ใช่ของฉัน/ปิดแล้ว (ข้อความเดียวกัน) |
| `tutoring.offering_not_found` | 404 | ไม่มี/ปิด/ติวเตอร์ไม่ Verified/ไม่ listed (ข้อความเดียวกัน) |
| `tutoring.booking_not_found` | 404 | ไม่มี/ไม่ใช่ของฉัน (ข้อความเดียวกัน) |
| `tutoring.not_found` | 404 | learner-profile ของคนอื่น/ไม่มี (CRUD) |
| `tutoring.slot_not_on_grid` | 400 | เวลาเริ่มไม่ตรง grid |
| `tutoring.slot_too_soon` / `tutoring.slot_too_far` | 400 | ก่อน min-notice / เกิน max-advance |
| `tutoring.guardian_consent_required` / `tutoring.learner_nickname_invalid` | 400 | ฟอร์มผู้เรียน |
| `tutoring.cannot_book_self` | 409 | ติวเตอร์จองคลาสตัวเอง |
| `tutoring.format_not_offered` / `tutoring.trial_not_available` / `tutoring.price_below_minimum` | 409 | จาก `TutorPriceCalculator` |
| `tutoring.trial_already_used` | 409 | trial ซ้ำ (pre-check หรือ UQ) |
| `tutoring.slot_unavailable` | 409 | นอก availability ของติวเตอร์ |
| **`tutoring.slot_taken`** | 409 | ชนคลาสอื่น (exclusion `23P01`) |
| `tutoring.slot_already_held_by_you` | 409 | ชนกับ hold ของตัวเอง — ext `bookingId` |
| `tutoring.seats_full` | 409 | ที่นั่งกลุ่มเต็ม |
| `tutoring.already_booked_this_session` | 409 | โปรไฟล์ผู้เรียนนี้จองกลุ่มนี้แล้ว |
| `tutoring.too_many_pending_holds` | 409 | hold ค้างเกิน `MaxOpenHoldsPerUser` |
| `tutoring.learner_profile_limit` / `tutoring.learner_profile_in_use` | 409 | โปรไฟล์ผู้เรียน |
| `tutoring.concurrent_update` | 409 | `DbUpdateConcurrencyException` |
| 429 | 429 | rate limit (ไม่มี reason) |

## 9. Config
`TutoringBookingOptions` (`Tutoring:Booking`): `HoldMinutes` 15 (5–60) · `MaxOpenHoldsPerUser` 3 (1–10) · `ReopenMinLeadMinutes` 60 · `HoldExpiryGraceSeconds` 0 (0–300) · `ExpiryBatchSize` 100 (10–500) · `TutoringLearnerProfileOptions` (`Tutoring:LearnerProfiles`): `MaxActivePerOwner` 10 · `GuardianConsentVersion` `2026-10-v1` (ข้อความจริงอยู่ FE i18n; ทนายยืนยัน Q14.3) · `IValidateOptions` + `ValidateOnStart` · placeholder ทั้ง Api และ Workers (Workers ใช้ job)
**`TutoringOptions` (root flat — เพิ่มต่อจาก P13-01/P13-06):** `JoinWindowMinutes` **15** (5–120) — **P13-05 เป็นผู้ประกาศ** (ใช้คำนวณ `joinOpensAtUtc`/`canJoin` ใน Booking DTO เป็น *display hint*); P13-10 เพิ่มเฉพาะ `TutorJoinWindowMinutes` และใช้ `JoinWindowMinutes` ตัวเดียวกัน (ข้อความ "ถ้ายังไม่มี" ใน P13-10 §2 ครอบคลุมอยู่แล้ว) · ค่าตัดสินสิทธิ์เข้าห้องจริงอยู่ที่ `POST …/join` ของ P13-10 เท่านั้น (server ตัดสิน; FE ห้ามใช้ `canJoin` เป็นสิทธิ์)
rate limit: `POST bookings` = `tutoring-booking` (10/นาที/ผู้ใช้ — P13-01 §7) · อื่น ๆ = `tutoring-user`

## 10. Test checklist
**Unit:** เครื่องสถานะ session (6×6) + booking (§3.2 ทุกคู่: ในตาราง ผ่าน / นอกตาราง โยน) + invariants B1-B6 · `ClaimSeat`/`ReleaseSeat` (ถึง 0 ⇒ Cancelled, เกิน CAPACITY โยน) · `Confirm` (มี/ไม่มี `paymentId` ⇒ `ESCROW_STATE` Held/None, `CONFIRMED_AT_UTC ??=`) · `Reopen`/`CancelBy*` ล้าง hold · `LearnerProfile` (เกรดบังคับ minor, consent) · nickname validator (อีเมล/เบอร์/`<`) · `BookingService` preflight ทุกข้อ 2-10 ด้วย fake repo/clock (ลำดับ error, ข้อความ 404 เดียวกัน, self-booking, grid, notice/advance, trial pre-check, hold cap) · การจับ exception §5.2 (ผ่าน `DbUpdateException` จำลอง/ห่อ `PostgresException`) · ขั้น Group opener-race ผ่าน `TryInSavepointAsync` (savepoint ล้ม ⇒ ค้นหาแล้ว claim) · `BookingHoldExpiryService`/`ExpireAsync` (idempotent, 1:1 ⇒ Cancel, กลุ่ม ⇒ ReleaseSeat, converge ล้มไม่กระทบ) · `IBookingReopenService` ทุกผลลัพธ์ (`NotReopenable`/`TutorUnavailable`/`SessionTooSoon`/`SlotTaken`/`Reopened`) และ "ไม่มีผลข้างเคียงเมื่อไม่ Reopened" · `TutoringUnitOfWork` (join/own/rollback/savepoint — §5.0 ก) · `BookingConfirmedNotifier` (ผู้รับ/เทมเพลต/ไม่มี URL ห้อง/ติวเตอร์เห็นแค่ nickname+เกรด/HtmlEncode) · `PostgresViolations` · `BOOKING_NO` รูปแบบ/ความไม่ซ้ำ · `BookingResponse` mapper (ไม่มีข้อมูลผู้ปกครอง/ติวเตอร์เกินที่กำหนด)
**Integration (PostgreSQL 17 จริงเท่านั้น — ห้าม InMemory; แต่ละงานแข่งใช้ scope/DbContext/HTTP request ของตัวเอง ไม่ใช้ DbContext ร่วม):**
1. **แข่งจองสล็อตเดียว:** N=8 ผู้ใช้ยิง `POST bookings` เวลาเดียวกันพร้อมกัน (`Task.WhenAll` + barrier) ⇒ **201 ตัวเดียว ที่เหลือ 409 `tutoring.slot_taken`**; DB มี session `Held` หนึ่งแถว · ทำซ้ำ 20 รอบ (กัน flaky)
2. ทับบางส่วน (10:00–11:00 กับ 10:30–11:30) ⇒ ชนะหนึ่ง · buffer (10:00–11:00 buffer 10 กับ 11:00–12:00 ⇒ 409; 11:30 ⇒ ผ่าน)
3. **ที่นั่งกลุ่มสุดท้าย:** capacity 3, ที่นั่งเหลือ 1, 6 คนแข่ง ⇒ ผ่านหนึ่ง ที่เหลือ `tutoring.seats_full`/`slot_taken`; `SEATS_TAKEN == CAPACITY` ไม่เกิน ไม่ติดลบ
4. **เปิดกลุ่มพร้อมกัน:** สองคนจอง Group เวลาเดียวกันที่ยังไม่มี session ⇒ ผ่านทั้งคู่ใน **session เดียว** (`SEATS_TAKEN=2`, 2 booking) — พิสูจน์เส้นทาง retry-join
5. **trial race:** โปรไฟล์ผู้เรียนเดียวกันยิง trial กับติวเตอร์เดียวกัน 2 เวลาต่างกันพร้อมกัน ⇒ หนึ่งผ่าน อีกอัน `trial_already_used` (พิสูจน์ว่าตัดสินโดย `UQ_TUTOR_BOOKINGS_TRIAL` เมื่อ pre-check ยังไม่เห็น) · หลัง `CancelledByTutor` ทดลองใหม่ได้
6. **hold หมดอายุ:** เลื่อน `IClock` (override ใน factory) เกิน hold ⇒ รัน `TutoringHoldExpiryJob` ⇒ booking `Expired`, session `Cancelled`, คนอื่นจองเวลานั้นได้, ที่นั่งกลุ่มถูกคืน, cache slots ถูก evict, `IBookingHoldExpiredHandler` ถูกเรียกหลัง commit (handler ล้ม ⇒ ผลยังคงอยู่)
7. **แข่ง confirm/expire:** `booking.Confirm` (ผ่าน flow จำลอง webhook ใน txn) กับ `IBookingExpiryService.ExpireAsync` พร้อมกัน ⇒ ผลสุดท้ายสอดคล้องและตรงกับลำดับ lock (Confirmed+Scheduled หรือ Expired+Cancelled — ห้ามเกิด Confirmed คู่กับ session Cancelled); `ExpireAsync` ซ้ำ ⇒ `false`
8. **reopen:** Expired + เวลาว่าง ⇒ `TryReopenAsync`=`Reopened` (booking `PendingPayment`, session `Held`) แล้ว `Confirm` ⇒ Confirmed/Scheduled ; เวลาถูกยึดแล้ว ⇒ `SlotTaken` และ**สถานะเดิมไม่ถูกแตะ** (ธุรกรรมยังใช้ต่อได้ — พิสูจน์ savepoint) ; ใกล้เริ่มเกิน `minLead` ⇒ `SessionTooSoon` ; ติวเตอร์ Suspended ⇒ `TutorUnavailable` ; booking ไม่ใช่ Expired ⇒ `NotReopenable`
9. trial ฟรี ⇒ 201 `Confirmed` ทันที, session `Scheduled`, `CONFIRMED_AT_UTC` ตั้ง, `ESCROW_STATE=None`, `ISessionRoomSync.ConvergeAsync` ถูกเรียกครั้งเดียว (fake) และถ้ามันโยน ⇒ booking ยังสำเร็จ, มีอีเมล+แจ้งเตือนถึงผู้เรียกและติวเตอร์ (ติวเตอร์เห็นเฉพาะ nickname+เกรด), ไม่มีการเรียก payment/escrow
10. **IDOR:** ผู้ใช้ B ใช้ `learnerProfileId` ของ A สร้าง booking ⇒ 404 `learner_profile_not_found` เท่ากับ id ที่ไม่มีจริง (diff body หลังตัด traceId) · B `GET bookings/{idของA}` ⇒ 404 เท่ากับ id ที่ไม่มี · B `PUT/DELETE learner-profiles/{ของA}` ⇒ 404 · `GET bookings/my` ไม่ปน
11. ตรวจเวลา/สิทธิ์: self-booking, ก่อน min-notice, เกิน max-advance, นอก grid, นอก availability, ติวเตอร์ Draft/Suspended/unlisted/offering ปิด ⇒ รหัสตาม §8 และ 404 เดียวกัน
12. `MaxOpenHoldsPerUser` : hold ที่ 4 ⇒ 409 · rate limit `tutoring-booking` : ครั้งที่ 11 ใน 60 วิ ⇒ 429, ผู้ใช้อื่นผ่าน
13. `slot_already_held_by_you`: ผู้ใช้เดิมยิงซ้ำ ⇒ 409 พร้อม `bookingId` ของ hold เดิม
14. migration บน PG17: ตรวจ `pg_constraint` (`EX_TUTOR_SESSIONS_NO_OVERLAP`, CHECK ทั้งหมด), `pg_extension` มี `btree_gist`, partial UQ ทำงาน, FK `NoAction`, **insert ตรงด้วย SQL สองแถวทับกัน ⇒ SQLSTATE 23P01** · model ไม่มี shadow column
15. job `tutoring-hold-expiry` ลงทะเบียนใน `RecurringJobIds.All` และเรียกได้ทั้งใน Api/Workers · ทุก action มี `[Authorize]` (reflection)

## 11. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | entity/config 3 ตาราง + `HasPostgresExtension("btree_gist")` + migration `AddTutorBookingCore` **อ่านทั้งไฟล์ตรวจลำดับ extension→table→EXCLUDE** + `docs/DATABASE.md` | architecture เขียว (identifier ≤63) · ไม่ apply DB จริง · constraint มีใน `Up()`/`Down()` |
| **B** | `backend-developer` | `PostgresViolations` + domain (session/booking/learner) + unit | unit เขียว |
| **C** | `backend-developer` | repositories (+raw SQL §5.3, `Lock*Async`), `BookingService`, `LearnerProfileService`, `BookingHoldExpiryService`/`IBookingExpiryService`, `IBookingReopenService` impl, `TutoringUnitOfWork`, `ISessionRoomSync`+`NullSessionRoomSync`, `BookingConfirmedNotifier`, `TutorBusyIntervalReader`, validators, Options | unit §10 |
| **D** | `backend-developer` | `LearnerProfilesController` + `BookingsController` + job + `RecurringJobIds`/registration + appsettings (Api+Workers) | ทุก action มี attribute auth |
| **E** | `backend-developer`/`integrator-qa` | integration tests §10 (ข้อ 1-8 บน PG จริง) | เขียนครบ; **ต้องรันจริงบน PG ก่อนตั้ง `DONE`** (ไม่ใช่แค่ compile) |
ลำดับ: A → B ∥ C(หลัง A) → D → E · **ห้าม apply migration เอง · ห้าม commit เอง**

## 12. FE notes (P13-22)
- Flow: เลือก `LEARNER_PROFILE` (สร้างได้ inline) → ชนิด (ตัวต่อตัว/กลุ่ม/ทดลองเรียน) → slot (จาก P13-03) → สรุป (`quote` จาก slots เป็นเพียงตัวแสดง; ยอดจริงมาจาก `BookingResponse.priceAmount`) → `POST /bookings` → ถ้า `requiresPayment` ไป `/tutoring/checkout/:bookingId` (P13-06) มิฉะนั้นไป `/my-tutoring` พร้อมสถานะ Confirmed
- นับถอยหลัง hold : `holdExpiresAtUtc − serverTimeUtc` (ใช้ offset นาฬิกาจาก `serverTimeUtc`, ไม่ใช้เวลาเครื่องดิบ); หมดเวลา ⇒ แสดง "หมดเวลาจอง" และให้จองใหม่ (job อาจยังไม่ expire จริงถึง ~1 นาที — FE ถือว่า PendingPayment ที่หมดเวลาแล้วเป็น "กำลังหมดอายุ")
- map error: `slot_taken` ⇒ รีเฟรช slot + ข้อความ; `slot_already_held_by_you` ⇒ ไปหน้าชำระเงินของ `bookingId` ใน ext; `seats_full`; `trial_already_used`; `too_many_pending_holds` (ชวนไปชำระ/รอหมดเวลา); `guardian_consent_required` (เปิด dialog consent)
- โปรไฟล์ผู้เรียน `/account/learner-profiles`: ข้อความเตือน "ห้ามใช้ชื่อจริง/เบอร์โทร", checkbox ยินยอมของผู้ปกครอง (เวอร์ชันจากค่าคงที่ที่ server ระบุใน 400 `currentVersion` หรือ `GET`), ไม่เก็บวันเกิด
- ห้ามคำนวณราคา/ตัดสินว่าจองได้ที่ FE · ปุ่ม submit กันกดซ้ำ · i18n `tutoring.booking.*`, `tutoring.learner.*`, `tutoring.errors.*` (th+en) · loading/error/empty ครบ

## Deviations from TUTORING.md (สำหรับ architect คนอื่น/orchestrator — **กรุณา reconcile**)
| # | ใน TUTORING.md | ที่ contract นี้ทำ | ผลต่อคนอื่น |
|---|---|---|---|
| D1 | `TUTOR_BOOKINGS` ไม่มี `TUTOR_ID` แต่ระบุ partial UQ บน `(TUTOR_ID, LEARNER_PROFILE_ID)` | **เพิ่ม `TUTOR_ID uuid` (FK NoAction) ใน `TUTOR_BOOKINGS`** | **จริงคือ defect ของเอกสารเดิม** (UQ ทำไม่ได้ถ้าไม่มีคอลัมน์) · P13-07/08/10 ใช้ `TUTOR_ID` ของ booking ได้ตรง ๆ |
| D2 | คอลัมน์ตามที่ระบุ | เพิ่ม `CONFIRMED_AT_UTC`, `COMPLETED_AT_UTC` (booking), `GUARDIAN_CONSENT_VERSION` (learner); `CANCEL_REASON` = varchar(500) | P13-08/10/11 **ห้ามเพิ่มคอลัมน์ซ้ำ** (P13-11 §2 เพิ่ม `CONFIRMED_AT_UTC` เฉพาะ "ถ้ายังไม่มี" ⇒ มีแล้ว ให้ข้าม) |
| D3 | `LEARNER_PROFILES.GRADE_LEVEL` ไม่ระบุค่า | enum `LearnerGrade` (`Primary1..6`, `Secondary1..6`, `Vocational`, `University`, `Adult`, `Other`) | FE ใช้ชุดนี้ |
| D4 | session กลุ่มสร้างโดยใคร ไม่ระบุ | ผู้จองคนแรกของ slot กลุ่ม "เปิด" session (Held, SEATS_TAKEN=1) คนถัดไป claim ที่นั่ง; ที่นั่งนับ booking ที่ยังไม่ยกเลิก/หมดอายุ; เหลือ 0 ⇒ session `Cancelled` อัตโนมัติ | P13-08 ใช้ SQL (ข) |
| D5 | trial กับกลุ่ม | trial = OneOnOne เท่านั้น (CHECK) | |
| D6 | ไม่ระบุกลไกต่อเข้ากับจ่ายเงิน/ห้อง | **ไม่มี hook ทั่วไป** — ใช้ interface ตรงที่ P13-06/08/09/10 ออกแบบไว้แล้ว: `IBookingExpiryService`, `IBookingReopenService`(+`ReopenResult`), `IBookingHoldExpiredHandler`, `ISessionRoomSync`, `ITutoringUnitOfWork`, `BookingConfirmedNotifier` + domain methods ครบ (§3) | ดู "Reconciliation notes" ด้านล่าง |
| D7 | PK ของ session | `SESSION_ID` (ไม่ใช่ `TUTOR_SESSION_ID`); booking `BOOKING_ID`; learner `LEARNER_PROFILE_ID` | ตรงกับชื่อ FK ที่ TUTORING.md ใช้ในตารางลูกทั้งหมด |
| D8 | exclusion `WHERE STATUS IN (…)` | ตรงตามเอกสารเดิมทุกตัวอักษร | — |

## Reconciliation notes — สิ่งที่สัญญา P13-06/08/09/10/11 (เขียนขนานกัน) ต้องปรับ**เชิงกลไก**ให้ตรงกับ P13-05 (ไม่ใช่ redesign)
> สัญญาเหล่านั้นถูกเขียนก่อนเห็น P13-05 และบางข้อระบุเงื่อนไข "ถ้า P13-05 ยังไม่มี" — ตอนนี้ P13-05 มีแล้ว ผู้ implement ยึดตารางนี้ ถ้าขัดกับข้อความในสัญญานั้น
| สัญญา | จุดที่ข้อความเดิม | ให้ทำ |
|---|---|---|
| P13-06 §6.0 / §7 | ประกาศ `ITutoringUnitOfWork`, `ISessionRoomSync`, `NullSessionRoomSync` "ถ้า P13-05 ยังไม่ประกาศ" | **P13-05 §5.0 ประกาศแล้ว — ข้ามของ P13-06.** `TryInSavepointAsync<T>` คืน `SavepointOutcome<T>` (ไม่ throw); operation ที่ไม่คืนค่าใช้ `TryRunInSavepointAsync` |
| P13-06 §6.2 ข้อ 6a | `booking.Confirm(paymentId)` ; "`PendingPayment|Expired(reopened)`" | เมธอดจริง `Confirm(IClock clock, Guid? paymentId)` ; หลัง `TryReopenAsync = Reopened` booking เป็น `PendingPayment` อยู่แล้ว — `Confirm` รับเฉพาะ `PendingPayment` |
| P13-06 §6.2 ข้อ 6d | สร้างอีเมล/แจ้งเตือนเอง | เรียก `BookingConfirmedNotifier.Stage(...)` ของ P13-05 §5.6 (เทมเพลต/ประเภท/ลิงก์ตามที่ P13-06 ระบุทุกตัวอักษร) ⇒ เส้นทาง trial ฟรีกับเส้นทางจ่ายเงินได้ข้อความเดียวกัน |
| P13-06 §6.3 | `IBookingReopenService`/`ReopenResult` "P13-05 ต้อง implement" | **ตรงชื่อ/ค่า enum ตามที่เขียน** — ประกาศและ implement ที่ P13-05 §5.5 (`TryReopenAsync(bookingId, nowUtc, minLead, ct)`) |
| P13-06 §6.4 | `IBookingExpiryService.ExpireAsync(Guid, CancellationToken)` | ประกาศที่ P13-05 §5.4 คืน `Task<bool>` (ใช้ `await` ทิ้งค่าได้) |
| P13-06 §6.5/§(job reconcile) | "job หมด hold ของ P13-05 ... เรียก `CancelPendingIntentsAsync` หลัง commit" | P13-06 implement `IBookingHoldExpiredHandler` (P13-05 §5.4) เพื่อรับจุดเรียกนี้ ; ผู้เรียก `ExpireAsync` นอก job (webhook) จัดการเอง |
| P13-06 §6.1 ข้อ 6 | จับ `DbUpdateException` unique `23505` | ใช้ `ex.IsUniqueViolation("<constraint>")` จาก `Siri.Persistence.PostgresViolations` (§6.2) — โมดูลไม่ reference Npgsql |
| P13-06/08/10 (lock) | `SELECT … FOR UPDATE` | ใช้ `ITutorSessionRepository.LockSessionAsync` / `ITutorBookingRepository.LockBookingAsync` ของ P13-05 (คืนค่าสด) ; **ลำดับ lock กลาง D-B (README §5):** `TUTOR_SESSIONS → TUTOR_BOOKINGS (BOOKING_ID ASC) → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS (SEQ_NO ASC) → PAYMENTS → REFUNDS → Payout splits → TUTOR_PROFILES` — P13-05 ล็อกแค่ session→booking; ส่วนที่เหลือเป็นของ task ที่เข้าถึงตารางนั้น ห้ามกลับลำดับ |
| P13-08 §2.3 | "domain ที่ P13-05 ต้องให้ (ชื่อแนะนำ)" | **ทำครบแล้วตามชื่อนั้น** (§3.1/§3.2) + `enum NoShowKind { Learner, Tutor, Both }` ประกาศที่ P13-05 (P13-08 ห้ามประกาศซ้ำ) ; `REFUNDED_AMOUNT` เขียนผ่าน `SetRefundedAmount` ; `CANCEL_REASON` = varchar(500) |
| P13-09 §9 | จุดเรียก `ConvergeAsync` ที่ "P13-05/08" | P13-05 เรียกที่: trial ฟรี, `ExpireAsync` (กลุ่มปล่อยที่นั่ง / 1:1 ยกเลิก), `TryReopenAsync` สำเร็จ (ผู้เรียก `Confirm` แล้วค่อยเรียก) ; ทุกครั้งครอบ `TryInSavepointAsync` |
| P13-10 §2.1 / §3.1 | ใช้คอลัมน์/เมธอด attendance "ถ้า P13-05 ยังไม่ทำให้เพิ่มเอง" | **ห้ามเพิ่มคอลัมน์ซ้ำ** (ข้อ 16: ไม่มี "เพิ่มถ้ายังไม่มี" อีกต่อไป) — คอลัมน์ `TUTOR_JOINED_AT_UTC`, `TUTOR_CONFIRMED_AT_UTC`, `FINALIZED_AT_UTC`, `LEARNER_JOINED_AT_UTC`, `LEARNER_CONFIRMED_AT_UTC` **P13-05 สร้างแล้วใน migration `AddTutorBookingCore`** ; เมธอด attendance (`RecordTutorJoined`, `RecordLearnerJoined`, `Finalize`, …) P13-10 เพิ่มเอง ; session `MarkCompleted/NoShowTutor/NoShowBoth` มีแล้ว (§3.1) ; ALTER ของ P13-10 (`TUTOR_PRESENT_ATTESTED_AT_UTC`, `TUTOR_NUDGE_SENT_AT_UTC`) ไม่ชนกับของที่นี่ |
| P13-11 §2 | เพิ่ม `REMINDER_*_SENT_AT_UTC` และ `CONFIRMED_AT_UTC` "ถ้า P13-05 ยังไม่สร้าง" | **มีแล้ว — ห้ามเพิ่มซ้ำ** (P13-05 สร้าง `REMINDER_24H_SENT_AT_UTC`/`REMINDER_15M_SENT_AT_UTC`/`CONFIRMED_AT_UTC` ใน migration เดียวกัน) ; `Confirm` เซ็ต `CONFIRMED_AT_UTC` ; trial ฟรีและ `CreateFromPackage` สร้างเป็น Confirmed พร้อมเซ็ตค่าเดียวกัน |
| P13-12 §0.2 | แตะโค้ด P13-05: factory `CreateFromPackage`, เงื่อนไข learner-profile in-use, DTO `packagePurchaseId` | **ทั้งสามจุดอยู่ใน contract นี้แล้ว** — `CreateFromPackage` §3.2 (ลายเซ็นตามที่ P13-12 ระบุ) ; "in use" ผ่าน seam `ILearnerProfileUsageReader` §4 (P13-12 ลงทะเบียน impl, ไม่แก้ `LearnerProfileService`) ; `packagePurchaseId` อยู่ใน `Booking` DTO ฉบับรวม ; booking ที่จองด้วยเครดิตเป็น 1:1 เสมอ ไม่เรียก `ClaimSeat` ; ต้อง tutor `Verified` (D-C) ; `PACKAGE_PURCHASE_ID` คอลัมน์เป็นของ P13-05, FK เป็นของ P13-12 |
| README §5 D-A | เวลาปล่อยเงิน `AVAILABLE_AT = max(session.ENDS_AT_UTC, decidedAt) + DisputeWindowHours` | **เจ้าของ P13-08** — P13-05 ไม่เก็บ/คำนวณ ; เปิดเผยเฉพาะ `TUTOR_SESSIONS.ENDS_AT_UTC` (มีแล้ว) ให้ P13-08 อ่าน |

## Open decisions (defaulted — ปรับด้วย config/revision ได้)
1. `HoldMinutes=15` (TUTORING.md §1) · 2. `MaxOpenHoldsPerUser=3` (กัน hold squatting; ไม่ใช่ของเอกสารเดิม; เป็น soft cap — นับก่อนเข้า transaction จึงคำขอที่ยิงพร้อมกันอาจเกินได้เล็กน้อย ซึ่งยอมรับเพราะมี rate limit 10/นาที และ hold หมดอายุเอง) · 3. `ReopenMinLeadMinutes=60` — เกินกว่านี้ถือว่าเวลาใกล้เกินจะ reopen ⇒ คืนเงิน · 4. **ไม่กันผู้เรียนจองเวลาซ้อนกันข้ามติวเตอร์** (โปรไฟล์ผู้เรียนเดียวกันสองคลาสเวลาเดียวกัน) — เป็นปัญหาของผู้ใช้เอง ไม่ใช่ความปลอดภัยของระบบ; เพิ่มทีหลังได้ · 5. ติวเตอร์ดูผู้เรียนเป็น `nickname`+เกรดเท่านั้น (P13-10) · 6. เวลา hold ที่หมดแล้วแต่ job ยังไม่ทำงานยังกันเวลาอยู่ ≤ ~1 นาที · 7. ไม่มี idempotency-key header (ใช้ `slot_already_held_by_you` แทน) · 8. `IS_MINOR` ฝั่ง client ตั้ง true ได้เสมอสำหรับเกรดที่ไม่ใช่โรงเรียน (เช่น `Vocational`) แต่ตั้ง false ไม่ได้สำหรับ `Primary*/Secondary*`

## Frontend DTO appendix (TypeScript)
```ts
type Guid = string; type IsoUtc = string;
type SessionFormat = 'OneOnOne'|'Group';
type TutorLevel = 'Primary'|'LowerSecondary'|'UpperSecondary'|'University'|'Competitive'|'Adult';
type TutorCurriculum = 'Thai'|'EP'|'International';
type LearnerGrade = 'Primary1'|'Primary2'|'Primary3'|'Primary4'|'Primary5'|'Primary6'|'Secondary1'|'Secondary2'|'Secondary3'|'Secondary4'|'Secondary5'|'Secondary6'|'Vocational'|'University'|'Adult'|'Other';
type BookingStatus = 'PendingPayment'|'Confirmed'|'CancelledByLearner'|'CancelledByTutor'|'Completed'|'NoShowLearner'|'NoShowTutor'|'NoShowBoth'|'Disputed'|'Expired';
interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number; totalPages: number; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: string; reason?: string; bookingId?: Guid; bookingStatus?: BookingStatus; currentVersion?: string; errors?: Record<string,string[]>; }   // ext key ห้ามชื่อ status/detail/title/type/instance/traceId (README §6) — สถานะของ booking ใช้ bookingStatus

interface UpsertLearnerProfileRequest { nickname: string; gradeLevel: LearnerGrade; isMinor: boolean; guardianConsent: boolean; guardianConsentVersion?: string|null; }
interface LearnerProfile { learnerProfileId: Guid; nickname: string; gradeLevel: LearnerGrade; isMinor: boolean; guardianConsentAtUtc: IsoUtc|null; guardianConsentVersion: string|null; isActive: boolean; }

interface CreateBookingRequest { offeringId: Guid; startsAtUtc: IsoUtc; durationMinutes: number; format: SessionFormat; learnerProfileId: Guid; isTrial: boolean; }
interface BookingTutorSummary { slug: string; displayName: string; photoUrl: string|null; }
interface BookingOfferingSummary { offeringId: Guid; subjectNameTh: string; subjectNameEn: string; level: TutorLevel; curriculum: TutorCurriculum; }
interface BookingLearnerSummary { learnerProfileId: Guid; nickname: string; gradeLevel: LearnerGrade; }
interface Booking {
  bookingId: Guid; sessionId: Guid; bookingNo: string; status: BookingStatus; isTrial: boolean; format: SessionFormat; priceAmount: number; currency: 'THB';   // sessionId = TUTOR_BOOKINGS.SESSION_ID — join/materials/tutor-present ของ P13-09/10 อ้างด้วย session id
  startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; durationMinutes: number; tutor: BookingTutorSummary; offering: BookingOfferingSummary; learner: BookingLearnerSummary;
  holdExpiresAtUtc: IsoUtc|null; requiresPayment: boolean; paymentId: Guid|null; refundedAmount: number; confirmedAtUtc: IsoUtc|null; createdAtUtc: IsoUtc; serverTimeUtc: IsoUtc;
  // --- ส่วนที่ P13-05 กำหนดรูปไว้เพื่อให้ฉบับรวมคงที่ (ดูตารางเจ้าของ field ด้านล่าง) ---
  packagePurchaseId: Guid|null;   // null เสมอจนกว่า P13-12 สร้าง booking ด้วยเครดิต (ค่าอ่านจากคอลัมน์ PACKAGE_PURCHASE_ID)
  joinOpensAtUtc: IsoUtc|null;    // = startsAtUtc − Tutoring:JoinWindowMinutes ; null เมื่อ status ≠ Confirmed
  canJoin: boolean;               // display hint เท่านั้น: status=='Confirmed' && joinOpensAtUtc ≤ serverTimeUtc < endsAtUtc — สิทธิ์เข้าห้องจริงตัดสินที่ POST …/join (P13-10)
}
type BookingListItem = Pick<Booking,'bookingId'|'sessionId'|'refundedAmount'|'bookingNo'|'status'|'isTrial'|'format'|'priceAmount'|'currency'|'startsAtUtc'|'endsAtUtc'|'durationMinutes'|'tutor'|'offering'|'learner'|'holdExpiresAtUtc'|'requiresPayment'|'packagePurchaseId'|'joinOpensAtUtc'|'canJoin'|'serverTimeUtc'>;
// GET /api/tutoring/bookings/my?scope=upcoming|past|all&status=&page=&pageSize=
```
C# (ชื่อเดียวกัน camelCase): `UpsertLearnerProfileRequest(string Nickname, LearnerGrade GradeLevel, bool IsMinor, bool GuardianConsent, string? GuardianConsentVersion)` · `LearnerProfileResponse(Guid LearnerProfileId, string Nickname, LearnerGrade GradeLevel, bool IsMinor, DateTime? GuardianConsentAtUtc, string? GuardianConsentVersion, bool IsActive)` · `CreateBookingRequest(Guid OfferingId, DateTimeOffset StartsAtUtc, int DurationMinutes, SessionFormat Format, Guid LearnerProfileId, bool IsTrial)` · `BookingResponse(Guid BookingId, Guid SessionId, string BookingNo, BookingStatus Status, bool IsTrial, SessionFormat Format, decimal PriceAmount, string Currency, DateTime StartsAtUtc, DateTime EndsAtUtc, int DurationMinutes, BookingTutorSummary Tutor, BookingOfferingSummary Offering, BookingLearnerSummary Learner, DateTime? HoldExpiresAtUtc, bool RequiresPayment, Guid? PaymentId, decimal RefundedAmount, DateTime? ConfirmedAtUtc, DateTime CreatedAtUtc, DateTime ServerTimeUtc)` · `BookingResponse` ท้ายสุดเพิ่ม `Guid? PackagePurchaseId, DateTime? JoinOpensAtUtc, bool CanJoin` (ตรงกับ TS) · `BookingListItem` เป็นชุดย่อยตาม TS ข้างบน

**Booking — ฉบับรวม (ต้นฉบับเดียว: ห้าม contract อื่นนิยาม `Booking` ซ้ำ — README §6):** รูปทรง `Booking`/`BookingListItem` ข้างบนคือฉบับรวม **ไม่มี object `payment`** (สถานะการจ่าย/PI ต้องเรียก endpoint ของ P13-06 ด้วย `paymentId`) · task อื่นเพิ่ม field ได้เฉพาะแบบ additive ที่ระบุเจ้าของในตารางนี้ (ห้ามลบ/เปลี่ยนชื่อ):
| field | เจ้าของค่า | ความหมาย / ข้อควรระวัง |
|---|---|---|
| `bookingId`, `sessionId`…`createdAtUtc`, `serverTimeUtc` | P13-05 | จาก `TUTOR_BOOKINGS` ⋈ session ⋈ tutor ⋈ offering ⋈ profile · **`sessionId` (= `SESSION_ID`) อยู่ทั้ง `Booking` และ `BookingListItem`** — FE ใช้อ้าง join/materials/tutor-present (P13-09/10 ทุก route ใช้ session id ไม่ใช่ booking id) |
| `paymentId` | P13-05 (อ่านคอลัมน์ `PAYMENT_ID`; ค่าเขียนโดย P13-06 `AttachPayment`/`Confirm`) | เฉพาะ id — ไม่มีสถานะ/ยอด Stripe ใน DTO นี้ |
| `refundedAmount` | P13-05 (อ่าน `REFUNDED_AMOUNT`; เขียนโดย P13-08 `SetRefundedAmount`) | **ผลรวมที่ตัดสินใจคืนแล้ว** (Requested+Processing+Completed) — ไม่ใช่เฉพาะที่เงินเข้าบัญชีผู้เรียนแล้ว (ฝั่ง payment ของ P13-06 ใช้ `refundedCompletedAmount` = เฉพาะ `Completed`) · **อยู่ทั้ง `Booking` และ `BookingListItem` ความหมายเดียวกัน** (หน้า "การเรียนของฉัน" แสดงยอดคืนบนการ์ดโดยไม่ต้องเปิดรายละเอียด) |
| `packagePurchaseId` | P13-05 รูป / P13-12 ให้ค่า | null จนกว่ามี booking จากเครดิต |
| `joinOpensAtUtc`, `canJoin` | P13-05 (คำนวณจาก `Tutoring:JoinWindowMinutes`) | display hint; P13-10 ไม่เพิ่ม field ชื่อนี้ซ้ำ — P13-10 เพิ่มได้เฉพาะ field ใหม่ (เช่น `attendance…`) แบบ additive |
| refund detail (`BookingRefundSummary`), review state (`BookingReviewState`) | P13-08 / P13-13 | **ตอบจาก endpoint ของตน** (ไม่ฝังใน `Booking` ฉบับนี้) เว้นแต่ contract นั้นระบุ additive ชัด |
| `disputeId: Guid\|null`, `disputeWindowEndsAtUtc: IsoUtc\|null` (**เพิ่มทั้ง `Booking` และ `BookingListItem`**) | **P13-14** (§9 — Wave 4, additive) | `disputeId` = ข้อพิพาทที่ `STATUS <> Withdrawn` ของ booking (LEFT JOIN `DISPUTES`); `disputeWindowEndsAtUtc` = display hint จาก `DisputeWindowPolicy` (ไม่ null เมื่อ `status ∈ {Completed, NoShowLearner}`) — สิทธิ์จริงที่ `POST bookings/{id}/dispute`; `BookingDisputeState` ตอบจาก `GET bookings/{id}/dispute` |

`reason` → i18n: ดูตาราง §8 (`tutoring.slot_taken`, `tutoring.slot_already_held_by_you`, `tutoring.seats_full`, `tutoring.trial_already_used`, `tutoring.too_many_pending_holds`, `tutoring.slot_unavailable`, `tutoring.slot_too_soon`, `tutoring.slot_too_far`, `tutoring.slot_not_on_grid`, `tutoring.cannot_book_self`, `tutoring.guardian_consent_required`, `tutoring.learner_nickname_invalid`, `tutoring.learner_profile_*`, `tutoring.booking_not_found`, `tutoring.offering_not_found`, `tutoring.already_booked_this_session`)

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review + FE errata) — additive/ชี้แจง ไม่เปลี่ยนตาราง/เมทริกซ์สถานะเดิม
- §3 intro: ประกาศ owner ของ enum (`SessionStatus/BookingStatus/EscrowState/LearnerGrade/NoShowKind` = P13-05; `SessionFormat` = P13-01) ตาม README §3 (ข้อ 5)
- §3.2: เพิ่ม factory `TUTOR_BOOKING.CreateFromPackage(bookingNo, sessionId, tutorId, learnerUserId, learnerProfileId, packagePurchaseId, paymentId, priceAmount, IClock)` (ลายเซ็นตาม P13-12 §0.2 จุด 1) — เมทริกซ์ 10×10 ไม่เปลี่ยน; guard tutor `Verified` (D-C) อยู่ที่ P13-12 (ข้อ 19/D-C)
- §2.3: ย้ำว่า `PACKAGE_PURCHASE_ID` คอลัมน์เป็นของ P13-05 (P13-12 เพิ่มเฉพาะ FK); ไม่เปลี่ยน DDL
- §4: นิยาม "in use" รวมแพ็กเกจ `Active` ผ่าน seam ใหม่ `ILearnerProfileUsageReader` (+`NullLearnerProfileUsageReader` เป็นค่าเริ่มต้น) — P13-12 ลงทะเบียน impl แทนการแก้ `LearnerProfileService`
- §5.0 (ข): ลำดับ lock ขยายเป็นมติ D-B (`SESSIONS → BOOKINGS(ASC) → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS → PAYMENTS → REFUNDS → Payout splits → TUTOR_PROFILES`); P13-05 ล็อกแค่ session→booking
- §5.1 ขั้น 6: `Quote(…, minChargeAmount)` — ส่ง `Tutoring:Profile:MinChargeAmount` (ตาม P13-03 รอบ 2, ข้อ 6)
- §5.5: ใช้ชื่อ option `Tutoring:Booking:ReopenMinLeadMinutes` (ไม่มี `LateReopenMinLeadMinutes`; ข้อ 18)
- §6.1: field คำนวณ `joinOpensAtUtc`/`canJoin`/`requiresPayment`; `TutorVisibleLearner(Nickname, GradeLevel?, IsMinor)` เป็นต้นฉบับที่ P13-05, P13-10 `learners[]` ใช้รูปเดียวกัน (ข้อ 19)
- §7: แถว P13-12 แก้ให้ตรงของจริง (`CreateHeld`/`MarkScheduled`/`ISessionRoomSync`/`CreateFromPackage`/`ITutoringUnitOfWork`; ไม่ใช้ `ClaimSeat`)
- §9: เพิ่ม `TutoringOptions.JoinWindowMinutes` (15, 5–120) เป็นของ P13-05; P13-10 เพิ่มเฉพาะ `TutorJoinWindowMinutes`
- Reconciliation notes: ตัดข้อความ "เพิ่มถ้ายังไม่มี" (ข้อ 16) — คอลัมน์ attendance/reminder/`CONFIRMED_AT_UTC` ทั้งหมดสร้างที่ P13-05 ห้ามเพิ่มซ้ำ; เพิ่มแถว P13-12 §0.2 และ D-A (เวลาปล่อยเงินเป็นของ P13-08)
- Frontend appendix: `Booking` ฉบับรวมมี `packagePurchaseId`/`joinOpensAtUtc`/`canJoin` + ตารางเจ้าของ field; **ไม่มี `payment` object**; ระบุ semantics `refundedAmount` (Requested+Processing+Completed) เทียบ `refundedCompletedAmount` ฝั่ง payment (ข้อ 19)

### 2026-10-14 Wave 4 (เติมโดยผู้เขียน P13-14/17 — additive; ไม่เปลี่ยนตาราง/เมทริกซ์เดิม)
- ตาราง "เจ้าของ field": เพิ่มแถว `disputeId`/`disputeWindowEndsAtUtc` (P13-14 §9) ทั้ง `Booking` และ `BookingListItem`
- §3.2: P13-14 เพิ่มเมธอด `ResolveDispute(BookingStatus restoredStatus)` (Disputed → Completed|NoShowLearner|NoShowTutor|NoShowBoth) — ผู้ลงมือ P13-14 เพิ่มแถวทดสอบในเมทริกซ์ 10x10 ; `MarkDisputed()` เดิมไม่แก้
- §4: P13-17 เพิ่ม guard ใน `LearnerProfileService` — แก้/ใช้โปรไฟล์ที่ `ANONYMIZED_AT_UTC != null` ⇒ 409 `tutoring.learner_profile_anonymised` ; คอลัมน์ `ANONYMIZED_AT_UTC`/`GUARDIAN_CONSENT_WITHDRAWN_AT_UTC` เพิ่มที่ migration `AddTutoringPdpa`

### 2026-10-15 รอบ 3 (ข้อค้นพบของ FE หน้า "การเรียนของฉัน") — additive ใน DTO เท่านั้น ไม่แตะตาราง/เมทริกซ์
- `Booking` และ `BookingListItem` เพิ่ม **`sessionId: Guid`** (= `TUTOR_BOOKINGS.SESSION_ID`) — เหตุผล: join/materials/tutor-present (P13-09/10) อ้างด้วย session id; C# `BookingResponse(Guid BookingId, Guid SessionId, …)`; ตาราง "เจ้าของ field" อัปเดต (เจ้าของ P13-05)
- `BookingListItem` เพิ่ม **`refundedAmount: number`** ความหมายเดียวกับ `Booking.refundedAmount` (Requested+Processing+Completed)
- ProblemDetails ext key: ห้ามใช้ `status/detail/title/type/instance/traceId` (ชื่อสงวนใน `DomainErrorHttpResults` — ถูกทิ้งเงียบ, README §6) ⇒ สถานะ booking ใน error ใช้ **`bookingStatus`** (P13-05 เพิ่ม `bookingStatus?` ใน `ApiProblem` ของภาคผนวก; P13-05 เองไม่มี ext `status` อยู่แล้ว — จุดที่เคยใช้ `status` คือ P13-06 `booking_already_paid`/`booking_not_payable` และ P13-08 `booking_not_cancellable` แก้เป็น `bookingStatus` แล้ว; ext `detail` ของ P13-02 `file_rejected` → `rejectDetail` และ P13-03 `availability_rule_invalid` → `ruleDetail`)

- **Changelog 2026-10-15 hardening (P13-33):** (L2) config `Tutoring:Booking:MaxActiveTrialsPerAccount` (default 5; 1-50) — นับ booking `IS_TRIAL` ที่ **Confirmed และ session ยังไม่จบ** ของบัญชีเดียวกันข้ามติวเตอร์/โปรไฟล์ผู้เรียน; ถึงเพดานแล้วจองเทรียลเพิ่ม = **409 `tutoring.too_many_active_trials`** (ตรวจหลัง `trial_already_used`, ก่อน `too_many_pending_holds`; soft cap ตรวจก่อน transaction) · (L3) `startsAtUtc` ต้องอยู่ใน **[2000-01-01, 2100-01-01) UTC** — validator ตอบ 400, service ตอบ `slot_too_far`/`slot_too_soon` (เดิม `9999-12-31` + ความยาวคลาสทำให้ ArgumentOutOfRangeException → 500) · `GET bookings/my` และทุก list: `page` 1..100000
