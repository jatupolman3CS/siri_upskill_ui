# Contract: P13-14 ข้อพิพาท (`DISPUTES` / `DISPUTE_MESSAGES` / `DISPUTE_EVIDENCE_LINKS`) — เปิดโดยผู้เรียกหรือติวเตอร์ภายในหน้าต่างเดียวกับเวลาปล่อยเงิน, Freeze escrow ใน txn เดียว, admin ตัดสิน Full/Partial/None (Stripe จริงผ่าน P13-08), อุทธรณ์ผลเข้าเรียน, เธรด 3 ฝ่าย, SLA/aging, ธงร้องเรียนซ้ำ

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE entity/DB, schema `TUTORING`) — เรียก `BookingSettlementService` / `TutoringRefundService` / `TutorReliabilityUpdater` / `TutorModerationService` / `IPackageCreditService` ภายในโมดูล + `Notification.Contracts` / `Identity.Contracts` (มีอยู่แล้ว) · **ไม่แตะ Catalog / Payout / Commerce / Live** · `Siri.Api` (controller ใหม่ 3 ตัว) · `Siri.Workers` (job 1 ตัว) · **แตะ P13-05 เล็กน้อยแบบ additive:** เมธอดโดเมน `TUTOR_BOOKING.ResolveDispute(...)` (§4) + field `Booking.disputeId/disputeWindowEndsAtUtc` (§9)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..F) → `frontend-developer`** (TASKS.md ตั้ง P13-14 เป็น CC อยู่แล้ว) — เหตุผล: ตัดสินเงินคืน/ปล่อยเงิน (Stripe จริง), freeze/unfreeze escrow, ธงระงับติวเตอร์/ความปลอดภัยผู้เยาว์, IDOR สองฝ่าย, ลำดับ lock ข้าม 6 ตาราง · **ไม่ต้องผ่าน DESIGN_DATABASE** (3 ตารางระดับคอลัมน์/CHECK/index ครบใน §2) · FE ขนานได้จาก DTO appendix

> **อ่านคู่กับ:** `docs/TUTORING.md` §3.9 · `REQUIREMENTS.md` TM-16 · `P13-README.md` (§5.1 route→policy, §7.2 lock chain D-B, §6 i18n/E7, E8) · **P13-08** (§3.3 `EscrowReleaseTime` D-A, §4 `FreezeEscrowAsync`/`UnfreezeEscrowAsync`/`ResolveDisputeAsync`, §6.0 lock, §7.1 `VoidPenaltyAsync`) · **P13-05** (`MarkDisputed`, `ITutoringUnitOfWork`, `Lock*Async`, Booking DTO ฉบับรวม §"Booking — ฉบับรวม") · **P13-10** (`SESSION_ATTENDANCE_DECISIONS` = หลักฐาน, `SESSION_JOIN_LOGS`, §4.6 ช่องอุทธรณ์) · **P13-12** (`MarkCreditRefundedAsync`) · **P13-13** (`TutorRatingService.RecomputeAsync`, `TutoringTextRules`) · **P13-01** (`TutorModerationService.SuspendAsync`) · **P13-17** (`REDACTED_AT_UTC` เขียนโดย PDPA เท่านั้น)

---

## 0. ข้อเท็จจริงจาก contract/โค้ดจริง (อ่านใหม่หลังรอบ 2 — 2026-10-14) ที่กำหนดดีไซน์นี้

| # | ข้อเท็จจริง | หลักฐาน | ผลต่อ contract |
|---|---|---|---|
| F1 | **สูตรเวลาเดียว (D-A):** `AVAILABLE_AT = max(session.ENDS_AT_UTC, decidedAt) + DisputeWindowHours` — `EscrowReleaseTime` (pure, `Domain.Policy`); `COMPLETED_AT_UTC = holdStartedAtUtc` (`SettleCompletedAsync`); no-show ใช้ `decidedAt` ของผล; `booking.ESCROW_STATE` คง `Held` ตลอดช่วงรอ + `ESCROW_RELEASE_AT_UTC`; job `tutoring-refund-reconcile` ตั้ง `Released`; ปล่อยทันทีเฉพาะผู้เรียก confirm-completed/admin | P13-08 §3.3, §4 (`SettleCompletedAsync`/`SettleLearnerNoShowAsync`), §2.3a | **หน้าต่างเปิดข้อพิพาท ≡ `EscrowReleaseTime(...)` ตัวเดียวกัน** (ไม่คิดสูตรใหม่) — ปิดหน้าต่างเมื่อเงินติวเตอร์พ้นกำหนดปล่อยพอดี (§3) |
| F2 | `FreezeEscrowAsync(FreezeEscrowCommand(BookingId, DisputeId, ActorUserId))` รับเฉพาะ `Completed \| NoShowLearner` → `Disputed`, Payout.Freeze, `ESCROW_STATE=Frozen`; Payout `TooLate` (เข้า batch/จ่ายแล้ว) ⇒ `Result.Failure` reason `tutoring.escrow_already_released` **และ booking ไม่เปลี่ยน**; ซ้ำด้วย `DisputeId` เดิม ⇒ `AlreadyApplied`; ผู้เรียกตรวจเวลาเอง | P13-08 §4 (บรรทัด `FreezeEscrowAsync`) | `NoShowTutor`/`NoShowBoth` (คืนเงินเต็ม + `Reversed` แล้ว ไม่มีเงินให้ freeze) **ไม่ผ่าน** `FreezeEscrowAsync` ⇒ flow `AttendanceAppeal` (§3.2) ที่ P13-14 เรียก `booking.MarkDisputed()` เอง (P13-05 §3.2 ให้ P13-14 เป็นผู้เรียก) · เคส `TooLate` ⇒ เปิด dispute ต่อ + `MarkDisputed()` เอง |
| F3 | `ResolveDisputeAsync(ResolveDisputeCommand(BookingId, DisputeId, DisputeResolutionKind, RefundAmount?, AdminUserId, Note))`: ต้อง `Disputed`; Full ⇒ `PRICE−REFUNDED_AMOUNT`; Partial ⇒ `0<amt≤เหลือ` (ไม่งั้น Validation `tutoring.refund_exceeds_cap`); ทั้ง 3 แบบ `RequestAsync(DisputeResolved, suffix=DisputeId)` (ถ้ามี amount) → `Payout.Unfreeze` + `ScheduleRelease(now)` ส่วนเหลือ; **ไม่แตะสถานะ booking — ผู้เรียก P13-14 ตั้งสถานะสุดท้ายและบันทึกผล dispute เอง**; idempotent ด้วย key `refund:{bookingId}:DisputeResolved:{disputeId:N}`; `Result.IsFailure` ขณะ join txn ⇒ **ผู้เรียกต้อง `throw`** | P13-08 §4 (ง) + `ResolveDisputeAsync` | P13-14 ตรวจ cap/เงื่อนไขก่อนเรียก (ใต้ lock) และใช้ `DisputeAbortException` (§6.3) เมื่อ Failure |
| F4 | `UnfreezeEscrowAsync(UnfreezeEscrowCommand(BookingId, DisputeId, ActorUserId, DateTime? ReleaseAtUtc))`; `null` ⇒ ปล่อยทันที · D-A: ปล่อยทันทีเฉพาะผู้เรียก/admin | P13-08 §4, §3.3 | withdraw (ไม่ใช่ admin) ส่ง `ReleaseAtUtc = windowEnd` ถ้ายังไม่ถึง ไม่งั้น `null` (§6.4) — P13-08 ต้องตั้ง `ESCROW_STATE`/`ESCROW_RELEASE_AT_UTC` ตามกติกา D-A (ไม่ใช่งาน P13-14) |
| F5 | **ไม่มีเมธอดออกจาก `Disputed`** ใน domain ของ booking — P13-05 เขียนว่า "ทางออกจาก `Disputed` ให้ P13-14 เพิ่ม method เอง"; เมทริกซ์ 10×10 ทดสอบทุกคู่ | P13-05 §3.2 บรรทัด `MarkDisputed()` | P13-14 เพิ่ม `ResolveDispute(BookingStatus restoredStatus)` (§4) + แถวในเมทริกซ์เทสต์ |
| F6 | `RecordAuditAsync` `SaveChanges` ทั้ง context ⇒ ใน txn: stage ทุกอย่างให้ครบแล้วเรียกเป็นขั้นสุดท้าย | `Identity/Infrastructure/Contracts/SecurityAuditContract.cs`; P13-06 F7 | ทุก flow ใน §6 เรียก audit ท้ายสุดก่อน commit |
| F7 | `TutorModerationService.SuspendAsync(adminUserId, tutorId, reason, ipAddress, ct)` **commit เอง** (audit = commit, จัดการ concurrency เอง, คืน `Result`); ไม่ใช่ `Verified` ⇒ `InvalidTransition` | `Siri.Modules.Tutoring/Application/TutorModerationService.cs:82-114` | ระงับติวเตอร์จาก dispute ทำ **หลัง** commit ของการตัดสิน (txn แยก) — ล้มต้องไม่ทำให้การตัดสิน/เงินล้ม (§6.3 ข้อ 12) |
| F8 | `TutorReliabilityUpdater.VoidPenaltyAsync(sessionId, kind, adminUserId, note)` → `Task<Result>`; `RecordPenalty` เขียน `TUTOR_PROFILES` เป็นท้ายสุดของ chain | P13-08 §4, §7.1 | เรียกเฉพาะเมื่อมีโทษ `NoShow` ที่ไม่ void ของ session นั้น (เช็คก่อนผ่าน repository ของ P13-14); เรียกหลังขั้นเงิน |
| F9 | `IUserNotificationOutbox.Stage` throw ถ้า `linkUrl` ไม่ใช่ path `/…` ตัวเดียว/http(s); `IEmailOutbox.Enqueue` stage-only; ผู้ใช้ที่ถูก anonymise มีอีเมล `anonymized_{id:N}@deleted.siriupskill.com` | `Notification/Contracts/*`; `AnonymizeAccountHandler.cs` | ข้ามอีเมลถึงผู้รับที่ลงท้าย `@deleted.siriupskill.com` (helper `AnonymizedAccount.IsAnonymizedEmail` ประกาศที่ P13-17 §3) |
| F10 | `MeetingLinkText.Scrub/ContainsLink` (SharedKernel) · `TutoringTextRules` (P13-13) · `TutoringErrors.NotFound` static instance | `Siri.SharedKernel/MeetingLinkText.cs`; P13-13 §3.2 | ข้อความ dispute: scrub ลิงก์ห้อง + ตรวจ markup/ช่องทางติดต่อ (§5.2) |
| F11 | `PAYMENT.ApplyRefundTotals`, `REFUND_RESERVED_AMOUNT`, `Booking.refundedAmount` = Requested+Processing+Completed; ผู้เขียนเดียว = `TutoringRefundService` | P13-06 §2.1; P13-08 §6.0 | P13-14 **ไม่เขียน** ยอดคืน — ใช้ `REFUNDED_AMOUNT` เป็นอินพุตอ่านอย่างเดียว |

---

## 1. Scope & task IDs

**ใน:** ตาราง `DISPUTES`, `DISPUTE_MESSAGES`, `DISPUTE_EVIDENCE_LINKS` + migration `AddTutoringDisputes` · `DisputeService` (open/list/get/post message/withdraw — ผู้เรียก+ติวเตอร์) · `AdminDisputeService` (queue/summary/detail/claim/message/decide/mark-compensation-settled) · `DisputeWindowPolicy` (pure) + `DisputeEligibility` (ตาราง role×สถานะ×หมวด) · เมธอดโดเมนใหม่ `TUTOR_BOOKING.ResolveDispute` · เรียก P13-08 (`FreezeEscrowAsync`/`UnfreezeEscrowAsync`/`ResolveDisputeAsync`/`VoidPenaltyAsync`) / P13-12 (`MarkCreditRefundedAsync`) / P13-13 (`RecomputeAsync`) / P13-01 (`SuspendAsync`) · ธงร้องเรียนซ้ำ + auto-suspend (config, default ปิด) · SLA/aging + job `tutoring-dispute-aging` (ไม่ปล่อยเงินเอง) · แจ้งเตือน (อีเมล+in-app) · endpoint ผู้เรียก/ติวเตอร์/admin

**นอก:** ตัดสินเข้าเรียนอัตโนมัติ (P13-10) · เงินคืนจริง (P13-08 `TutoringRefundService`) · ไฟล์แนบหลักฐาน (v1 = **ลิงก์เท่านั้น** — ไฟล์ต้องรอ validator/virus scan Q9, ดู P13-10 `Tutoring:Materials:FilesEnabled=false`; เพิ่มทีหลังผ่าน revision) · ชดเชยติวเตอร์แบบอัตโนมัติจากเงินแพลตฟอร์ม (ไม่มี Payout contract รองรับ ⇒ **ธง `COMPENSATION_REQUIRED` + คิว follow-up** §6.5) · ปิดบัญชีผู้ใช้ที่ละเมิด (admin ใช้เครื่องมือ Identity) · FE (DTO appendix เป็นสัญญา)

---

## 2. Schema delta — migration `AddTutoringDisputes` (ตารางใหม่ 3 ตาราง; ไม่แตะตารางอื่น)

> UPPERCASE ผ่าน `ApplyUppercaseNamingConventions` · เวลา `timestamptz(3)` UTC · เงิน `numeric(18,2)` + `HasPrecision(18,2)` · enum เก็บ string · `ROW_VERSION bytea` (`.IsConcurrencyToken().HasColumnType("bytea")`) · **ไม่ implement `IAuditable`/`ISoftDelete`** (ใช้ timestamp ตั้งชื่อเอง เหมือน `REFUND`/`PAYMENT`) · **FK ทุกเส้น `NoAction`; ไม่มีเมธอดลบ; ไม่มี cascade** · ชื่อ ≤63 ไบต์ ตั้งเอง · accessor `Disputes()` / `DisputeMessages()` / `DisputeEvidenceLinks()` · อ่าน migration ที่ generate ทั้งไฟล์ (ไม่มี shadow FK) · **ห้าม apply DB จริงเอง**
> **ทุก CHECK ที่ต้องบังคับให้คอลัมน์มีค่าต้องมี `IS NOT NULL` ชัดเจน** (PostgreSQL ถือว่านิพจน์ NULL ผ่าน CHECK — บทเรียน implementer P13-01)

