# Contract: P13-10 Tutoring — ด่าน join, เช็กชื่อ, job ตัดสินผลคลาส (finalize), สรุปบทเรียน, ยืนยันเร็ว, เอกสารต่อคลาส

Status: FROZEN · วันที่: 2026-10-14 · Module: **`Siri.Modules.Tutoring` (Repository+Service, UPPERCASE entity/DB, schema `TUTORING` — D-17/D-25)** · เรียก Live ผ่าน `Siri.Modules.Live.Contracts.ILiveRoomProvisioner` เท่านั้น · Controllers ใน `Siri.Api/Controllers/Tutoring/` (D-19)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..F) → `frontend-developer` (FE ตาม Appendix)** — เหตุผล: ด่านสิทธิ์เข้าเรียน (ผู้เยาว์), การตัดสินผลที่กระทบเงิน/คะแนนติวเตอร์ (no-show → คืนเงิน/ระงับ), ลิงก์ห้องที่เป็น capability, ไฟล์ที่ผู้เรียนเด็กดาวน์โหลด, concurrency ระหว่าง join กับ job → ตรงเกณฑ์ที่ห้ามส่ง Antigravity · **ไม่ต้องผ่าน DESIGN_DATABASE** (ตารางเล็ก ๆ 4 ตาราง + 2 คอลัมน์ — §3 ระดับคอลัมน์ครบ)

> **อ่านคู่กับ:** `docs/TUTORING.md` §2 (state machine), §3.5–§3.7, §7, §10 · **`P13-09-live-adhoc-rooms.md`** (`ILiveRoomProvisioner`, 404 ของ `GetJoinLink`) · **`P13-11-tutoring-reminders.md`** (เพิ่ม 2 คอลัมน์บน `TUTOR_SESSIONS`) · P13-05 (booking/session core) · P13-08 (settlement — §2.3) · P13-14 (dispute — ช่องทางอุทธรณ์ §4.6) · pattern อ้างอิง: `P11-05` (ด่าน join คอร์ส — **ตั้งใจให้ผลลัพธ์รูปแบบเดียวกัน**)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่านแล้ว 2026-10-14) ที่กำหนดดีไซน์นี้

| # | ข้อเท็จจริง | หลักฐาน | ผล |
|---|---|---|---|
| G1 | ด่าน join ของคอร์ส: 404 เป็น **instance เดียว** (`LiveErrors.NotFound`) ทั้ง "ไม่พบ/ไม่มีสิทธิ์/enrollment หมด"; ลำดับ session→entitled→cancelled→ended→window→room→URL→**commit join log ก่อนคืน URL**; ปฏิเสธไม่เขียน log แต่ log เชิงโครงสร้าง `live.join.denied` | `Live/Application/SessionJoinService.cs:47-148`; `LiveErrors.cs:29-30` | Tutoring ใช้ pattern เดียวกัน (§4.2) — `TutoringErrors.NotFound` static instance เดียว (reason `tutoring.not_found` ตรงกับ P13-01) |
| G2 | controller join: `NoStore()` ตั้ง header **ก่อน** คืนผล (รวม error), `sid` จาก claim, `RemoteIpAddress`, `Retry-After: 30` เมื่อ 503; rate limit partition ต่อ user และ **ชื่อ policy อยู่ในคีย์ partition** | `Siri.Api/Controllers/Live/LiveLearnerController.cs:92-132,175-179`; `Configuration/RateLimiterConfiguration.cs:87-88,154-160` | `tutoring-join`/`tutoring-user` ใช้ `CreateUserPartition` เดียวกัน (§10) |
| G3 | `AuthorizationPolicyNames` ปัจจุบันมีแค่ `AdminOnly`/`InstructorOnly` | `Siri.SharedKernel/AuthorizationPolicyNames.cs` | `TutorOnly` เพิ่มโดย P13-01 §4.2 (Instructor Approved + `TUTOR_PROFILE.Verified`, **Admin ไม่ bypass**) |
| G4 ⚠ | `SecurityAuditContract.RecordAuditAsync` **`SaveChangesAsync` ของ context ที่ใช้ร่วม** (flush ทุกอย่างที่ tracked) | `Identity/Infrastructure/Contracts/SecurityAuditContract.cs:17-19`; P13-06 F7 | ใน flow ตัดสินผลที่รันใต้ transaction ชัดเจน (`ITutoringUnitOfWork`) เรียกเป็น **ขั้นสุดท้ายก่อน commit** (flush ปลอดภัย — P13-06 §6.2 ข้อ 6e); นอก transaction (อ่านอย่างเดียว) เรียกท้าย action ตอนไม่มี tracked changes ค้าง; หลักฐานการตัดสินอยู่ตาราง `SESSION_ATTENDANCE_DECISIONS` (atomic กับผล) เสมอ ไม่พึ่ง audit |
| G12 | แพทเทิร์น lock/transaction ของ Tutoring (P13-06 §6.0): ลำดับ lock canonical (มติ D-B, README §7.2): `TUTOR_SESSIONS → TUTOR_BOOKINGS (BOOKING_ID ASC) → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS → PAYMENTS → REFUNDS → Payout splits → TUTOR_PROFILES` (**TUTOR_PROFILES ท้ายสุดของ txn**); หนึ่ง DI scope + หนึ่ง transaction ต่อรายการใน job; อ่านสถานะซ้ำหลัง lock; `ROW_VERSION` เป็นด่านสอง | `docs/contracts/P13-06-…md` §6.0 | ด่าน join/finalize/complete/confirm ทั้งหมดใน contract นี้ใช้แพทเทิร์นนี้ (§4.2 ข้อ 6, §5.4) |
| G5 | `AttachmentFileValidator` เป็น `public static` ใน **`Catalog.Features`** และ `TeachingMaterialStorage` ใน `Catalog.Application` — ไม่ใช่ `Contracts`; `IAttachmentVirusScanner` อยู่ `Catalog.Contracts` (ใช้ได้); `IFileStorage` อยู่ `Siri.Integrations.Storage` (ใช้ได้) | `Catalog/Features/AttachmentFileValidator.cs:11`; `Catalog/Application/TeachingMaterialStorage.cs:36-52`; `Catalog/Contracts/IAttachmentVirusScanner.cs` | ไฟล์: ใช้ **สำเนาของ Tutoring** + parity test (§8.3) |
| G6 | `IUserNotificationOutbox.Stage` ตัด title 200/body 2000, **throw** ถ้า `linkUrl` ไม่ใช่ path ขึ้นต้น `/` ตัวเดียวหรือ http(s) ≤1000, `type` ≤64 | `Notification/Contracts/IUserNotificationOutbox.cs` | `linkUrl` ใช้ path แอปเท่านั้น (§9) |
| G7 | `EmailTemplateRenderer.RenderLayout(title, contentHtml)` ใส่ content **ดิบ** | `Notification/Contracts/EmailTemplateRenderer.cs` | ทุก string จาก DB ต้อง `HtmlEncode` ก่อน (§9) |
| G8 | `MeetingLinkText.ContainsLink/Scrub/ScrubRequired` เป็น `public static` ใน SharedKernel | `Siri.SharedKernel/MeetingLinkText.cs` | ใช้กับ title/ลิงก์ของเอกสาร (§8.2) |
| G9 | `DomainError.Reason`/`Extensions`/`Unavailable` มีแล้ว → `ToProblemHttpResult` ส่ง `reason` + extension | `Siri.SharedKernel/DomainError.cs` | error ทั้งหมดใน §4–§8 ใช้รูปเดียวกับ Live |
| G10 | `RecurringJobIds.All` ต้องตรงกับที่ลงทะเบียน (test) | `tests/Siri.UnitTests/Workers/HangfireHostingTests.cs:201` | เพิ่ม `tutoring-session-finalize` ใน `All` |
| G11 | meter ที่ host เลือกฟังด้วย `.AddMeter(...)` มี precedent | `Siri.Api/Program.cs:230`; `Siri.Workers/Program.cs:166` | `TutoringTelemetry` (§10) |

---

## 1. Scope & task IDs

**ใน:** `GET tutor/classes` (รายการคลาสของติวเตอร์ — §7.5, รอบ 4) · ด่าน `join`/`start` + `SESSION_JOIN_LOGS` · attendance evidence (รวม learner attestation) · job `tutoring-session-finalize` (heal ห้อง, nudge START+5, ตัดสิน START+N/END+grace) · `AttendanceEvaluator` (pure) · tutor `complete` + `SESSION_SUMMARIES` · learner `confirm-completed` · `SESSION_MATERIALS` (ลิงก์/การบ้านตัวอักษรก่อน; ไฟล์หลัง flag) · wrapper จัดการห้องของติวเตอร์ (meeting-link/retry/room) · admin `attention` + `attendance` · `ISessionRoomSync` impl จริง · แจ้งเตือน (อีเมล+ในแอป) ของเหตุการณ์ในไฟล์นี้ · migration `AddTutoringSessionAttendance`, `AddTutoringSessionContent`
**นอก:** payment/booking core (P13-05/06) · escrow/refund/penalty logic (P13-07/08 — เราเรียกอย่างเดียว §2.3) · reminders (P13-11) · dispute (P13-14) · รีวิว (P13-13) · Drive folder (P13-16) · attendance ผ่าน Meet REST (Wave 5) · **การบันทึกคลาส (ห้าม — TUTORING.md §7)** · FE (Appendix เป็นสัญญา DTO)

---

## 2. สิ่งที่ต้องการจาก contract อื่น (Required from …) — ถ้าชื่อต่างให้ผู้เป็นเจ้าของ contract ชนะ เฉพาะ **semantics** ด้านล่างเป็นข้อผูกพัน

### 2.1 จาก P13-01 / P13-05 — **มีอยู่แล้วทั้งหมด ห้ามสร้างซ้ำใน migration ของ P13-10** (README §2 ระบุว่า P13-05 สร้างแล้ว: `TUTOR_SESSIONS.MEETING_ROOM_ID/TUTOR_JOINED_AT_UTC/TUTOR_CONFIRMED_AT_UTC/FINALIZED_AT_UTC`, `TUTOR_BOOKINGS.LEARNER_JOINED_AT_UTC/LEARNER_CONFIRMED_AT_UTC/CONFIRMED_AT_UTC/REMINDER_*`; P13-10 เพิ่มเฉพาะคอลัมน์ใน §3.1)
- (ชื่อ PK ตามที่ P13-05/06 ใช้: คอลัมน์ id ขึ้นต้นด้วยชื่อ entity — `SESSION_ID`, `BOOKING_ID`, `TUTOR_ID` ไม่ใช่ `ID`)
- `TUTOR_SESSIONS`: `SESSION_ID`, `TUTOR_ID`, `STARTS_AT_UTC`, `ENDS_AT_UTC`, `STATUS` (`Held|Scheduled|Cancelled|Completed|NoShowTutor|NoShowBoth`), `MEETING_ROOM_ID`, `TUTOR_JOINED_AT_UTC`, `TUTOR_CONFIRMED_AT_UTC`, `FINALIZED_AT_UTC`, `ROW_VERSION`
- `TUTOR_BOOKINGS`: `BOOKING_ID`, `SESSION_ID`, `LEARNER_USER_ID`, `LEARNER_PROFILE_ID`, `STATUS` (…`Confirmed|Completed|NoShowLearner|NoShowTutor|NoShowBoth|Disputed|CancelledBy*`…), `LEARNER_JOINED_AT_UTC`, `LEARNER_CONFIRMED_AT_UTC`, `PRICE_AMOUNT`, `ROW_VERSION`
- `TUTOR_PROFILES`: `TUTOR_ID`, `USER_ID`, `INSTRUCTOR_PROFILE_ID`, `STATUS`; `LEARNER_PROFILES`: `LEARNER_PROFILE_ID`, `NICKNAME`, `GRADE_LEVEL`
- policy `TutorOnly` + `Tutoring.Contracts.ITutorVerificationReader` + rate-limit `tutoring-user` (`TutoringUserPolicyName`, 60/60 วิ) + `tutoring-upload` (P13-01 §4/§7) · `TutoringErrors`/`TutoringReasons` (reason `tutoring.not_found`, `tutoring.concurrent_update` ตรงกับที่ใช้ที่นี่)
- `TutoringOptions` (flat root): `PublicBaseUrl`, `DefaultCommissionPercent` (P13-01 §8) · `DisputeWindowHours`=24 (P13-06 §7) · **`JoinWindowMinutes`=15 (5–120) ประกาศโดย P13-05 §9** (P13-10 ใช้ตัวเดียวกัน ไม่ประกาศซ้ำ) · **P13-10 เพิ่มเฉพาะ `TutorJoinWindowMinutes`** (60, 5–240, ≥ `JoinWindowMinutes`) + validator
- ข้อมูลสาธารณะของ DTO ที่ติวเตอร์เห็นผู้เรียน: **`TutorVisibleLearner(Nickname, GradeLevel?, IsMinor)` ต้นฉบับที่ P13-05 §6.1** — `TutorAttendanceResponse.learners[]` ใช้รูปเดียวกันและเพิ่ม field attendance แบบ additive (Appendix)
- `ITutoringUnitOfWork` (`ExecuteInTransactionAsync`, `TryInSavepointAsync`/`TryRunInSavepointAsync`) — **ประกาศที่ P13-05 §5.0** ใช้กฎ lock ของ P13-06 §6.0 + มติ D-B
- **ที่ P13-05 มี/ไม่มี (ตรวจแล้ว):** `TUTOR_SESSION` มี `MarkCompleted/MarkNoShowTutor/MarkNoShowBoth(IClock)` (Scheduled→terminal), `Revive`, `CreateHeld/MarkScheduled/ClaimSeat/ReleaseSeat/Cancel` (P13-05 §3.1) · **P13-10 เพิ่มบน entity (idempotent, ตั้งเฉพาะเมื่อยัง null, ห้ามมี public setter):** `TUTOR_SESSION.AssignRoom(roomId)`, `RecordTutorJoined(clock)`, `RecordTutorConfirmed(clock)`, `MarkNudgeSent(clock)`, `Finalize(SessionOutcome, clock)` (= ห่อ `MarkCompleted/MarkNoShow*` + ตั้ง `FINALIZED_AT_UTC`) · `TUTOR_BOOKING.RecordLearnerJoined(clock)`, `RecordLearnerConfirmed(clock)`, `RecordTutorPresentAttested(clock)` · **การเปลี่ยน `STATUS`/`ESCROW_STATE` ของ booking เป็นของ `BookingSettlementService` ของ P13-08 เท่านั้น — P13-10 ห้ามตั้ง `ESCROW_STATE=Released` เอง** (booking คง `Held` ตลอดช่วงรอ; เวลาปล่อยอยู่ที่ `TUTOR_BOOKINGS.ESCROW_RELEASE_AT_UTC` ที่ P13-08 เป็นเจ้าของ — README §7.1)
- `ITutorStatsWriter.IncrementCompletedSessionsAsync(tutorId, ct)` — **ประกาศแล้วที่ P13-01 §4.3** (implement โดย `TutorProfileStatsUpdater`, `ExecuteUpdateAsync` join ธุรกรรมของ context อัตโนมัติ): P13-10 เรียก **ครั้งเดียวต่อ session** ตอน session กลายเป็น `Completed` และมี booking `Completed` ≥1 ภายใน transaction เดียวกัน (rollback แล้วนับไม่ติด); เรียกก่อน/เป็นส่วนของ "ขั้นสุดท้ายแตะ TUTOR_PROFILES" ตาม §5 (lock chain D-B)
- `ISessionRoomSync` + `NullSessionRoomSync` (`TryAddScoped`) **ประกาศโดย P13-05 §5.0ค** (P13-06 §6.2 ข้อ 6c และ P13-05 §5.5 เรียกครอบ `TryInSavepointAsync`; ตรงกับ P13-09 §9); P13-10 แทนที่ด้วย `SessionRoomSync` จริง

### 2.2 จาก P13-09
`ILiveRoomProvisioner.GetJoinLinkAsync/GetStatusAsync(es)/SetManualLinkAsync/RequestResyncAsync/CreateAsync/UpdateAsync/CancelAsync` ตาม P13-09 §3 (`CreateAsync` ยัง "ปลุกห้อง cancelled ที่ session ยังไม่จบ" ได้ด้วย `Revived=true` — ใช้ใน §7.1b)
**ProjectReference (รอบ 2 ข้อ 21):** `Siri.Modules.Tutoring.csproj` → `Siri.Modules.Live` (เพื่อใช้ `Live.Contracts` เท่านั้น) **เพิ่มโดย P13-09 WP-B** (งาน Live ที่เปิด contract) — P13-10 WP-C **ไม่เพิ่มเอง** แต่ต้องรอ WP-B merge ก่อน; ArchitectureTest ต้องคงห้าม Tutoring อ้าง `Live.Domain/Infrastructure/Application`