### 2.1 `TUTORING.DISPUTES` (entity `DISPUTE`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `DISPUTE_ID` | uuid PK | no | UUIDv7 — สร้างล่วงหน้าก่อนเรียก `FreezeEscrowAsync` (เป็น `DisputeId`) |
| `DISPUTE_NO` | varchar(24) | no | `DS-yyMMdd-XXXXXX` (6 hex CSPRNG ตัวพิมพ์ใหญ่) · **UQ** `UQ_DISPUTES_NO` · ชน ⇒ สร้างใหม่ ≤3 ครั้ง (แบบ `BOOKING_NO`) |
| `BOOKING_ID` | uuid | no | FK → `TUTOR_BOOKINGS` (`FK_DISPUTES_TUTOR_BOOKINGS_BOOKING_ID`) |
| `SESSION_ID` | uuid | no | FK → `TUTOR_SESSIONS` (`FK_DISPUTES_TUTOR_SESSIONS_SESSION_ID`) · denormalize (admin join / attendance link) |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` (`FK_DISPUTES_TUTOR_PROFILES_TUTOR_ID`) · denormalize (IDOR ฝั่งติวเตอร์ + ประวัติ) |
| `LEARNER_USER_ID` | uuid | no | = `TUTOR_BOOKINGS.LEARNER_USER_ID` (IDOR ฝั่งผู้เรียก + PDPA) · ไม่มี FK ข้าม schema · **ไม่ออก API** |
| `OPENED_BY_USER_ID` | uuid | no | จาก `IUserContext` เท่านั้น · ไม่ออก API |
| `OPENED_BY_ROLE` | varchar(8) | no | `DisputeParty`: `Learner` \| `Tutor` |
| `CATEGORY` | varchar(16) | no | `DisputeCategory`: `NoClass` \| `TutorConnection` \| `Behavior` \| `NotAsDescribed` \| `Other` |
| `FLOW` | varchar(16) | no | `DisputeFlow`: `Escrow` \| `AttendanceAppeal` (§3.2) |
| `BOOKING_STATUS_AT_OPEN` | varchar(16) | no | `Completed`\|`NoShowLearner`\|`NoShowTutor`\|`NoShowBoth` — สถานะที่ `ResolveDispute` ต้องคืน (§4) |
| `DESCRIPTION` | varchar(2000) | no | ข้อความล้วนที่ผู้เปิดเขียน (10–2000 หลัง trim) · P13-17 แทนที่ด้วย placeholder เมื่อ erasure/retention |
| `STATUS` | varchar(12) | no | `DisputeStatus`: `Open` \| `UnderReview` \| `Resolved` \| `Rejected` \| `Withdrawn` |
| `PRIORITY` | varchar(8) | no | `DisputePriority`: `Normal` \| `High` (§7.1) |
| `ESCROW_FREEZE` | varchar(16) | no | `EscrowFreezeResult`: `Frozen` \| `TooLate` \| `NotApplicable` (§6.1 ข้อ 8) |
| `AMOUNT_AT_STAKE` | numeric(18,2) | no | snapshot `PRICE_AMOUNT − REFUNDED_AMOUNT` ตอนเปิด (≥0) — ไว้เรียง/สรุป |
| `REPEAT_COMPLAINT_FLAG` | boolean | no | default false (§7.2) |
| `REPEAT_COMPLAINT_COUNT` | int | no | default 0 — จำนวนที่นับได้ ณ ตอนเปิด (รวมเคสนี้) |
| `SLA_DUE_AT_UTC` | timestamptz(3) | no | `OPENED_AT_UTC + (PRIORITY=High ? HighPrioritySlaHours : SlaHours)` |
| `LAST_ACTIVITY_AT_UTC` | timestamptz(3) | no | อัปเดตทุกข้อความ/สถานะ |
| `LAST_MESSAGE_ROLE` | varchar(8) | yes | `Learner`\|`Tutor`\|`Admin` — ไว้คิว "รอแอดมินตอบ" |
| `AGING_ALERT_LEVEL` | smallint | no | default 0 (0–4) — idempotency ของ job เตือนค้างนาน (§7.4) |
| `ASSIGNED_TO_USER_ID` | uuid | yes | admin ผู้รับเคส (`claim`) · ไม่ออกฝั่งผู้ใช้ |
| `ASSIGNED_AT_UTC` | timestamptz(3) | yes | |
| `RESOLUTION` | varchar(14) | yes | `DisputeResolution`: `FullRefund` \| `PartialRefund` \| `NoRefund` (map จาก `DisputeResolutionKind` ของ P13-08) |
| `REFUND_AMOUNT` | numeric(18,2) | yes | > 0 เมื่อ Full/Partial เท่านั้น |
| `REFUND_ID` | uuid | yes | FK → `REFUNDS` (`FK_DISPUTES_REFUNDS_REFUND_ID`) — refund ที่ `ResolveDisputeAsync` สร้าง (`SettlementOutcome.RefundId`) |
| `ATTENDANCE_OVERTURNED` | boolean | no | default false — เฉพาะ flow `AttendanceAppeal` |
| `PENALTY_VOIDED` | boolean | no | default false |
| `COMPENSATION_REQUIRED` | boolean | no | default false — admin ธง "ต้องชดเชยติวเตอร์นอกระบบ" (§6.5) |
| `COMPENSATION_SETTLED_AT_UTC` | timestamptz(3) | yes | ปิด follow-up |
| `DECIDED_BY_USER_ID` | uuid | yes | admin |
| `DECIDED_AT_UTC` | timestamptz(3) | yes | |
| `DECISION_NOTE` | varchar(1000) | yes | **ทั้งสองฝ่ายเห็นข้อความนี้** (UI แอดมินต้องเตือน) |
| `WITHDRAWN_AT_UTC` | timestamptz(3) | yes | |
| `CLIENT_REQUEST_ID` | uuid | no | idempotency ตอนเปิด (กันดับเบิลคลิก) |
| `OPENED_AT_UTC` | timestamptz(3) | no | |
| `REDACTED_AT_UTC` | timestamptz(3) | yes | **เขียนโดย P13-17 เท่านั้น** |
| `ROW_VERSION` | bytea | no | |

Index / constraint (ชื่อตายตัว):
- `PK_DISPUTES` · **UQ** `UQ_DISPUTES_NO` (`DISPUTE_NO`) · **UQ** `UQ_DISPUTES_CLIENT_REQUEST` (`OPENED_BY_USER_ID`,`CLIENT_REQUEST_ID`)
- **UQ partial `UQ_DISPUTES_BOOKING_ACTIVE`** (`BOOKING_ID`) `HasFilter("\"STATUS\" <> 'Withdrawn'")` — หนึ่งข้อพิพาท "ที่มีผล" ต่อ booking (Open/UnderReview/Resolved/Rejected นับหมด ⇒ ตัดสินแล้วเปิดใหม่ไม่ได้) · ถูกถอนแล้วเปิดใหม่ได้ภายใต้เพดาน `MaxWithdrawnPerBooking` (§5.1)
- `IX_DISPUTES_BOOKING` (`BOOKING_ID`) · `IX_DISPUTES_QUEUE` (`PRIORITY` DESC, `SLA_DUE_AT_UTC`, `DISPUTE_ID`) `HasFilter("\"STATUS\" IN ('Open','UnderReview')")` — คิว admin · `IX_DISPUTES_TUTOR` (`TUTOR_ID`,`OPENED_AT_UTC` DESC) · `IX_DISPUTES_LEARNER` (`LEARNER_USER_ID`,`OPENED_AT_UTC` DESC) · `IX_DISPUTES_OPENED_BY` (`OPENED_BY_USER_ID`,`STATUS`) — เพดานเปิดพร้อมกัน/PDPA · `IX_DISPUTES_FOLLOWUP` (`DECIDED_AT_UTC`) `HasFilter("\"COMPENSATION_REQUIRED\" = true AND \"COMPENSATION_SETTLED_AT_UTC\" IS NULL")` · `IX_DISPUTES_AGING` (`OPENED_AT_UTC`) `HasFilter("\"STATUS\" IN ('Open','UnderReview')")`
- CHECK `CK_DISPUTES_ENUMS`: `"OPENED_BY_ROLE" IS NOT NULL AND "OPENED_BY_ROLE" IN ('Learner','Tutor') AND "CATEGORY" IS NOT NULL AND "CATEGORY" IN ('NoClass','TutorConnection','Behavior','NotAsDescribed','Other') AND "FLOW" IS NOT NULL AND "FLOW" IN ('Escrow','AttendanceAppeal') AND "STATUS" IS NOT NULL AND "STATUS" IN ('Open','UnderReview','Resolved','Rejected','Withdrawn') AND "PRIORITY" IS NOT NULL AND "PRIORITY" IN ('Normal','High') AND "ESCROW_FREEZE" IS NOT NULL AND "ESCROW_FREEZE" IN ('Frozen','TooLate','NotApplicable') AND "BOOKING_STATUS_AT_OPEN" IS NOT NULL AND "BOOKING_STATUS_AT_OPEN" IN ('Completed','NoShowLearner','NoShowTutor','NoShowBoth')`
- CHECK `CK_DISPUTES_FLOW_ROLE`: `"FLOW" IS NOT NULL AND "OPENED_BY_ROLE" IS NOT NULL AND ("FLOW" <> 'AttendanceAppeal' OR "OPENED_BY_ROLE" = 'Tutor')`
- CHECK `CK_DISPUTES_DECIDED`: `"STATUS" IS NOT NULL AND ("STATUS" NOT IN ('Resolved','Rejected') OR ("DECIDED_AT_UTC" IS NOT NULL AND "DECIDED_BY_USER_ID" IS NOT NULL AND "RESOLUTION" IS NOT NULL AND "DECISION_NOTE" IS NOT NULL))`
- CHECK `CK_DISPUTES_WITHDRAWN`: `"STATUS" IS NOT NULL AND ("STATUS" <> 'Withdrawn' OR "WITHDRAWN_AT_UTC" IS NOT NULL)`
- CHECK `CK_DISPUTES_REFUND_SHAPE`: `(CASE WHEN "RESOLUTION" IN ('FullRefund','PartialRefund') THEN ("REFUND_AMOUNT" IS NOT NULL AND "REFUND_AMOUNT" > 0) ELSE ("REFUND_AMOUNT" IS NULL) END)` และ `("RESOLUTION" IS NULL OR "RESOLUTION" IN ('FullRefund','PartialRefund','NoRefund'))` — (เขียนเป็นสอง CHECK: `CK_DISPUTES_REFUND_SHAPE`, `CK_DISPUTES_RESOLUTION`)
- CHECK `CK_DISPUTES_APPEAL_NO_MONEY`: `"FLOW" <> 'AttendanceAppeal' OR (("RESOLUTION" IS NULL OR "RESOLUTION" = 'NoRefund') AND "REFUND_AMOUNT" IS NULL AND "REFUND_ID" IS NULL)`
- CHECK `CK_DISPUTES_AMOUNTS`: `"AMOUNT_AT_STAKE" IS NOT NULL AND "AMOUNT_AT_STAKE" >= 0 AND "REPEAT_COMPLAINT_COUNT" IS NOT NULL AND "REPEAT_COMPLAINT_COUNT" >= 0`
- CHECK `CK_DISPUTES_AGING`: `"AGING_ALERT_LEVEL" IS NOT NULL AND "AGING_ALERT_LEVEL" BETWEEN 0 AND 4`

State machine (domain method เท่านั้น — `private set`): `Open → UnderReview` (`Claim(adminUserId)`) · `Open|UnderReview → Resolved|Rejected` (`Decide(...)`) · `Open|UnderReview → Withdrawn` (`Withdraw(userId)`) · `Resolved|Rejected|Withdrawn` terminal · transition อื่น ⇒ `InvalidOperationException` (theory test ครบ 5×5) · `Decide` ตั้ง `LAST_ACTIVITY_AT_UTC` · ไม่มี setter สาธารณะ

### 2.2 `TUTORING.DISPUTE_MESSAGES` (entity `DISPUTE_MESSAGE` — **append-only**; ข้อยกเว้นเดียว: `Redact` ของ P13-17)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `MESSAGE_ID` | uuid PK | no | |
| `DISPUTE_ID` | uuid | no | FK → `DISPUTES` (`FK_DISPUTE_MESSAGES_DISPUTES_DISPUTE_ID`) |
| `AUTHOR_USER_ID` | uuid | yes | null เมื่อ `AUTHOR_ROLE='System'` · ไม่ออก API |
| `AUTHOR_ROLE` | varchar(8) | no | `Learner` \| `Tutor` \| `Admin` \| `System` |
| `KIND` | varchar(8) | no | `Message` \| `System` |
| `VISIBILITY` | varchar(8) | no | `Parties` (ทุกฝ่ายเห็น) \| `Internal` (admin เท่านั้น — **ไม่ออก API ผู้ใช้เด็ดขาด**) |
| `BODY` | varchar(2000) | no | `KIND=Message`: ข้อความล้วน 1–2000 · `KIND=System`: **รหัสสั้น** (`opened`/`claimed`/`decided`/`withdrawn`/`escrow_too_late`, ≤64) — FE แปลเป็นข้อความตาม i18n (DB ไม่เก็บข้อความภาษา) |
| `CLIENT_MESSAGE_ID` | uuid | yes | idempotency ฝั่งผู้โพสต์ (null สำหรับ System) |
| `CREATED_AT_UTC` | timestamptz(3) | no | |
| `REDACTED_AT_UTC` | timestamptz(3) | yes | P13-17 |
Index/constraint: `PK_DISPUTE_MESSAGES` · `IX_DISPUTE_MESSAGES_DISPUTE` (`DISPUTE_ID`,`CREATED_AT_UTC`,`MESSAGE_ID`) · **UQ partial** `UQ_DISPUTE_MESSAGES_CLIENT` (`DISPUTE_ID`,`CLIENT_MESSAGE_ID`) `HasFilter("\"CLIENT_MESSAGE_ID\" IS NOT NULL")` · CHECK `CK_DISPUTE_MESSAGES_ROLE`: `"AUTHOR_ROLE" IS NOT NULL AND "AUTHOR_ROLE" IN ('Learner','Tutor','Admin','System') AND "KIND" IS NOT NULL AND "KIND" IN ('Message','System') AND "VISIBILITY" IS NOT NULL AND "VISIBILITY" IN ('Parties','Internal')` · CHECK `CK_DISPUTE_MESSAGES_SYSTEM`: `("AUTHOR_ROLE" = 'System') = ("AUTHOR_USER_ID" IS NULL) AND ("AUTHOR_ROLE" = 'System') = ("KIND" = 'System')` · CHECK `CK_DISPUTE_MESSAGES_INTERNAL`: `"VISIBILITY" IS NOT NULL AND ("VISIBILITY" <> 'Internal' OR "AUTHOR_ROLE" = 'Admin')`

### 2.3 `TUTORING.DISPUTE_EVIDENCE_LINKS` (entity `DISPUTE_EVIDENCE_LINK` — append-only)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `EVIDENCE_ID` | uuid PK | no | |
| `DISPUTE_ID` | uuid | no | FK → `DISPUTES` (`FK_DISPUTE_EVIDENCE_LINKS_DISPUTES_DISPUTE_ID`) |
| `MESSAGE_ID` | uuid | yes | FK → `DISPUTE_MESSAGES` (`FK_DISPUTE_EVIDENCE_LINKS_DISPUTE_MESSAGES_MESSAGE_ID`) · null = แนบตอนเปิด (Parties) · การมองเห็น = `VISIBILITY` ของข้อความต้นทาง |
| `ADDED_BY_USER_ID` | uuid | no | ไม่ออก API |
| `ADDED_BY_ROLE` | varchar(8) | no | `Learner`\|`Tutor`\|`Admin` |
| `URL` | varchar(500) | yes | https เท่านั้น · null เฉพาะหลัง redact |
| `LABEL` | varchar(120) | yes | |
| `ADDED_AT_UTC` | timestamptz(3) | no | |
| `REDACTED_AT_UTC` | timestamptz(3) | yes | P13-17 |
Index/constraint: `PK_DISPUTE_EVIDENCE_LINKS` · `IX_DISPUTE_EVIDENCE_DISPUTE` (`DISPUTE_ID`,`ADDED_AT_UTC`) · CHECK `CK_DISPUTE_EVIDENCE_URL`: `"REDACTED_AT_UTC" IS NOT NULL OR ("URL" IS NOT NULL AND "URL" LIKE 'https://%')` · CHECK `CK_DISPUTE_EVIDENCE_ROLE`: `"ADDED_BY_ROLE" IS NOT NULL AND "ADDED_BY_ROLE" IN ('Learner','Tutor','Admin')`

---

## 3. กติกาการเปิดข้อพิพาท

### 3.1 หน้าต่างเวลา — `DisputeWindowPolicy` (pure, `Domain.Policy`, unit test ทุกขอบ)
```csharp
public static class DisputeWindowPolicy
{
    /// คืน null เมื่อสถานะนี้เปิดข้อพิพาทไม่ได้. อื่น ๆ = EscrowReleaseTime(sessionEndsAtUtc, decidedAtUtc, disputeWindowHours) ของ P13-08 §3.3 (สูตรเดียว D-A)
    public static DateTime? WindowEndsAtUtc(BookingStatus status, DateTime sessionEndsAtUtc, DateTime? completedAtUtc,
                                            DateTime? attendanceDecidedAtUtc, int disputeWindowHours);
    public static bool IsOpen(DateTime windowEndsAtUtc, DateTime nowUtc) => nowUtc <= windowEndsAtUtc;   // ขอบ inclusive
}
```
| `booking.STATUS` | `decidedAtUtc` ที่ใช้ | หมายเหตุ |
|---|---|---|
| `Completed` | `booking.COMPLETED_AT_UTC` (= `holdStartedAtUtc` ที่ `SettleCompletedAsync` ตั้ง) | ตรงกับ `AVAILABLE_AT` ของเงินติวเตอร์เมื่อไม่ได้ปล่อยเร็ว |
| `NoShowLearner` / `NoShowTutor` / `NoShowBoth` | `SESSION_ATTENDANCE_DECISIONS.DECIDED_AT_UTC` ของ booking นั้น (UQ ต่อ booking, P13-10 §3.3) | **ตอบคำถาม "no-show นับจากเมื่อไร":** นับจาก **เวลาตัดสินผล** (≥ เวลาเริ่มคลาส เพราะตัดสินที่ `S+nsAt`/`E+grace`) ผ่านสูตร `max(ENDS, decidedAt)+window` — ผู้ใช้เปิดข้อพิพาทไม่ได้ก่อนมีผลตัดสิน และหน้าต่างปิด**พร้อมเวลาที่เงินติวเตอร์ถึงกำหนดปล่อย** (ไม่ใช่ "หลังเริ่มคลาส" ตรง ๆ ตามถ้อยคำ TUTORING.md §3.9 — ปรับให้ตรง D-A) |
| อื่น (`PendingPayment`, `Confirmed`, `CancelledBy*`, `Expired`, `Disputed`) | — | ⇒ null |
- ไม่พบ decision row ของ no-show (ข้อมูลผิดปกติ) ⇒ fallback `decidedAt = session.ENDS_AT_UTC` + log Warning
- **ปล่อยเงินเร็ว (learner confirm-completed / `ReleaseEarlyAsync`)** ไม่ย่นหน้าต่าง (P13-10 §6.3: ยังเปิด dispute ได้) — หน้าต่างคำนวณจากสูตรเสมอ ไม่ใช่จาก `ESCROW_RELEASE_AT_UTC` · ถ้าเงินเข้า batch ไปแล้ว ⇒ `Freeze` ตอบ `TooLate` ⇒ §6.1 ข้อ 8
- เทสต์เวกเตอร์: ends 10:00, completed 10:05, window 24 ⇒ ถัดไป 10:05 ; no-show ตัดสิน 10:15 (คลาส 10:00–11:00) ⇒ `max(11:00,10:15)+24h` = ถัดไป 11:00 ; `now == windowEnd` เปิดได้, `+1 ms` ปิด ; `DisputeWindowHours=0` ⇒ `max(ends, decided)` (เปิดได้เฉพาะ ≤ ขณะนั้น)

### 3.2 ตารางสิทธิ์: สถานะ booking × ผู้เปิด ⇒ flow + หมวดที่อนุญาต (`DisputeEligibility`, pure, unit test ทุกแถว)

| `booking.STATUS` | ผู้เปิด | `FLOW` | หมวดที่อนุญาต | เหตุผล |
|---|---|---|---|---|
| `Completed` | Learner | `Escrow` | `NoClass`, `TutorConnection`, `Behavior`, `NotAsDescribed`, `Other` | |
| `Completed` | Tutor | `Escrow` | `NoClass`, `TutorConnection`, `Behavior`, `Other` (ไม่มี `NotAsDescribed`) | `Tutoring:Disputes:TutorMayOpenOnCompleted` (default true) — **หมายเหตุ:** escrow ถูก freeze ซึ่งหน่วงเงินของติวเตอร์เอง (UI ต้องเตือน) |
| `NoShowLearner` | Learner | `Escrow` | `NoClass`, `TutorConnection`, `Other` | ผู้เรียก "อยู่แต่ถูกบันทึกว่าไม่มา" — เงินยังอยู่ใน escrow ⇒ freeze ได้ |
| `NoShowLearner` | Tutor | — | ไม่อนุญาต (`role_not_allowed`) | ติวเตอร์ได้เงินเต็มอยู่แล้ว |
| `NoShowTutor` | Tutor | `AttendanceAppeal` | `NoClass`, `TutorConnection`, `Other` | ผู้เรียกได้คืนเต็มแล้ว (P13-10 §4.4 ข้อ 6: ทางแก้คือกลับโทษ/ชดเชย ไม่ดึงเงินคืน) |
| `NoShowTutor` | Learner | — | ไม่อนุญาต | ได้เงินคืนเต็มแล้ว |
| `NoShowBoth` | Tutor | `AttendanceAppeal` | `NoClass`, `TutorConnection`, `Other` | |
| `NoShowBoth` | Learner | — | ไม่อนุญาต | |
- ผู้เปิดเลือก category นอกตาราง ⇒ 400 `tutoring.dispute_category_invalid` (ext `allowed`) · role ไม่อนุญาต ⇒ 409 `tutoring.dispute_role_not_allowed`
- `PRIORITY=High` เมื่อ: `CATEGORY=Behavior` **หรือ** `REPEAT_COMPLAINT_FLAG` **หรือ** (`learner.IS_MINOR` และ `CATEGORY ∈ {Behavior, NotAsDescribed}`) (§7.1)

### 3.3 ตัวตรวจ pre-flight ทั้งหมด (`DisputeService.OpenAsync`, ตามลำดับ — คืน error แรกที่พบ)
```
 1 feature flag Tutoring:Disputes:Enabled=false                             → 404 tutoring.not_found
 2 resolve (ไม่ล็อก, ownership ใน WHERE): learner route → b.LEARNER_USER_ID=@caller ; tutor route → b.TUTOR_ID ∈ (SELECT TUTOR_ID FROM TUTOR_PROFILES WHERE USER_ID=@caller)
                                                                             → ไม่พบ/ไม่ใช่ของฉัน: 404 tutoring.booking_not_found (ไบต์เดียวกับ P13-05 §8)
 3 validate request (§5.2)                                                   → 400
 4 เพดานผู้ใช้: นับ DISPUTES ที่ OPENED_BY_USER_ID=@caller ∧ STATUS ∈ (Open,UnderReview) ≥ MaxOpenPerUser(5) → 409 tutoring.dispute_limit_reached
 5 UoW.ExecuteInTransactionAsync → ล็อก session → ล็อก booking (อ่านสถานะซ้ำหลังล็อก) → (§6.1)
 6 มี DISPUTES ของ booking ที่ STATUS<>'Withdrawn' → Open/UnderReview: 409 tutoring.dispute_already_open ext {disputeId} · Resolved/Rejected: 409 tutoring.dispute_already_decided ext {disputeId}
   (ถ้า retry ซ้ำด้วย CLIENT_REQUEST_ID เดิม ⇒ คืน dispute เดิม 200 — idempotent, ก่อนข้อนี้)
 7 count(Withdrawn ของ booking) ≥ 1 + MaxWithdrawnPerBooking(1)  → 409 tutoring.dispute_reopen_not_allowed
 8 status/role/flow ตาม §3.2: status ไม่อยู่ในตาราง → 409 tutoring.dispute_not_available ext {bookingStatus}; role ไม่ได้ → 409 tutoring.dispute_role_not_allowed
 9 window: DisputeWindowPolicy → ปิดแล้ว → 409 tutoring.dispute_window_closed ext {windowEndedAtUtc}