### 2.3 จาก P13-08 — **ประกาศแล้วที่ P13-08 §4** (ชื่อ/ลายเซ็นด้านล่างตรงกับ P13-08; semantics ผูกพันทั้งสองฝั่ง)
เมธอดบน **`BookingSettlementService`** (class ใน `Tutoring.Application`; P13-06 §6.2 สร้างพร้อม `ConfirmPaidAsync`, P13-08 ต่อยอด — ไม่มี `I…Service`) คืน `Result<SettlementOutcome>` — เป็นเจ้าของเพียงผู้เดียวของการเขียน `TUTOR_BOOKINGS.STATUS` (terminal) / `ESCROW_STATE` / `ESCROW_RELEASE_AT_UTC` / `REFUNDS` / penalty; P13-10 **ไม่เขียนคอลัมน์เหล่านี้โดยตรง และห้ามตั้ง `ESCROW_STATE=Released` เอง** (booking คง `Held` ตลอดช่วงรอ; ตั้ง `Released` โดย `ReleaseEarlyAsync` หรือ job `tutoring-refund-reconcile` ของ P13-08 เมื่อถึงเวลา) ทุกเมธอด **ทำงานใน transaction ของผู้เรียก (P13-10 ครอบด้วย `ITutoringUnitOfWork`), idempotent ต่อ booking (เรียกซ้ำบน booking ที่เป็น terminal แล้ว = Success + `AlreadyApplied`), ไม่เรียก Stripe ใน transaction (ฝาก `REFUNDS` สถานะ `Requested` ให้ worker ของ P13-08), lock ตามลำดับ canonical D-B (ผู้เรียกถือ session+booking lock อยู่แล้ว)**:

**กติกาความล้มเหลว (มติ P13-08 — บังคับฝั่ง P13-10):** `Settle*`/`ReleaseEarlyAsync` ที่คืน `Result.IsFailure` ขณะ **join transaction ของผู้เรียก** ⇒ ผู้เรียก (`SessionFinalizeService`, `complete`, `confirm-completed`) **ต้อง `throw`** (ให้ `ITutoringUnitOfWork` rollback ทั้งหน่วย) — ห้ามกลืน failure แล้ว commit ต่อ และ **P13-08 ไม่ rollback เอง**; session นั้นถูกข้ามและประเมินใหม่รอบถัดไป (log Error: sessionId/bookingId/error code — ไม่มีอีเมล/ยอดเงิน)

| เมธอด | semantics ที่ต้องการ |
|---|---|
| `SettleCompletedAsync(bookingId, holdStartedAtUtc, releaseImmediately, ct)` | booking→`Completed`; split (Held) → `AVAILABLE_AT_UTC = releaseImmediately ? now : EscrowReleaseTime = max(session.ENDS_AT_UTC, holdStartedAtUtc) + DisputeWindowHours` (**สูตรเดียว D-A; เจ้าของสูตร = P13-08 §3.3**); ฟรี/trial ราคา 0 → ข้ามขาเงิน |
| `SettleLearnerNoShowAsync(bookingId, decidedAtUtc, ct)` | booking→`NoShowLearner`; **ไม่คืนเงิน**; `AVAILABLE_AT_UTC = max(session.ENDS_AT_UTC, decidedAtUtc) + DisputeWindowHours` (ติวเตอร์ได้เต็ม) |
| `SettleTutorNoShowAsync(bookingId, sessionId, decidedAtUtc, applyPenalty, ct)` | booking→`NoShowTutor`; คืน **100%** (package = คืนเครดิต); reverse split; penalty `NoShow` **ครั้งเดียวต่อ (tutor, session)** และเฉพาะ `applyPenalty=true` — **เมื่อ txn เดียวตัดสินหลาย booking ของ session เดียว P13-10 ส่ง `applyPenalty=true` เฉพาะ booking ใบสุดท้ายของ txn (ใบอื่น `false`) ก็ต่อเมื่อไม่มีหลักฐานติวเตอร์อยู่ — ดู §5.3 ข้อ "ลำดับการเขียน TUTOR_PROFILES"** |
| `SettleBothNoShowAsync(bookingId, decidedAtUtc, ct)` | booking→`NoShowBoth`; คืน 100%; reverse split; **ไม่หักคะแนน** |
| `ReleaseEarlyAsync(bookingId, nowUtc, ct)` | เฉพาะ booking `Completed` และ escrow ไม่ `Frozen` → `AVAILABLE_AT_UTC = nowUtc` (`ESCROW_STATE=Released` ทันที — ทางเดียวที่ปล่อยทันที); ซ้ำ/Frozen = Success no-op พร้อม Code บอกเหตุผล (`already_released`/`escrow_frozen`) |

**`holdStartedAtUtc`:** P13-10 ส่ง `max(session.ENDS_AT_UTC, now)` เสมอ (complete เปิดได้ตั้งแต่ `E − EarlyCompleteMinutes` ⇒ ได้ `E`) ; P13-08 ตรวจ `session.STARTS_AT_UTC ≤ holdStartedAtUtc ≤ max(session.ENDS_AT_UTC, now + 1 นาที)` (ไม่ผ่าน ⇒ `Validation tutoring.invalid_hold_start` ⇒ ผู้เรียก throw ตามกติกาข้างบน) — P13-08 คำนวณ `max(ENDS, holdStartedAtUtc)` ต่อเองในสูตร D-A
ฝั่ง Payout (P13-07 §4) ที่ P13-08 เรียกต่อ: `ITutoringEscrowContract.ScheduleReleaseAsync` / `ReverseBySourceAsync` / `FreezeAsync` · lock chain D-B `Session→Booking→Package→Credits→Payment→Refund→Splits→Profile` — ผู้เรียกฝั่ง P13-10 ถือ session+booking lock ไว้แล้วตาม §5

---

## 3. Schema delta (migrations `AddTutoringSessionAttendance`, `AddTutoringSessionContent`) — additive ล้วน

> UPPERCASE · `IAuditable` เป็น PascalCase · `timestamptz(3)` UTC · UUIDv7 · enum = string · ไม่มี FK ข้าม schema · **ไม่มี cascade** (FK ภายใน module ทุกเส้นใช้ `DeleteBehavior.NoAction` — README §2) · ชื่อ constraint/index ตั้งเองทุกตัว ≤63 ไบต์

### 3.1 ALTER ตารางของ P13-05 (เพิ่มคอลัมน์ nullable เท่านั้น)
| ตาราง | คอลัมน์ | หมายเหตุ |
|---|---|---|
| `TUTOR_BOOKINGS` | `TUTOR_PRESENT_ATTESTED_AT_UTC timestamptz(3) NULL` | ผู้เรียนยืนยันว่าติวเตอร์อยู่ในห้อง (§4.5) |
| `TUTOR_SESSIONS` | `TUTOR_NUDGE_SENT_AT_UTC timestamptz(3) NULL` | nudge START+5 ส่งแล้ว (once) |
**ไม่เพิ่ม index** — job ใช้ของ P13-05 ที่มีแล้ว: `IX_TUTOR_SESSIONS_ACTIVE_STARTS` (`STARTS_AT_UTC`, filter `STATUS IN ('Held','Scheduled')` — ครอบ `Scheduled ∧ STARTS ≤ now`) และ `IX_TUTOR_BOOKINGS_SESSION` (`SESSION_ID`; ต่อ session มี booking ≤ capacity จึงไม่ต้องใช้ (`SESSION_ID`,`STATUS`)) · migration ของ P13-10 ที่แตะ `TUTOR_*` มีแค่ 2 คอลัมน์ข้างบน

### 3.2 `TUTORING.SESSION_JOIN_LOGS` (entity class **`TUTOR_SESSION_JOIN_LOG`**, append-only, ไม่ implement `IAuditable`/`ISoftDelete`)
> ชื่อตาราง = `SESSION_JOIN_LOGS` ตาม `TUTORING.md` §2 (schema `TUTORING` ≠ `LIVE` จึงไม่ชน); **ชื่อ class/PK/index ใช้คำนำหน้า TUTOR/TUTORING** เพื่อไม่ให้ซ้ำกับ `Live.Domain.SESSION_JOIN_LOG` ในการอ่านโค้ด/ค้นหา

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `SESSION_JOIN_LOG_ID` | uuid PK | no | UUIDv7 |
| `SESSION_ID` | uuid | no | FK → `TUTOR_SESSIONS` NoAction |
| `BOOKING_ID` | uuid | yes | ผู้เรียน = booking ของตัวเอง; ติวเตอร์ = null · FK → `TUTOR_BOOKINGS` NoAction |
| `USER_ID` | uuid | no | จาก `IUserContext` เท่านั้น |
| `ROLE` | varchar(16) | no | `Tutor`\|`Learner` |
| `AUTH_SESSION_ID` | uuid | yes | claim `sid` |
| `JOINED_AT_UTC` | timestamptz(3) | no | เวลาที่ **เปิดเผยลิงก์** |
| `IP_ADDRESS` | varchar(64) | yes | |
| `USER_AGENT` | varchar(300) | yes | ตัดที่ 300 |
Index: `PK_TUTORING_SESSION_JOIN_LOGS` · `IX_TUTORING_JOIN_LOGS_SESSION_USER` (`SESSION_ID`,`USER_ID`) · ไม่มี UPDATE/DELETE (มีแต่ `static Record(...)`) · retention: scrub `IP_ADDRESS`/`USER_AGENT` หลัง `Tutoring:Retention:JoinLogPiiMonths` — **key นี้ P13-17 (PDPA hooks, Wave 4 — ยังไม่มี contract) เป็นผู้นิยามพร้อม job scrub; P13-10 ส่งมอบแค่ตาราง + ระบุ default 12 เดือนเป็นข้อเสนอ ไม่อ่าน key นี้ในโค้ดจนกว่า P13-17 จะมี** แต่ **ต้องเก็บ id/role/เวลา**

### 3.3 `TUTORING.SESSION_ATTENDANCE_DECISIONS` (entity `SESSION_ATTENDANCE_DECISION`, append-only — หลักฐานอุทธรณ์/ตรวจสอบ)
`SESSION_ATTENDANCE_DECISION_ID` PK · `SESSION_ID` · `BOOKING_ID` (**UQ** — แต่ละ booking มีผลตัดสิน terminal ได้ครั้งเดียว) · `OUTCOME` varchar(16) (`Completed|NoShowLearner|NoShowTutor|NoShowBoth`) · `DECIDED_AT_UTC` · `DECIDED_BY` varchar(16) (`System|TutorComplete|LearnerConfirm`) · `TUTOR_EVIDENCE` varchar(20) (`None|PlatformJoin|TutorCompleted|LearnerAttested`) · `TUTOR_EVIDENCE_AT_UTC` null · `LEARNER_EVIDENCE` varchar(16) (`None|PlatformJoin|Confirmed`) · `LEARNER_EVIDENCE_AT_UTC` null · `SESSION_STARTS_AT_UTC` · `SESSION_ENDS_AT_UTC` (snapshot) · `RULES_VERSION` smallint (=1)
Index: `PK_SESSION_ATTENDANCE_DECISIONS` · UQ `IX_ATTENDANCE_DECISIONS_BOOKING` (`BOOKING_ID`) · `IX_ATTENDANCE_DECISIONS_SESSION` (`SESSION_ID`) · FK → sessions/bookings NoAction

### 3.4 `TUTORING.SESSION_SUMMARIES` (entity `SESSION_SUMMARY : IAuditable`) — **หนึ่งแถวต่อ booking**
`SESSION_SUMMARY_ID` PK · `SESSION_ID` · `BOOKING_ID` (**UQ**, NOT NULL — ต่างจาก `TUTORING.md` ที่ nullable: ไม่ใช้แถวระดับ session เพื่อไม่ให้ feedback ของผู้เรียนคนหนึ่งปนกับคนอื่นใน group) · `AUTHOR_USER_ID` · `TOPICS_COVERED` varchar(2000) NOT NULL · `FEEDBACK` varchar(2000) null · `HOMEWORK` varchar(2000) null · `NEXT_STEPS` varchar(2000) null · `NOTIFIED_AT_UTC` null (แจ้งผู้เรียนครั้งแรกแล้ว) · `CreatedAtUtc`→`CREATED_AT_UTC`, `UpdatedAtUtc`→`UPDATED_AT_UTC` (IAuditable PascalCase)
Index: `PK_SESSION_SUMMARIES` · UQ `IX_SESSION_SUMMARIES_BOOKING` · `IX_SESSION_SUMMARIES_SESSION` · FK NoAction

### 3.5 `TUTORING.SESSION_MATERIALS` (entity `SESSION_MATERIAL`)
`SESSION_MATERIAL_ID` PK · `SESSION_ID` (FK NoAction) · `UPLOADED_BY_USER_ID` · `KIND` varchar(16) (`File|Link|Homework`) · `TITLE` varchar(200) NOT NULL · `URL` varchar(500) null · `BODY_TEXT` varchar(4000) null · `STORAGE_KEY` varchar(500) null (**ไม่ออก API ทุกกรณี**) · `FILE_NAME` varchar(255) null · `CONTENT_TYPE` varchar(100) null · `SIZE_BYTES` bigint null · `ADDED_AT_UTC` NOT NULL · `REMOVED_AT_UTC` null (soft — เก็บแถวไว้เป็นหลักฐาน; object ใน R2 ลบแบบ best-effort)
Invariant (factory ใน domain): `File` ⇒ `STORAGE_KEY`,`FILE_NAME`,`CONTENT_TYPE`,`SIZE_BYTES` ครบ · `Link` ⇒ `URL` · `Homework` ⇒ `BODY_TEXT` หรือ `URL` อย่างน้อยหนึ่ง
Index: `PK_SESSION_MATERIALS` · `IX_SESSION_MATERIALS_SESSION` (`SESSION_ID`,`ADDED_AT_UTC`) `HasFilter("\"REMOVED_AT_UTC\" IS NULL")`

### 3.6 Enum ที่ P13-10 เป็นเจ้าของ (`Tutoring.Domain`; เก็บเป็น string; README §3) — รอบ 2 ข้อ 18: ประกาศครบ ไม่มี "ผู้ implement คนแรกประกาศ"
| Enum | ค่า | ใช้ที่ |
|---|---|---|
| `SessionOutcome` | `Completed`, `NoShowTutor`, `NoShowBoth` | **พารามิเตอร์ของ `TUTOR_SESSION.Finalize(SessionOutcome, IClock)` เท่านั้น** — ไม่เป็นคอลัมน์ (ผลเก็บใน `TUTOR_SESSIONS.STATUS` ซึ่งเป็น `SessionStatus` ของ P13-05) · `Finalize` map: `Completed`→`MarkCompleted`, `NoShowTutor`→`MarkNoShowTutor`, `NoShowBoth`→`MarkNoShowBoth` แล้วตั้ง `FINALIZED_AT_UTC` |
| `AttendanceVerdict` | `Wait`, `Completed`, `NoShowLearner`, `NoShowTutor`, `NoShowBoth` | ค่าที่ `AttendanceEvaluator.Evaluate` คืน (`Wait` = ไม่ทำอะไร); ค่าที่ไม่ใช่ `Wait` เก็บเป็น `SESSION_ATTENDANCE_DECISIONS.OUTCOME` (string เดียวกัน) |
| `AttendanceDecidedBy` | `System`, `TutorComplete`, `LearnerConfirm` | `DECIDED_BY` |
| `TutorEvidenceKind` / `LearnerEvidenceKind` | `None\|PlatformJoin\|TutorCompleted\|LearnerAttested` / `None\|PlatformJoin\|Confirmed` | `TUTOR_EVIDENCE` / `LEARNER_EVIDENCE` |
| `JoinRole` | `Tutor`, `Learner` | `SESSION_JOIN_LOGS.ROLE` และพารามิเตอร์ `forcedRole` ของ `JoinAsync` |
| `SessionMaterialKind` | `File`, `Link`, `Homework` | `SESSION_MATERIALS.KIND` |
ทุก enum มี `JsonStringEnumConverter` ผ่าน global setting แล้ว · EF: `HasConversion<string>()` + `HasMaxLength` ตามคอลัมน์ข้างบน · `SessionStatus`/`BookingStatus`/`EscrowState` เป็นของ P13-05 — **P13-10 ไม่ประกาศซ้ำ**

---

## 4. ด่าน join / start / attendance

### 4.1 Endpoint (base `/api/tutoring`, ทุก action ใส่ `[Authorize]`/policy ชัดเจน — ไม่มี fallback policy; `userId` จาก `IUserContext` เท่านั้น)

| # | Method + path | Auth | Rate limit | สำเร็จ | Error |
|---|---|---|---|---|---|
| 1 | **`POST /sessions/{sessionId}/join`** | `[Authorize]` (บทบาทตัดสินโดยความเป็นเจ้าของใน query) | **`tutoring-join`** | 200 `JoinTutoringSessionResponse` + `no-store` | 404 `tutoring.not_found` · 409 `tutoring.session_cancelled` / `session_closed` / `session_ended` / `window_not_open` (+`opensAtUtc`,`serverTimeUtc`) · **503** `tutoring.room_not_ready` (+`Retry-After: 30`) · 409 `tutoring.concurrent_update` · 429 |
| 2 | `POST /tutor/classes/{sessionId}/start` | `TutorOnly` | `tutoring-join` | เหมือนข้อ 1 (บังคับ role=Tutor) | เหมือนข้อ 1 |
| 3 | `POST /sessions/{sessionId}/tutor-present` | `[Authorize]` (ผู้เรียนของ session) | `tutoring-user` | 204 (idempotent) | 404 · 409 `tutoring.session_closed` |

กฎ: `Cache-Control: no-store, no-cache` + `Pragma: no-cache` ตั้งก่อนทำงาน (ทั้งสำเร็จและ error) · `sid` = claim `sid` (parse ไม่ได้ → null) · `ip = RemoteIpAddress` · `User-Agent` ตัด 300 · **ห้ามใช้ policy `default`/`auth`/`webhook`**

### 4.2 `JoinAsync(userId, sessionId, forcedRole?, authSessionId, ip, userAgent)` — ลำดับตรวจ **บังคับ** (`SessionJoinService.JoinAsync` เป็นต้นแบบ)