```

---

## 4. โดเมนที่เพิ่มบน `TUTOR_BOOKING` (P13-05 อนุญาตไว้ — ผู้ลงมือ P13-14 เพิ่มในไฟล์ entity แบบ additive + unit test)

```csharp
/// Disputed → restoredStatus (ต้อง ∈ {Completed, NoShowLearner, NoShowTutor, NoShowBoth} และเท่ากับ DISPUTES.BOOKING_STATUS_AT_OPEN) ; อื่นๆ ⇒ InvalidOperationException
public void ResolveDispute(BookingStatus restoredStatus);
```
- **ไม่เปลี่ยน** `COMPLETED_AT_UTC`, `PRICE_AMOUNT`, `REFUNDED_AMOUNT` (เขียนโดย P13-08) · ไม่แตะ `ESCROW_STATE` (P13-08 ผ่าน `ResolveDisputeAsync`/`UnfreezeEscrowAsync`) · เมทริกซ์ 10×10 ของ P13-05: เพิ่มกลุ่มทดสอบของเมธอดนี้ (4 คู่ผ่าน, ที่เหลือโยน) — `MarkDisputed()` เดิมไม่แก้
- เหตุผลที่คืนสถานะเดิมแทนสถานะใหม่: enum `BookingStatus` ถูกใช้เป็น "ข้อเท็จจริงการเข้าเรียน" (Completed/NoShow*) ส่วน "ผลทางเงิน" อยู่ที่ `REFUNDS`/`REFUNDED_AMOUNT`/`DISPUTES.RESOLUTION` — เปลี่ยนสถานะเป็นอย่างอื่นจะทำลาย invariant ของ P13-10 (รีวิว/สถิติ/dashboard); คืนเต็มแล้ว `Completed` + `REFUNDED_AMOUNT = PRICE` ⇒ P13-13 ไม่นับรีวิว (predicate §5.1)
- `AttendanceOverturned` **ไม่** เปลี่ยน `NoShowTutor` เป็น `Completed` (ผู้เรียกได้เงินคืนไปแล้ว ย้อนไม่ได้) — บันทึกที่ `DISPUTES.ATTENDANCE_OVERTURNED`

---

## 5. API (controller: `TutoringDisputesController` (ผู้เรียก), `TutorDisputesController` (ติวเตอร์), `AdminTutoringDisputesController` ใต้ `Siri.Api/Controllers/Tutoring/`; base `/api/tutoring`)

กฎร่วม (บังคับ): ทุก action ใส่ `[Authorize]`/policy ชัดเจน (ไม่มี fallback) · `userId` จาก `IUserContext` **เท่านั้น** (ไม่มีใน body/query/route) · ownership อยู่ใน WHERE เดียวกับการดึงข้อมูล · ไม่พบ/ไม่ใช่ของฉัน ⇒ **404 ตัวเดียวกัน** (`tutoring.dispute_not_found` สำหรับ id ของ dispute, `tutoring.booking_not_found` สำหรับ id ของ booking — static instance เดียวต่อ reason) · response ทุกตัวของงานนี้ `Cache-Control: no-store` · error = RFC 9457 + `reason` · `[EndpointName]`+`[EndpointSummary]`+`[ProducesResponseType]` ครบ · enum เป็น string · เวลา UTC `…Z`
**Rate limit (partition ต่อผู้ใช้; ไม่มี policy ใหม่):** ทุก endpoint = `tutoring-user` (60/นาที) · **ห้าม `default`/`auth`/`webhook`**
**Policy (README §5.1 — เพิ่มแถวของงานนี้):** ผู้เรียก `[Authorize]` · ติวเตอร์ **`InstructorOnly`** (ตั้งใจ — ติวเตอร์ที่ถูกระงับต้องอุทธรณ์/ติดตามเคสได้) · admin `AdminOnly`

### 5.1 ผู้เรียก (`[Authorize]`)
| # | Method + path | สำเร็จ | Error |
|---|---|---|---|
| 1 | `GET /bookings/{bookingId:guid}/dispute` | 200 `BookingDisputeState` | 404 `tutoring.booking_not_found` |
| 2 | `POST /bookings/{bookingId:guid}/dispute` body `OpenDisputeRequest` | 201 `DisputeDetail` + `Location: /api/tutoring/disputes/{id}` (idempotent ด้วย `clientRequestId` ⇒ 200 เคสเดิม) | 404 `booking_not_found` · 409 `dispute_not_available` / `dispute_role_not_allowed` / `dispute_window_closed` / `dispute_already_open` / `dispute_already_decided` / `dispute_reopen_not_allowed` / `dispute_limit_reached` / `concurrent_update` · 400 `validation` / `dispute_category_invalid` / `dispute_text_*` / `dispute_evidence_link_invalid` / `dispute_too_many_links` · 409 `tutoring.escrow_unavailable` (Freeze ล้มด้วยเหตุอื่นนอกจาก TooLate) · 429 |
| 3 | `GET /disputes?status=&page=1&pageSize=20` | 200 `PagedResult<DisputeListItem>` (ของผู้ใช้: `LEARNER_USER_ID=@caller`; เรียง `OPENED_AT_UTC DESC`; pageSize ≤50) | 400 |
| 4 | `GET /disputes/{disputeId:guid}` | 200 `DisputeDetail` | 404 `tutoring.dispute_not_found` |
| 5 | `POST /disputes/{disputeId:guid}/messages` body `PostDisputeMessageRequest` | 201 `DisputeMessage` (idempotent ด้วย `clientMessageId` ⇒ 200 ข้อความเดิม) | 404 · 409 `dispute_closed` / `dispute_message_limit` / `concurrent_update` · 400 `dispute_text_*` / `dispute_evidence_link_invalid` / `dispute_too_many_links` |
| 6 | `POST /disputes/{disputeId:guid}/withdraw` body `WithdrawDisputeRequest` | 200 `DisputeDetail` | 404 · 409 `dispute_closed` / `dispute_withdraw_not_allowed` (ext `reason`: `not_opener`\|`other_party_posted`\|`behavior`\|`admin_decided`) / `concurrent_update` |
- ข้อ 3–6 หา dispute ด้วย `D.DISPUTE_ID=@id AND D.LEARNER_USER_ID=@caller` ในคำสั่งเดียว (ผู้เรียกเห็นเฉพาะเคสของ booking ตัวเอง **ไม่ว่าใครเป็นผู้เปิด**)

### 5.2 ติวเตอร์ (`[Authorize(Policy = AuthorizationPolicyNames.InstructorOnly)]`)
| # | Method + path | สำเร็จ | Error |
|---|---|---|---|
| 7 | `GET /tutor/bookings/{bookingId:guid}/dispute` | 200 `BookingDisputeState` | 404 `booking_not_found` |
| 8 | `POST /tutor/bookings/{bookingId:guid}/dispute` | 201 `DisputeDetail` | เหมือนข้อ 2 |
| 9 | `GET /tutor/disputes?status=&page&pageSize` | 200 `PagedResult<DisputeListItem>` (`D.TUTOR_ID = โปรไฟล์ของ caller`) | 404 `tutoring.tutor_profile_not_found` เมื่อยังไม่มีโปรไฟล์ติวเตอร์ ⇒ **ตอบรายการว่าง** (ไม่ error) |
| 10 | `GET /tutor/disputes/{disputeId:guid}` | 200 `DisputeDetail` | 404 `dispute_not_found` |
| 11 | `POST /tutor/disputes/{disputeId:guid}/messages` | 201 `DisputeMessage` | เหมือนข้อ 5 |
| 12 | `POST /tutor/disputes/{disputeId:guid}/withdraw` | 200 `DisputeDetail` | เหมือนข้อ 6 |
- ติวเตอร์ "เป็นเจ้าของ" = `TUTOR_PROFILES.USER_ID = caller` join `D.TUTOR_ID` ในคำสั่งเดียว · **ติวเตอร์ไม่เห็น** `LEARNER_USER_ID`, อีเมล/ชื่อบัญชีผู้ปกครอง, ข้อความ `Internal`; เห็นผู้เรียกเป็น `TutorVisibleLearner {nickname, gradeLevel, isMinor}` เท่านั้น (P13-05 §6.1)

### 5.3 Admin (`[Authorize(Policy = AuthorizationPolicyNames.AdminOnly)]`)
| # | Method + path | สำเร็จ | Error |
|---|---|---|---|
| 13 | `GET /admin/disputes/summary` | 200 `AdminDisputeSummary` | |
| 14 | `GET /admin/disputes?status=&category=&flow=&priority=&overdue=&assignedToMe=&needsFollowUp=&tutorId=&q=&sort=&page=1&pageSize=20` | 200 `PagedResult<AdminDisputeListItem>` (pageSize ≤100; default `status=Open,UnderReview`; `sort`: `sla` (default: `PRIORITY` DESC, `SLA_DUE_AT_UTC` ASC) \| `newest` \| `oldest` \| `activity`; `q` = `DISPUTE_NO` หรือ `BOOKING_NO` แบบเท่ากัน) | 400 |
| 15 | `GET /admin/disputes/{disputeId:guid}` | 200 `AdminDisputeDetail` | 404 `dispute_not_found` |
| 16 | `POST /admin/disputes/{disputeId:guid}/claim` body `ClaimDisputeRequest(bool TakeOver)` | 200 `AdminDisputeDetail` (`Open→UnderReview`; claim ซ้ำโดยคนเดิม ⇒ 200) | 404 · 409 `dispute_claimed_by_other` (ถ้าไม่ `TakeOver`) / `dispute_closed` / `concurrent_update` |
| 17 | `POST /admin/disputes/{disputeId:guid}/messages` body `AdminPostMessageRequest(Guid ClientMessageId, string Body, DisputeVisibility Visibility, IReadOnlyList<EvidenceLinkInput>? EvidenceLinks)` | 201 `AdminDisputeMessage` | 404 · 409 `dispute_closed` (เฉพาะ `Visibility=Parties`; `Internal` โพสต์ได้ทุกสถานะ) · 400 |
| 18 | `POST /admin/disputes/{disputeId:guid}/decide` body `DecideDisputeRequest` | 200 `AdminDisputeDetail` (+ `alreadyDecided`) | 404 · 409 `dispute_not_decidable` / `tutoring.refund_exceeds_cap` (+`maxRefundable`) / `dispute_no_refundable_amount` / `concurrent_update` · 400 `dispute_decision_invalid` |
| 19 | `POST /admin/disputes/{disputeId:guid}/compensation-settled` body `{ note }` | 200 `AdminDisputeDetail` (`COMPENSATION_SETTLED_AT_UTC=now`; ต้อง `COMPENSATION_REQUIRED`) | 404 · 409 `dispute_no_compensation_required` |
- admin เห็นข้อความ `Internal` + ทุก field ที่ไม่เป็นความลับระบบ · **admin ไม่เห็นอีเมลผู้ปกครอง** ในงานนี้ (ติดต่อผ่านข้อความ Parties → อีเมลแจ้งเตือนออกจากระบบ)

### 5.4 Request / validation (FluentValidation ผูกผ่าน `ValidationActionFilter`)
- `OpenDisputeRequest(DisputeCategory Category, string Description, IReadOnlyList<EvidenceLinkInput>? EvidenceLinks, Guid ClientRequestId)` — `Description` 10–2000 หลัง trim · `ClientRequestId` ≠ empty · `EvidenceLinkInput(string Url, string? Label)`
- `PostDisputeMessageRequest(Guid ClientMessageId, string Body, IReadOnlyList<EvidenceLinkInput>? EvidenceLinks)` — `Body` 1–2000
- `WithdrawDisputeRequest(string? Note)` ≤500 (เก็บเป็น system message code เท่านั้น — ข้อความอิสระไม่เก็บ; `Note` ใช้ใน audit เฉพาะความยาว 0/ไม่ 0) → **ตัด `Note` ออกจาก v1** (ไม่มีช่องข้อความอิสระตอนถอน) ⇒ `WithdrawDisputeRequest()` ว่าง
- `DecideDisputeRequest(DisputeDecision Decision /*Resolve|Reject*/, DisputeResolution? Resolution, decimal? RefundAmount, bool AttendanceOverturned, bool CompensationRequired, string Note /*3–1000*/, bool SuspendTutor, string? SuspendReason /*3–1000 บังคับเมื่อ SuspendTutor*/)` — กฎ:
  - flow `Escrow` + `Resolve`: `Resolution` บังคับ; `PartialRefund` ⇒ `RefundAmount` 2 ตำแหน่ง `> 0`; `FullRefund`/`NoRefund` ⇒ `RefundAmount` ต้อง null · `Reject` ⇒ `Resolution` ต้อง null (ระบบตั้ง `NoRefund`)
  - flow `AttendanceAppeal`: `Resolution`/`RefundAmount` ต้อง null (ห้ามคืนเงิน — 400 `tutoring.dispute_appeal_no_refund` ถ้ามี) · `AttendanceOverturned`/`CompensationRequired` ใช้ได้เฉพาะ `Resolve`
  - flow `Escrow`: `AttendanceOverturned`/`CompensationRequired` ต้อง false
  - `Note` ผ่านกฎข้อความ §5.5 (ผู้ใช้ทั้งสองฝ่ายเห็น)
- **กฎข้อความ (`DisputeTextRules`, ทุกข้อความของฝ่ายผู้ใช้):** `TutoringTextRules.StripControlChars` · `ContainsMarkup` ⇒ 400 `tutoring.text_contains_markup` · `MeetingLinkText.Scrub` (แทนลิงก์ห้องด้วย placeholder ไม่ปฏิเสธ) · `Tutoring:Disputes:RejectContactInfo=true` ⇒ `ContainsContactInfo` ⇒ 400 `tutoring.dispute_text_contains_contact` (กันย้ายสนทนานอกแพลตฟอร์ม — ความปลอดภัยผู้เยาว์; **admin ไม่ถูกตรวจข้อนี้**) · ข้อความ admin/Note: ตรวจเฉพาะ markup + ความยาว
- **ลิงก์หลักฐาน (`EvidenceLinkInput`):** `EvidenceLinksEnabled=true` · ≤ `MaxEvidenceLinksPerDispute` (10) รวมทั้งเคส ⇒ 400 `tutoring.dispute_too_many_links` · `Url` ≤500, สร้างด้วย `Uri.TryCreate(Absolute)` scheme **https เท่านั้น**, ไม่มี userinfo (`user:pass@`), host ไม่ใช่ IP literal/`localhost`/`*.local`/`*.internal`, ไม่ใช่โฮสต์ห้องประชุม (`MeetingLinkText.ContainsLink`), ถ้า `AllowedEvidenceHosts` ไม่ว่าง ⇒ host ต้องตรง/เป็น sub-domain ของรายการ ⇒ ไม่ผ่าน 400 `tutoring.dispute_evidence_link_invalid` · `Label` ≤120 ผ่านกฎข้อความ · เก็บค่า normalized (`Uri.AbsoluteUri`) · **ไม่ fetch URL ฝั่งเซิร์ฟเวอร์ (ไม่มี SSRF)**; FE/แอดมินเปิดผ่าน `<a rel="noopener noreferrer nofollow" target="_blank">` และแสดง host ให้เห็นก่อนคลิก

---

## 6. Orchestration (ขอบเขต transaction + ลำดับ lock D-B — **บังคับ**)

**ลำดับ lock (ต่อยอด README §7.2):** `TUTOR_SESSIONS → TUTOR_BOOKINGS (BOOKING_ID ASC) → DISPUTES → TUTOR_REVIEWS → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS → PAYMENTS → REFUNDS → Payout splits → TUTOR_PROFILES` (เพิ่ม `DISPUTES` ต่อจาก `TUTOR_BOOKINGS` ⇒ เพิ่มแถวใน README §8) · flow ที่ไม่ต้องแตะ booking (โพสต์ข้อความ) ล็อกแค่ `DISPUTES` · **ห้ามเรียก HTTP ภายนอกขณะถือ txn/lock** (Stripe ถูกเรียกหลัง commit โดย `ExecuteAsync`)

### 6.1 `OpenAsync` (ผู้เรียก/ติวเตอร์) — `ITutoringUnitOfWork.ExecuteInTransactionAsync` ครอบข้อ 3–12
```
 1 pre-read (ไม่ล็อก) ตาม §3.3 ข้อ 1-4 → booking, session, tutor, learner profile (IS_MINOR), decision (DECIDED_AT_UTC)
 2 ล็อก session → ล็อก booking → อ่านสถานะซ้ำ (ใช้ค่าที่ล็อก)
 3 ตรวจ §3.3 ข้อ 6-9 (dispute ที่มีอยู่ / reopen cap / role×status / window)
 4 สร้าง DISPUTE_ID (UuidV7), DISPUTE_NO, คำนวณ PRIORITY, SLA_DUE_AT_UTC, repeat flag (§7.2)
 5 flow=Escrow ∧ amountAtStake>0 ∧ ESCROW_STATE ∉ {Reversed,None}:
      r = BookingSettlementService.FreezeEscrowAsync(new FreezeEscrowCommand(bookingId, disputeId, callerUserId))
      Success (รวม AlreadyApplied)       → ESCROW_FREEZE='Frozen'   (booking ถูก P13-08 ตั้ง Disputed แล้ว)
      Failure reason tutoring.escrow_already_released → ESCROW_FREEZE='TooLate' ; booking.MarkDisputed() เอง ; เพิ่ม system message 'escrow_too_late' ; log Warning + metric
      Failure อื่น → throw DisputeAbortException(error) → rollback → 409 tutoring.escrow_unavailable (ไม่เขียนอะไร)
    ไม่ใช่ข้างบน (flow=AttendanceAppeal | ฟรี/ไม่มียอด | Reversed):
      ESCROW_FREEZE='NotApplicable' ; booking.MarkDisputed()
 6 INSERT DISPUTE (+ DISPUTE_EVIDENCE_LINKS ตอนเปิด, MESSAGE_ID=null) + system message 'opened' (Parties)
 7 stage แจ้งเตือน (§8): ฝ่ายตรงข้าม (อีเมล+in-app) + ผู้เปิด (อีเมลยืนยัน+in-app)
 8 ISecurityAuditContract.RecordAuditAsync("tutoring.dispute.opened", callerUserId, json{disputeId, bookingId, category, flow, role, escrowFreeze, priority}, ip)   ← ขั้นสุดท้าย = commit
 COMMIT
 9 หลัง commit: telemetry; best-effort ไม่มี I/O ภายนอก
```
- ชน `UQ_DISPUTES_BOOKING_ACTIVE` (race ที่ผ่าน pre-check) ⇒ `ex.IsUniqueViolation("UQ_DISPUTES_BOOKING_ACTIVE")` → rollback → โหลดเคสที่ชนะแล้วตอบ 409 `dispute_already_open` ext `disputeId` (ผู้ปกครองกับติวเตอร์เปิดพร้อมกัน ⇒ ผู้แพ้ได้ id ไปเข้าเธรดเดียวกัน) · ชน `UQ_DISPUTES_CLIENT_REQUEST` ⇒ คืนเคสเดิม 200
- `DbUpdateConcurrencyException` ⇒ retry หน่วยงานทั้งก้อน 1 ครั้ง (scope ใหม่ + `ChangeTracker.Clear()`) ⇒ ยังชน ⇒ 409 `tutoring.concurrent_update`
- **ผลข้างเคียงบนบริการอื่นที่ต้องไม่ทำงาน:** `confirm-completed` (P13-10 §6.3) บน `Disputed` ⇒ 409 `confirm_not_available`; `ReleaseEarlyAsync` Frozen ⇒ no-op; `CancelByLearner` (รับเฉพาะ Confirmed/PendingPayment) ไม่ทับกัน; finalize job ข้าม booking terminal; รีวิว (P13-13) ไม่รับ `Disputed`

### 6.2 `PostMessageAsync` (ผู้เรียก/ติวเตอร์) — txn สั้น
`SELECT … FROM DISPUTES WHERE DISPUTE_ID=@id AND <party predicate> FOR UPDATE` (ล็อกเฉพาะแถว dispute) → STATUS ∉ (Open, UnderReview) ⇒ 409 `dispute_closed` → `CLIENT_MESSAGE_ID` ซ้ำ ⇒ คืนข้อความเดิม 200 → เพดาน `MaxMessagesPerParty` (50 ต่อ role ต่อเคส) ⇒ 409 `dispute_message_limit` → INSERT message (`Parties`) + evidence links (เพดานรวม) → `LAST_ACTIVITY_AT_UTC`, `LAST_MESSAGE_ROLE` → stage in-app ถึงฝ่ายตรงข้าม (+ถึง admin ผู้รับเคสไม่มี — ใช้คิว) → `SaveChanges` (ไม่มี audit ของข้อความปกติ) · ชน `UQ_DISPUTE_MESSAGES_CLIENT` ⇒ โหลดเดิม

### 6.3 `AdminDisputeService.DecideAsync` — `ITutoringUnitOfWork.ExecuteInTransactionAsync`
```
 1 pre-read dispute (ไม่ล็อก) → sessionId, bookingId, tutorId, flow     (ไม่พบ ⇒ 404 tutoring.dispute_not_found)
 2 ล็อก session → ล็อก booking → ล็อก DISPUTES (FOR UPDATE) → อ่านซ้ำ
 3 STATUS ∈ (Resolved, Rejected) ∧ คำตัดสินเดียวกัน (Decision, Resolution, RefundAmount) ⇒ 200 alreadyDecided=true (ไม่ทำซ้ำ) ; ต่างกัน ⇒ 409 dispute_not_decidable
    STATUS = Withdrawn ⇒ 409 dispute_not_decidable ; booking.STATUS ≠ Disputed ⇒ 409 dispute_not_decidable (ข้อมูลผิดปกติ — log Error)
 4 flow=Escrow:
     resolutionKind = Reject ? NoRefund : request.Resolution
     remaining = booking.PRICE_AMOUNT − booking.REFUNDED_AMOUNT
     FullRefund: remaining ≤ 0 ⇒ 409 dispute_no_refundable_amount ; amount = remaining
     PartialRefund: amount > remaining ⇒ 409 tutoring.refund_exceeds_cap ext {maxRefundable = remaining}
     booking แพ็กเกจ (PACKAGE_PURCHASE_ID ≠ null): IPackageCreditService.LockPurchaseAsync(purchaseId)   (ก่อน payment ตาม chain)
     o = BookingSettlementService.ResolveDisputeAsync(new ResolveDisputeCommand(bookingId, disputeId, resolutionKind, amountOrNull, adminUserId, note))
         o.IsFailure ⇒ throw DisputeAbortException(o.Error)  (P13-08 §4 (ง)) ; Success ⇒ refundId = o.Value.RefundId, refundAmount = o.Value.RefundAmount
     FullRefund ∧ แพ็กเกจ ⇒ IPackageCreditService.MarkCreditRefundedAsync(bookingId)  (Partial: เครดิตคง Consumed — P13-12 §7 ตาราง)
 5 flow=AttendanceAppeal:
     ไม่มีขั้นเงิน ; AttendanceOverturned ∧ มีโทษ NoShow ที่ไม่ void ของ session (IDisputeRepository.HasActiveNoShowPenaltyAsync(sessionId)) ⇒ TutorReliabilityUpdater.VoidPenaltyAsync(sessionId, NoShow, adminUserId, note) ;
     Failure ⇒ throw DisputeAbortException ; (เรียก **หลัง** ขั้นอื่นเพราะเขียน TUTOR_PROFILES ท้าย chain)
 6 booking.ResolveDispute(dispute.BOOKING_STATUS_AT_OPEN)   (§4)
 7 dispute.Decide(...) : STATUS = Reject ? Rejected : Resolved ; RESOLUTION, REFUND_AMOUNT, REFUND_ID, ATTENDANCE_OVERTURNED, PENALTY_VOIDED, COMPENSATION_REQUIRED, DECIDED_*, DECISION_NOTE, LAST_ACTIVITY ; system message 'decided' (Parties)
 8 มีรีวิวของ booking นี้ (SELECT EXISTS) ∧ flow=Escrow ∧ amount>0 ⇒ TutorRatingService.RecomputeAsync(tutorId)  (P13-13 §5 — ล็อก TUTOR_PROFILES ท้ายสุด)
 9 stage แจ้งเตือน §8 (ผลถึงทั้งสองฝ่าย อีเมล+in-app)