```
1. PARTICIPANT RESOLUTION (query เดียว ownership อยู่ใน WHERE — ไม่ query แล้วค่อยเช็ค):
     session = TUTOR_SESSIONS s JOIN TUTOR_PROFILES tp ON tp.TUTOR_ID = s.TUTOR_ID WHERE s.SESSION_ID = @sessionId
     isTutor   = tp.USER_ID == @userId
     booking   = TUTOR_BOOKINGS b WHERE b.SESSION_ID = s.SESSION_ID AND b.LEARNER_USER_ID = @userId AND b.STATUS = 'Confirmed'
     role      = isTutor ? Tutor : (booking != null ? Learner : none)
   ไม่พบ session | role = none | (role=Tutor && tp.STATUS != Verified) | (forcedRole=Tutor && !isTutor)
        → 404 TutoringErrors.NotFound   (instance เดียว ไบต์เดียวกัน) · log tutoring.join.denied userId sessionId reason
2. role = Tutor && s.STATUS = Cancelled                          → 409 tutoring.session_cancelled
   role = Tutor && s.STATUS ∈ {Completed, NoShowTutor, NoShowBoth} → 409 tutoring.session_closed   (ตัดสินผลแล้ว — อุทธรณ์ทาง dispute §4.6)
   (ผู้เรียนที่ booking ไม่ใช่ Confirmed ตกที่ข้อ 1 แล้ว)
3. now > s.ENDS_AT_UTC                                           → 409 tutoring.session_ended
4. opensAt = s.STARTS_AT_UTC − (role=Tutor ? Tutoring:TutorJoinWindowMinutes : Tutoring:JoinWindowMinutes)
   now < opensAt                                                 → 409 tutoring.window_not_open  ext {opensAtUtc, serverTimeUtc}
5. s.MEETING_ROOM_ID == null → ISessionRoomSync.ConvergeAsync (stage) + SaveChanges (best effort) แล้วถือว่า "ห้องไม่พร้อม" → 503 tutoring.room_not_ready
   link = ILiveRoomProvisioner.GetJoinLinkAsync(roomId, userId)
     NotFound(live.room_not_found) → 404 TutoringErrors.NotFound   (Live เห็นผู้ใช้ไม่ใช่ participant — นับเป็น drift: log Error + 404)
     Cancelled                      → 409 tutoring.session_cancelled
     Unavailable(meeting_not_ready) → 503 tutoring.room_not_ready (+Retry-After 30); ext {needsAction} ส่ง **เฉพาะ role=Tutor**
6. WRITE (transaction เดียวผ่าน ITutoringUnitOfWork, commit ต้องสำเร็จ "ก่อน" คืน URL):
     lock แถวเดียว FOR UPDATE ตามแพทเทิร์น P13-06 §6.0 — role=Learner: แถว booking ของตัวเอง · role=Tutor: แถว session
     อ่านสถานะ "ซ้ำหลัง lock": booking.STATUS ≠ Confirmed | session.STATUS ∉ {Scheduled} (job ตัดสินแซงไปแล้ว) → 404 / 409 session_closed ตามข้อ 1–2
     INSERT TUTOR_SESSION_JOIN_LOG(sessionId, learner ? bookingId : null, userId, role, sid, now, ip, ua)
     role=Learner: booking.RecordLearnerJoined(clock)  (??= now)
     role=Tutor  : session.RecordTutorJoined(clock)    (??= now)
   `ROW_VERSION` เป็นด่านสอง: DbUpdateConcurrencyException → ทำซ้ำตั้งแต่ข้อ 1 ได้สูงสุด 1 รอบ (ผู้เรียกใหม่ใน scope เดิม + ChangeTracker.Clear()) มิฉะนั้น 409 tutoring.concurrent_update
   (join ถือ lock เพียงแถวเดียว จึงไม่ขัดลำดับ canonical: finalize ถือ session แล้วจึง bookings)
7. return JoinTutoringSessionResponse(sessionId, role, meetUrl, startsAtUtc, endsAtUtc, serverTimeUtc: now)
```
- เวลา = `IClock` เท่านั้น · ห้ามเขียน join log ตอนถูกปฏิเสธ · URL ห้อง **ไม่อยู่ใน log/exception/ProblemDetails**
- **ผู้เรียน (ผู้ปกครอง)** เข้าในนามบัญชีเจ้าของ booking — ไม่มี "learner user" แยก (เด็กไม่มี account)
- **404 ต้องเท่ากันทุกไบต์** (สำหรับ `join`): unit test เปรียบ ProblemDetails (ตัด `traceId`) ของ: session ไม่มี · ไม่ใช่ participant · booking ไม่ใช่ Confirmed (Cancelled/NoShow*) · ติวเตอร์ไม่ Verified (Suspended ฯลฯ) · `forcedRole=Tutor` ของ session คนอื่น — สำหรับ `start` (`TutorOnly`) ติวเตอร์ที่ไม่ Verified ถูกกั้นที่ policy (403 ก่อนถึง service; ไม่เปิดเผยข้อมูล session) ส่วนติวเตอร์ Verified แต่ไม่ใช่เจ้าของ ⇒ 404 เดียวกับข้างบน
- **ด่าน "ติวเตอร์ต้อง Verified" เป็นของ P13-10 อยู่แล้ว (ข้อ 1) — ไม่ใช่ follow-up** (P13-08 §7.3 ต้องใช้ถ้อยคำนี้; README §7 บันทึกไว้): ติวเตอร์ที่ถูกระงับเข้าห้อง/เริ่มคลาสไม่ได้ทันที ไม่ต้องรอ sweep ยกเลิกคลาสอนาคตของ P13-08
- `start` (ข้อ 2) = ข้อ 1 ที่ `forcedRole=Tutor` + `TutorOnly` — ไม่มี logic แยก (ลดพื้นที่บั๊ก)

### 4.3 Evidence ที่ใช้ตัดสิน (ที่มาของ "ใครเข้า")
| สัญญาณ | เขียนโดย | คอลัมน์ | ความหมาย |
|---|---|---|---|
| ติวเตอร์ `join`/`start` | §4.2 | `SESSION.TUTOR_JOINED_AT_UTC` (+join log) | **PlatformJoin** |
| ติวเตอร์ `complete` | §6.1 | `SESSION.TUTOR_CONFIRMED_AT_UTC` | **TutorCompleted** (ถือว่าติวเตอร์อยู่ — ใช้ปิด limitation §4.4) |
| ผู้เรียน `join` | §4.2 | `BOOKING.LEARNER_JOINED_AT_UTC` (+join log) | **PlatformJoin** (= ได้รับลิงก์ ไม่ใช่ "อยู่ใน Meet จริง" — ตัวชี้วัดเดียวกับกฎ refund ของคอร์ส) |
| ผู้เรียน `tutor-present` | §4.5 | `BOOKING.TUTOR_PRESENT_ATTESTED_AT_UTC` | **LearnerAttested** (ต่อ booking) |
| ผู้เรียน `confirm-completed` | §6.3 | `BOOKING.LEARNER_CONFIRMED_AT_UTC` (+ attestation) | **Confirmed** |
`TP(b)` (tutor present สำหรับ booking b) = `TUTOR_JOINED_AT_UTC ≠ null ∨ TUTOR_CONFIRMED_AT_UTC ≠ null ∨ b.TUTOR_PRESENT_ATTESTED_AT_UTC ≠ null` · `LP(b)` = `b.LEARNER_JOINED_AT_UTC ≠ null ∨ b.LEARNER_CONFIRMED_AT_UTC ≠ null`

### 4.4 ข้อจำกัดที่ทราบ: ติวเตอร์เข้า Meet ตรงจากปฏิทิน Google ของตัวเอง (ไม่ผ่านด่านเรา) — การรับมือ (ลำดับความสำคัญ)
1. **ทางหลักคือปุ่ม "เริ่มคลาส"** ใน Tutor Portal/หน้า `/tutoring/sessions/:id/join` (ลิงก์ในอีเมล/ICS ทั้งหมดชี้ที่นี่) — อีเมลเตือนติวเตอร์ (P13-11) ย้ำว่า "กดเริ่มคลาสจากแพลตฟอร์ม"
2. **nudge START+5 นาที** (in-app + อีเมล) ถ้ายังไม่มีหลักฐานว่าติวเตอร์อยู่ (§5.2 ขั้น A)
3. **ติวเตอร์กด `start` ภายหลังได้** แม้เข้า Meet ไปก่อนแล้ว (บันทึก `TUTOR_JOINED_AT_UTC` ณ ตอนนั้น) ตราบที่ session ยัง `Scheduled` และยังไม่ถึงเวลาตัดสิน
4. **learner attestation (§4.5)** — ผู้เรียนที่อยู่ในห้องกับติวเตอร์ยืนยันได้ → นับเป็น `TP` ต่อ booking (ปิดเคส "ติวเตอร์อยู่จริงแต่ไม่ผ่านด่าน" โดยไม่ต้องพึ่งติวเตอร์)
5. ติวเตอร์กด `complete` (§6.1) ถือเป็นหลักฐานว่าอยู่
6. **ช่องอุทธรณ์ = dispute (P13-14) ภายใน `DisputeWindowHours` หลังผลตัดสิน** — แอดมินดู `GET /admin/sessions/{id}/attendance` (§7.4: join logs ทั้งสองฝ่าย + `SESSION_ATTENDANCE_DECISIONS` + สถานะห้อง) · ข้อจำกัดที่ยอมรับ: การคืนเงิน `NoShowTutor` เป็น **ทันที** ตามนโยบายเจ้าของ (TUTORING.md §1) จึงย้อนไม่ได้ — ทางแก้ของแอดมินคือกลับคะแนน/ชดเชยติวเตอร์ (P13-14) ไม่ใช่ดึงเงินคืนจากผู้เรียน
7. **Wave 5:** Meet REST conference records (Workspace เท่านั้น) จะเป็นหลักฐานชั้นที่ 7 — ไม่อยู่ใน v1

### 4.5 `POST /sessions/{sessionId}/tutor-present` (learner attestation — เปิดด้วย `Tutoring:Finalize:LearnerAttestationEnabled`, default true)
เงื่อนไข (ownership ใน query): booking `Confirmed` ของ caller บน session นั้น **และ `LP(b)`** (ต้องเคยได้ลิงก์) · session `Scheduled` · ตั้ง `TUTOR_PRESENT_ATTESTED_AT_UTC ??= now` · idempotent 204 · ปิดใช้งาน → 404 · ไม่ใช่ participant → 404 เดียวกัน · แรงจูงใจ: ผู้เรียนที่โกหกว่า "ติวเตอร์มา" จะเสียสิทธิ์คืนเงินของตัวเอง ไม่ได้ประโยชน์ — ส่วน "ไม่กด" แล้วติวเตอร์มาจริงเป็นความเสี่ยงที่ติวเตอร์อุทธรณ์ (ข้อ 6)

### 4.6 สถานะ ↔ ข้อความที่ผู้ใช้เห็น
ผู้ถูกตัดสินเป็น no-show จะได้ในแอป+อีเมล (§9) บอกผล + "ไม่เห็นด้วย → เปิดข้อพิพาทภายใน {DisputeWindowHours} ชม." (ลิงก์ไปหน้า dispute ของ P13-23/P13-14)

---

## 5. Job `tutoring-session-finalize` (Hangfire recurring ทุก 1 นาที · เฉพาะ `Siri.Workers` · `[DisableConcurrentExecution(timeoutInSeconds: 55)]` · เพดาน 45 วิ/รอบ)

`TutoringSessionFinalizeJob` → `SessionFinalizeService.RunAsync` · **หนึ่ง DI scope + หนึ่ง transaction (`ITutoringUnitOfWork.ExecuteInTransactionAsync`) ต่อ session** (P13-06 §6.0): lock `TUTOR_SESSIONS` แถวนั้น `FOR UPDATE` → lock bookings `Confirmed` ของ session เรียงตาม `BOOKING_ID` → **อ่านสถานะซ้ำหลัง lock** → ประเมิน/เรียก `BookingSettlementService` (ซึ่ง lock payment/payout ต่อตามลำดับ canonical) → decision rows → แจ้งเตือน → audit เป็นขั้นสุดท้ายก่อน commit · exception ของ session หนึ่ง ⇒ rollback + `ChangeTracker.Clear()` + log แล้วไปต่อ session ถัดไป; `DbUpdateConcurrencyException`/lock timeout ⇒ ข้าม (รอบหน้าประเมินใหม่ด้วยหลักฐานล่าสุด) · `OperationCanceledException` ผ่านออก · log เฉพาะ id/outcome (ไม่มีอีเมล/URL) · เพิ่ม `RecurringJobIds.TutoringSessionFinalize = "tutoring-session-finalize"` ใน `All`

### 5.0 ลำดับภายใน transaction ของ session (มติ D-B + กติกา P13-08 — รอบ 2 ข้อ 7/8/20)
1. lock `TUTOR_SESSIONS` (session นั้น) → lock bookings `Confirmed` เรียง `BOOKING_ID ASC` (ต่อจากนั้น `Settle*` ของ P13-08 ล็อก `PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS → PAYMENTS → REFUNDS → Payout splits` ต่อให้ตามลำดับ canonical) → อ่านสถานะซ้ำหลัง lock
2. ประเมินทุก booking ด้วย `AttendanceEvaluator` (ยังไม่เขียนอะไร) แล้ว **เรียก `Settle*` ตามลำดับ `BOOKING_ID ASC` ทีละใบจนครบทุกใบ** — ห้ามแทรกการเขียน `TUTOR_PROFILES` ระหว่างกลาง (booking ใบถัดไปจะล็อก booking/payment ต่อหลังแตะ profile ผิดลำดับ D-B)
3. **`TUTOR_PROFILES` เป็นขั้นท้ายสุดของ txn:** `SettleTutorNoShowAsync(..., applyPenalty)` ส่ง `applyPenalty=true` **เฉพาะ booking ใบสุดท้ายของ txn ที่เป็น NoShowTutor** และเฉพาะเมื่อไม่มีหลักฐานติวเตอร์อยู่ (ใบอื่น `false`) ⇒ `RecordPenaltyAsync` ถูกเรียกครั้งเดียวหลังจบ booking ทุกใบ; `ITutorStatsWriter.IncrementCompletedSessionsAsync` (เฉพาะ session `Completed` ที่มี booking `Completed` ≥1) ก็เรียกหลัง `Settle*` ทุกใบเช่นกัน (สองกรณีนี้ไม่เกิดพร้อมกัน เพราะ penalty ต้องไม่มีหลักฐานติวเตอร์อยู่ ส่วน Completed ต้องมี)
4. `session.Finalize(...)` + แถว `SESSION_ATTENDANCE_DECISIONS` + แจ้งเตือน (§9) — stage ใน context
5. `ISecurityAuditContract.RecordAuditAsync(...)` **เป็นขั้นสุดท้ายสุดของ txn (หลังขั้น 3)** เพราะมัน `SaveChanges` ทั้ง context (flush ทุกอย่างข้างบน) — ห้ามเรียกก่อนจบ booking ทุกใบ
6. `Settle*`/`ReleaseEarlyAsync` ตัวใดคืน `Failure` ⇒ **throw** ⇒ `ITutoringUnitOfWork` rollback ทั้ง session (§2.3) — ใช้กติกาเดียวกันใน `complete` (§6.1) และ `confirm-completed` (§6.3)

### 5.1 พารามิเตอร์เวลา (config `Tutoring:Finalize:*` — §10)
`S`=`STARTS_AT_UTC`, `E`=`ENDS_AT_UTC`, `D=E−S` · `NudgeMinutes`=5 · `NoShowMinutes`=15 → **`nsAt = S + min(NoShowMinutes, ⌊D/2⌋ นาที)`** (คลาส 15 นาที trial → S+7; 30 นาที → S+15; ≥60 → S+15) · `CompletionGraceMinutes`=10 → **`doneAt = E + grace`** · `EarlyCompleteMinutes`=10

### 5.2 ขั้นต่อรอบ
| ขั้น | เป้าหมาย | เงื่อนไขเลือก (ใช้ `IX_TUTOR_SESSIONS_ACTIVE_STARTS`) | เพดาน |
|---|---|---|---|
| 0 **Heal ห้อง** (รอบ 2 ข้อ 9) | session ที่ `Scheduled`, `S > now`, `S ≤ now + RoomHealLookaheadHours` (72), มี booking `Confirmed` ≥1 **และ ("ยังไม่มีห้อง" หรือ "ห้อง `LiveRoomState=Cancelled`")** — ตัดสินจาก `GetStatusesAsync` แบบ batch (`MEETING_ROOM_ID` null ⇒ ยังไม่มีห้อง; มีห้องแต่ `Cancelled` ⇒ ต้องปลุก) · ห้องที่ `Pending/AwaitingLink/NeedsReconnect/Failed` **ไม่อยู่ใน heal นี้** (Live `live-adhoc-sync` ดูแล หรือติวเตอร์ต้องลงมือเอง — เห็นผ่าน `RoomStatusDto.needsAction`) | `ISessionRoomSync.ConvergeAsync` (§7.1b — ตัดสินสถานะห้องจริง; สร้าง/ปลุกห้อง) · กัน webhook ที่สร้างห้องล้ม แต่ booking ต้องไม่ล้ม — P13-09 §9 | 20 |
| A **Nudge ติวเตอร์** | `STATUS=Scheduled`, `now ≥ S + NudgeMinutes`, `now < nsAt`, `TUTOR_NUDGE_SENT_AT_UTC` null, **ไม่มีหลักฐานติวเตอร์อยู่** (`TUTOR_JOINED`/`TUTOR_CONFIRMED` null และไม่มี booking ใด attest) | ส่ง nudge (§9: ตัวแปร "ผู้เรียนรออยู่" ถ้ามี booking `Confirmed` ที่ `LP` หรือ attested อย่างน้อย 1; ไม่งั้นตัวแปรทั่วไป) + `MarkNudgeSent` | 100 |
| B **ตัดสิน** | `STATUS=Scheduled`, `FINALIZED_AT_UTC` null, `S ≤ now` (เรียงตาม `S` เก่าสุดก่อน ⇒ ไล่ backlog หลัง job ล่ม) | `AttendanceEvaluator` ต่อ booking `Confirmed` ตาม §5.3 | 100 session |