10 RecordAuditAsync("tutoring.dispute.resolved"|"tutoring.dispute.rejected", adminUserId, json{disputeId, bookingId, flow, resolution, refundAmount, refundId, attendanceOverturned, penaltyVoided, compensationRequired}, ip)   ← commit
COMMIT
11 หลัง commit (ทุกขั้น best-effort, ล้มไม่ทำให้การตัดสินล้ม): ITutorPublicCacheInvalidator.InvalidateProfilesAsync (+InvalidateReviewsAsync ถ้าเรียก Recompute) ;
   ถ้า refundId ≠ null ⇒ TutoringRefundService.ExecuteAsync(refundId) (timeout รวม ≤10 วิ; ล้ม/ช้า ⇒ job tutoring-refund-process รับช่วง)
12 ระงับติวเตอร์ (txn แยก — F7): ถ้า request.SuspendTutor ⇒ TutorModerationService.SuspendAsync(adminUserId, tutorId, request.SuspendReason, ip, ct)
      หรือ auto: เมื่อ AutoSuspendUpheldThreshold>0 ∧ จำนวน disputes ที่ RESOLUTION∈(Full,Partial) ของ tutorId ใน RepeatComplaintWindowDays ≥ threshold
      ⇒ SuspendAsync(adminUserId, tutorId, $"auto:disputes_upheld_ge_{n}", ip, ct)
      ผล: AdminDisputeDetail.tutorSuspension = 'Done'|'SkippedNotVerified'|'Failed'|'NotRequested' (ไม่ใช่ Verified ⇒ InvalidTransition ⇒ Skipped ; Failed ⇒ log Error + ให้ admin ลองใหม่ผ่าน endpoint ระงับเดิม)
```
`DisputeAbortException(DomainError Error)` (internal, Application): throw ภายใน lambda ของ UoW เพื่อ rollback; `DecideAsync` จับนอก UoW แล้วคืน `Result.Failure(error)` — **ไม่กลืน exception อื่น**

### 6.4 `WithdrawAsync` (ผู้เปิดเท่านั้น) — ExecuteInTransaction
ล็อก session → booking → DISPUTES (อ่านซ้ำ) → เงื่อนไขถอน (ทุกข้อต้องผ่าน มิฉะนั้น 409 `dispute_withdraw_not_allowed` ext `reason`): ผู้เรียกคือ `OPENED_BY_USER_ID` (`not_opener`) · STATUS ∈ (Open, UnderReview) (`dispute_closed`) · **ฝ่ายตรงข้าม (Learner/Tutor ที่ไม่ใช่ผู้เปิด) ยังไม่เคยโพสต์ข้อความ `Message`** (`other_party_posted`) · `CATEGORY ≠ Behavior` (`behavior` — เคสพฤติกรรม/ความปลอดภัยปิดได้โดย admin เท่านั้น ป้องกันการกดดันให้ถอน) · admin ยังไม่ตัดสิน (`admin_decided`)
- flow=Escrow ∧ ESCROW_FREEZE='Frozen': `UnfreezeEscrowAsync(new UnfreezeEscrowCommand(bookingId, disputeId, callerUserId, ReleaseAtUtc: windowEnd > now ? windowEnd : null))` (F4) ; Failure ⇒ throw Abort
- `TooLate`/`NotApplicable`/appeal ⇒ ไม่มีขั้นเงิน
- `booking.ResolveDispute(BOOKING_STATUS_AT_OPEN)` → `dispute.Withdraw(userId, clock)` (system message 'withdrawn') → stage in-app+อีเมลถึงฝ่ายตรงข้าม → audit `tutoring.dispute.withdrawn` (ท้าย = commit)

### 6.5 `claim` / `compensation-settled` / admin message
- `claim`: ล็อก DISPUTES → `Open→UnderReview` (`ASSIGNED_TO_USER_ID`, `ASSIGNED_AT_UTC`) + system message 'claimed' (Parties) + in-app ถึงสองฝ่าย ("กำลังตรวจสอบ") · `UnderReview` โดยคนอื่น + `TakeOver=false` ⇒ 409 · audit `tutoring.dispute.claimed`
- `compensation-settled`: ตั้ง `COMPENSATION_SETTLED_AT_UTC` ; audit `tutoring.dispute.compensation_settled` (detail: disputeId) — **ระบบไม่โอนเงินชดเชยเอง**: admin จัดการนอกระบบ (เช่น โอนตรง/ลด commission) แล้วกดยืนยัน ⇒ ปิดรายการใน `needsFollowUp`
- admin message `Parties`: ต้อง open ; stage อีเมล+in-app ถึงสองฝ่าย ; `Internal`: ไม่แจ้งใคร ; ทั้งสองแบบ audit `tutoring.dispute.admin_message` (detail: disputeId, visibility — **ไม่มีเนื้อหา**) เป็นขั้นสุดท้าย

### 6.6 ความขัดแย้ง (concurrency) — ต้องมีเทสต์ทุกแถว
| สถานการณ์ | กลไก | ผล |
|---|---|---|
| ผู้เรียก+ติวเตอร์เปิดพร้อมกัน | ล็อก session→booking; `UQ_DISPUTES_BOOKING_ACTIVE` เป็น backstop | ผู้ชนะ 201 ; ผู้แพ้ 409 `dispute_already_open` ext `disputeId` |
| ดับเบิลคลิกเปิด | `UQ_DISPUTES_CLIENT_REQUEST` | เคสเดิม 200 |
| เปิด dispute vs confirm-completed / finalize / cancel | ล็อก booking เดียวกัน; อ่านสถานะซ้ำหลังล็อก | ผู้แพ้เห็นสถานะใหม่ ⇒ 409 ตามเงื่อนไข (confirm: `confirm_not_available`) |
| เปิด dispute vs weekly payout batch | `Freeze` ใต้ lock Payout; ชนะ batch ⇒ `TooLate` | dispute เปิดได้ `ESCROW_FREEZE='TooLate'` → แก้ด้วย refund+adjustment รอบหน้า |
| decide สองแอดมินพร้อมกัน | ล็อก DISPUTES; คนที่สองเห็น terminal | คำตัดสินเหมือนกัน ⇒ 200 alreadyDecided ; ต่างกัน ⇒ 409 |
| decide vs withdraw | ล็อก DISPUTES; คนที่สองเห็น terminal | withdraw ⇒ 409 `dispute_closed` ; decide ⇒ 409 `dispute_not_decidable` |
| decide ซ้ำหลัง refund ถูกสร้างแล้ว | key `refund:{bookingId}:DisputeResolved:{disputeId:N}` (P13-08) | ไม่คืนซ้ำ |
| Stripe ล่มหลัง commit | `REFUNDS` `Requested` + job | การตัดสินคงอยู่ ; ผู้ใช้เห็นสถานะคืนเงินจาก endpoint ของ P13-08 |
| P13-08 ตอบ Failure กลาง decide | `DisputeAbortException` → rollback ทั้งก้อน | booking ยัง `Disputed` ; dispute ยังเปิด |

---

## 7. ผลลัพธ์ธุรกิจ: ปิดหน้าต่าง / aging / ธงซ้ำ / ระงับ

### 7.1 เมื่อหน้าต่างปิดขณะมีข้อพิพาทเปิดอยู่ (กำหนดเป๊ะ)
1. **หน้าต่างควบคุมเฉพาะ "การเปิดเคสใหม่"** — เคสที่เปิดแล้วดำเนินต่อไม่จำกัดเวลา: ผู้ใช้ยังโพสต์ข้อความได้ (ตราบ Open/UnderReview), admin ตัดสินเมื่อใดก็ได้, นาฬิกา SLA/aging เดินต่อ
2. เงินติวเตอร์ **ยัง Frozen** (`AVAILABLE_AT` ถูกล้างตอน freeze จึงไม่เข้า batch) — การผ่านเวลา `windowEnd` **ไม่ปล่อยเงิน** และ `tutoring-refund-reconcile` (ที่ตั้ง `ESCROW_STATE=Released` เมื่อ `ESCROW_RELEASE_AT_UTC<=now`) ไม่แตะแถวที่ `ESCROW_STATE=Frozen` (P13-08 §3.3: ล้างเวลาปล่อยเมื่อ Frozen)
3. **ไม่มี auto-release / auto-resolve / auto-refund ใด ๆ** แม้ admin ไม่ตัดสิน — ระบบออก **อีเมล/metric เตือนค้างนาน** (§7.4) เท่านั้น (ตัดสินใจเชิงนโยบาย: เงินของบุคคลที่สามห้ามเคลื่อนโดยไม่มีมนุษย์ตัดสิน)
4. คนถอนเคสหลังหน้าต่างปิด ⇒ `Unfreeze(ReleaseAtUtc=null)` ปล่อย **ทันที** (ไม่มีเวลารอเหลือ)
5. หน้าต่างปิดแล้วไม่มีเคส ⇒ เงินปล่อยตามเวลาปกติ (ไม่มีงานของ P13-14)
6. สถานะ `Disputed` ของ booking คงอยู่จนกว่าตัดสิน/ถอน (`ResolveDispute`)

### 7.2 ธงร้องเรียนซ้ำ (`REPEAT_COMPLAINT_FLAG`) และระงับติวเตอร์
- นับตอนเปิดเคสที่ `OPENED_BY_ROLE='Learner'`: `count = 1 (เคสนี้) + COUNT(DISTINCT BOOKING_ID) ของ DISPUTES ที่ TUTOR_ID เดียวกัน ∧ OPENED_BY_ROLE='Learner' ∧ FLOW='Escrow' ∧ STATUS NOT IN (Withdrawn, Rejected) ∧ OPENED_AT_UTC ≥ now − RepeatComplaintWindowDays(90)` ; `count ≥ RepeatComplaintThreshold(3)` ⇒ `REPEAT_COMPLAINT_FLAG=true`, `PRIORITY=High`
- **default = ธงเท่านั้น** (admin เห็นใน list/detail: "ติวเตอร์ถูกร้องเรียน N ครั้งใน 90 วัน" + ปุ่มระงับในหน้า detail ซึ่งเรียก `decide` พร้อม `SuspendTutor` หรือเรียก endpoint ระงับเดิมของ P13-01) · `AutoSuspendUpheldThreshold` (default `0` = ปิด) > 0 ⇒ ระงับอัตโนมัติ **หลังตัดสิน** เมื่อจำนวนเคส upheld (Full/Partial) ในหน้าต่าง ≥ threshold (§6.3 ข้อ 12; เหตุผลขึ้นต้น `auto:`)
- hints ใน `AdminDisputeDetail.hints[]` (รหัสคงที่): `minor_learner`, `behavior_complaint`, `repeat_complaint`, `tutor_suspended`, `learner_repeat_rejected` (ผู้เรียกที่เคส NoRefund/Rejected ≥ `LearnerRejectedHintThreshold`(3) ใน 90 วัน — **ไม่ระบุตัวผู้เรียก** เป็นเพียงตัวเลข) , `appeal_penalty_exists`

### 7.3 SLA
`SLA_DUE_AT_UTC = OPENED_AT_UTC + (High ? Tutoring:Disputes:HighPrioritySlaHours (24) : Tutoring:Disputes:SlaHours (72))` · `isOverdue = now > SLA_DUE_AT_UTC ∧ STATUS ∈ (Open, UnderReview)` · ผู้ใช้เห็น `expectedResolutionByUtc = SLA_DUE_AT_UTC` ("เป้าหมายตอบภายใน") — เป็นเป้าหมายบริการ ไม่ใช่การรับประกัน

### 7.4 Job `tutoring-dispute-aging` (ทุก 30 นาที `Cron.MinuteInterval(30)`; `RecurringJobIds.TutoringDisputeAging = "tutoring-dispute-aging"`; `[DisableConcurrentExecution(timeoutInSeconds: 600)]`; Api(`ServerInApi`)/Workers ได้)
1. หาเคส `STATUS IN (Open, UnderReview)` ที่ `AGING_ALERT_LEVEL < levelReached(ageHours)` โดย `AgingAlertHours` default `[24, 48, 72, 168]` (ระดับ 1–4) — `IX_DISPUTES_AGING` · ≤ `AgingBatchSize` (200)
2. ต่อเคส: `UPDATE "TUTORING"."DISPUTES" SET "AGING_ALERT_LEVEL" = @lvl WHERE "DISPUTE_ID" = @id AND "STATUS" IN ('Open','UnderReview') AND "AGING_ALERT_LEVEL" < @lvl` (`ExecuteUpdate` — ไม่หมุน ROW_VERSION โดยตั้งใจ ไม่ชนกับ admin) ; affected=1 ⇒ นับเป็น "เพิ่งข้ามระดับ"
3. รวบเป็น **digest เดียวต่อรอบ**: log Warning (จำนวนเคสต่อระดับ, ยอดเงินที่ค้าง `Σ AMOUNT_AT_STAKE WHERE ESCROW_FREEZE='Frozen'`, ไม่มี PII) + counter `tutoring.disputes.aging_alerts{level}` + ถ้า `Tutoring:Disputes:AlertEmails` ไม่ว่าง ⇒ `IEmailOutbox.Enqueue` หนึ่งฉบับต่อผู้รับ (`tutoring-dispute-aging-digest`, ตัวเลข+ลิงก์ `/admin/tutoring/disputes?overdue=true`) + `SaveChanges`
4. **ไม่ปล่อยเงิน / ไม่ตัดสิน / ไม่เปลี่ยนสถานะเคส** ในทุกกรณี · `AlertEmails` ว่างใน Production ⇒ log Warning ตอน start (ไม่ block boot)

### 7.5 ผู้ใช้ที่ถูก anonymise (P13-17)
ข้ามอีเมลถึงผู้รับที่ `AnonymizedAccount.IsAnonymizedEmail(email)` (F9); in-app ยัง stage ได้ · เมื่อฝ่ายใดถูกลบบัญชี ข้อความของฝ่ายนั้นถูก redact ตาม P13-17 แต่โครงเคส/ผล/จำนวนเงินคงอยู่ · P13-17 บล็อกการลบบัญชีขณะมีเคส Open/UnderReview

---

## 8. แจ้งเตือน (stage ผ่าน `IEmailOutbox`/`IUserNotificationOutbox` ใน unit-of-work เดียวกับการเปลี่ยนสถานะ; ไทย+อังกฤษซ้อนในอีเมลฉบับเดียว; in-app ไทย)

กลไก: `TutoringDisputeMessages` (static pure ใน `Tutoring.Application`, แบบเดียวกับ `TutoringSessionMessages` ของ P13-10) คืน `TutoringMessage(Subject, BodyHtml, TemplateKey, InApp(Type, Title, Body, LinkPath))` · ผู้รับ/อีเมลจาก `IUserContactReader` (ผู้เรียก = `LEARNER_USER_ID`; ติวเตอร์ = `TUTOR_PROFILES.USER_ID`) · ทุก string จาก DB ผ่าน `WebUtility.HtmlEncode` · subject single-line ≤80 · **อีเมลไม่มีเนื้อหาข้อความ/คำอธิบาย/หลักฐานของเคส** (มีหมวด + เลขเคส + ลิงก์เข้าแอป) · ลิงก์ in-app: ผู้เรียก `/my-tutoring/disputes/{id}` · ติวเตอร์ `/instructor/tutoring/disputes/{id}` · admin `/admin/tutoring/disputes/{id}`

| เหตุการณ์ | ผู้รับ | ช่องทาง | templateKey | in-app `type` | ข้อความ in-app (TH) |
|---|---|---|---|---|---|
| เปิดเคส | ฝ่ายตรงข้าม | อีเมล+in-app | `tutoring-dispute-opened-counterparty` | `tutoring.dispute_opened` | `มีการเปิดข้อพิพาทเรื่องคลาส "{title}" ({categoryLabel}) กรุณาตอบกลับภายในเธรด` |
| เปิดเคส | ผู้เปิด | อีเมล+in-app | `tutoring-dispute-opened-opener` | `tutoring.dispute_opened_self` | `รับเรื่องข้อพิพาท {disputeNo} แล้ว ทีมงานจะตอบภายใน {sla} ชม. {frozenNote}` |
| ฝ่ายตรงข้ามโพสต์ | อีกฝ่าย | in-app | — | `tutoring.dispute_message` | `มีข้อความใหม่ในข้อพิพาท {disputeNo}` |
| admin รับเคส | ทั้งสองฝ่าย | in-app | — | `tutoring.dispute_under_review` | `ทีมงานกำลังตรวจสอบข้อพิพาท {disputeNo}` |
| admin ข้อความ (Parties) | ทั้งสองฝ่าย | อีเมล+in-app | `tutoring-dispute-admin-message` | `tutoring.dispute_admin_message` | `ทีมงานส่งข้อความถึงคุณในข้อพิพาท {disputeNo}` |
| ตัดสิน Resolved/Rejected | ทั้งสองฝ่าย | อีเมล+in-app | `tutoring-dispute-resolved-learner` / `-resolved-tutor` | `tutoring.dispute_resolved` | ผลสรุป + (ถ้ามี refund) `ยอดคืนผู้เรียก {amount} บาท` + (ติวเตอร์) `เงินส่วนที่เหลือจะถูกปล่อยตามกำหนด` ; appeal: `ผลการพิจารณาการอุทธรณ์: {upheld|overturned}` ; **ข้อความตัดสินของ admin (`DECISION_NOTE`) แสดงในแอปเท่านั้น ไม่ใส่อีเมล** |
| ถอนเคส | ฝ่ายตรงข้าม | อีเมล+in-app | `tutoring-dispute-withdrawn` | `tutoring.dispute_withdrawn` | `ข้อพิพาท {disputeNo} ถูกถอนโดยผู้เปิดเรื่อง` |
| ค้างนาน (digest) | `AlertEmails` | อีเมล | `tutoring-dispute-aging-digest` | — | — |
- ผู้รับ anonymised ⇒ ข้ามอีเมล (F9) · ติวเตอร์เห็นผู้เรียกเป็นชื่อเล่นเท่านั้นในข้อความ · ไม่มีเบอร์/อีเมลผู้ปกครองในข้อความถึงติวเตอร์ · ข้อความด้านการเงิน (สถานะคืนเงิน) เป็นของ P13-08 (`tutoring-refund-*`) — ไม่ซ้ำที่นี่

---

## 9. Booking DTO (P13-05 ฉบับรวม) — field ใหม่ที่ P13-14 ลงชื่อรับ (additive; owner table ใน P13-05 ถูกเติมแถวแล้ว)

| field | เจ้าของค่า | ความหมาย |
|---|---|---|
| `disputeId: Guid\|null` | P13-14 | id ของข้อพิพาทที่ `STATUS <> Withdrawn` ของ booking นี้ (ถ้ามี) — ผู้เรียกเท่านั้นเห็นของ booking ตัวเอง |
| `disputeWindowEndsAtUtc: IsoUtc\|null` | P13-14 (`DisputeWindowPolicy.WindowEndsAtUtc`) | display hint เท่านั้น: ไม่ null เมื่อ `status ∈ {Completed, NoShowLearner}` (ฝั่งผู้เรียกเปิดได้) ; สิทธิ์จริงตัดสินที่ `POST …/dispute` |
`BookingListItem` เพิ่มสองฟิลด์นี้ด้วย · คำนวณใน query เดียวกับรายการ (LEFT JOIN `DISPUTES` ด้วย `UQ_DISPUTES_BOOKING_ACTIVE`, LEFT JOIN `SESSION_ATTENDANCE_DECISIONS` — ไม่ N+1) · รายละเอียด state เต็มอยู่ที่ `GET bookings/{id}/dispute` (`BookingDisputeState`)

---

## 10. Config / DI / jobs

`TutoringDisputesOptions` (`Tutoring:Disputes`, `IValidateOptions` + `ValidateOnStart`):

| Key | Default | ช่วง / หมายเหตุ |
|---|---|---|
| `Enabled` | `true` | ปิด = ทุก endpoint ผู้ใช้ 404 (admin ยังเห็นเคสเดิม) |
| `TutorMayOpenOnCompleted` | `true` | |
| `MaxOpenPerUser` | `5` | 1–20 |
| `MaxWithdrawnPerBooking` | `1` | 0–5 (เปิดใหม่หลังถอนได้กี่ครั้ง) |
| `MaxMessagesPerParty` | `50` | 5–500 |
| `MaxEvidenceLinksPerDispute` | `10` | 0–50 |
| `EvidenceLinksEnabled` | `true` | |
| `AllowedEvidenceHosts` | `[]` | ว่าง = ทุก host https ที่ผ่านกฎ §5.4 (ใช้ `PostConfigure` อ่าน section ดิบ — กับดัก `Bind()` ต่อท้าย list, P13-06 F9) |
| `RejectContactInfo` | `true` | |
| `SlaHours` / `HighPrioritySlaHours` | `72` / `24` | 1–720 / 1–168 (High ≤ Normal) |
| `AgingAlertHours` | `[24,48,72,168]` | strictly increasing, 1–4 ค่า, 1–2160 |
| `AgingBatchSize` | `200` | 10–1000 |
| `AlertEmails` | `[]` | รูปแบบอีเมลถูกต้อง (≤10) · ว่างใน Production ⇒ log Warning |
| `RepeatComplaintWindowDays` / `RepeatComplaintThreshold` | `90` / `3` | 7–365 / 2–20 |
| `AutoSuspendUpheldThreshold` | `0` | 0 = ปิด ; 2–20 |
| `LearnerRejectedHintThreshold` | `3` | 2–20 |
ใช้ `Tutoring:DisputeWindowHours` (P13-06 §7; ช่วง 0–168) ร่วม · **ไม่มี NuGet package ใหม่ ไม่มี secret ใหม่ ไม่มี rate limit policy ใหม่ ไม่มี production guard ใหม่**
- **DI (`AddTutoringModule`):** `DisputeService`, `AdminDisputeService`, `IDisputeRepository`→`DisputeRepository` (Scoped; ไม่มี `I…Service`) · `DisputeWindowPolicy`/`DisputeEligibility`/`DisputeTextRules` (static pure) · `TutoringDisputeMessages` (static) · validators · Options · `TutoringDisputeAgingJob`
- **Job:** `RecurringJobIds.TutoringDisputeAging` (+ใน `All`) + `AddOrUpdate<TutoringDisputeAgingJob>(…, Cron.MinuteInterval(30))` · section `Tutoring:Disputes` ใน appsettings **Api และ Workers** (placeholder = default)
- **Telemetry (`TutoringTelemetry`, Meter `Siri.Tutoring`):** `tutoring.disputes.opened{category,role,flow}` · `tutoring.disputes.resolved{resolution}` · `tutoring.disputes.rejected` · `tutoring.disputes.withdrawn` · `tutoring.disputes.escrow_too_late` · `tutoring.disputes.aging_alerts{level}` · `tutoring.disputes.suspensions{result}`

---

## 11. Security / IDOR (เมทริกซ์ — ทุกแถวมี integration test)

| ทรัพยากร | ผู้เรียก (เจ้าของ booking) | ติวเตอร์เจ้าของคลาส | ผู้ใช้อื่น | admin | anonymous |
|---|---|---|---|---|---|
| `GET/POST bookings/{id}/dispute` | ✔ | 404 `booking_not_found` (ใช้ route `tutor/…`) | 404 | 404 (admin ใช้ endpoint admin) | 401 |
| `GET/POST tutor/bookings/{id}/dispute` | 404 | ✔ (`InstructorOnly` + เจ้าของ) | 404 | 404 | 401 |
| `GET/POST disputes/{id}…` | ✔ เฉพาะเคสของ booking ตัวเอง | 404 | 404 | 404 | 401 |
| `GET/POST tutor/disputes/{id}…` | 404 | ✔ เฉพาะเคสของคลาสตัวเอง | 404 | 404 | 401 |
| `admin/disputes*` | 403 | 403 | 403 | ✔ `AdminOnly` | 401 |
- ownership ใน WHERE เดียวกับการดึง (ไม่ query แล้วค่อยเช็ค) · 404 ไบต์เดียวกัน (diff body หลังตัด `traceId` ในเทสต์) · `userId`/`tutorId`/`learnerUserId`/`openedByUserId` **ไม่มี**ใน body/query/route และ **ไม่ออก**ใน response ฝั่งผู้ใช้ทุกชนิด
- ข้อความ `Internal` และ `ASSIGNED_TO_USER_ID`/`DECIDED_BY_USER_ID` ไม่ออกฝั่งผู้ใช้ (เทสต์ JSON-walk allow-list) · ติวเตอร์ไม่เห็นข้อมูลผู้ปกครอง (อีเมล/ชื่อบัญชี/userId) · ผู้เรียกไม่เห็น `reliabilityScore`/โทษของติวเตอร์ (เฉพาะ admin)
- เงิน: ไม่คำนวณ/เขียนยอดเงิน/สถานะ payment ที่นี่ (เรียก P13-08 เท่านั้น); ราคา/ยอดคืนจาก server; `RefundAmount` ของ admin ถูกตรวจ cap ใต้ lock ก่อนส่ง P13-08 · audit ทุกการเปลี่ยนสถานะเงิน/ตัดสิน (detail = id/จำนวน/โค้ด — **ไม่มีข้อความอิสระ/ลิงก์หลักฐาน/คำอธิบาย**)
- ข้อความผู้ใช้: plain text, ไม่ HTML-render, ลิงก์หลักฐาน https-only ไม่ fetch, `rel=noopener noreferrer nofollow`; ห้ามช่องทางติดต่อ (ผู้เยาว์) · ไม่ log เนื้อหาข้อความ/ลิงก์/คำอธิบาย
- DoS: เพดาน `MaxOpenPerUser`, `MaxMessagesPerParty`, `MaxEvidenceLinks`, ความยาวข้อความ, rate limit ต่อผู้ใช้ — ผู้เปิดเคสรัวหน่วง escrow ของคนอื่นได้ ⇒ `learner_repeat_rejected` hint + เพดานเปิดพร้อมกัน + SLA

---

## 12. Test checklist

**Unit:** `DisputeWindowPolicy` (เวกเตอร์ §3.1 + ขอบ ±1 ms + window 0 + fallback no-decision + ทุกสถานะ) · `DisputeEligibility` (ทุกแถว §3.2 × 5 หมวด) · `DisputeTextRules` (markup, ช่องทางติดต่อ, meeting link scrub, ลิงก์หลักฐานทุกกรณี: http, `javascript:`, userinfo, IP, localhost, meet host, host นอก allow-list, ยาว >500, normalize) · state machine `DISPUTE` 5×5 · `TUTOR_BOOKING.ResolveDispute` (4 ผ่าน/อื่นโยน) + เมทริกซ์ P13-05 ยังเขียว · `DecideDisputeRequest` validator ทุก flow/ชุดค่า · priority/SLA/repeat-flag คำนวณ (ขอบ threshold, หน้าต่าง 90 วัน, Withdrawn/Rejected ไม่นับ) · เงื่อนไขถอน (5 เหตุผล) · `TutoringDisputeMessages` (HtmlEncode, ไม่มีเนื้อหาเคสในอีเมล, ข้ามอีเมล anonymised) · options validator ทุก branch (`AgingAlertHours` ไม่เรียง, `SlaHours` High>Normal) · source-scan: P13-14 ไม่เขียน `REFUNDED_AMOUNT`/`ESCROW_STATE`/`RATING_*`/`RELIABILITY_SCORE` · reflection: ทุก action มี `[Authorize]`/policy
**Integration (PostgreSQL 17 + `SiriApiFactory`; ห้าม InMemory; เส้น Stripe ใช้ fake `IPaymentMethod` ที่จำลอง idempotency ตามคีย์):**
1. **เปิดเคส Escrow (Completed):** เปิด → booking `Disputed`, `ESCROW_STATE=Frozen`, Payout rows `Frozen`/`AVAILABLE_AT=null`, `DISPUTES.ESCROW_FREEZE='Frozen'`, system message, แจ้งเตือนสองฝ่าย, audit 1 แถว · ซ้ำด้วย `ClientRequestId` เดิม ⇒ 200 เคสเดิม ไม่ freeze ซ้ำ
2. **เปิดพร้อมกัน** (ผู้เรียก+ติวเตอร์ ×20 รอบ, barrier) ⇒ 201 หนึ่ง + 409 `dispute_already_open` พร้อม `disputeId` เดียวกัน; DB มี `DISPUTES` 1 แถว/ Payout Frozen ครั้งเดียว
3. **หน้าต่าง:** เปิดที่ `windowEnd` (FakeClock) ผ่าน, `+1 ms` ⇒ `dispute_window_closed`; ไม่มีเคสแล้วเงินปล่อยตามเวลาเดิม (`ESCROW_RELEASE_AT_UTC` ไม่ถูกแตะ)
4. **ปิดหน้าต่างขณะเคสเปิด:** เปิดเคส → เลื่อนเวลาเลย `windowEnd` + รัน `tutoring-refund-reconcile` + weekly batch ⇒ เงินยัง Frozen ไม่เข้า batch, `ESCROW_STATE` ไม่เป็น `Released`; ผู้ใช้โพสต์ข้อความได้; admin ตัดสินทีหลังได้
5. **TooLate:** เปิดหลัง `ReleaseEarlyAsync` + batch `Draft` ผูกแถวแล้ว ⇒ dispute เปิดได้, `ESCROW_FREEZE='TooLate'`, booking `Disputed`, system message `escrow_too_late`; decide FullRefund ⇒ refund + adjustment ลบ (ledger = `Compute(K,F,t)`)
6. **AttendanceAppeal:** ติวเตอร์เปิดบน `NoShowTutor` ⇒ `FLOW=AttendanceAppeal`, ไม่เรียก Freeze, `Disputed`; ผู้เรียกเปิดบน `NoShowTutor`/`NoShowBoth` ⇒ `dispute_role_not_allowed`; decide `AttendanceOverturned` ⇒ `VoidPenaltyAsync` ถูกเรียก (คะแนนติวเตอร์กลับ), booking กลับ `NoShowTutor`, **ไม่มี refund/ledger เปลี่ยน**, `CompensationRequired` ⇒ ขึ้นคิว follow-up → `compensation-settled` ปิด
7. **Decide ครบ 3 แบบ:** Full / Partial (ขอบ: `remaining`, `remaining+0.01` ⇒ `refund_exceeds_cap`, `0.00`/ติดลบ ⇒ 400) / None ; หลังตัดสิน: booking กลับสถานะเดิม, ยอด `REFUNDED_AMOUNT` ถูก, `REFUNDS` 1 แถว key `refund:{bookingId}:DisputeResolved:{disputeId:N}`, Payout: ส่วนเหลือ `ScheduleRelease(now)`, rating recompute เมื่อมีรีวิว (คืนเต็ม ⇒ รีวิวไม่นับ) · decide ซ้ำ (คำตัดสินเดียวกัน) ⇒ 200 `alreadyDecided` ไม่คืนซ้ำ · แพ็กเกจ FullRefund ⇒ `MarkCreditRefundedAsync` ถูกเรียก
8. **Stripe ล่ม/ช้า:** decide สำเร็จ + `REFUNDS=Requested` ⇒ job ส่งต่อ ; `DisputeAbortException` (จำลอง P13-08 Failure) ⇒ rollback ทั้งก้อน (booking ยัง `Disputed`, dispute ยังเปิด, Payout ยัง Frozen)
9. **ถอน:** ผู้เปิดถอนก่อนมีข้อความฝ่ายตรงข้าม ⇒ Unfreeze (`ReleaseAtUtc=windowEnd`/null ถ้าเลย) + booking กลับ + `Withdrawn`; ฝ่ายตรงข้ามโพสต์แล้ว ⇒ `other_party_posted`; `Behavior` ⇒ `behavior`; คนอื่นถอน ⇒ `not_opener`; หลังตัดสิน ⇒ `dispute_closed` ; เปิดใหม่หลังถอนผ่านครั้งแรก, ครั้งที่สอง ⇒ `dispute_reopen_not_allowed`
10. **IDOR:** ผู้ใช้ B ยิงทุก endpoint ผู้เรียกกับ dispute/booking ของ A ⇒ 404 body เท่ากับ id ไม่มีจริง (diff หลังตัด `traceId`) ; ติวเตอร์ B ยิง `tutor/*` ของคลาส A ⇒ 404 ; ผู้เรียกยิง `tutor/*` ⇒ 404 ; ผู้ใช้ทั่วไปยิง `admin/*` ⇒ 403 ; ติวเตอร์ที่ถูกระงับ (`Suspended`) ยัง `GET/POST tutor/disputes…` ได้ (InstructorOnly)
11. **Leak test (JSON-walk allow-list):** response ผู้เรียก/ติวเตอร์ไม่มี `learnerUserId`, `openedByUserId`, `assignedTo*`, `decidedBy*`, ข้อความ Internal, `reliabilityScore`/penalty, อีเมล/ชื่อบัญชี; seed ผู้ปกครองมีอีเมลและชื่อจริง ⇒ ไม่พบสตริงเหล่านั้นใน response ฝั่งติวเตอร์/admin list
12. **ข้อความ:** `clientMessageId` ซ้ำ ⇒ 200 เดิม ; เพดาน `MaxMessagesPerParty` ⇒ 409 ; ช่องทางติดต่อ/markup/ลิงก์ห้อง ⇒ ตามกฎ ; ลิงก์หลักฐานครบ 10 แล้วเพิ่ม ⇒ 400 ; ข้อความ `Internal` ไม่โผล่ในทุก endpoint ผู้ใช้ ; post หลังตัดสิน ⇒ `dispute_closed` ; admin `Internal` หลังตัดสินได้
13. **ธงซ้ำ/ระงับ:** 3 ผู้เรียก 3 booking ใน 90 วัน ⇒ ใบที่ 3 `REPEAT_COMPLAINT_FLAG`+`High` ; เคส Withdrawn/Rejected ไม่นับ ; `AutoSuspendUpheldThreshold=2` ⇒ หลังตัดสิน upheld ใบที่ 2 ติวเตอร์ถูกระงับ (txn แยก) ; ระงับล้ม/ไม่ Verified ⇒ การตัดสินยังคงอยู่ `tutorSuspension='Failed'|'SkippedNotVerified'`
14. **Job aging:** เคสเลย 24/48/72/168 ชม. ⇒ level เพิ่มทีละขั้นครั้งเดียว (รันซ้ำไม่เพิ่ม), digest 1 ฉบับต่อรอบ, **ไม่มีการเปลี่ยนสถานะเคส/เงิน** ; เคส terminal ไม่ถูกนับ ; job อยู่ใน `RecurringJobIds.All`
15. **Booking DTO:** `disputeId`/`disputeWindowEndsAtUtc` ใน `bookings/my` ถูกต้อง ไม่ N+1 (นับ query)
16. migration บน PG17: UQ partial/CHECK ทั้งหมด (insert ตรงด้วย `NULL`/ค่านอก enum ล้ม; `FLOW='AttendanceAppeal'` กับ `OPENED_BY_ROLE='Learner'` ล้ม; `STATUS='Resolved'` ไม่มี `DECIDED_AT_UTC` ล้ม; `REFUND_AMOUNT` กับ `NoRefund` ล้ม; `Internal` กับ `AUTHOR_ROLE='Learner'` ล้ม) · FK `NoAction` · model ไม่มี shadow column · `DatabaseIdentifierLengthTests` เขียว

---

## 13. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | entity `DISPUTE`/`DISPUTE_MESSAGE`/`DISPUTE_EVIDENCE_LINK` + configuration + accessors + migration `AddTutoringDisputes` + `docs/DATABASE.md` | อ่านทั้งไฟล์ ไม่มี shadow FK · FK ทั้งหมด `NoAction` · CHECK มี `IS NOT NULL` ตาม §2 · ชื่อ ≤63 · **ไม่ apply DB จริง** |
| **B** | `backend-developer` | pure: `DisputeWindowPolicy`, `DisputeEligibility`, `DisputeTextRules`, state machine, `TUTOR_BOOKING.ResolveDispute` (+ เมทริกซ์ P13-05) + unit | unit เขียว (เริ่มได้ก่อน A) |
| **C** | `backend-developer` | `DisputeRepository` + `DisputeService` (open/list/get/post/withdraw) + `TutoringDisputeMessages` + Options | unit + service tests (หลัง A + P13-08 §4 มีใน main — stub ได้) |
| **D** | `backend-developer` | `AdminDisputeService` (queue/summary/detail/claim/message/decide/compensation) + ธงซ้ำ/ระงับ + job aging + `RecurringJobIds` | unit |
| **E** | `backend-developer` | 3 controller + attributes + Booking DTO fields (`ToResponse()`/list query) + appsettings (Api+Workers) | ทุก action มี attribute auth |
| **F** | `backend-developer`/`integrator-qa` | integration §12 (ข้อ 1–9 ต้องรันจริงบน PG ก่อนตั้ง `DONE`) | เขียนครบ (ระบุถ้าไม่เคยรันเพราะไม่มี Docker) |
ลำดับ: A ∥ B → C → D → E → F · **ห้ามส่ง Antigravity · ห้าม apply migration / commit เอง**

---

## 14. Frontend notes + DTO appendix (สร้างขนานได้ — ห้าม mock)

- **ผู้เรียก** (`/my-tutoring` การ์ดคลาส): ปุ่ม "แจ้งปัญหา/เปิดข้อพิพาท" ปรากฏเมื่อ `disputeWindowEndsAtUtc != null` (นับถอยหลังอิง offset `serverTimeUtc`) ; มีเคสแล้ว (`disputeId`) ⇒ ลิงก์ "ดูข้อพิพาท" · หน้า `/my-tutoring/disputes/:id` (CSR, noindex, `authGuard`): ข้อมูลเคส + เธรด (บับเบิลตาม `authorRole`, system message แปลจากรหัส) + ฟอร์มตอบ (ตัวนับ, ปุ่มกันกดซ้ำ, สร้าง `clientMessageId` ต่อการส่ง) + ลิงก์หลักฐาน (แสดง host ก่อน) + ปุ่มถอน (ปิดตาม `canWithdraw`/`withdrawBlockedReason`) ; แสดง `fundsOnHold`, `expectedResolutionByUtc`, ผลตัดสิน ; **เตือนก่อนเปิด:** "ห้ามใส่เบอร์/อีเมล/ช่องทางติดต่อ", "เงินของคลาสนี้จะถูกพักระหว่างพิจารณา"
- **ติวเตอร์** (`/instructor/tutoring/disputes`, `/…/:id`): ใช้ `state` จาก `GET tutor/bookings/{id}/dispute` ; ปุ่ม "อุทธรณ์ผลเข้าเรียน" บนหน้า join 409 `session_closed` / รายการคลาส (P13-10 §4.6) ; เตือน "เปิดข้อพิพาทแล้วเงินคลาสนี้จะถูกพัก" เมื่อ flow Escrow ; เห็นผู้เรียกเป็นชื่อเล่น+ระดับชั้นเท่านั้น ; ติวเตอร์ที่ถูกระงับยังเข้าถึงได้
- **Admin** (`/admin/tutoring/disputes`, `/…/:id`, `roleGuard`): ตารางคิว (ตัวกรอง/เรียง SLA, ป้ายความสำคัญ/ค้างนาน/ธงซ้ำ/`needsFollowUp`), การ์ดสรุป (`summary`), detail: หลักฐาน (attendance summary + ลิงก์ไปหน้า attendance ของ P13-10 §7.4 ซึ่งเห็น IP/UA และถูก audit), ข้อความ (Parties/Internal แยกสี + ไอคอน — ไม่ใช้สีอย่างเดียว), ประวัติติวเตอร์/โทษ, payment+refunds, hints, ฟอร์มตัดสิน (ตัวเลือกตาม flow; `PartialRefund` แสดง `maxRefundable`; ช่อง Note พร้อมคำเตือน "ทั้งสองฝ่ายเห็นข้อความนี้"; checkbox ระงับติวเตอร์) · FE **ไม่คำนวณ**ยอดคืน/สิทธิ์
- i18n (README §6 E7): `tutoring.learner.dispute.*`, `tutoring.tutor.dispute.*`, `tutoring.admin.disputes.*`, `tutoring.enums.disputeCategory.*` / `disputeStatus.*` / `disputeFlow.*` / `disputeSystemMessage.*`, `tutoring.errors.<reason>` (th+en ครบ) · `bangkokDate`/`currencyThb` (ต้อง `providers:[CurrencyPipe]`) · token/`tone-*` เท่านั้น · loading/error/empty ครบ · **E8:** เพิ่ม `RenderMode.Client` ใน `app.routes.server.ts` ใน change เดียวกับที่ประกาศแต่ละ route (ห้ามล่วงหน้า)

```ts
type Guid = string; type IsoUtc = string;
type DisputeParty = 'Learner' | 'Tutor';
type DisputeCategory = 'NoClass' | 'TutorConnection' | 'Behavior' | 'NotAsDescribed' | 'Other';
type DisputeStatus = 'Open' | 'UnderReview' | 'Resolved' | 'Rejected' | 'Withdrawn';
type DisputeFlow = 'Escrow' | 'AttendanceAppeal';
type DisputePriority = 'Normal' | 'High';
type DisputeResolution = 'FullRefund' | 'PartialRefund' | 'NoRefund';
type DisputeVisibility = 'Parties' | 'Internal';
type EscrowFreezeResult = 'Frozen' | 'TooLate' | 'NotApplicable';
interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number; totalPages: number; }

interface EvidenceLinkInput { url: string; label?: string | null; }
interface EvidenceLink { evidenceId: Guid; url: string; host: string; label: string | null; addedByRole: DisputeParty | 'Admin'; addedAtUtc: IsoUtc; }
interface OpenDisputeRequest { category: DisputeCategory; description: string; evidenceLinks?: EvidenceLinkInput[] | null; clientRequestId: Guid; }
interface PostDisputeMessageRequest { clientMessageId: Guid; body: string; evidenceLinks?: EvidenceLinkInput[] | null; }
type WithdrawDisputeRequest = Record<string, never>;

interface BookingDisputeState {            // GET bookings/{id}/dispute  และ  GET tutor/bookings/{id}/dispute
  bookingId: Guid; canOpen: boolean;
  reasonCode: 'status_not_eligible' | 'window_closed' | 'already_open' | 'already_decided' | 'role_not_allowed' | 'feature_disabled' | 'limit_reached' | 'reopen_not_allowed' | null;
  flow: DisputeFlow | null; allowedCategories: DisputeCategory[]; windowEndsAtUtc: IsoUtc | null;
  dispute: { disputeId: Guid; disputeNo: string; status: DisputeStatus } | null; fundsWillBeHeld: boolean; serverTimeUtc: IsoUtc; }

interface DisputeMessage { messageId: Guid; kind: 'Message' | 'System'; authorRole: DisputeParty | 'Admin' | 'System'; isMine: boolean;
  body: string;                              // kind=System ⇒ รหัสสั้น (opened|claimed|decided|withdrawn|escrow_too_late) แปลด้วย i18n
  evidenceLinks: EvidenceLink[]; createdAtUtc: IsoUtc; }
interface DisputeDecisionView { resolution: DisputeResolution; refundAmount: number | null; note: string; decidedAtUtc: IsoUtc; attendanceOverturned: boolean; }
interface DisputeDetail {
  disputeId: Guid; disputeNo: string; bookingId: Guid; bookingNo: string; status: DisputeStatus; category: DisputeCategory; flow: DisputeFlow;
  myRole: DisputeParty; openedByRole: DisputeParty; description: string;
  session: { startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; subjectNameTh: string; subjectNameEn: string };
  counterparty: { role: DisputeParty; displayName: string; gradeLevel: string | null };   // ผู้เรียกเห็นติวเตอร์=displayName ; ติวเตอร์เห็นผู้เรียก=nickname+gradeLevel
  evidenceLinks: EvidenceLink[]; messages: DisputeMessage[];
  openedAtUtc: IsoUtc; lastActivityAtUtc: IsoUtc; expectedResolutionByUtc: IsoUtc; fundsOnHold: boolean;
  decision: DisputeDecisionView | null; withdrawnAtUtc: IsoUtc | null;
  canPostMessage: boolean; canWithdraw: boolean; withdrawBlockedReason: 'not_opener' | 'other_party_posted' | 'behavior' | 'admin_decided' | null; serverTimeUtc: IsoUtc; }
interface DisputeListItem { disputeId: Guid; disputeNo: string; bookingNo: string; status: DisputeStatus; category: DisputeCategory; flow: DisputeFlow; myRole: DisputeParty;
  startsAtUtc: IsoUtc; subjectNameTh: string; subjectNameEn: string; openedAtUtc: IsoUtc; lastActivityAtUtc: IsoUtc; }

interface AdminDisputeSummary { open: number; underReview: number; overdue: number; highPriority: number; awaitingAdminReply: number; needsFollowUp: number;
  oldestOpenedAtUtc: IsoUtc | null; frozenAmountTotal: number; serverTimeUtc: IsoUtc; }
interface AdminDisputeListItem { disputeId: Guid; disputeNo: string; bookingNo: string; status: DisputeStatus; category: DisputeCategory; flow: DisputeFlow; priority: DisputePriority;
  openedByRole: DisputeParty; tutor: { tutorId: Guid; displayName: string; slug: string }; learnerNickname: string; learnerIsMinor: boolean;
  amountAtStake: number; openedAtUtc: IsoUtc; lastActivityAtUtc: IsoUtc; lastMessageRole: DisputeParty | 'Admin' | null; slaDueAtUtc: IsoUtc; isOverdue: boolean; ageHours: number;
  agingAlertLevel: number; repeatComplaintFlag: boolean; assignedToUserId: Guid | null; escrowFreeze: EscrowFreezeResult; compensationRequired: boolean; compensationSettled: boolean; }
interface AdminDisputeMessage extends Omit<DisputeMessage, 'isMine'> { visibility: DisputeVisibility; authorUserId: Guid | null; }
interface AdminDisputeDetail extends AdminDisputeListItem {
  bookingId: Guid; sessionId: Guid; description: string; bookingStatusAtOpen: 'Completed' | 'NoShowLearner' | 'NoShowTutor' | 'NoShowBoth';
  session: { startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; subjectNameTh: string; subjectNameEn: string; format: string };
  learner: { nickname: string; gradeLevel: string; isMinor: boolean };
  attendance: { tutorJoinedAtUtc: IsoUtc | null; tutorConfirmedAtUtc: IsoUtc | null; learnerJoinedAtUtc: IsoUtc | null; tutorPresentAttestedAtUtc: IsoUtc | null; learnerConfirmedAtUtc: IsoUtc | null;
    decision: { outcome: string; decidedAtUtc: IsoUtc; decidedBy: string; tutorEvidence: string; learnerEvidence: string } | null; joinLogs: { role: string; joinedAtUtc: IsoUtc }[] };
  payment: { paymentId: Guid; method: string; status: string; amount: number; refundReservedAmount: number; refundedCompletedAmount: number; succeededAtUtc: IsoUtc | null } | null;
  refunds: { refundId: Guid; amount: number; reason: string; status: string; requestedAtUtc: IsoUtc; completedAtUtc: IsoUtc | null }[];
  priceAmount: number; refundedAmount: number; isPackageBooking: boolean;
  tutorHistory: { status: string; reliabilityScore: number; ratingAverage: number; ratingCount: number; completedSessionsCount: number;
    penalties: { kind: string; points: number; reasonCode: string; createdAtUtc: IsoUtc; voided: boolean }[];
    disputes90d: { total: number; upheld: number; noRefundOrRejected: number } };
  evidenceLinks: EvidenceLink[]; messages: AdminDisputeMessage[];
  decision: { resolution: DisputeResolution; refundAmount: number | null; refundId: Guid | null; note: string; decidedAtUtc: IsoUtc; decidedByUserId: Guid;
    attendanceOverturned: boolean; penaltyVoided: boolean } | null;
  hints: ('minor_learner' | 'behavior_complaint' | 'repeat_complaint' | 'tutor_suspended' | 'learner_repeat_rejected' | 'appeal_penalty_exists')[];
  repeatComplaintCount: number; tutorSuspension: 'NotRequested' | 'Done' | 'SkippedNotVerified' | 'Failed'; alreadyDecided: boolean; serverTimeUtc: IsoUtc; }

interface ClaimDisputeRequest { takeOver: boolean; }
interface AdminPostMessageRequest { clientMessageId: Guid; body: string; visibility: DisputeVisibility; evidenceLinks?: EvidenceLinkInput[] | null; }
interface DecideDisputeRequest { decision: 'Resolve' | 'Reject'; resolution?: DisputeResolution | null; refundAmount?: number | null;
  attendanceOverturned: boolean; compensationRequired: boolean; note: string; suspendTutor: boolean; suspendReason?: string | null; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: string; reason?: string; disputeId?: Guid; allowed?: DisputeCategory[]; bookingStatus?: string;
  windowEndedAtUtc?: IsoUtc; maxRefundable?: number; withdrawReason?: string; }
```
C# (record ตำแหน่งเดียว ชื่อเดียวกับ TS ลำดับฟิลด์ตามข้างบน): `OpenDisputeRequest(DisputeCategory Category, string Description, IReadOnlyList<EvidenceLinkInput>? EvidenceLinks, Guid ClientRequestId)` · `PostDisputeMessageRequest` · `WithdrawDisputeRequest()` · `BookingDisputeState` · `DisputeMessage` · `DisputeDetail` · `DisputeListItem` · `AdminDisputeSummary` · `AdminDisputeListItem` · `AdminDisputeMessage` · `AdminDisputeDetail` · `ClaimDisputeRequest(bool TakeOver)` · `AdminPostMessageRequest` · `DecideDisputeRequest(DisputeDecision Decision, DisputeResolution? Resolution, decimal? RefundAmount, bool AttendanceOverturned, bool CompensationRequired, string Note, bool SuspendTutor, string? SuspendReason)` · `EvidenceLink`/`EvidenceLinkInput` — enum ใน `Domain` (`DisputeParty`, `DisputeCategory`, `DisputeFlow`, `DisputeStatus`, `DisputePriority`, `DisputeResolution`, `DisputeVisibility`, `EscrowFreezeResult`) ; `DisputeDecision` ใน `Application` ; map ใน `ToResponse()` ไม่รั่ว entity · `DisputeResolution` (Domain) ↔ `DisputeResolutionKind` (P13-08 Application) แมปที่ service

`ApiProblem.reason` ใหม่ (i18n `tutoring.errors.*`): `tutoring.dispute_not_found` · `dispute_not_available` (+`bookingStatus`) · `dispute_role_not_allowed` · `dispute_category_invalid` (+`allowed`) · `dispute_window_closed` (+`windowEndedAtUtc`) · `dispute_already_open` (+`disputeId`) · `dispute_already_decided` (+`disputeId`) · `dispute_reopen_not_allowed` · `dispute_limit_reached` · `dispute_closed` · `dispute_message_limit` · `dispute_withdraw_not_allowed` (+`withdrawReason`) · `dispute_not_decidable` · `dispute_no_refundable_amount` · `dispute_appeal_no_refund` · `dispute_decision_invalid` · `dispute_claimed_by_other` · `dispute_no_compensation_required` · `dispute_text_contains_contact` · `dispute_evidence_link_invalid` · `dispute_too_many_links` · `escrow_unavailable` · ที่ใช้ซ้ำ: `booking_not_found`, `not_found`, `text_contains_markup`, `refund_exceeds_cap` (+`maxRefundable`), `concurrent_update`, `tutor_profile_not_found`

---

## Deviations from TUTORING.md / ข้อกำหนดก่อนหน้า
| # | ที่เดิม | ที่ contract นี้ทำ | เหตุผล / ผลต่อคนอื่น |
|---|---|---|---|
| D1 | "เปิดได้ภายใน DisputeWindowHours หลังจบ (หรือหลังเวลาเริ่มกรณี no-show)" | หน้าต่าง = `EscrowReleaseTime(ENDS, decidedAt, window)` (decidedAt = เวลาตัดสินผล) ทุกสถานะ | ตรงมติ D-A สูตรเดียว; หน้าต่างปิดพร้อมเงินติวเตอร์ถึงเวลาปล่อย |
| D2 | `DISPUTES` ตามสเก็ตช์ (BOOKING_ID … DECISION_NOTE) | เพิ่ม `DISPUTE_NO`, `SESSION_ID/TUTOR_ID/LEARNER_USER_ID`, `FLOW`, `BOOKING_STATUS_AT_OPEN`, `PRIORITY`, `ESCROW_FREEZE`, SLA/aging, ธงซ้ำ, `ATTENDANCE_OVERTURNED/PENALTY_VOIDED/COMPENSATION_*`, `REFUND_ID`, `CLIENT_REQUEST_ID`, `REDACTED_AT_UTC`, `ROW_VERSION` ; `DISPUTE_MESSAGES` เพิ่ม `KIND/VISIBILITY/CLIENT_MESSAGE_ID/REDACTED_AT_UTC` ; ตารางใหม่ `DISPUTE_EVIDENCE_LINKS` | IDOR/idempotency/audit/SLA/PDPA |
| D3 | `RESOLUTION` ∈ FullRefund\|PartialRefund\|NoRefund | คงสามค่า ; flow อุทธรณ์ใช้ `NoRefund` + `ATTENDANCE_OVERTURNED` | ไม่ขยาย enum ของ P13-08 (`DisputeResolutionKind`) |
| D4 | สถานะ `Rejected` | = admin ปฏิเสธเคส (ละเมิด/ไม่เข้าข่าย) ตั้ง `RESOLUTION=NoRefund` ; `Resolved`+`NoRefund` = พิจารณาแล้วไม่มีเยียวยา | แยกเพื่อสถิติ/ธงผู้เรียก |
| D5 | "ไฟล์แนบหลักฐาน" | ลิงก์เท่านั้น (v1) | validator/virus scan ยังไม่พร้อม (Q9; P13-10 `FilesEnabled=false`) |
| D6 | "ชดเชยติวเตอร์" (P13-10 §4.4 ข้อ 6) | ไม่โอนเงินอัตโนมัติ — ธง `COMPENSATION_REQUIRED` + คิว + `compensation-settled` | ไม่มี Payout contract; นักบัญชี/เจ้าของตัดสินวิธีชดเชยนอกระบบ (Q14) |
| D7 | `MarkDisputed()` ผ่าน `FreezeEscrowAsync` เท่านั้น (ตีความจาก P13-08) | P13-14 เรียก `MarkDisputed()` เองเมื่อ `TooLate`/`NotApplicable`/appeal | `FreezeEscrowAsync` รับเฉพาะ Completed\|NoShowLearner และไม่เปลี่ยน booking เมื่อ TooLate |
| D8 | path ติวเตอร์ `tutor/disputes` (TUTORING.md §5) | เพิ่ม `tutor/bookings/{id}/dispute` (state/open) | route ผู้เรียก `bookings/*` ติวเตอร์เข้าไม่ได้ ; policy `InstructorOnly` เพิ่มใน README §5.1 |
| D9 | — | `DISPUTES` อยู่ใน lock chain หลัง `TUTOR_BOOKINGS` | README §7.2 เพิ่มแถว |
| D10 | — | `Booking.disputeId/disputeWindowEndsAtUtc` (additive) | owner table P13-05 เติมแถวแล้ว |

## Open decisions (defaulted — เจ้าของ/ที่ปรึกษาเปลี่ยนที่ config/revision ได้)
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | Auto-release เมื่อ admin ไม่ตัดสิน | **ไม่มี** — มีแต่ aging alert (เงินบุคคลที่สามต้องมีมนุษย์ตัดสิน) |
| 2 | ติวเตอร์เปิดข้อพิพาทบน Completed (freeze เงินตัวเอง) | อนุญาต (`TutorMayOpenOnCompleted`) |
| 3 | ถอนเคส `Behavior` | ผู้เปิดถอนไม่ได้ (admin ปิดเอง) |
| 4 | เคสหลัง Resolved เปิดซ้ำ | ไม่ได้ (ต้องติดต่อทีมงาน/admin ทำ refund manual ผ่าน P13-08 §5.6) |
| 5 | Package: FullRefund | คืนเงินส่วนของครั้งนั้น + เครดิต `Refunded` ; Partial เครดิตคง `Consumed` (P13-12) |
| 6 | Auto-suspend จาก dispute | ปิด (`AutoSuspendUpheldThreshold=0`) — ธงอย่างเดียว |
| 7 | อุทธรณ์ที่ชนะ | ไม่เปลี่ยน `NoShowTutor` เป็น `Completed`, ไม่ดึงเงินคืนจากผู้เรียก ; กลับโทษ + ธงชดเชย |
| 8 | ข้อความ `DECISION_NOTE` | ทั้งสองฝ่ายเห็นในแอป ไม่ส่งในอีเมล |
| 9 | แจ้ง admin แบบ push | อีเมลสรุป `AlertEmails` (ว่าง = เฉพาะ log/metric) — ไม่มี contract ดึงรายชื่อ admin จาก Identity |
| 10 | ตัดสินเคสที่ `ESCROW_FREEZE='TooLate'` | FullRefund ⇒ refund + adjustment ลบรอบถัดไป (P13-07) — ติวเตอร์อาจติดลบ carry-forward ตาม Q4 |

## Changelog
(ยังไม่มี revision หลัง FROZEN)