### 5.3 ตารางตัดสิน (EXACT) — `AttendanceEvaluator.Evaluate(session, booking, now, timings, forceComplete)` เป็น **pure function** (unit test ครบทุกแถว × ขอบเวลา)
ใช้กับ **booking ที่ `STATUS = Confirmed` เท่านั้น** (booking อื่นถูกข้าม ⇒ idempotent); `TP`/`LP` ตาม §4.3 ณ เวลา `now`

| # | TP | LP | เวลา | ผลของ booking | เรียก P13-08 | หมายเหตุ |
|---|---|---|---|---|---|---|
| 1 | ✔ | ✔ | `now < doneAt` และ `¬forceComplete` | ไม่ทำอะไร | — | คลาสกำลังดำเนินอยู่/เพิ่งจบ |
| 2 | ✔ | ✔ | `now ≥ doneAt` หรือ `forceComplete` | **Completed** | `SettleCompletedAsync(b, max(E,now), releaseImmediately: false)` | `forceComplete` มาจาก §6.1/§6.3 เท่านั้น |
| 3 | ✔ | ✘ | `now < nsAt` | ไม่ทำอะไร | — | รอผู้เรียน |
| 4 | ✔ | ✘ | `now ≥ nsAt` | **NoShowLearner** | `SettleLearnerNoShowAsync(b, now)` | ติวเตอร์ได้เงินเต็ม (รอ 24 ชม.) |
| 5 | ✘ | ✔ | `now < nsAt` | ไม่ทำอะไร | — | nudge ขั้น A ทำงานช่วงนี้ |
| 6 | ✘ | ✔ | `now ≥ nsAt` | **NoShowTutor** | `SettleTutorNoShowAsync(b, sessionId, now, applyPenalty)` | คืน 100%; penalty ครั้งเดียวต่อ session และเฉพาะ `applyPenalty` (ดูข้างล่าง) |
| 7 | ✘ | ✘ | `now < doneAt` | ไม่ทำอะไร | — | รอเผื่อมีใครมาสาย (ถ้าแถว 4/6 เกิดทีหลังเพราะมีคนมาแล้วอีกฝ่ายไม่มา ก็จะถูกตัดสินที่ run ถัดไป) |
| 8 | ✘ | ✘ | `now ≥ doneAt` | **NoShowBoth** | `SettleBothNoShowAsync(b, now)` | คืน 100%, ไม่หักคะแนน, เข้ารายการตรวจของแอดมิน (§7.3) |

**นิยาม `TP` ระดับ booking (สำคัญ):** หลักฐานของ *ติวเตอร์เอง* (`TUTOR_JOINED_AT_UTC`/`TUTOR_CONFIRMED_AT_UTC`) นับให้ **ทุก** booking ของ session; attestation นับให้ **เฉพาะ booking ของผู้ยืนยัน** (กันผู้เรียนคนเดียวยืนยันแทนคนอื่น/ร่วมมือกับติวเตอร์) ⇒ ใน group อาจได้ผลต่างกันต่อ booking ได้

หลังประเมินทั้ง session เมื่อ **ไม่เหลือ booking `Confirmed`** → `ResolveSession(outcomes)`:
1. มี booking ผลเป็น `Completed` **หรือ** `NoShowLearner` (⇒ ติวเตอร์อยู่) → session **`Completed`**; เรียก `ITutorStatsWriter.IncrementCompletedSessionsAsync` (§2.1; ครั้งเดียว ใน transaction เดียวกัน) **เฉพาะเมื่อมี booking `Completed` ≥ 1** (session ที่ผู้เรียนไม่มาทุกคนไม่นับเป็น "คลาสที่สอนสำเร็จ" — D5)
2. ไม่เข้าข้อ 1 และมี booking `NoShowTutor` → session **`NoShowTutor`**
3. นอกนั้น (ทุก booking `NoShowBoth`) → session **`NoShowBoth`**
**penalty:** `SettleTutorNoShowAsync(..., applyPenalty)` — `applyPenalty = true` ก็ต่อเมื่อ **ไม่มีหลักฐานการมีอยู่ของติวเตอร์จากแหล่งใดเลยใน session** (ไม่มี `TUTOR_JOINED`/`TUTOR_CONFIRMED` และไม่มี booking ใด attest) — กรณี group ที่ A attest (Completed) แต่ B ไม่ attest (NoShowTutor) B ได้เงินคืนแต่ **ไม่หักคะแนนติวเตอร์** · เมื่อมี NoShowTutor หลายใบ: ส่ง `applyPenalty=true` ที่ใบสุดท้ายใบเดียว (ลำดับการเขียน `TUTOR_PROFILES` ท้ายสุด — §5.0 ข้อ 3)
ตั้ง `FINALIZED_AT_UTC = now` + `Finalize(outcome)` ใน `SaveChanges` เดียวกับการเปลี่ยน booking, แถว `SESSION_ATTENDANCE_DECISIONS` ต่อ booking (snapshot หลักฐาน) และการแจ้งเตือน §9 — **all-or-nothing ต่อ session**

ตัวอย่างยืนยัน (60 นาที S=10:00, E=11:00; nsAt=10:15, doneAt=11:10):
| เหตุการณ์ | ผล |
|---|---|
| ติวเตอร์ join 09:55, ผู้เรียน join 10:02 | 11:10 → Completed |
| ติวเตอร์ไม่ join; ผู้เรียน join 10:03 และ **ไม่ attest** | 10:05 nudge ติวเตอร์ ("ผู้เรียนรออยู่") · 10:15 → NoShowTutor (`applyPenalty=true`) |
| ติวเตอร์ไม่ join (เข้า Meet ตรงจากปฏิทิน); ผู้เรียน join 10:03 แล้ว **attest** 10:06 | `TP` ✔ ⇒ แถว 1 → 11:10 Completed (ไม่ NoShowTutor) |
| ติวเตอร์ join 09:58; ผู้เรียนไม่มา | 10:15 → NoShowLearner (session Completed, FINALIZED 10:15, ไม่นับสถิติสอน) |
| ไม่มีใครมา | 11:10 → NoShowBoth |
| ผู้เรียน join 10:03, ติวเตอร์ยังไม่ join; ติวเตอร์ join 10:20 | ถ้า run 10:15 เกิดก่อน ⇒ NoShowTutor ตัดสินแล้ว, join 10:20 → 409 `session_closed` · ถ้า join มาก่อน run ⇒ แถว 1/2 (`ROW_VERSION` ตัดสินลำดับ — §5.4) |
| ผู้เรียนกด `confirm-completed` 11:02 (join 10:01) | แถว 2 ทันที (`forceComplete`), `releaseImmediately:true` |
trial 15 นาที (S=10:00,E=10:15): nsAt=10:07, doneAt=10:25

### 5.4 Concurrency / idempotency / ความทนต่อ downtime
- join (§4.2 ข้อ 6) กับ job แตะ **แถวเดียวกัน** (booking/session) ⇒ แถวถูก `FOR UPDATE` serialize: ถ้า job ถือ lock ก่อน ⇒ join รอแล้วอ่านซ้ำหลัง lock เห็น booking ไม่ใช่ `Confirmed` ⇒ 404 / session ปิดแล้ว ⇒ 409; ถ้า join ได้ lock ก่อน ⇒ job รอแล้วอ่านหลักฐานที่ commit แล้ว (LP/TP ครบ) ⇒ ตัดสินใหม่ถูกต้อง · `ROW_VERSION` เป็นด่านสอง (กัน writer ที่ไม่ได้ lock เช่น reminders P13-11 stamp flag) — ชนแล้วข้ามรอบหน้า
- เรียก `BookingSettlementService` ซ้ำปลอดภัย (§2.3) และ UQ(`BOOKING_ID`) ของ decision ทำให้ผล terminal ต่อ booking เกิดครั้งเดียว
- **job ล่ม/ช้า:** ใช้เงื่อนไข `now ≥ ...` (ไม่ใช่ตรงนาที) ⇒ ไล่ทันทั้งหมดเมื่อกลับมา (เรียง `S` เก่าสุด 100 session/รอบ) · ผลกระทบที่ยอมรับ: ระหว่างล่ม ผู้เรียนที่ยัง `Confirmed` อาจ join ได้สายกว่า `nsAt` (ถือว่าเข้า ⇒ Completed) — ความผิดพลาดเอียงไปทางผู้เรียน/ไม่เสียเงินผิด · nudge ที่พลาดช่วง ⇒ ข้าม (หน้าต่าง `now < nsAt`)
- ห้ามตัดสินจาก timestamp ใน payload ของ client ใด ๆ

---

## 6. Complete + สรุปบทเรียน · Confirm-completed

### 6.1 `POST /tutor/classes/{sessionId}/complete` (`TutorOnly`, `tutoring-user`) — body
```json
{ "topicsCovered": "สมการกำลังสอง ...", "homework": "แบบฝึกหัดหน้า 45 ข้อ 1-10", "nextSteps": "ครั้งหน้าทบทวนสูตรกำลังสอง",
  "learnerFeedback": [ { "bookingId": "…", "feedback": "ทำได้ดี ควรฝึกแยกตัวประกอบเพิ่ม" } ] }
```
validation (FluentValidation): `topicsCovered` 1–2000 · `homework`/`nextSteps` ≤2000 · `learnerFeedback` ≤ 6 รายการ, `feedback` 1–2000, `bookingId` ต้องเป็น booking ของ session นี้ (ไม่งั้น 400) · ทุกฟิลด์ผ่าน `MeetingLinkText.Scrub` (กันลิงก์ห้องนอกแพลตฟอร์ม)
ลำดับ: ownership (`session.TUTOR_ID` ของ caller — query เดียว; ไม่ใช่เจ้าของ/ไม่พบ ⇒ 404 `TutoringErrors.NotFound`) →
1. `STATUS = Completed` (job ปิดไปแล้ว) ⇒ ทำเฉพาะ upsert summary (§6.2) ตอบ 200 `alreadyCompleted:true` · `NoShow*`/`Cancelled` ⇒ 409 `tutoring.session_closed`
2. `STATUS = Scheduled`: `now < E − EarlyCompleteMinutes` ⇒ 409 `tutoring.complete_too_early` ext `{opensAtUtc}` · ไม่มี booking `Confirmed` ที่ `LP` เลย ⇒ 409 `tutoring.complete_no_learner_present`
3. `RecordTutorConfirmed(clock)` + upsert summaries + `AttendanceEvaluator` ด้วย `forceComplete:true` กับ **ทุก booking `Confirmed`**: แถว 2 ⇒ Completed ทันที · แถว 4 (ติวเตอร์อยู่ ผู้เรียนไม่มา และ `now ≥ nsAt`) ⇒ NoShowLearner · booking ที่ยังไม่ถึง `nsAt` ค้าง `Confirmed` ให้ job ตัดสิน
4. ถ้าไม่เหลือ `Confirmed` ⇒ `ResolveSession` + `FINALIZED_AT_UTC` · `SaveChanges` เดียว ⇒ แจ้งเตือน §9
(ทั้งหมดรันใต้ `ITutoringUnitOfWork` ด้วยลำดับ lock/เขียนเดียวกับ §5.0 — `Settle*` คืน Failure ⇒ throw; `holdStartedAtUtc = max(E, now)`)
response `200 CompleteClassResponse { sessionId, status, alreadyCompleted, completedBookings, noShowLearnerBookings, pendingBookings }`

### 6.2 Summary
แถวต่อ booking ที่ `Completed` หรือ `Confirmed` ที่ `LP`: `{TOPICS_COVERED, HOMEWORK, NEXT_STEPS}` ชุดเดียวกันทุกแถว + `FEEDBACK` เฉพาะ booking · upsert โดย `UQ(BOOKING_ID)` · แก้ไขได้ภายใน `Tutoring:Summary:EditWindowDays` (7) หลัง `ENDS_AT_UTC` ผ่าน `PUT /tutor/classes/{sessionId}/summary` (body เหมือน complete; พ้นเวลา ⇒ 409 `tutoring.summary_locked`) · `NOTIFIED_AT_UTC` ตั้งตอนแจ้งผู้เรียนครั้งแรกเท่านั้น (แก้ทีหลังไม่แจ้งซ้ำ) · อ่าน: ผู้เรียน `GET /bookings/{bookingId}/summary` (เฉพาะแถว booking ของตัวเอง — ownership ใน query) · ติวเตอร์ `GET /tutor/classes/{sessionId}/summary`

### 6.3 `POST /bookings/{bookingId}/confirm-completed` (`[Authorize]`, `tutoring-user`) — early release
ownership: `b.LEARNER_USER_ID = @userId` ใน query (ไม่ใช่ ⇒ 404 `TutoringErrors.NotFound`) → เงื่อนไข:
- `b.STATUS = Disputed` หรือ escrow `Frozen` ⇒ 409 `tutoring.confirm_not_available` reason ext `disputed`
- `b.STATUS ∈ {Completed}` ⇒ ตั้ง `LEARNER_CONFIRMED_AT_UTC ??= now` + `ReleaseEarlyAsync(b, now)` (idempotent) ⇒ 200
- `b.STATUS = Confirmed` และ `now ≥ E` และ `LP(b)` ⇒ `RecordLearnerConfirmed` + `RecordTutorPresentAttested` (การยืนยันว่าเรียนเรียบร้อย = หลักฐานติวเตอร์อยู่) + evaluator `forceComplete` ⇒ แถว 2 ⇒ `SettleCompletedAsync(b, max(E,now), releaseImmediately: true)` ⇒ 200 (ใต้ `ITutoringUnitOfWork` ลำดับ lock §5.0; `Failure` ⇒ throw ⇒ rollback ⇒ 5xx ให้ผู้เรียกลองใหม่ — ไม่กลืน)
- อื่น ๆ (ยังไม่จบ/ไม่เคย join/NoShow*/Cancelled) ⇒ 409 `tutoring.confirm_not_available`
response `{ bookingId, status: 'Completed', confirmedAtUtc }` · **ผลทางเงินของผู้เรียนต่อให้ confirm แล้วยังเปิด dispute ได้** (ช่องภายใน `DisputeWindowHours` — เงินที่ปล่อยแล้วชดเชยด้วยแถวติดลบตาม Q4/P13-07)

---

## 7. Wrapper จัดการห้อง + admin

### 7.1 ห้องของติวเตอร์ (`TutorOnly`, ownership = `session.TUTOR_ID` ของ caller ใน query; ไม่ใช่ ⇒ 404 `TutoringErrors.NotFound`)
| Method + path | พฤติกรรม |
|---|---|
| `GET /tutor/classes/{sessionId}/room` | `GetStatusAsync(roomId)` ⇒ `RoomStatusDto` (ไม่มี id ภายใน/URL) · ไม่มีห้อง ⇒ `state:'Pending'`,`needsAction:'Waiting'` + stage heal |
| `PUT /tutor/classes/{sessionId}/meeting-link` body `{ "meetUrl": "https://meet.google.com/abc-defg-hij" }` | `SetManualLinkAsync` ⇒ 200 `RoomStatusDto` · 400 `live.meeting_link_invalid`/`live.meeting_link_host_not_allowed` · 409 `live.room_not_editable` · `SaveChanges` โดย wrapper |
| `POST /tutor/classes/{sessionId}/room/retry` | `RequestResyncAsync` ⇒ 200 · 409 `live.meeting_not_resyncable` |
ทั้งสามคืน `Cache-Control: no-store` · rate limit `tutoring-user` · ไม่มีทางที่ endpoint ใดคืน `meetUrl` ยกเว้น `join`/`start`

### 7.1b `SessionRoomSync.ConvergeAsync(sessionId)` + `TutoringRoomRequestFactory` (แทน `NullSessionRoomSync` ที่ P13-05 §5.0ค ลงทะเบียนไว้)
stage-only (ไม่ `SaveChanges`/ไม่เปิด transaction เอง — ผู้เรียกถือ `ITutoringUnitOfWork` และครอบ `TryInSavepointAsync`) · idempotent · **ตัดสินจาก "สถานะห้องจริง" ไม่ใช่แค่ `MEETING_ROOM_ID` null (รอบ 2 ข้อ 9)** · ลำดับ:
1. โหลด session + bookings (tracked; ผู้เรียกล็อกแล้วตาม D-B) + ชื่อสาธารณะติวเตอร์/ชื่อวิชา (projection ครั้งเดียว) + **`room = MEETING_ROOM_ID is null ? null : ILiveRoomProvisioner.GetStatusAsync(roomId)`**
2. ตัดสิน (ตารางเดียว):
   | session | booking `Confirmed` | ห้อง | การกระทำ |
   |---|---|---|---|
   | `FINALIZED_AT_UTC` มีค่า / `Completed`/`NoShow*` | — | — | ไม่ทำอะไร |
   | **`Cancelled`** | — | มี และ `State ≠ Cancelled` | `CancelAsync(new LiveRoomCancelRequest(requestId, roomId, null))` |
   | `Cancelled` | — | ไม่มี หรือ `Cancelled` แล้ว | ไม่ทำอะไร |
   | `Scheduled`, `ENDS > now` | ≥1 | ไม่มี | `CreateAsync` ⇒ `session.AssignRoom(roomId)` |
   | `Scheduled`, `ENDS > now` | ≥1 | มี **และ `State = Cancelled`** | `CreateAsync` (ปลุกห้องเดิม `Revived=true`; `MEETING_ROOM_ID` ไม่เปลี่ยน) — กรณี session ถูก `Revive` ผ่าน reopen (P13-05 §5.5) แล้ว `Confirm` |
   | `Scheduled`, `ENDS > now` | ≥1 | active | `UpdateAsync` เมื่อ title/เวลา/รายชื่อต่าง (Live no-op ให้ถ้าไม่ต่าง) |
   | `Scheduled`, `ENDS > now` | **0** (เช่นกลุ่มที่ยังมี booking `PendingPayment`/reopen เท่านั้น) | active | `UpdateAsync` ให้เหลือเฉพาะติวเตอร์ — **ห้ามยกเลิกห้อง** (ยกเลิกห้องเฉพาะเมื่อ `session.STATUS = Cancelled`) |
   | `Scheduled` | 0 | ไม่มี | ไม่สร้างห้อง (ยังไม่มีใครจ่าย) |
   | `Held` | — | — | ไม่ทำอะไร (ยังไม่ชำระ) |
3. `TutoringRoomRequestFactory.Build(...)`: `SourceKey=tutoring`, `SourceRefId=SESSION_ID`, `OrganizerUserId=tp.USER_ID`, `Title="{ชื่อวิชา} · {ชื่อติวเตอร์}"` (≤200), `Description` = null, เวลา session, `JoinUrl=TutoringLinks.JoinUrl(options, SESSION_ID)` (= `{Tutoring:PublicBaseUrl}/tutoring/sessions/{id:D}/join`), `JoinOpensMinutesBefore=JoinWindowMinutes`, `OrganizerManagePath=/instructor/tutoring/classes/{id:D}`, participants = ติวเตอร์ (`Organizer`, `DisplayName` = ชื่อสาธารณะ) + ผู้เรียน **dedupe ตาม `LEARNER_USER_ID`** (`Participant`, `DisplayName` = ชื่อเล่นของ learner profile ทั้งหมดของ user นั้นใน session คั่น ", " ตัด 100 — ไม่ใช่ชื่อบัญชีผู้ปกครอง), `Options = (SendCalendarInvites: Tutoring:Rooms:SendCalendarInvites, SyncGoogleAttendees: Tutoring:Rooms:GoogleAttendeeSync)`; `RequestId = UuidV7.NewId()` ต่อการเรียก (Live diff ⇒ เรียกซ้ำเนื้อหาเดิมเป็น no-op ไม่ bump SEQUENCE)
4. หลัง `CreateAsync` สำเร็จเป็นห้องใหม่ ⇒ `session.AssignRoom(roomId)` (ครั้งเดียว — revive คง id เดิม)
5. `Failure` จาก Live ⇒ คืน `Result.Failure` ให้ผู้เรียก (P13-05/06 ครอบ `TryInSavepointAsync` ⇒ rollback + log + booking ยัง Confirmed; heal ขั้น 0 §5.2 ลองใหม่) · **`live.room_invalid_request` ที่มี `Extensions.problem = origin_not_allowed` ⇒ log Error เจาะจง + นับ `tutoring.room_sync.failures{reason}`** (P13-09 §7.1 — ไม่ปล่อยให้ล้มเงียบ)
เรียกจาก: P13-06 §6.2 ข้อ 6c (payment succeeded / free trial confirm), P13-05 (expire/ปล่อยที่นั่ง/ยกเลิก 1:1, `TryReopenAsync` สำเร็จแล้ว `Confirm`), P13-08 (cancel booking/session, sweep ติวเตอร์ไม่ Verified), P13-12 (จองด้วยเครดิต), heal ขั้น 0

### 7.2 Attendance ฝั่งติวเตอร์ — `GET /tutor/classes/{sessionId}/attendance` (`TutorOnly`)
คืน nickname + `gradeLevel` ของผู้เรียนต่อ booking, เวลา join, attestation, สถานะ — **ไม่มีอีเมล/ชื่อบัญชีผู้ปกครอง/เบอร์** (กฎผู้เยาว์ `TUTORING.md` §7)

### 7.3 Admin — `AdminOnly`, `tutoring-user`
- `GET /admin/sessions/attention?kind=&page=&pageSize=` ⇒ `PagedResult<AttentionItemDto>` (pageSize ≤50): `RoomNotReady` = session `Scheduled` ที่ `now ∈ [S − AttentionLookaheadMinutes(60), E]` และ `GetStatusesAsync` ≠ `Ready` (batch ครั้งเดียว) · `NoShowBoth` = 30 วันล่าสุด (ตรวจสุ่มโดยแอดมิน) · `FinalizeOverdue` = `Scheduled` ที่ `E < now − 30 นาที` (job อาจค้าง)
### 7.4 `GET /admin/sessions/{sessionId}/attendance` ⇒ `AdminAttendanceResponse` (join logs ทั้งหมดรวม IP/UA, decisions, สถานะห้อง, เวลา session) · `no-store` · เปิดเห็น IP/UA ของผู้ใช้จึง **เรียก `ISecurityAuditContract.RecordAuditAsync` (`tutoring.admin.attendance_viewed`, userId = admin, detail = sessionId) ท้าย action ตอนไม่มี tracked changes ค้างใน context** (G4: เมธอดนี้ `SaveChanges` ทั้ง context)

### 7.5 รายการคลาสของติวเตอร์ — `GET /api/tutoring/tutor/classes?scope=upcoming|history&page=1&pageSize=20` (เพิ่มรอบ 4)
**Auth:** `[Authorize(Policy = InstructorOnly)]` (**ไม่ใช้ `TutorOnly`** — แถวเดียวกับ `cancel`/`cancellation-quote`/wallet ใน README §5.1: ติวเตอร์ที่ถูกระงับต้องยังเห็นคลาสค้างเพื่อยกเลิก/ติดตามได้; `start`/`complete`/`summary`/`attendance`/`room`/`materials` ยัง `TutorOnly` ตามเดิม ⇒ ติวเตอร์ที่ไม่ Verified จะได้ `canStart=false`/`canComplete=false` จากการ์ดนี้) · `[EnableRateLimiting("tutoring-user")]` · `Cache-Control: no-store` · `scope` ผิด ⇒ 400 · `pageSize` 1–50 (default 20)
**Ownership (query เดียว ไม่ query แล้วค่อยเช็ค):** `FROM TUTOR_SESSIONS s JOIN TUTOR_PROFILES tp ON tp.TUTOR_ID = s.TUTOR_ID WHERE tp.USER_ID = @userId` (`userId` จาก `IUserContext` เท่านั้น — ไม่มี `tutorId` ใน query/body) · ผู้ใช้ที่ไม่มี `TUTOR_PROFILE` ⇒ 200 หน้าว่าง (ไม่ใช่ 404 — ไม่เปิดเผยว่ามีโปรไฟล์หรือไม่)
**นิยาม scope** (ตัดสินที่ `s.STATUS` — ไม่ใช้เวลา เพื่อให้ session ที่จบเวลาแล้วแต่ job ยังไม่ปิด/ค้าง ยังอยู่ในแท็บ "กำลังจะมาถึง" พร้อมปุ่ม `complete`):
| scope | เงื่อนไข session | เรียง |
|---|---|---|
| `upcoming` | `s.STATUS = 'Scheduled'` (รวมที่กำลังสอนและที่เลยเวลาแต่ยังรอ `tutoring-session-finalize`) | `STARTS_AT_UTC ASC, SESSION_ID ASC` |
| `history` | `s.STATUS IN ('Completed','NoShowTutor','NoShowBoth','Cancelled')` **และ** `EXISTS (booking b ของ session ที่ b.STATUS NOT IN ('PendingPayment','Expired'))` (ตัด session ที่เคยเป็นแค่ hold หมดอายุ — ไม่เคยเป็นคลาสจริง) | `STARTS_AT_UTC DESC, SESSION_ID DESC` |
`Held` ไม่ปรากฏทั้งสอง scope (ยังไม่มีใครชำระ = ยังไม่ใช่คลาส) · **ดัชนี:** `IX_TUTOR_SESSIONS_TUTOR_STARTS` (`TUTOR_ID`,`STARTS_AT_UTC`) **มีอยู่แล้วที่ P13-05 §3.1 — ไม่มี migration เพิ่ม** (ปริมาณต่อติวเตอร์เล็ก; STATUS เป็น filter บนแถวของติวเตอร์คนเดียว) + `IX_TUTOR_BOOKINGS_SESSION` (join/EXISTS) + `IX_SESSION_SUMMARIES_SESSION`
**Response:** `200 PagedResult<TutorClassListItem>` (shape เดิมของระบบ) — **ไม่ N+1: เรียกคงที่ 4 ชุดต่อหน้า** (1) count + หน้า session ⋈ offering ⋈ subject ⋈ `tp.STATUS` (projection) (2) bookings ⋈ learner profiles ของ session ในหน้า: `WHERE b.SESSION_ID = ANY(@ids) AND b.STATUS NOT IN ('PendingPayment','Expired')` (3) แถว `SESSION_SUMMARIES` ของ session `Completed` ในหน้า (`SESSION_ID = ANY(@ids)`; เฉพาะเมื่อมี) (4) `ILiveRoomProvisioner.GetStatusesAsync(roomIds)` ครั้งเดียวสำหรับ session `Scheduled` ที่มี `MEETING_ROOM_ID` — **ล้มเหลว/ไม่พบ ⇒ `room = null` + log Warning (id) ไม่ทำให้ list ล้ม**
**field ที่ server คำนวณ (`IClock`, ใน `ToResponse()` ไม่ใช่ SQL; ค่าอื่นจาก §4.2/§5.1/§6.1 — ห้าม FE เดา):**
| field | นิยาม |
|---|---|
| `startOpensAtUtc` | `STARTS − Tutoring:TutorJoinWindowMinutes` เมื่อ `status=Scheduled` มิฉะนั้น `null` |
| `canStart` | `status=Scheduled ∧ tutorStatus=Verified ∧ มี learner ที่ booking Confirmed ≥1 ∧ startOpensAtUtc ≤ now < ENDS` (hint เท่านั้น — สิทธิ์จริงตัดสินที่ `POST …/start`/`join`) |
| `completeOpensAtUtc` | `ENDS − Tutoring:Finalize:EarlyCompleteMinutes` เมื่อ `status=Scheduled` มิฉะนั้น `null` |
| `learnerPresent` | มี booking `Confirmed` ที่ `LP` (`LEARNER_JOINED_AT_UTC` หรือ `LEARNER_CONFIRMED_AT_UTC` ไม่ null — §4.3) อย่างน้อย 1 |
| `canComplete` | `status=Scheduled ∧ tutorStatus=Verified ∧ now ≥ completeOpensAtUtc ∧ learnerPresent` (ตรงกับ §6.1 ข้อ 2) — UI แยกสาเหตุปิดปุ่มได้จาก `completeOpensAtUtc`/`learnerPresent` |
| `needsSummary` | `status=Completed ∧ now ≤ summaryEditableUntilUtc ∧ มี learner ที่ booking `Completed` ซึ่งยังไม่มีแถว `SESSION_SUMMARIES` (D7: สรุปไม่บังคับ — เป็นแค่ตัวกระตุ้น) |
| `summaryEditableUntilUtc` | `ENDS + Tutoring:Summary:EditWindowDays` เมื่อ `status=Completed` มิฉะนั้น `null` (พ้นแล้ว ⇒ `PUT …/summary` ได้ 409 `summary_locked`) |
| `room` | `{ state: LiveRoomState, needsAction: LiveRoomNeedsAction } \| null` — จาก `LiveRoomStatus` (ไม่มี URL/id/provider/errorCode); `null` เมื่อไม่ใช่ `Scheduled`/ยังไม่มีห้อง/ห้อง `Cancelled`/Live ล้ม |
| `seatsTaken`, `capacity` | จาก `SEATS_TAKEN`/`CAPACITY` เมื่อ `format=Group` มิฉะนั้น `null` (`SEATS_TAKEN` รวม hold `PendingPayment` ตาม P13-05 — UI ใช้ `learners[]` สำหรับคนที่ยืนยันแล้ว) |
| `serverTimeUtc` | `IClock.UtcNow` (แบบเดียวกับ `Booking` — ให้ FE คำนวณ offset/นับถอยหลัง) |
**ไม่คำนวณ `canCancel`** — สิทธิ์/ผลเงินของการยกเลิกเป็นของ P13-08 §5.5: UI เรียก `GET …/cancellation-quote` ตอนผู้ใช้กดยกเลิก (แสดงปุ่มยกเลิกเมื่อ `status=Scheduled`)
`learners[]` = `TutorVisibleLearner` (P13-05 §6.1 — ต้นฉบับเดียว) + `bookingId` + `status: BookingStatus` ของ booking ที่ไม่ใช่ `PendingPayment/Expired` เรียงตาม `CONFIRMED_AT_UTC ASC` — **ไม่มีอีเมล/ชื่อบัญชีผู้ปกครอง/เบอร์/userId/ราคา/paymentId** (กฎผู้เยาว์ `TUTORING.md` §7; allow-list ตาม DTO เท่านั้น ไม่ serialize entity)


---

## 8. เอกสารประกอบต่อคลาส (`SESSION_MATERIALS`)

### 8.1 Endpoint
| # | Method + path | Auth · rate limit | ผล |
|---|---|---|---|
| M1 | `GET /sessions/{sessionId}/materials` | `[Authorize]` participant · `tutoring-user` | 200 `MaterialDto[]` (ไม่รวมที่ `REMOVED_AT_UTC`) · 404 |
| M2 | `GET /sessions/{sessionId}/materials/{materialId}/download` | `[Authorize]` participant · `tutoring-user` | 200 `MaterialDownloadResponse` (signed URL TTL `Tutoring:Materials:DownloadUrlTtlMinutes`=5, 1–15) · 404 (ไม่พบ/ไม่ใช่ File/ไม่ใช่ participant) · 503 `tutoring.storage_not_configured` |
| M3 | `POST /tutor/classes/{sessionId}/materials` (JSON) | `TutorOnly` · `tutoring-user` | `Link`/`Homework` ⇒ 201 `MaterialDto` |
| M4 | `POST /tutor/classes/{sessionId}/materials` (multipart `file` + `title?`) | `TutorOnly` · `tutoring-upload` | `File` ⇒ 201 · **503 `tutoring.materials_files_disabled` เมื่อ `FilesEnabled=false` (ค่าเริ่มต้น)** |
| M5 | `DELETE /tutor/classes/{sessionId}/materials/{materialId}` | `TutorOnly` · `tutoring-user` | 204 (soft: `REMOVED_AT_UTC`, ลบ object R2 best-effort) |
participant ของ material = ติวเตอร์เจ้าของ session **หรือ** ผู้เรียนที่ booking ของ session นั้นมีสถานะ ∈ {`Confirmed`,`Completed`,`Disputed`} (ownership ใน query เดียว) · ผู้เรียน group เห็นเอกสารชุดเดียวกัน (เอกสารเป็นของคลาส ไม่ใช่ของคนใดคนหนึ่ง) · เพิ่มได้เมื่อ session ยังไม่ `Cancelled` และ `now ≤ E + `Tutoring:Materials:UploadGraceDays`(14)` · เพดานต่อ session `MaxMaterialsPerSession`=20 (409 `tutoring.material_limit_reached`)

### 8.2 Link / Homework
`Link`: `url` https เท่านั้น, ≤500, ไม่มี whitespace/control/backslash/userinfo/พอร์ตนอก 443, host ไม่เป็น IP literal/`localhost`, **`MeetingLinkText.ContainsLink(url)` ต้อง false** (กันดึงคลาสออกไปห้องภายนอก — 400 `tutoring.material_link_not_allowed`) · `title` 1–200 (scrub ด้วย `MeetingLinkText.ScrubRequired`) · `Homework`: `bodyText` ≤4000 (scrub) และ/หรือ `url` ตามกฎ Link · FE แสดงเป็น text/anchor `rel="noopener noreferrer nofollow" target="_blank"` พร้อมคำเตือนลิงก์ภายนอก (ห้าม `bypassSecurityTrustHtml`)

### 8.3 File (ฝัง flag; ปิดเป็นค่าเริ่มต้น — ระหว่างรอ validator ถูกดึงขึ้น `Siri.Integrations.Storage`)
- **ชั่วคราว = สำเนาของ Tutoring** (`TutoringMaterialFileValidator`, `TutoringMaterialStorage`) กฎเดียวกับ `AttachmentFileValidator`: ปฏิเสธนามสกุล executable (`.exe .dll .bat .cmd .sh .ps1 .vbs .msi .jar .com .scr .pif .app .apk .bin .elf .iso .dmg .hta .cpl .reg .wsf .gadget`), allow-list (**เล็กกว่าของคอร์ส**: `.pdf .png .jpg .jpeg .docx .xlsx .pptx .txt .csv .md` — ไม่รับ `.zip .7z .gz .json`), MIME ต้องสอดคล้องนามสกุล, **magic bytes** (`%PDF`, PNG, JPEG, ZIP-container สำหรับ docx/xlsx/pptx, ไม่มี NUL ใน text) + ปฏิเสธ header ที่เป็น MZ/ELF/Mach-O/Java class ไม่ว่านามสกุล — server อ่านไบต์เองจาก seekable stream
- **parity test** (unit): เวกเตอร์เดียวกันป้อนให้ `AttachmentFileValidator.ValidateMagicBytes` (Catalog) กับสำเนา Tutoring ต้องได้ verdict เหมือนกันในนามสกุลที่ใช้ร่วม — กัน drift จนกว่าจะรวมเป็นตัวเดียว (บันทึก follow-up รวมเข้า `Siri.Integrations.Storage`)
- เก็บด้วย `IFileStorage.UploadAsync` key `tutoring-materials/sessions/{sessionId:N}/{guid:N}{ext}` (server เลือก; ไม่มีชื่อไฟล์ผู้ใช้ใน key) `Content-Disposition: attachment`, content-type จากนามสกุลฝั่ง server · ขนาด ≤ `MaxFileSizeMegabytes`(25; ≤100)
- **Virus scan:** `Tutoring:Materials:VirusScanMode` = `Required` (ค่าเริ่มต้นเมื่อเปิด `FilesEnabled`) ⇒ เรียก `IAttachmentVirusScanner` (Catalog.Contracts) — ไม่มี engine ⇒ 503 `tutoring.virus_scanner_not_configured` · `Disabled` ⇒ รับไฟล์โดยไม่สแกนและ log เตือนทุกไฟล์ (เหมือนที่เจ้าของรับไว้ใน Q9 สำหรับคอร์ส; **เปิดได้เฉพาะเมื่อเจ้าของสั่งชัด** เพราะผู้รับเป็นผู้เยาว์)
- ไม่ได้ตั้งค่า R2 ⇒ 503 `tutoring.storage_not_configured` (host ยัง boot — ไม่เข้า `ProductionConfigurationGuard`)

---

## 9. การแจ้งเตือน (ไทย+อังกฤษ ซ้อนในอีเมลฉบับเดียว; in-app ไทยอย่างเดียว) — เฉพาะเหตุการณ์ของไฟล์นี้

กลไก: `TutoringSessionMessages` (static pure, ใน `Tutoring.Application`) คืน `TutoringMessage(Subject, BodyHtml, TemplateKey, InApp(Type, Title, Body, LinkPath))` ตามแบบ `LiveEmailTemplates` · ส่งผ่าน `IEmailOutbox.Enqueue(...)` + `IUserNotificationOutbox.Stage(...)` ใน **unit-of-work เดียวกับการเปลี่ยนสถานะ** (atomic) · ผู้รับ/อีเมลจาก `IUserContactReader` (ผู้เรียน = บัญชีเจ้าของ booking; ติวเตอร์ = `TUTOR_PROFILE.USER_ID`) · ไม่มีอีเมล ⇒ in-app อย่างเดียว · ทุก string จาก DB ผ่าน `WebUtility.HtmlEncode` + subject single-line ≤80 · **ลิงก์ในอีเมล = `{Tutoring:PublicBaseUrl}/tutoring/sessions/{id:D}/join` หรือหน้าในแอปเท่านั้น (ไม่มี meetUrl)** · `linkUrl` in-app = path แอป (G6)
**Helper กลางที่ P13-10 WP-B เป็นผู้สร้าง (รอบ 2 ข้อ 18 — P13-06/09/11 เรียกใช้; ไม่มีใครประกาศซ้ำ):** `Tutoring.Application/TutoringLinks.cs` (`static string JoinUrl(TutoringOptions o, Guid sessionId)` = `{o.PublicBaseUrl.TrimEnd('/')}/tutoring/sessions/{sessionId:D}/join`) · `TutoringTelemetry.cs` (Meter `Siri.Tutoring` + counter ของไฟล์นี้; P13-11 เพิ่ม counter ของตนเองในไฟล์เดิม) · `TutoringSessionMessages.cs` (record `TutoringMessage` + helper `Encode/Subject/Page`; แถวข้อความของ P13-11 อยู่ใน `TutoringReminderMessages` ที่เรียก helper เหล่านี้)

| เหตุการณ์ | ผู้รับ | ช่องทาง | templateKey | in-app `type` | `linkUrl` | Subject (TH / EN) | Body in-app (TH) |
|---|---|---|---|---|---|---|---|
| nudge — ผู้เรียนรออยู่ | ติวเตอร์ | อีเมล+in-app | `tutoring-tutor-start-nudge` | `tutoring.start_nudge` | `/tutoring/sessions/{id}/join` | `ผู้เรียนรออยู่ในคลาส กรุณากดเริ่มคลาส` / `Your learner is waiting — please start the class` | `คลาส "{title}" เริ่มไปแล้ว {n} นาที ผู้เรียนเข้ารออยู่ กดเริ่มคลาสจากแพลตฟอร์มเพื่อไม่ให้ถูกบันทึกว่าไม่มา` |
| nudge — ทั่วไป | ติวเตอร์ | อีเมล+in-app | เดียวกัน | เดียวกัน | เดียวกัน | `คลาสของคุณเริ่มแล้ว กรุณากดเริ่มคลาส` / `Your class has started — please start it` | `คลาส "{title}" เริ่มไปแล้ว {n} นาที กรุณากดเริ่มคลาสจากแพลตฟอร์ม` |
| Completed | ผู้เรียน | อีเมล+in-app | `tutoring-class-completed-learner` | `tutoring.class_completed` | `/my-tutoring` | `คลาสเสร็จสิ้นแล้ว — ยืนยันและให้คะแนน` / `Class completed — confirm and rate` | `หากคลาส "{title}" เป็นไปตามที่ตกลง กด "ยืนยันคลาสเรียบร้อย" หรือรอระบบปล่อยเงินอัตโนมัติใน {h} ชม. มีปัญหาแจ้งข้อพิพาทได้ภายในเวลาเดียวกัน` |
| Completed | ติวเตอร์ | in-app | — | `tutoring.class_completed_tutor` | `/instructor/tutoring/classes/{id}` | — | `คลาส "{title}" เสร็จสิ้น เงินจะพร้อมโอนหลังพ้นช่วงข้อพิพาท {h} ชม.` |
| NoShowLearner | ผู้เรียน | อีเมล+in-app | `tutoring-no-show-learner` | `tutoring.no_show_learner` | `/my-tutoring` | `คุณไม่ได้เข้าคลาสตามเวลา / You missed your class` | `คลาส "{title}" ถูกบันทึกว่าผู้เรียนไม่ได้เข้า ตามนโยบายจึงไม่คืนเงิน หากไม่เห็นด้วยเปิดข้อพิพาทได้ภายใน {h} ชม.` |
| NoShowLearner | ติวเตอร์ | in-app | — | `tutoring.no_show_learner_tutor` | `/instructor/tutoring/classes/{id}` | — | `ผู้เรียนไม่เข้าคลาส "{title}" คุณได้รับค่าสอนเต็มจำนวน (พ้นช่วงข้อพิพาท {h} ชม.)` |
| NoShowTutor | ผู้เรียน | อีเมล+in-app | `tutoring-no-show-tutor-learner` | `tutoring.no_show_tutor` | `/my-tutoring` | `ติวเตอร์ไม่ได้เข้าคลาส — คืนเงินเต็มจำนวน / Tutor did not attend — full refund` | `เราขออภัย คลาส "{title}" ติวเตอร์ไม่ได้เข้าห้อง ระบบกำลังดำเนินการคืนเงินเต็มจำนวน (ดูสถานะในหน้าการเรียนของฉัน)` |
| NoShowTutor | ติวเตอร์ | อีเมล+in-app | `tutoring-no-show-tutor-tutor` | `tutoring.no_show_tutor_tutor` | `/instructor/tutoring/classes/{id}` | `คุณไม่ได้เข้าคลาส / You missed a class` | `คลาส "{title}" ถูกบันทึกว่าติวเตอร์ไม่เข้า ผู้เรียนได้รับเงินคืน หากเข้าใจผิด (เช่น เข้า Meet ตรงจากปฏิทิน) เปิดข้อพิพาทได้ภายใน {h} ชม.` (**ไม่พูดถึงคะแนนความน่าเชื่อถือ** — โทษเป็นของ `tutoring-penalty-notice` ที่ P13-08 ส่งเมื่อ `RecordPenaltyAsync` หักจริง; `applyPenalty` อาจเป็น false) |
| NoShowBoth | ผู้เรียน+ติวเตอร์ | อีเมล(ผู้เรียน)+in-app | `tutoring-no-show-both` | `tutoring.no_show_both` | `/my-tutoring` / `/instructor/tutoring/classes/{id}` | `ไม่มีผู้เข้าคลาส — คืนเงินเต็มจำนวน / No one attended — full refund` | `คลาส "{title}" ไม่มีใครเข้าห้อง ผู้เรียนได้รับเงินคืนเต็มจำนวน ไม่มีผลต่อคะแนนติวเตอร์` |
| Summary ครั้งแรก | ผู้เรียน | อีเมล+in-app | `tutoring-summary-ready` | `tutoring.summary_ready` | `/my-tutoring` | `สรุปบทเรียนพร้อมแล้ว / Your lesson summary is ready` | `ติวเตอร์สรุปบทเรียนของคลาส "{title}" แล้ว ดูหัวข้อ การบ้าน และขั้นต่อไปได้ในหน้าการเรียนของฉัน` |
| เพิ่มเอกสาร | ผู้เรียนใน session | in-app | — | `tutoring.material_added` | `/my-tutoring` | — | `ติวเตอร์เพิ่มเอกสาร "{materialTitle}" ในคลาส "{title}"` |
**ความเป็นเจ้าของข้อความ (รอบ 2 ข้อ 17 — ไม่ส่งซ้ำ):** ข้อความ "ผลการเข้าเรียน" ทุกแถวในตารางนี้ (Completed / NoShowLearner / NoShowTutor / NoShowBoth ถึงผู้เรียน+ติวเตอร์) **เป็นของ P13-10 ผู้เดียว** ส่งใน transaction เดียวกับ `Settle*`; **P13-08 ส่งเฉพาะ (ก) สถานะการคืนเงิน** (`tutoring-refund-processing|completed|failed`) **(ข) `tutoring-penalty-notice` ถึงติวเตอร์เมื่อ penalty ถูกหักจริง (ค) อีเมลยกเลิกโดยผู้เรียก/ติวเตอร์/แพลตฟอร์ม** — `Settle*NoShow*` ของ P13-08 **ต้องไม่ enqueue** `tutoring-noshow-tutor-refund` / `tutoring-noshow-learner-notice` / `tutoring-noshow-both-refund` (ซ้ำกับแถว NoShow* ข้างบน; ผลของมติคือ P13-08 §8 แก้ตามที่ README §7 บันทึก) · ข้อความด้านการเงิน (ยอดคืน/สถานะ refund) เป็นของ P13-08 — ข้อความในตารางนี้ **ไม่ระบุตัวเลข** กันขัดกัน

---

## 10. Config / Options / Rate limit / Telemetry (ทุกตัว `ValidateOnStart()`)

| Key | Default | ช่วง |
|---|---|---|
| `Tutoring:JoinWindowMinutes` | `15` (5–120) | **ประกาศโดย P13-05 §9 — P13-10 อ่านใช้เท่านั้น ไม่ประกาศซ้ำ/ไม่ validate ซ้ำ** |
| `Tutoring:TutorJoinWindowMinutes` | `60` | 5–240, ≥ `JoinWindowMinutes` (P13-10 ประกาศ + validator) |
| `Tutoring:Finalize:NudgeMinutes` | `5` | 1–30, < `NoShowMinutes` |
| `Tutoring:Finalize:NoShowMinutes` | `15` | 5–60 |
| `Tutoring:Finalize:CompletionGraceMinutes` | `10` | 0–120 |
| `Tutoring:Finalize:EarlyCompleteMinutes` | `10` | 0–60 |
| `Tutoring:Finalize:LearnerAttestationEnabled` | `true` | |
| `Tutoring:Finalize:BatchSize` | `100` | 10–500 |
| `Tutoring:Finalize:AttentionLookaheadMinutes` | `60` | 15–240 |
| `Tutoring:Rooms:SendCalendarInvites` | `true` | ส่งต่อให้ `LiveRoomOptions.SendCalendarInvites` (P13-09) |
| `Tutoring:Rooms:GoogleAttendeeSync` | `false` | ส่งต่อให้ `LiveRoomOptions.SyncGoogleAttendees` — **เปิดได้เมื่อ privacy policy/PDPA ครอบคลุมการส่งอีเมลผู้ปกครองไป Google เท่านั้น** (P13-09 §6.4) |
| `Tutoring:Summary:EditWindowDays` | `7` | 1–60 |
| `Tutoring:Materials:FilesEnabled` | `false` | |
| `Tutoring:Materials:MaxFileSizeMegabytes` | `25` | 1–100 |
| `Tutoring:Materials:MaxMaterialsPerSession` | `20` | 1–100 |
| `Tutoring:Materials:UploadGraceDays` | `14` | 0–90 |
| `Tutoring:Materials:DownloadUrlTtlMinutes` | `5` | 1–15 |
| `Tutoring:Materials:VirusScanMode` | `Required` | `Required`\|`Disabled` |
| `Tutoring:Finalize:RoomHealLookaheadHours` | `72` | 1–336 — heal ขั้น 0 (§5.2) มองล่วงหน้ากี่ชม. |
| `Tutoring:Retention:JoinLogPiiMonths` | `12` | 1–60 — **key นิยามโดย P13-17 (Wave 4); ค่า default นี้เป็นข้อเสนอ — P13-10 ไม่อ่านค่านี้ในโค้ด** (§3.2) |
Rate limit (ใน `RateLimiterConfiguration`; ชื่อ policy อยู่ในคีย์ partition ตาม `CreateUserPartition`): **`tutoring-join`** (`TutoringJoinPolicyName`) **6 req / 60 วิ ต่อผู้ใช้** — **เพิ่มโดย P13-10 ต่อท้ายไฟล์ตามที่ P13-01 §7 ระบุ** (ทำตามลำดับ wave ไม่ขนาน) · `tutoring-user` (`TutoringUserPolicyName`, 60/60 วิ) และ `tutoring-upload` (10/10 นาที) **ประกาศแล้วโดย P13-01 §7 — ใช้ตัวเดิม ไม่ประกาศซ้ำ** · ห้ามใช้ `default`/`auth`/`webhook`
Telemetry: `TutoringTelemetry` (Meter `Siri.Tutoring`; counters `tutoring.finalize.decisions{outcome}`, `tutoring.join.denied{reason}`, `tutoring.nudges.sent`, `tutoring.room_heal.attempts`) — `.AddMeter(TutoringTelemetry.MeterName)` ใน `Siri.Api/Program.cs` และ `Siri.Workers/Program.cs` ตาม precedent G11
Telemetry (เพิ่มรอบ 2): `tutoring.room_sync.failures{reason}` — `reason` ∈ `origin_not_allowed|provider|not_editable|unknown` (นับเมื่อ `ConvergeAsync` คืน Failure; log Error ไม่มี URL/อีเมล) · **ด่านป้องกัน origin (ข้อ 15):** `Tutoring:PublicBaseUrl` ต้องอยู่ใน origin ที่ Live ยอมรับ — ใช้ `LiveAdhocProductionRequirements.GetProblems` ของ P13-09 §7.1 (fail-fast ใน Production; **wire โดย P13-06 (ข)** เพราะ P13-06 เป็นผู้เรียก `JoinUrl` ก่อนใคร) · P13-10 **ไม่เพิ่มด่านซ้ำ** แต่ `TutoringRoomRequestFactory` ต้องใช้ `TutoringLinks.JoinUrl` ตัวเดียวกับที่ guard ตรวจ
**appsettings placeholder (รอบ 2 ข้อ 21):** key ใหม่ของ P13-10 ใส่ใน `appsettings.json` ของ **ทั้ง `Siri.Api` และ `Siri.Workers`** (controller/`ConvergeAsync` จาก webhook อยู่ฝั่ง Api, job finalize/heal อยู่ฝั่ง Workers; ค่า default ตามตาราง ไม่มี secret):
```json
"Tutoring": {
  "TutorJoinWindowMinutes": 60,
  "Finalize": { "NudgeMinutes": 5, "NoShowMinutes": 15, "CompletionGraceMinutes": 10, "EarlyCompleteMinutes": 10,
                "LearnerAttestationEnabled": true, "BatchSize": 100, "AttentionLookaheadMinutes": 60, "RoomHealLookaheadHours": 72 },
  "Rooms": { "SendCalendarInvites": true, "GoogleAttendeeSync": false },
  "Summary": { "EditWindowDays": 7 },
  "Materials": { "FilesEnabled": false, "MaxFileSizeMegabytes": 25, "MaxMaterialsPerSession": 20, "UploadGraceDays": 14,
                "DownloadUrlTtlMinutes": 5, "VirusScanMode": "Required" }
}
```
(`JoinWindowMinutes` อยู่ในบล็อกของ P13-05 ไม่ซ้ำที่นี่ · `Retention` อยู่ที่ P13-17) · ชื่อ key ของ grace = `Tutoring:Materials:UploadGraceDays` เท่านั้น (ไม่มี `MaterialUploadGraceDays`)

---

## 11. Security / IDOR (สรุปเป็นเมทริกซ์ — ทุกแถวต้องมี integration test)

| ทรัพยากร | ติวเตอร์เจ้าของ | ผู้เรียน (booking ตัวเอง) | ผู้เรียนอื่นใน group | admin | คนอื่น |
|---|---|---|---|---|---|
| join/start | ✔ (ต้อง Verified) | ✔ (booking `Confirmed`) | ✔ เฉพาะ booking ของตัวเอง | ✘ ไม่ bypass | 404 เดียวกัน |
| summary | ทุกแถวของ session | เฉพาะแถว booking ตัวเอง | ✘ 404 | ผ่าน admin attendance (ไม่เห็นเนื้อ summary) | 404 |
| materials list/download | ✔ | ✔ (Confirmed/Completed/Disputed) | ✔ ของ session เดียวกัน | ✘ | 404 |
| tutor-present | — | ✔ (LP ก่อน) | — | — | 404 |
| confirm-completed | — | ✔ เฉพาะ booking ตัวเอง | — | — | 404 |
| attendance (tutor) | ✔ nickname/grade เท่านั้น | ✘ | ✘ | — | 404 |
| รายการคลาส `GET tutor/classes` | ✔ เฉพาะ session ของตน (`InstructorOnly`; nickname/grade เท่านั้น) | ✘ | ✘ | ✘ (ใช้ `admin/*`) | 200 หน้าว่าง (ไม่มี `TUTOR_PROFILE`) · ผู้ไม่ใช่ติวเตอร์/ไม่ login 403/401 |
| admin attendance/attention | — | — | — | ✔ `AdminOnly` | 403 |
- ownership อยู่ใน `WHERE` ของ query ที่ดึงข้อมูล (ไม่ query แล้วค่อยเช็ค) · `userId` ไม่เคยมาจาก body/query · id ภายในของ Live (`roomId`) ไม่ออก API
- ผู้เยาว์: ติวเตอร์เห็นเฉพาะ nickname/gradeLevel; ผู้เรียนไม่เห็นกัน; ไม่มีอีเมลผู้ปกครองในข้อความถึงติวเตอร์; ไม่มีแชต; ไม่บันทึกคลาส
- ไม่ log: meetUrl, อีเมล, เนื้อ summary/feedback/homework · ไฟล์: ไม่ log ชื่อไฟล์ดิบ
- เงิน: ไม่คำนวณ/เขียนสถานะเงินที่นี่ (เรียก `BookingSettlementService` เท่านั้น) · ผลตัดสิน terminal เขียน decision row (atomic กับผล) และเรียก `ISecurityAuditContract.RecordAuditAsync` (`tutoring.session.no_show_tutor` / `…no_show_both`) เป็น **ขั้นสุดท้ายก่อน commit ใน transaction ของ session นั้น** (G4/P13-06 F7); admin attendance read เรียกท้าย action โดยไม่มี tracked changes ค้าง

## 12. Test checklist
**Unit:** `AttendanceEvaluator` ทุกแถว §5.3 × {ก่อน/พอดี/หลัง} `nsAt`,`doneAt`, trial 15 นาที, `forceComplete`, attestation เป็น `TP`, `LP` จาก confirm · `ResolveSession` ทุก combination (group ผสม) + นับสถิติเฉพาะมี Completed · join: ลำดับ §4.2 ทุก branch ด้วย fake clock (ขอบ `opensAt`, `E` พอดี, `E+1tick`) · **404 ทุกกรณี ProblemDetails เท่ากัน (ตัด traceId)** · join log ล้ม ⇒ ไม่คืน URL · เจ้าของข้าม window ของผู้เรียนได้ตาม `TutorJoinWindow` · `start` โดยผู้ที่ไม่ใช่เจ้าของ ⇒ 404 · materials: validator ทุกนามสกุล/magic/ขนาด/MIME + parity vector กับ Catalog · link validator (`https://meet.google.com/..`, `javascript:`, userinfo, พอร์ต, IP literal) · email content: HtmlEncode (`<script>`), ไม่มี meeting host/URL ห้อง · `TutoringErrors.NotFound` เป็น instance เดียว
**Integration (Testcontainers PostgreSQL 17 + Redis; `SiriApiFactory`):** IDOR ครบเมทริกซ์ §11 · **race join vs job:** learner join ขณะ job ตัดสิน `NoShowLearner` ⇒ ผลลัพธ์เดียวเท่านั้น (ทั้งสองลำดับ) · tutor join ขณะ job `NoShowTutor` เหมือนกัน · job ซ้ำ 3 รอบ ⇒ settlement เรียกครั้งเดียวต่อ booking, decision แถวเดียว · job ล่ม 2 ชม. แล้วกลับ ⇒ ไล่ทัน · group 3 คน (ผสม attend/absent) · `complete` ก่อนเวลา ⇒ 409 · `confirm-completed` ก่อนจบ/ไม่เคย join/Disputed ⇒ 409 · rate limit `tutoring-join` ครั้งที่ 7 ⇒ 429 และผู้ใช้อื่นยังผ่าน · `Cache-Control: no-store` ทุก response ของ join/start/room · JSON-walk: ไม่มี `meetUrl` นอก join/start; ไม่มี `storageKey` ที่ใด · material download ของ session อื่น ⇒ 404 · เปิด/ปิด `FilesEnabled`
**§7.5 รายการคลาส (รอบ 4):** unit — `TutorClassFlags` (pure: `canStart`/`canComplete`/`needsSummary`/`startOpensAtUtc`/`completeOpensAtUtc` ที่ขอบ `STARTS−TutorJoinWindow`, `ENDS`, `ENDS−EarlyComplete`, ไม่ Verified ⇒ false, `learnerPresent` ผ่าน joined/confirmed, พ้น `EditWindowDays`) · integration — IDOR (ติวเตอร์ B ไม่เห็น session ของ A ทั้ง 2 scope; ไม่รับ `tutorId` ใน query) · scope: `Held` ไม่ปรากฏ, hold หมดอายุ (Cancelled/ไม่มี booking จริง) ไม่อยู่ใน history, `Scheduled` ที่เลยเวลายังอยู่ upcoming, เรียงถูกทั้งสอง scope · การแบ่งหน้า (`total`, `pageSize` เกิน 50 ⇒ 400/clamp ตาม validator) · **นับ SQL คงที่ไม่เกิน 4 ชุดต่อหน้า** (interceptor นับคำสั่งตอนหน้า 50 session × 6 learner) · ติวเตอร์ `Suspended` เรียกได้ (200) แต่ `canStart=canComplete=false` · Live ล่ม (fake โยน) ⇒ 200 + `room=null` · JSON-walk: ไม่มี email/phone/guardian/userId/paymentId/meetUrl/roomId · ไม่ล็อก nickname
**ไม่ทำใน task นี้:** E2E (P13-31)

## 13. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | entity 4 ตัว + 2 คอลัมน์ + configuration + migration ×2 (อ่านทั้งไฟล์; ไม่ apply) + `docs/DATABASE.md` | build 0 warning; identifier ≤63; architecture เขียว |
| B | `backend-developer` | `AttendanceEvaluator`, `SessionJoinService`, `TutoringErrors.NotFound` (ถ้ายังไม่มี), **helper กลาง `TutoringLinks`/`TutoringTelemetry`/`TutoringSessionMessages` (§9 — P13-11 รอ WP นี้ merge)**, controllers join/start/tutor-present + rate limits | unit §12 ข้อ join/evaluator |
| C | `backend-developer` | `SessionFinalizeService` + job + `SessionRoomSync` impl + heal + nudge + messages + registration | integration job/race |
| D | `backend-developer` | complete/summary/confirm-completed + call-sites ของ `BookingSettlementService` (ต่อกับ P13-08 เมื่อ FROZEN; ถ้า P13-08 ยังไม่ merge ให้ใช้ fake ใน unit test และ integration test เฉพาะส่วน attendance) | unit+integration §6 |
| E | `backend-developer` | materials (link/homework ก่อน; file หลัง flag) + wrapper ห้อง + admin attention/attendance + **`GET tutor/classes` (§7.5)** | ตาม §8/§7 |
| F | `frontend-developer` | หน้าตาม Appendix (หลัง BE DTO นิ่ง; เริ่มขนานได้จากไฟล์นี้) | state machine ครบ |
`DONE` ตั้งโดย integrator-qa · ห้าม commit/apply migration เอง

## 14. Open decisions (defaulted) · ความเสี่ยงที่เหลือ
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| D1 | เวลาตัดสิน no-show | `min(15, ⌊D/2⌋)` นาทีหลังเริ่ม; ตัดสิน Completed ที่ `E+10 นาที` (config) |
| D2 | NoShowLearner ตัดสิน ณ `nsAt` ไม่รอสิ้นคลาส | ใช่ (ผู้เรียนมาสายหลังตัดสินเข้าไม่ได้ — อุทธรณ์ทาง dispute) |
| D3 | ผู้เรียนรอ host admit | เป็นหน้าที่ติวเตอร์ (P13-09 D4) |
| D4 | `start` ซ้ำซ้อนกับ `join` ของติวเตอร์ | คงทั้งคู่ — `start` บังคับ role=Tutor + `TutorOnly` (ลด ambiguity) |
| D5 | ตัวเลขสถิติ "คลาสที่สอน" | นับเมื่อมี booking `Completed` ≥1 |
| D6 | ไฟล์เอกสาร | ปิดไว้ (`FilesEnabled=false`) จนกว่าเจ้าของสั่ง + มีนโยบายสแกน (Q9) |
| D7 | summary บังคับ? | บังคับ `topicsCovered` เมื่อใช้ปุ่ม complete; job ปิดคลาสเองได้โดยไม่มี summary (ผู้เรียนเห็น "ติวเตอร์ยังไม่สรุป") |
| D8 | 404 ของ endpoint ที่เป็น participant-scoped | reason `tutoring.not_found` (README §5) ข้อความไทยคงที่เดียว ผ่าน **`TutoringErrors.NotFound` — static instance เดียว** (ชื่อเดียวกับที่ P13-13 F5 ใช้; อยู่ในไฟล์ `Application/TutoringErrors.cs` ที่ P13-01 สร้าง) — ห้ามมี instance/ข้อความ 404 ที่สองใน module · ถ้า WP ที่ลงมือก่อนยังไม่มีสมาชิกนี้ในไฟล์ ให้เพิ่มสมาชิกเดียวนี้ (ไม่สร้างคลาส/ไฟล์ใหม่) |
**ความเสี่ยงที่เหลือ:** (1) ข้อ 4.4: ติวเตอร์เข้า Meet ตรง + ผู้เรียน "ไม่กด attest" ⇒ NoShowTutor ผิดและคืนเงินทันที (ยอมรับตามนโยบายเจ้าของ; มี nudge/start-later/attest/complete/dispute ลดความเสี่ยง) (2) `LP` = ได้รับลิงก์ ไม่ใช่เข้า Meet จริง (3) ไม่มีการวัดเวลาที่อยู่ในห้องจริง ⇒ "สอนสั้นกว่าตกลง" ต้องพึ่ง dispute/รีวิว (4) (รอบ 2) ลายเซ็น/ชื่อที่ผูกพันไว้แล้ว: `BookingSettlementService` = P13-08 §4, `ITutorStatsWriter` = P13-01 §4.3, `ISessionRoomSync`/`ITutoringUnitOfWork` = P13-05 §5.0, `JoinWindowMinutes` = P13-05 §9, `DisputeWindowHours` = P13-06 §7 — ผู้เป็นเจ้าของเปลี่ยนชื่อได้โดยออก Changelog ที่นี่ · semantics ใน §2.1/§2.3 ผูกพัน (5) ห้องที่ติวเตอร์ถูก `Suspended`: ด่าน join ปฏิเสธที่ §4.2 ข้อ 1 ทันที (ตรงกับ P13-08 §7.3 — ไม่ใช่ follow-up) แต่ห้อง Meet/ICS ที่ส่งไปแล้วยังอยู่จน sweep ของ P13-08 ยกเลิกคลาสอนาคต → `ConvergeAsync` ยกเลิกห้อง

---

## Appendix — Frontend DTO (camelCase · enum = string · เวลา ISO-8601 UTC `…Z` · FE แปลง `Asia/Bangkok` ที่ pipe เดียว · ห้ามมี mock)

```ts
type Guid = string; type IsoUtc = string;
type TutoringParticipantRole = 'Learner' | 'Tutor';
type LiveRoomState = 'Pending' | 'AwaitingLink' | 'Ready' | 'NeedsReconnect' | 'Failed' | 'Cancelled';
type LiveRoomNeedsAction = 'None' | 'Waiting' | 'PasteLink' | 'ReconnectGoogle' | 'Retry';
type MaterialKind = 'File' | 'Link' | 'Homework';

interface JoinTutoringSessionResponse {            // POST /api/tutoring/sessions/{id}/join  และ  /tutor/classes/{id}/start
  sessionId: Guid; role: TutoringParticipantRole; meetUrl: string;     // meetUrl: เก็บใน signal ของ component เท่านั้น — ห้าม localStorage/sessionStorage/router state/URL/analytics/console; ห้ามปุ่ม copy สำหรับผู้เรียน
  startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; serverTimeUtc: IsoUtc;
}
interface RoomStatusDto { state: LiveRoomState; needsAction: LiveRoomNeedsAction; provider: 'GoogleMeet'|'Manual'|'Logging'|null;
                          hasMeetingLink: boolean; isUsable: boolean; lastSyncAtUtc: IsoUtc|null; errorCode: string|null; }
interface SetMeetingLinkRequest { meetUrl: string }
interface CompleteClassRequest { topicsCovered: string; homework?: string; nextSteps?: string; learnerFeedback?: { bookingId: Guid; feedback: string }[]; }
interface CompleteClassResponse { sessionId: Guid; status: 'Completed' | 'Scheduled'; alreadyCompleted: boolean; completedBookings: number; noShowLearnerBookings: number; pendingBookings: number; }
interface ConfirmCompletedResponse { bookingId: Guid; status: 'Completed'; confirmedAtUtc: IsoUtc; }
interface BookingSummaryDto { bookingId: Guid; sessionId: Guid; topicsCovered: string; feedback: string|null; homework: string|null; nextSteps: string|null; createdAtUtc: IsoUtc; updatedAtUtc: IsoUtc|null; }
interface TutorSummaryResponse { sessionId: Guid; topicsCovered: string|null; homework: string|null; nextSteps: string|null; learners: { bookingId: Guid; nickname: string; feedback: string|null }[]; }
// รอบ 2 ข้อ 19: learners[] = TutorVisibleLearner (ต้นฉบับ P13-05 §6.1 — ห้ามนิยามซ้ำ) + field attendance แบบ additive ล้วน
type TutorVisibleLearner = { nickname: string; gradeLevel: string | null; isMinor: boolean };   // นำเข้าจากโมเดล P13-05; ไม่มีอีเมล/เบอร์/userId
interface TutorAttendanceResponse { sessionId: Guid; startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; status: string; tutorJoinedAtUtc: IsoUtc|null; tutorConfirmedAtUtc: IsoUtc|null; finalizedAtUtc: IsoUtc|null;
  learners: (TutorVisibleLearner & { bookingId: Guid; status: string; joinedAtUtc: IsoUtc|null; attestedTutorPresentAtUtc: IsoUtc|null; confirmedAtUtc: IsoUtc|null })[]; }
// รอบ 4: GET /api/tutoring/tutor/classes?scope=upcoming|history&page=1&pageSize=20 (InstructorOnly) → PagedResult<TutorClassListItem>   (§7.5)
type TutorClassScope = 'upcoming' | 'history';
interface TutorClassListItem {                                   // SessionStatus/SessionFormat/BookingStatus/BookingOfferingSummary = โมเดลของ P13-05 (ไม่นิยามซ้ำ)
  sessionId: Guid; startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; status: SessionStatus; format: SessionFormat; isTrial: boolean;
  offering: BookingOfferingSummary;                              // offeringId, subjectNameTh, subjectNameEn, level, curriculum
  learners: (TutorVisibleLearner & { bookingId: Guid; status: BookingStatus })[];   // ไม่มีอีเมล/ชื่อผู้ปกครอง; ไม่รวม PendingPayment/Expired
  seatsTaken: number | null; capacity: number | null;           // เฉพาะ format='Group' (SEATS_TAKEN รวม hold ที่ยังไม่ชำระ)
  startOpensAtUtc: IsoUtc | null; canStart: boolean;            // display hint — สิทธิ์จริงที่ POST …/start
  completeOpensAtUtc: IsoUtc | null; canComplete: boolean; learnerPresent: boolean;
  needsSummary: boolean; summaryEditableUntilUtc: IsoUtc | null;
  room: { state: LiveRoomState; needsAction: LiveRoomNeedsAction } | null;   // ไม่มี URL/id
  serverTimeUtc: IsoUtc;
}
// ปุ่มยกเลิกแสดงเมื่อ status==='Scheduled' แล้วเรียก GET …/cancellation-quote (P13-08 §5.5) — ไม่มี canCancel ใน DTO นี้
interface MaterialDto { id: Guid; kind: MaterialKind; title: string; url: string|null; bodyText: string|null; fileName: string|null; contentType: string|null; sizeBytes: number|null; addedAtUtc: IsoUtc; }
interface AddMaterialRequest { kind: 'Link' | 'Homework'; title: string; url?: string; bodyText?: string }   // File = multipart (part "file", optional "title")
interface MaterialDownloadResponse { id: Guid; fileName: string; contentType: string; sizeBytes: number; downloadUrl: string; expiresAtUtc: IsoUtc; }   // downloadUrl ใช้ทันที ห้ามเก็บ
interface AttentionItemDto { sessionId: Guid; kind: 'RoomNotReady'|'NoShowBoth'|'FinalizeOverdue'; startsAtUtc: IsoUtc; tutorDisplayName: string; roomState: LiveRoomState|null; needsAction: LiveRoomNeedsAction|null; detectedAtUtc: IsoUtc; }
interface AdminAttendanceResponse extends TutorAttendanceResponse {
  joinLogs: { role: TutoringParticipantRole; userId: Guid; bookingId: Guid|null; joinedAtUtc: IsoUtc; ipAddress: string|null; userAgent: string|null }[];
  decisions: { bookingId: Guid; outcome: 'Completed'|'NoShowLearner'|'NoShowTutor'|'NoShowBoth'; decidedAtUtc: IsoUtc; decidedBy: 'System'|'TutorComplete'|'LearnerConfirm';
               tutorEvidence: 'None'|'PlatformJoin'|'TutorCompleted'|'LearnerAttested'; tutorEvidenceAtUtc: IsoUtc|null; learnerEvidence: 'None'|'PlatformJoin'|'Confirmed'; learnerEvidenceAtUtc: IsoUtc|null }[];
  room: RoomStatusDto | null; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: string; reason?: string; opensAtUtc?: IsoUtc; serverTimeUtc?: IsoUtc; needsAction?: LiveRoomNeedsAction; }
```
| `reason` | status | i18n `tutoring.errors.*` |
|---|---|---|
| `tutoring.not_found` | 404 | `notFoundOrNoAccess` (ไม่พบหรือไม่มีสิทธิ์ — รวมกันโดยตั้งใจ) |
| `tutoring.session_cancelled` / `session_closed` / `session_ended` | 409 | `cancelled` / `closed` (+ลิงก์ไปข้อพิพาท) / `ended` |
| `tutoring.window_not_open` | 409 | `notOpenYet` + นับถอยหลังถึง `opensAtUtc` (offset จาก `serverTimeUtc`) แล้ว auto-retry |
| `tutoring.room_not_ready` | 503 + `Retry-After` | `roomNotReady` — retry ทุก 30 วิ สูงสุด 10 ครั้ง; ติวเตอร์ (`needsAction`) → ปุ่มไปหน้าจัดการห้อง |
| `tutoring.concurrent_update` | 409 | `tryAgain` |
| `tutoring.complete_too_early` / `complete_no_learner_present` / `confirm_not_available` / `summary_locked` | 409 | ข้อความตามเหตุ |
| `tutoring.material_*` / `materials_files_disabled` / `virus_scanner_not_configured` / `storage_not_configured` | 400/409/503 | |
| `live.meeting_link_invalid` / `live.meeting_link_host_not_allowed` / `live.room_not_editable` / `live.meeting_not_resyncable` | 400/409 | (ของ Live — ใช้ key `live.errors.*` เดิม) |
| 429 | | "ลองใหม่ในอีกสักครู่" (ไม่มี reason) |

**หน้า `/tutoring/sessions/:sessionId/join`** (CSR, `robots: noindex`, `canActivate:[authGuard]` พร้อม returnUrl, **POST ครั้งเดียวใน `afterNextRender()` — ไม่เรียกใน ctor/resolver**) — state machine เทียบ `live-join-page` (P11-FE FE-1): `checking` → `ready` (200: ปุ่มหลัก `<a target="_blank" rel="noopener noreferrer">` เปิด Meet + พยายามเปิดอัตโนมัติ; **ไม่ใช้ `location.replace`** เพื่อให้หน้านี้ยังอยู่แสดงปุ่ม attestation) · `notOpen` · `ended` · `cancelled` · `closed` (409 session_closed: ข้อความ "คลาสนี้ปิดแล้ว" + ปุ่ม "เปิดข้อพิพาท" ถ้าเกี่ยวข้อง) · `roomNotReady` · `notFoundOrNoAccess` · `rateLimited` · `error` · **เพิ่มจาก Live:** ในสถานะ `ready` ของ **ผู้เรียน** แสดงคำถาม "ติวเตอร์เข้าห้องแล้วหรือยัง?" หลัง `startsAtUtc + 5 นาที` (ตามนาฬิกา server offset) ปุ่ม "เข้าแล้ว" ⇒ `POST …/tutor-present`, "ยังไม่มา" ⇒ ปิดคำถาม (ไม่ยิง API) · ผู้เรียนมีข้อความ "อย่าส่งต่อลิงก์ — ใช้ได้เฉพาะบัญชีของคุณ" + (ติวเตอร์) คำเตือน lobby/admit · focus ไปหัวเรื่องหลังเปลี่ยนสถานะ · นับถอยหลังไม่ประกาศทุกวินาที (`aria-live=off` ประกาศที่จุดเปลี่ยนสถานะ)
**หน้า `/instructor/tutoring/classes` (P13-25; CSR, `noindex`, guard เฉพาะติวเตอร์/`InstructorOnly`):** แท็บ `upcoming|history` เก็บ `scope`+`page` ใน URL query (กด back แล้วไม่รีเซ็ต) · skeleton / empty ("ยังไม่มีคลาส" + ลิงก์ไปตั้งเวลาว่าง) / error + "ลองใหม่" · การ์ดต่อคลาส: "เริ่มคลาส" เปิดเมื่อ `canStart` (ปิด ⇒ แสดงเวลาเปิดจาก `startOpensAtUtc`), "จบคลาส + สรุป" เมื่อ `canComplete` (ปิด ⇒ `learnerPresent=false` แสดง "ยังไม่มีผู้เรียนเข้าห้อง", มิฉะนั้นแสดงเวลาเปิดจาก `completeOpensAtUtc`), ป้าย `needsSummary` (กดไปแก้สรุปได้ถึง `summaryEditableUntilUtc`), `room.needsAction ≠ None` ⇒ ปุ่มไปหน้าจัดการห้อง (§7.1), ปุ่มยกเลิกเรียก `cancellation-quote` ก่อน (P13-08), รายชื่อผู้เรียนแสดง nickname (ชั้น) เท่านั้น · ติวเตอร์ที่ถูกระงับ ⇒ ปุ่ม start/complete ปิดเอง (flag จาก server) · นับถอยหลังใช้ offset จาก `serverTimeUtc` · i18n `tutoring.tutor.classes.*` (th+en)
**ความเป็นเจ้าของ DTO ของ Booking (รอบ 2 ข้อ 19):** `Booking`/`BookingListItem` และ field `canJoin`/`joinOpensAtUtc` เป็นของ **P13-05** (ฉบับรวม; ตารางเจ้าของ field ใน P13-05 Appendix) — P13-10 **ไม่นิยามซ้ำ** และไม่เพิ่ม field ชื่อ `canJoin`/`joinOpensAtUtc` ที่ไหน · field attendance ที่ P13-10 เพิ่มให้ `Booking` (additive, optional): `attendance?: { learnerJoinedAtUtc: IsoUtc|null; tutorPresentAttested: boolean; confirmedCompletedAtUtc: IsoUtc|null; canConfirmCompleted: boolean }` (`canConfirmCompleted` = display hint ตามเงื่อนไข §6.3 ข้อ 3 — สิทธิ์จริงตัดสินที่ POST) — ส่งเฉพาะ `GET /bookings/my` และ `GET /bookings/{id}` ของเจ้าของ booking · **ลงชื่อ P13-10 ในตาราง "เจ้าของ field" ของ P13-05 Appendix แถวใหม่** (README §6 บันทึกแล้ว) · ไม่มี field ใดของ P13-10 ที่ทำให้ `Booking` ของ P13-05 breaking
i18n namespace `tutoring.*` (th+en ครบ; `i18n-guard.spec`/`theme-guard.spec` เขียว) · ไม่มี hardcode ข้อความ · `bangkokDate` pipe · ลงทะเบียน `RenderMode.Client` ใน `app.routes.server.ts`

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review) — แก้ในไฟล์เดิม ยัง FROZEN · รายการ diff ทางการสำหรับ reconcile โค้ดที่เขียนไปแล้ว
- **ข้อ 9 (MAJOR — ห้อง):** §7.1b เขียนใหม่เป็นตารางตัดสินจาก "สถานะห้องจริง" (`GetStatusAsync`) ไม่ใช่แค่ `MEETING_ROOM_ID` null · **ยกเลิกห้องเฉพาะเมื่อ `session.STATUS = Cancelled`** (ไม่ยกเลิกเมื่อ booking `Confirmed` หมดแต่ session ยัง `Scheduled` — ปรับรายชื่อเหลือติวเตอร์ด้วย `UpdateAsync`) · session ที่ `Revive` (P13-05 §5.5) แล้ว `Confirm` ⇒ `CreateAsync` ปลุกห้องเดิมแบบ in-place (`Revived=true`, `MEETING_ROOM_ID` เดิม; P13-09 รอบ 2) — ไม่แตะ pipeline คอร์ส · §5.2 ขั้น 0 heal: เงื่อนไขเป็น "ไม่มีห้อง หรือ `LiveRoomState=Cancelled`" + `S ≤ now + RoomHealLookaheadHours`(72, ใหม่)
- **ข้อ 7/8/20 (เงิน):** §2.3 ตั้งตาม P13-08 §4 — สูตร D-A (`max(E, holdStartedAtUtc|decidedAtUtc)+DisputeWindowHours`), `ESCROW_STATE` คง `Held` (P13-10 ห้ามตั้ง `Released`; ปล่อยทันทีเฉพาะ `ReleaseEarlyAsync`), `ESCROW_RELEASE_AT_UTC` เป็นของ P13-08, ช่วง `holdStartedAtUtc ≤ max(E, now+1 นาที)`, **`Settle*` คืน Failure ในธุรกรรมที่ join ⇒ ผู้เรียก `throw`** · §5.0 ใหม่ — ลำดับใน txn (D-B): session → bookings ASC → `Settle*` ทีละใบ → `TUTOR_PROFILES` ท้ายสุด (`applyPenalty=true` เฉพาะใบสุดท้ายที่ NoShowTutor และไม่มีหลักฐานติวเตอร์) → `IncrementCompletedSessionsAsync` → decision/แจ้งเตือน → **`RecordAuditAsync` เป็นขั้นสุดท้าย** (มัน `SaveChanges` ทั้ง context)
- **ข้อ 15:** อ้างด่านป้องกัน origin ของ P13-09 §7.1 (wire โดย P13-06 (ข)) + metric/log `tutoring.room_sync.failures{reason}` เมื่อ `ConvergeAsync` ล้ม
- **ข้อ 16:** ลบประโยค "เพิ่มถ้ายังไม่มี" ทั้งหมด — คอลัมน์/index ที่ P13-05 สร้างแล้วระบุเป็น "มีอยู่แล้ว"; P13-10 เพิ่มเฉพาะ `TUTOR_BOOKINGS.TUTOR_PRESENT_ATTESTED_AT_UTC`, `TUTOR_SESSIONS.TUTOR_NUDGE_SENT_AT_UTC` + 4 ตารางใหม่; **ไม่เพิ่ม index** (ใช้ `IX_TUTOR_SESSIONS_ACTIVE_STARTS`, `IX_TUTOR_BOOKINGS_SESSION`)
- **ข้อ 17:** §9 ระบุเจ้าของอีเมล: "ผลการเข้าเรียน" ทั้งหมด = P13-10; P13-08 ส่งเฉพาะสถานะ refund / `tutoring-penalty-notice` / อีเมลยกเลิก — P13-08 `Settle*NoShow*` ต้องไม่ enqueue `tutoring-noshow-*-refund|learner-notice` · อีเมล NoShowTutor ถึงติวเตอร์ตัดข้อความ "มีผลต่อคะแนน" ออก (โทษเป็นของ penalty-notice)
- **ข้อ 18:** แก้อ้างอิง — `ISessionRoomSync` = P13-05 §5.0ค, `DisputeWindowHours` = P13-06 §7, `JoinWindowMinutes` = P13-05 §9, `ITutorStatsWriter` = P13-01 §4.3, `BookingSettlementService` = P13-08 §4; ลบ hedge "ผู้ implement คนแรกประกาศ" · ประกาศ enum ใน §3.6 (`SessionOutcome` ฯลฯ) · ด่าน "ติวเตอร์ต้อง Verified" ระบุว่า P13-10 ทำแล้ว (ไม่ใช่ follow-up ของ P13-08 §7.3) · `JoinLogPiiMonths` = key ของ P13-17, default 12 ที่นี่ · `TutoringErrors.NotFoundOrNoAccess` เปลี่ยนชื่อเป็น `TutoringErrors.NotFound` (ตรง P13-13 F5)
- **ข้อ 19:** Appendix `TutorAttendanceResponse.learners[]` = `TutorVisibleLearner` (P13-05 §6.1) & field attendance; `canJoin/joinOpensAtUtc` เป็นของ P13-05 ไม่นิยามซ้ำ; field attendance ที่ P13-10 เพิ่มให้ `Booking` ระบุเป็น additive และลงชื่อใน README §6
- **ข้อ 21:** ชื่อ key เดียว `Tutoring:Materials:UploadGraceDays` · FK ใน TUTORING ใช้ `NoAction` (ไม่ใช่ Restrict) · appsettings placeholder ทั้ง Api+Workers (§10) · `ProjectReference` Tutoring→Live เพิ่มโดย P13-09 WP-B · ลบแถว `JoinWindowMinutes` ที่ P13-10 เคยเพิ่ม (คงเฉพาะ `TutorJoinWindowMinutes`)

### 2026-10-15 รอบ 4 (ช่องว่างที่ FE Tutor Portal พบ) — additive ล้วน ไม่แตะ schema/endpoint เดิม
- **เพิ่ม §7.5 `GET /api/tutoring/tutor/classes?scope=upcoming|history&page&pageSize`** (ไม่เคยมี contract ไหนนิยาม): `InstructorOnly` (ให้ติวเตอร์ที่ถูกระงับยังเห็นคลาสค้าง; `start`/`complete`/`summary`/`attendance`/`room`/`materials` ยัง `TutorOnly`) · `tutoring-user` · ownership `tp.USER_ID = @userId` ใน query เดียว · scope ตัดสินที่ `s.STATUS` (`upcoming`=`Scheduled`; `history`=terminal ที่เคยมี booking จริง; `Held` ไม่แสดง) · เรียงตามเวลาเริ่ม (upcoming ASC / history DESC) · `PagedResult` pageSize ≤50 · query คงที่ 4 ชุด/หน้า (ไม่ N+1; room ผ่าน `GetStatusesAsync` ครั้งเดียว, ล้ม ⇒ `room=null`) · **ไม่มี migration เพิ่ม** — ใช้ `IX_TUTOR_SESSIONS_TUTOR_STARTS` ที่ P13-05 §3.1 มีอยู่แล้ว + `IX_TUTOR_BOOKINGS_SESSION`
- **DTO `TutorClassListItem`** (Appendix): `offering: BookingOfferingSummary` + `learners[] = TutorVisibleLearner & {bookingId,status}` (P13-05 ต้นฉบับ — ไม่มีอีเมล/ชื่อผู้ปกครอง) + flag ที่ server คำนวณ `canStart/startOpensAtUtc`, `canComplete/completeOpensAtUtc/learnerPresent`, `needsSummary/summaryEditableUntilUtc`, `room{state,needsAction}`, `seatsTaken/capacity` (Group), `serverTimeUtc` · **ไม่มี `canCancel`** (ใช้ `cancellation-quote` ของ P13-08)
- §11 เพิ่มแถว IDOR, §12 เพิ่มเทสต์ (นับ SQL ≤4/หน้า, Suspended ⇒ flag=false, Live ล้ม), WP-E ครอบ endpoint นี้ · README: §1 แถว P13-10, §5 ชิ้นส่วนร่วม, §5.1 ย้าย list ไปแถว `InstructorOnly`
- **ตรวจดัชนี:** task ที่ implement = **P13-10 (WP-E)**; ผู้บริโภค = FE **P13-25** (TASKS.md ระบุ P13-25 พึ่ง P13-10 อยู่แล้ว) · หมายเหตุ: แถว P13-10 ใน `docs/TASKS.md` ยังไม่เอ่ย `GET tutor/classes` และ P13-25 ระบุ "guard `Verified`" — หน้ารายการคลาสต้อง guard เป็น instructor/ติวเตอร์ (ไม่ใช่ `Verified`) เพื่อให้ผู้ถูกระงับเห็นคลาสค้าง (ให้ integrator-qa/เจ้าของ TASKS.md ปรับ ผมแก้ TASKS.md ไม่ได้) · ไม่มีรอบ 3 ในไฟล์นี้ — ใช้ "รอบ 4" ตามคำสั่ง

- **Changelog 2026-10-15 hardening (P13-33):** (L8/L9) config `Tutoring:Join:LogDedupeSeconds` (default 30; 0-600, 0 = ปิด): การ join ซ้ำของ **คนเดิม/role เดิม/ที่นั่งเดิม** ในหน้าต่างนี้ไม่เขียนแถว `SESSION_JOIN_LOGS` ใหม่และไม่ stamp หลักฐานซ้ำ แต่ยังได้ลิงก์; แถวแรกของหน้าต่างยัง **commit ก่อนคืนลิงก์** เหมือนเดิม ("no log, no link" ไม่ถูกผ่อน — การเช็คทำใต้ row lock หลังอ่านแถวที่ commit แล้วเท่านั้น; save ที่ล้มเหลวไม่เหลือแถวให้อ้าง) · ที่นั่งใหม่ที่ confirm หลัง join ครั้งแรกยังถูกบันทึกเมื่อ join ซ้ำ (dedupe ทำรายที่นั่ง) · เวลาของแถว log อ่านหลัง lock/ตรวจสถานะ ติดกับการ stamp หลักฐาน
