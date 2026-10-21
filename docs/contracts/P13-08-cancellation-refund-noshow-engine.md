# Contract: P13-08 ยกเลิก · คืนเงิน · no-show · คะแนนความน่าเชื่อถือติวเตอร์ (CancellationPolicy เป็น pure function + วงจร `REFUNDS` ที่เรียก Stripe จริง)

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE entity/DB, schema `TUTORING`) — ใช้ `Siri.Modules.Payout.Contracts.ITutoringEscrowContract` (P13-07) และ `Siri.Integrations.Payment` (แก้ใน P13-06 §4) · ไม่แก้ Commerce/Payout/Live

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..G)** — นี่คือ **ตรรกะคืนเงิน (เงินจริงผ่าน Stripe) + การตัดสินสิทธิ์เงินของติวเตอร์ + ธงระงับติวเตอร์อัตโนมัติ** ตรงเกณฑ์ที่ห้ามส่ง Antigravity และเป็นคลาสที่ audit เคยพลาด (X-35: refund ไม่เรียก Stripe จริง) · **ไม่ต้องผ่าน DESIGN_DATABASE** (สองตาราง §2 ระดับคอลัมน์ครบ) · ไม่มีบล็อกคำสั่ง Antigravity · FE ขนานได้ทันทีจาก DTO appendix

> **อ่านคู่กับ:** `docs/TUTORING.md` §3.7 (ตารางนโยบาย — ต้นทางของทุกบรรทัดใน §3 นี้) · §3.8 · `DECISIONS.md` D-25 + Q4 + Q14 · `TASKS.md` X-35/X-36 · **P13-06** (webhook seam, `IPaymentMethod` ที่เพิ่ม idempotency/metadata/`GetRefundAsync`, §6.0 กฎ lock, §6.3 ตาราง race ที่สร้าง `REFUNDS` แถวแรก) · **P13-07** (ledger — สูตรเงินของฝั่งติวเตอร์) · **P13-09** (`ISessionRoomSync`) · **P13-12** (แพ็กเกจ) · ผู้เรียก §4: **P13-10** (join/finalize/complete), **P13-14** (dispute)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body 2026-10-14)

| # | ข้อเท็จจริง | หลักฐาน | ผล |
|---|---|---|---|
| F1 | Commerce `RefundService` ไม่เคยเรียก Stripe; `REFUND.MarkProcessing/MarkCompleted/MarkFailed` ไม่มีผู้เรียกใน service ใด ๆ | `grep CreateRefundAsync` พบผู้เรียกเดียวคือ `PaymentOpsQueueService.cs:207`; `grep MarkProcessing\|MarkCompleted\|MarkFailed` ใน Commerce นอก `Domain/REFUND.cs` = ว่าง | **ไม่สืบทอด**: Tutoring เรียก Stripe จริงทุกครั้งและบันทึกผลทุกสถานะ (X-35 ของคอร์สยังเปิด ไม่แก้ที่นี่) |
| F2 | ทางเดียวที่เรียก Stripe refund วันนี้ **กลืน error**: `refundResult.IsFailure` → `LogWarning` แล้ว `payment.MarkRefunded` ต่อ + ย้อน split | `Commerce/Application/PaymentOpsQueueService.cs:207-220` | Tutoring: Stripe ล้ม ⇒ **ไม่ถือว่าคืนแล้ว** (สถานะ Requested/Failed + ธง manual review + แจ้งทีม) |
| F3 | `CreateRefundAsync` ไม่มี idempotency key / metadata / การจัดประเภท error / `GetRefundAsync` | `StripePaymentMethod.cs:219-272` | แก้โดย P13-06 §4 (งานนี้ **ใช้** ผลลัพธ์: `CreateRefundRequest.IdempotencyKey/Metadata`, `PaymentProviderErrors.RetryableReason/PermanentReason`, `IPaymentMethod.GetRefundAsync`) |
| F4 | Stripe เก็บ idempotency key **24 ชั่วโมง**; refund ของ PromptPay เป็น async (สถานะ `pending`/`requires_action` — Stripe ติดต่อผู้ซื้อขอบัญชีเอง); refund อาจ `failed`/`canceled` ภายหลัง | `PAYMENT.md` ("refund ของ PromptPay เป็น async"); `Stripe.net.xml` `Refund.Status`/`FailureReason` | retry อัตโนมัติจำกัด < 24 ชม.; มี `IS_ASYNC` + สถานะ Processing ที่ UI ต้องแสดงตรง ๆ |
| F5 | `ISecurityAuditContract.RecordAuditAsync` flush `SaveChangesAsync` ของ `AppDbContext` ร่วม | `SecurityAuditContract.cs:17-19` | ทุกเส้นเงินรันใต้ transaction ชัดเจน ⇒ เรียกได้โดยไม่ commit; แต่ flush ทุกอย่างที่ tracked ณ จุดนั้น ⇒ **ห้ามเรียกก่อนงานที่ต้อง atomic กับมันพร้อมแล้ว** และไม่ใช่ "ขั้นสุดท้าย" เสมอไป (เช่น `RequestAsync` ถูกเรียกกลาง flow ของผู้เรียก) — ดู §6.1 ข้อ 7 / P13-06 F7 |
| F6 | `ExecuteInTransactionAsync<T>`: join ถ้ามี txn; `Result.Failure` ⇒ rollback ถ้าเป็นเจ้าของ txn; exception ⇒ rollback | `OrderRepository.cs:61-93` | บริการ Tutoring คัดลอก semantics เดียวกัน (`ITutoringUnitOfWork` ใน P13-06 §6.0) |
| F7 | ตัวอย่างการล็อกแถวด้วย `FromSqlInterpolated(... FOR UPDATE)` และ `ExecuteUpdateAsync` atomic | `Commerce/Infrastructure/PromoCodeRepository.cs:40,52`; `Catalog/Infrastructure/Contracts/CatalogPriceContract.cs:273` | ใช้ pattern เดียวกัน |
| F8 | ไม่มี `EnableRetryOnFailure`; `RecurringJobsRegistration`/`RecurringJobIds.All` ต้องตรงกัน (HangfireHostingTests) | grep; `Siri.Workers/RecurringJobIds.cs` | job ใหม่ §8 เพิ่มทั้งสองที่ |
| F9 | P13-09 กำหนดว่า Tutoring เรียก `ISessionRoomSync.ConvergeAsync(sessionId)` ใน unit-of-work เดียวกับการเปลี่ยนสถานะ (booking ยกเลิก/หมดอายุ ใน group, session ยกเลิก) และห้องที่ไม่มี booking Confirmed เหลือถูก `CancelAsync` โดย sync | `P13-09 §9` | cancel ทุกชนิดเรียก `ConvergeAsync` ครอบ `uow.TryRunInSavepointAsync` (P13-05 §5.0 — `ConvergeAsync` คืน `Task`) — ล้มแล้ว **การยกเลิก/คืนเงินต้องไม่ล้ม** |

---

## 1. Scope

**ใน:** `CancellationPolicy` (pure) + config · ตาราง `REFUNDS`, `TUTOR_PENALTY_EVENTS` + migration · `TutoringRefundService` (request/execute/apply-provider/void/retry) · `BookingCancellationService` (ผู้เรียก/ติวเตอร์ + quote) · `BookingSettlementService` (complete/release/no-show/freeze/resolve — **§4 คือ contract ภายใน Tutoring ที่ P13-10/14 ต้องเรียก**) · `TutorReliabilityUpdater` + ระงับอัตโนมัติ · endpoint ผู้เรียก/ติวเตอร์/admin ของงานนี้ · job `tutoring-refund-process` / `tutoring-refund-reconcile` / `tutoring-reliability-recompute` / `tutoring-suspended-sweep` · อีเมล/แจ้งเตือนที่เกี่ยวข้อง

**นอก:** การตัดสิน no-show จาก join log (P13-10 — งานนี้รับ "ผลตัดสิน" ผ่าน `Settle{Tutor|Learner|Both}NoShowAsync` §4) · ข้อพิพาท entity/เธรด (P13-14 — งานนี้ให้ `FreezeEscrow/ResolveDispute`) · reschedule · ตาราง `TUTOR_PACKAGES/PURCHASES/CREDITS` (P13-12; งานนี้เรียกผ่าน `IPackageCreditService` ที่ P13-12 ประกาศ §5.2) · ค่า Stripe fee รายการ/`charge.dispute.*` · FE · แก้ Commerce `RefundService` (X-35)

---

## 2. Schema delta — migration `AddTutoringRefundsAndPenalties` (ตารางใหม่ 2 ตาราง + คอลัมน์เดียวบน `TUTOR_BOOKINGS` ตามมติ D-A §2.3a)

> UPPERCASE ผ่าน `ApplyUppercaseNamingConventions` · เวลา `timestamptz(3)` UTC · เงิน `numeric(18,2)` + `HasPrecision(18,2)` · enum เก็บ string · `ROW_VERSION bytea` · **ไม่มีเมธอดลบ ไม่มี cascade ทุก FK = `NoAction` (`DeleteBehavior.NoAction` ตาม README §2)** · ชื่อ ≤63 ไบต์ · accessor ชื่อ `TutoringRefunds()` / `TutorPenaltyEvents()` (ไม่ชน `Refunds()` ของ Commerce — P13-06 F8) · อ่าน migration ที่ generate ทั้งไฟล์ · **ห้าม apply DB จริงเอง**

### 2.1 `TUTORING.REFUNDS` (entity `REFUND`; **ไม่ implement IAuditable/ISoftDelete** — ใช้ timestamp ตั้งชื่อเอง)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `REFUND_ID` | uuid PK | no | UUIDv7 — ส่งเป็น `metadata.refundId` ให้ Stripe (`Guid "D"`) |
| `PAYMENT_ID` | uuid | no | FK → `TUTORING.PAYMENTS` **NoAction** (`FK_REFUNDS_PAYMENTS_PAYMENT_ID`) |
| `BOOKING_ID` | uuid | yes | FK → `TUTORING.TUTOR_BOOKINGS` **NoAction** (`FK_REFUNDS_TUTOR_BOOKINGS_BOOKING_ID`); null = refund ระดับ payment/แพ็กเกจ (orphan, `PackageExpired`) |
| `PACKAGE_PURCHASE_ID` | uuid | yes | ไม่มี FK ในงานนี้ — P13-12 เพิ่ม FK ใน migration ของตัวเอง |
| `AMOUNT` | numeric(18,2) | no | > 0 (CHECK `CK_REFUNDS_AMOUNT_POSITIVE`) |
| `REASON` | varchar(24) | no | `RefundReason`: `LearnerCancelEarly` \| `LearnerCancelLate` \| `TutorCancel` \| `TutorNoShow` \| `NoClassHeld` \| `DisputeResolved` \| `AdminManual` \| `LatePayment` \| `DuplicatePayment` \| `AmountMismatch` \| `PackageExpired` *(เพิ่ม 4 ค่าท้ายจาก `TUTORING.md` §2 เพื่อรองรับ P13-06 §6.3/6.5 และ P13-12)* |
| `STATUS` | varchar(16) | no | `Requested` \| `Processing` \| `Completed` \| `Failed` \| `Voided` *(`Voided` เพิ่มจาก TUTORING.md — admin ยกเลิกคำขอที่ล้มเหลว §6.4)* |
| `IDEMPOTENCY_KEY` | varchar(120) | no | **UQ** `UX_REFUNDS_IDEMPOTENCY_KEY` · รูป §5.1 |
| `ATTEMPT_NO` | int | no | default 1 — เพิ่มเมื่อ admin `retry` (key ใหม่) |
| `LEDGER_SEQ` | int | no | default 0 — ตัวนับครั้งที่เรียก `ITutoringEscrowContract.ReverseBySourceAsync` เพราะ refund นี้ (คืน=1, ล้ม/void=2, retry=3, …) ใช้สร้าง `entryKey = adj:{refundId:N}:{seq}` (P13-07 §5.5) — เพิ่มได้เฉพาะใต้ lock ของ payment+refund |
| `PROVIDER_REFUND_ID` | varchar(255) | yes | `re_…` · **UQ partial** `UX_REFUNDS_PROVIDER_REFUND` (`HasFilter("\"PROVIDER_REFUND_ID\" IS NOT NULL")`) |
| `PROVIDER_STATUS` | varchar(24) | yes | ค่าดิบ `pending`/`requires_action`/`succeeded`/`failed`/`canceled` |
| `PROVIDER_STATUS_AT_UTC` | timestamptz(3) | yes | `Event.Created` ของสถานะล่าสุดที่รับ — ใช้ทิ้ง event เก่ากว่า |
| `FAILURE_CODE` | varchar(64) | yes | โค้ดสั้น (จาก Stripe `failure_reason` หรือของเรา เช่น `retry_window_exhausted`) |
| `LAST_ERROR` | varchar(120) | yes | โค้ดสั้นเท่านั้น (ห้ามข้อความดิบ/PII) |
| `IS_ASYNC` | bool | no | true เมื่อ payment เป็น PromptPay (UI ต้องบอกผู้ใช้ตรง ๆ) |
| `REQUIRES_MANUAL_REVIEW` | bool | no | default false — คิวของ admin |
| `FIRST_ATTEMPT_AT_UTC` / `NEXT_ATTEMPT_AT_UTC` / `LEASE_UNTIL_UTC` / `LAST_CHECKED_AT_UTC` | timestamptz(3) | yes | วงจร retry/lease/poll |
| `REQUESTED_BY_USER_ID` | uuid | yes | null = ระบบตามนโยบาย |
| `DECIDED_BY_USER_ID` | uuid | yes | admin (ตามสเก็ตช์) |
| `DECISION_NOTE` | varchar(500) | yes | |
| `REQUESTED_AT_UTC` | timestamptz(3) | no | |
| `COMPLETED_AT_UTC` / `FAILED_AT_UTC` | timestamptz(3) | yes | |
| `ROW_VERSION` | bytea | no | |

Index/constraint: `PK_REFUNDS` · `UX_REFUNDS_IDEMPOTENCY_KEY` · `UX_REFUNDS_PROVIDER_REFUND` · `IX_REFUNDS_DUE` (`NEXT_ATTEMPT_AT_UTC`) `HasFilter("\"STATUS\" = 'Requested'")` · `IX_REFUNDS_PROCESSING` (`LAST_CHECKED_AT_UTC`) `HasFilter("\"STATUS\" = 'Processing'")` · `IX_REFUNDS_PAYMENT` (`PAYMENT_ID`) · `IX_REFUNDS_BOOKING` (`BOOKING_ID`) `HasFilter("\"BOOKING_ID\" IS NOT NULL")` · `IX_REFUNDS_REVIEW` (`REQUESTED_AT_UTC`) `HasFilter("\"REQUIRES_MANUAL_REVIEW\" = true")` · CHECK `CK_REFUNDS_COMPLETED_HAS_PROVIDER_ID` (`"STATUS" <> 'Completed' OR "PROVIDER_REFUND_ID" IS NOT NULL`)

State machine (domain method เท่านั้น): `Requested→Processing` (provider รับ, pending/requires_action) · `Requested→Completed` (provider ตอบ succeeded ทันที) · `Requested→Failed` (permanent / หมดหน้าต่าง retry / provider failed·canceled) · `Processing→Completed` · `Processing→Failed` · `Completed→Failed` (provider ย้อนภายหลัง — หายาก: หัก `REFUNDED_AMOUNT` กลับ + ธง manual review) · `Failed→Requested` (**เฉพาะ admin retry**: `ATTEMPT_NO++`, key ใหม่, ล้าง FAILURE_*) · `Failed→Voided` (admin void) · ทางอื่น → `InvalidOperationException`. ลำดับความก้าวหน้าเมื่อรับสถานะจาก provider (webhook/poll/ผลตอบกลับตรง): `Requested(0) < Processing(1) < Completed(2)`; รับสถานะที่ rank ต่ำกว่าปัจจุบันหรือ event เก่ากว่า `PROVIDER_STATUS_AT_UTC` ⇒ ทิ้ง; `failed/canceled` จาก provider ยอมรับได้ทุกสถานะที่ไม่ใช่ Voided · **สถานะ `Failed` และ `Voided` ไม่นับในยอดจอง cap (`PAYMENT.REFUND_RESERVED_AMOUNT`/`booking.REFUNDED_AMOUNT`)** ⇒ การเข้าสู่ `Failed` ปล่อย cap และ reinstate ledger อัตโนมัติ (P13-07 §5.5; ติวเตอร์ไม่เสียเงินขณะผู้เรียนไม่ได้รับเงินคืนจริง) · `retry` จอง cap/ledger ใหม่ (§6.4)

### 2.2 `TUTORING.TUTOR_PENALTY_EVENTS` (entity `TUTOR_PENALTY_EVENT`; **append-only** ยกเว้นตราประทับ void)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `PENALTY_EVENT_ID` | uuid PK | no | |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` **NoAction** (`FK_TUTOR_PENALTY_EVENTS_TUTOR_PROFILES_TUTOR_ID`) |
| `SESSION_ID` | uuid | no | FK → `TUTOR_SESSIONS` **NoAction** *(เพิ่มจากสเก็ตช์ — โทษคิดต่อ "คลาส" ไม่ใช่ต่อ booking: คลาสกลุ่ม 6 คนต้องไม่ถูกหัก 6 เท่า)* |
| `BOOKING_ID` | uuid | yes | booking ที่ทำให้เกิดเหตุการณ์ (ตัวแรก) — ไม่มี FK |
| `KIND` | varchar(16) | no | `NoShow` \| `LateCancel` |
| `POINTS` | int | no | CHECK `POINTS >= 1` (ถ้า 0 คะแนน **ไม่สร้างแถว**) |
| `REASON_CODE` | varchar(40) | no | เช่น `tutor_cancel.tier_24h`, `tutor_noshow` |
| `CREATED_AT_UTC` | timestamptz(3) | no | |
| `VOIDED_AT_UTC` / `VOIDED_BY_USER_ID` / `VOID_NOTE` | timestamptz(3)/uuid/varchar(500) | yes | admin ยกเลิกโทษ (appeal ผ่าน dispute) — แถวคงอยู่ แต่ไม่นับคะแนน |

Index: `PK_TUTOR_PENALTY_EVENTS` · **UQ** `UX_PENALTY_SESSION_KIND` (`SESSION_ID`,`KIND`) — กันโทษซ้ำเมื่อ cancel/no-show job ชนกันหรือเรียกซ้ำ · `IX_PENALTY_TUTOR_CREATED` (`TUTOR_ID`,`CREATED_AT_UTC` DESC)

### 2.3 ที่ต้องมีจากตารางของ task อื่น (ถ้าขาดให้ task เจ้าของเพิ่ม — ไม่ใช่ที่นี่)
- `TUTOR_PROFILES` (P13-01 มีครบแล้ว): `RELIABILITY_SCORE int default 100` — **denormalized: เขียนผ่าน `TutorProfileStatsUpdater` (Infrastructure, `ExecuteUpdateAsync`) ที่เดียวเท่านั้น** (source-scan test ของ P13-01 §9 บังคับ) ⇒ `TutorReliabilityUpdater` **คำนวณคะแนน** แล้วส่งให้ updater เขียนผ่านทางเข้า `ITutorStatsWriter.SetReliabilityScoreAsync(Guid tutorId, int score, CancellationToken)` (interface เดียวกับ `IncrementCompletedSessionsAsync` ที่ P13-10 §2.1 อ้าง — ผู้ลงมือคนแรกที่ถึงเป็นผู้ประกาศ, `TutorProfileStatsUpdater` implement) · `STATUS` + domain `Suspend(string reason, IClock)` (Verified→Suspended, `IS_LISTED=false`, ใช้โดย P13-08 อัตโนมัติตามตารางของ P13-01 §5.1) · เหตุผลที่ระงับอัตโนมัติขึ้นต้น `auto:` (เช่น `auto:reliability_score_lt_60`, `auto:noshow_count_ge_3`) เพื่อให้ admin กรองคิว "ระงับโดยระบบ" จาก `STATUS_REASON` ได้โดยไม่ต้องเพิ่มคอลัมน์
- `TUTOR_BOOKINGS`: `CANCELLED_AT_UTC`, `CANCEL_REASON varchar(500)`, `REFUNDED_AMOUNT` (**ความหมายที่นี่: ผลรวม refund ที่ "ตัดสินใจคืนแล้ว" = Requested+Processing+Completed ของ booking นี้ — เขียนโดย `TutoringRefundService` ที่เดียว**), `ESCROW_STATE` (`None|Held|Released|Reversed|Frozen`), `LEARNER_CONFIRMED_AT_UTC`, `PACKAGE_PURCHASE_ID` (P13-05)
- **คอลัมน์ที่ P13-08 เพิ่มบน `TUTOR_BOOKINGS` ใน migration นี้ (§2.3a — additive, มติ D-A):** `ESCROW_RELEASE_AT_UTC timestamptz(3) NULL` = เวลาที่ส่วนของติวเตอร์ถึงกำหนดปล่อย (สูตร §3.3) · partial index `IX_TUTOR_BOOKINGS_ESCROW_DUE` (`ESCROW_RELEASE_AT_UTC`) `HasFilter("\"ESCROW_STATE\" = 'Held' AND \"ESCROW_RELEASE_AT_UTC\" IS NOT NULL")` · domain mutator ใหม่ `TUTOR_BOOKING.ScheduleEscrowRelease(DateTime atUtc)` (ไม่แก้เมทริกซ์สถานะ; ตั้งได้เมื่อ `ESCROW_STATE=Held`; ถูกล้างเมื่อ `SetEscrowState(Frozen|Reversed|Released)`) — property + mutator อยู่ในไฟล์ entity ของ P13-05 แบบ additive (ผู้ลงมือ P13-08 เพิ่ม + unit test; เมทริกซ์ 10×10 ไม่เปลี่ยน)
- **domain methods ที่ P13-05 §3 (FROZEN) ให้แล้ว — P13-08 เรียกเฉพาะตัวเหล่านี้ ไม่เพิ่มเส้นทางสถานะ:** `TUTOR_BOOKING.CancelByLearner(DateTime nowUtc, string? reason)` / `CancelByTutor(…)` (PendingPayment|Confirmed→CancelledBy*) · `MarkCompleted(DateTime nowUtc)` (Confirmed→Completed; เซ็ต `COMPLETED_AT_UTC`) · `MarkNoShow(NoShowKind kind, DateTime nowUtc)` (`enum NoShowKind { Learner, Tutor, Both }` ประกาศที่ P13-05) · `MarkDisputed()` · `SetEscrowState(EscrowState)` (`None|Held|Released|Reversed|Frozen`) · `SetRefundedAmount(decimal total)` (`0 ≤ total ≤ PRICE_AMOUNT`; **P13-08 `TutoringRefundService` เป็นผู้เรียกที่เดียว**) · `TUTOR_SESSION.ReleaseSeat(IClock)` (กลุ่ม; เหลือ 0 ⇒ Cancelled) / `Cancel(IClock)` (1:1 และการยกเลิกทั้งคลาส) หรือ SQL (ข) ของ P13-05 §5.3 เมื่อไม่ได้ล็อกแถว · ล็อกด้วย `LockSessionAsync`/`LockBookingAsync` (P13-05 §5.0 ข) + `LockPaymentAsync` (P13-06 §6.0) · transition ที่ผิด ⇒ `InvalidOperationException`

---

## 3. `CancellationPolicy` — pure function (`Siri.Modules.Tutoring.Domain.Policy`; ไม่รู้จัก EF/HTTP/IClock — เวลาเข้ามาเป็น input)

```csharp
public enum CancellationTrigger { LearnerCancel, TutorCancel, TutorNoShow, LearnerNoShow, NoShowBoth }
public enum BookingFunding { Direct, PackageCredit }
public enum RefundSettlement { None, Money, CreditRestore }          // Money = Stripe refund; CreditRestore = คืนเครดิตแพ็กเกจ (ไม่มีเงินเคลื่อนไหว)
public enum EscrowAction { None, ReverseFull, ReducePartial, ScheduleRelease }
public enum TutorPenaltyKind { LateCancel, NoShow }
public enum BookingOutcome { CancelledByLearner, CancelledByTutor, NoShowTutor, NoShowLearner, NoShowBoth }
public enum PackageTutorFaultRemedy { RestoreCredit, RefundMoney }

public sealed record TutorCancelPenaltyTier(int MinHoursBeforeStart, int Points);   // เรียงมาก→น้อย
public sealed record CancellationPolicyConfig(
    int FullRefundHours,                       // 24
    decimal LateRefundPercent,                 // 50
    IReadOnlyList<TutorCancelPenaltyTier> TutorCancelTiers,
    int TutorCancelAfterStartPoints,           // 6
    int TutorNoShowPoints,                     // 10
    PackageTutorFaultRemedy PackageTutorFaultRemedy);   // RestoreCredit

public sealed record CancellationInput(
    CancellationTrigger Trigger, DateTime NowUtc, DateTime SessionStartsAtUtc, DateTime SessionEndsAtUtc,
    decimal AmountPaid,                        // PRICE_AMOUNT ของ booking (0 = ทดลองเรียนฟรี); แพ็กเกจ = ส่วนของครั้งนั้น
    BookingFunding Funding);

public sealed record CancellationDecision(
    bool Allowed, string RuleCode, string? RefusalReason,
    decimal RefundAmount, decimal RetainedAmount, decimal RefundPercent,   // Refund + Retained == AmountPaid เสมอ
    RefundSettlement Settlement, RefundReason? RefundReason,
    EscrowAction EscrowAction, BookingOutcome ResultingOutcome,
    TutorPenaltyKind? PenaltyKind, int PenaltyPoints,
    bool ReleasesSlot, bool ConsumesCredit, bool RestoresCredit);

public static class CancellationPolicy
{
    public static CancellationDecision Evaluate(in CancellationInput input, CancellationPolicyConfig config);
}
```

### 3.1 กฎ (ตารางเดียวที่ implement และเทสต์)
`lead = SessionStartsAtUtc − NowUtc` (เปรียบเทียบด้วย `TimeSpan` ไม่ปัดเป็นชั่วโมง) · `refund(p) = Round(AmountPaid × p / 100, 2, MidpointRounding.AwayFromZero)` · `retained = AmountPaid − refund` (**เศษสตางค์ที่ปัดไม่ลงตัวตกฝั่งผู้ซื้อเมื่อครึ่งสตางค์พอดี (AwayFromZero) แล้ว "ส่วนที่ไม่คืน" = ส่วนต่าง** ⇒ ผลรวมเท่ายอดจ่ายเป๊ะ ไม่หายสตางค์) · `0 ≤ refund ≤ AmountPaid`

| Trigger | เงื่อนไข | RuleCode | Refund% | Settlement: Direct | Settlement: PackageCredit | EscrowAction | โทษ | ผลสถานะ |
|---|---|---|---|---|---|---|---|---|
| LearnerCancel | `lead ≥ FullRefundHours·1h` | `learner_cancel.full` | 100 | Money (ถ้ายอด>0) · เหตุผล `LearnerCancelEarly` | **CreditRestore** (RestoresCredit) | ReverseFull | — | CancelledByLearner |
| LearnerCancel | `0 < lead < FullRefundHours·1h` | `learner_cancel.late` | `LateRefundPercent` | Money (refund>0) · `LearnerCancelLate` | Money ของ "ส่วนของครั้งนั้น" (refund>0) + **ConsumesCredit** | ReducePartial (refund>0 และ <100%) · ถ้า refund=0 ⇒ ScheduleRelease · ถ้า pct=100 ⇒ เหมือน `.full` | — | CancelledByLearner |
| LearnerCancel | `lead ≤ 0` (เริ่มแล้ว/พอดี) | `learner_cancel.rejected_after_start` | — | **Allowed=false** (`RefusalReason="after_start"`) | เหมือนกัน | — | — | — |
| TutorCancel | `NowUtc < SessionEndsAtUtc` | `tutor_cancel` | 100 | Money · `TutorCancel` | ตาม `PackageTutorFaultRemedy`: **RestoreCredit** (default) หรือ Money | ReverseFull | `LateCancel`: tier แรกที่ `lead ≥ MinHours·1h` (inclusive); `lead < 0` ⇒ `TutorCancelAfterStartPoints`; 0 คะแนน ⇒ `PenaltyKind=null` | CancelledByTutor |
| TutorCancel | `NowUtc ≥ SessionEndsAtUtc` | `tutor_cancel.rejected_after_end` | — | Allowed=false (`after_end`) | | | | |
| TutorNoShow | — | `tutor_noshow` | 100 | Money · `TutorNoShow` | remedy เหมือน TutorCancel | ReverseFull | `NoShow` = `TutorNoShowPoints` | NoShowTutor |
| LearnerNoShow | — | `learner_noshow` | 0 | None | None + **ConsumesCredit** | ScheduleRelease | — | NoShowLearner |
| NoShowBoth | — | `noshow_both` | 100 | Money · `NoClassHeld` | remedy เหมือน TutorCancel | ReverseFull | — | NoShowBoth |

- **ทดลองเรียนฟรี / ยอด 0:** `refund = retained = 0`, `Settlement=None`, `EscrowAction=None` ในทุกแถว (ไม่มีเงินให้ทำอะไร) · **โทษของติวเตอร์ยังใช้ตามปกติ** · ผู้เรียกยกเลิกช้าได้ (ไม่มีโทษฝั่งผู้เรียก)
- `ReleasesSlot=true` ทุกแถวที่ผลเป็นยกเลิก (CancelledBy*); no-show ไม่ปล่อยช่อง (ผ่านเวลาไปแล้ว) · `ConsumesCredit`/`RestoresCredit` มีผลเฉพาะ `Funding=PackageCredit`
- กลุ่มย่อย: ตัวอย่างต่อ booking (ราคาต่อที่นั่ง) — กฎเหมือนกัน; โทษติวเตอร์ที่ยกเลิก **คลาส** คิดครั้งเดียวต่อ session (§7)

### 3.2 ขอบที่เทสต์ต้องล็อก (ตัวอย่าง `start = T`, `FullRefundHours=24`)
`now = T−24h00m00.000s` ⇒ `.full` · `T−24h+1ms` ⇒ `.late` · `T−23:59:59.999` ⇒ `.late` · `T−7d` ⇒ `.full` · `T−1ms` ⇒ `.late` · `T` ⇒ rejected · `T+1s` ⇒ rejected · `FullRefundHours=0` ⇒ ก่อน `T` ทุกกรณี `.full` · `LateRefundPercent=0` ⇒ refund 0, ScheduleRelease · `=100` ⇒ ทุกกรณี full · `=33.33` ⇒ `333.33×33.33% = 111.09…` ปัดตามกฎ · เวกเตอร์เงิน: `AmountPaid=333.33` ที่ 50% ⇒ refund **166.67**, retained **166.66** · `0.01` ที่ 50% ⇒ refund 0.01, retained 0.00 · `1.00` ที่ 50% ⇒ 0.50/0.50 · `1000.00` ⇒ 500.00/500.00 · tutor tiers ที่ `lead` = 200h→0 pts(ไม่มีแถว), 168h→0, 167h59m59s→1, 72h→1, 71h59m→2, 24h→2, 23h59m→4, 1ms ก่อนเริ่ม→4, หลังเริ่มก่อนจบ→6, หลังจบ→rejected · **property test:** สุ่ม input ทุกตัวแปร ⇒ `Refund+Retained==AmountPaid`, 2 ตำแหน่ง, ไม่ติดลบ, ไม่เกินยอดจ่าย

### 3.3 เวลาปล่อยเงินของส่วนที่ติวเตอร์ได้ (มติกลาง D-A) — `EscrowReleaseTime` (pure, `Domain.Policy`)
`AvailableAtUtc = max(SessionEndsAtUtc, decidedAtUtc) + DisputeWindowHours·1h` — **สูตรเดียวทั้งระบบ** ใช้กับ: คลาสจบปกติ (`decidedAt` = เวลา complete/finalize), ผู้เรียก no-show, ยกเลิกช้า (ส่วนที่ไม่คืน; `decidedAt` = เวลายกเลิก) และทุกเส้นทางที่มี "ส่วนที่ติวเตอร์ได้" · **ปล่อยทันที (`AvailableAt = now`) เฉพาะ** (ก) ผู้เรียกกด confirm-completed (`ReleaseEarlyAsync` / `releaseImmediately=true`) (ข) admin (`ResolveDispute`/`Unfreeze`) · `DisputeWindowHours` = `Tutoring:DisputeWindowHours` (P13-06 §7)
- เวกเตอร์: ends 10:00, decided 09:50 (complete ก่อนจบ), window 24 ⇒ ถัดไปวัน 10:00 · ends 10:00, decided 10:05 ⇒ ถัดไปวัน 10:05 · ยกเลิกช้า (ends 10:00, ยกเลิกเมื่อวาน 20:00) ⇒ ถัดไปวัน 10:00 (อิง ENDS ไม่ใช่เวลายกเลิก) · window 0 ⇒ `max(ends, decided)`
- **`booking.ESCROW_STATE` (D-A):** `Held` **ตลอดช่วงรอ** `AvailableAt` — `Settle*`/cancel ที่ตั้งเวลาปล่อย **ไม่ตั้ง `Released`**; เก็บเวลาไว้ที่ `TUTOR_BOOKINGS.ESCROW_RELEASE_AT_UTC` (§2.3a) ผ่าน `ScheduleEscrowRelease` และ job `tutoring-refund-reconcile` (ทุก 15 นาที — ข้อ 3 ของ §6.6) ตั้ง `Released` ด้วย SQL เดียวเมื่อ `ESCROW_RELEASE_AT_UTC <= now` (วิธีที่เรียบง่ายสุด: ไม่ต้องอ่าน Payout, ไม่มี job ใหม่) · ตั้ง `Released` ทันทีเมื่อ `releaseImmediately`/`ReleaseEarlyAsync`/admin · `Frozen` ตอน dispute (ล้างเวลาปล่อย) · `Reversed` เมื่อคืนเต็ม

---

## 4. Interfaces consumed by P13-09/10/14 (**ส่วนบังคับ — ชื่อ/ลายเซ็น/semantics ที่ผู้เรียกพึ่งได้**)

> เหล่านี้เป็น **คลาสภายใน assembly Tutoring** (Repository+Service pattern — ไม่ใช่ cross-module contract) ใน `Siri.Modules.Tutoring.Application` · ทุกเมธอด: (ก) **เข้าร่วม transaction ที่มีอยู่** (`CurrentTransaction`) หรือเปิดเองถ้าไม่มี (`ITutoringUnitOfWork`, P13-05 §5.0) — ผู้เรียกที่ทำหลายขั้นต่อเนื่อง (finalize job) ควรห่อเอง · (ข) ล็อกตามลำดับ canonical (มติ D-B) `SESSION → BOOKING (ASC) → [PACKAGE_PURCHASE → CREDITS] → PAYMENT → REFUND → SPLITS → TUTOR_PROFILE` — booking ที่ `PACKAGE_PURCHASE_ID <> null` เรียก `IPackageCreditService.LockPurchaseAsync(purchaseId)` ก่อน lock payment (P13-12 F8); ผู้เรียกที่ถือ lock session+booking อยู่แล้ว (เช่น P13-10 finalize) ปล่อยให้เมธอดเหล่านี้ล็อก purchase→payment→refund ต่อเอง · (ค) **idempotent ตามสถานะ booking** (เรียกซ้ำ = `AlreadyApplied` ไม่ใช่ error) · (ง) **เมธอดที่คืน `Result` แล้วได้ `IsFailure` ขณะ join txn ของผู้เรียก: ตัว `ITutoringUnitOfWork` ไม่ rollback ให้ ⇒ ผู้เรียกต้อง `throw` เอง** (เส้นที่ผู้เรียกเป็นเจ้าของ txn ภายนอก เช่น webhook ก็เช่นกัน — P13-06 F3) · (จ) เขียน `SECURITY_AUDIT` โดยถือว่า `RecordAuditAsync` flush ทุกอย่างที่ tracked (P13-06 F7 / F5): เรียกหลังงานที่ต้อง atomic พร้อมแล้วและเมื่ออยู่ใน txn ของผู้เรียกเท่านั้น (ไม่ commit) · (ฉ) **ไม่เรียก HTTP ภายนอกใน txn/lock** (D-B)

```csharp
namespace Siri.Modules.Tutoring.Application;

public enum DisputeResolutionKind { FullRefund, PartialRefund, NoRefund }

public sealed record SettlementOutcome(
    string Code,                   // ค่าคงที่ snake_case เช่น "completed", "already_completed", "noshow_tutor_refunded", "released_early"
    bool AlreadyApplied,
    Guid? RefundId,                // refund ที่สร้าง/พบ (ถ้ามี)
    decimal RefundAmount,          // ที่ตัดสินใจคืนเงินในการเรียกครั้งนี้ (0 ถ้าไม่มี)
    decimal RetainedAmount);

// ---- P13-06 (เจ้าของ implementation; ระบุที่นี่เพื่อให้ครบ) -------------------------------------------
// listener-only; THROWS เมื่อ infra/ledger ล้ม (ให้ webhook rollback); anomaly ทางธุรกิจ → ผลลัพธ์ (refund) ไม่ใช่ exception
Task<PaymentFulfillmentOutcome> BookingSettlementService.ConfirmPaidAsync(ConfirmPaidCommand command, CancellationToken ct);

// ---- P13-10 (ชื่อ/ลายเซ็นตรงกับ "Required from P13-08" ใน P13-10 §2.3 — P13-10 FROZEN ไปแล้ว จึงยึดชื่อของผู้เรียก; ทุกเมธอดอยู่ใน transaction ของผู้เรียก) ----
// P13-10 ถือ lock session+booking ไว้แล้ว (§6.0 ของ P13-06) · เมธอดเหล่านี้เป็นผู้เขียนเดียวของ TUTOR_BOOKINGS.STATUS(terminal)/ESCROW_STATE/REFUNDS/penalty
// ไม่เรียก Stripe ใน transaction (ฝาก REFUNDS 'Requested' ให้ job §6.5) · เรียกซ้ำบน booking ที่ terminal แล้ว = Success + AlreadyApplied (no-op)
// (ตรงกับชื่อที่พรอมต์ตั้งต้นใช้: CompleteAndScheduleRelease = SettleCompletedAsync, MarkNoShow = Settle{Tutor|Learner|Both}NoShowAsync)

/// holdStartedAtUtc = เวลาตัดสิน (decidedAt) ที่ใช้นับ DisputeWindowHours — P13-10 ส่ง max(session.ENDS_AT_UTC, now) (complete เปิดได้ตั้งแต่ E−10 นาที จึงส่งค่า = E ได้): **validation `session.STARTS_AT_UTC <= holdStartedAtUtc <= max(session.ENDS_AT_UTC, now + 1 นาที)`** ไม่งั้น Validation "tutoring.invalid_hold_start".
/// releaseImmediately=true (ผู้เรียกยืนยันจบคลาส / admin เท่านั้น — มติ D-A) ⇒ AVAILABLE_AT = now; ไม่งั้น AVAILABLE_AT = EscrowReleaseTime(§3.3) = max(session.ENDS_AT_UTC, holdStartedAtUtc) + DisputeWindowHours.
Task<Result<SettlementOutcome>> BookingSettlementService.SettleCompletedAsync(Guid bookingId, DateTime holdStartedAtUtc, bool releaseImmediately, CancellationToken ct);
//   Confirmed → Completed (`booking.MarkCompleted(holdStartedAtUtc)` ⇒ `COMPLETED_AT_UTC = holdStartedAtUtc`; session transition `MarkCompleted` เป็นของ P13-10 Finalize); แพ็กเกจ: credit Reserved→Consumed; Payout.ScheduleRelease(AVAILABLE_AT ข้างบน);
//   **booking.ESCROW_STATE คง `Held` ระหว่างรอ (D-A, §3.3):** `booking.ScheduleEscrowRelease(AVAILABLE_AT)`; ตั้ง `Released` ทันทีเฉพาะ `releaseImmediately` — นอกนั้นโดย job `tutoring-refund-reconcile` เมื่อถึงเวลา; ฟรี/ไม่มี split ⇒ ข้ามขาเงิน (Payout ตอบ NotFound ⇒ ปกติ); Completed แล้ว ⇒ AlreadyApplied; สถานะอื่น ⇒ Conflict "tutoring.booking_not_completable"

/// ไม่คืนเงิน; AVAILABLE_AT = max(session.ENDS_AT_UTC, decidedAtUtc) + DisputeWindowHours (D-A, ติวเตอร์ได้เต็ม); booking.ESCROW_STATE คง Held + ScheduleEscrowRelease; แพ็กเกจ: credit Consumed. CancellationPolicy(LearnerNoShow).
Task<Result<SettlementOutcome>> BookingSettlementService.SettleLearnerNoShowAsync(Guid bookingId, DateTime decidedAtUtc, CancellationToken ct);

/// คืน 100% (Direct = refund เงิน reason TutorNoShow; แพ็กเกจ = คืนเครดิตตาม PackageTutorFaultRemedy) + ReverseBySource เต็ม;
/// applyPenalty=true เท่านั้นที่หักคะแนน NoShow (ครั้งเดียวต่อ (tutor, session) ด้วย UQ แม้ค่าเรียกซ้ำ/หลาย booking) — P13-10 ส่ง false เมื่อมีหลักฐานว่าติวเตอร์อยู่จากแหล่งอื่น. **เมื่อ txn เดียวตัดสินหลาย booking ของ session เดียว (คลาสกลุ่ม) ผู้เรียกส่ง `applyPenalty=true` เฉพาะ booking ใบสุดท้ายของ txn (ใบอื่น false)** — เพื่อให้การเขียน `TUTOR_PROFILES` (`RecordPenaltyAsync`) เป็นลำดับท้ายสุดของ txn ตาม D-B (booking ใบถัดไปต้องไม่ล็อก booking/payment หลังแตะ profile)
Task<Result<SettlementOutcome>> BookingSettlementService.SettleTutorNoShowAsync(Guid bookingId, Guid sessionId, DateTime decidedAtUtc, bool applyPenalty, CancellationToken ct);

/// คืน 100% (reason NoClassHeld / คืนเครดิต) + ReverseBySource เต็ม; ไม่หักคะแนน; audit tutoring.booking.noshow_both (คิวสุ่มตรวจของ admin อ่านจาก P13-10 §7.3).
Task<Result<SettlementOutcome>> BookingSettlementService.SettleBothNoShowAsync(Guid bookingId, DateTime decidedAtUtc, CancellationToken ct);
//   ทั้งสามตัวข้างบน: Confirmed → NoShowTutor|NoShowLearner|NoShowBoth; ซ้ำสถานะเดิม ⇒ AlreadyApplied; booking อยู่สถานะ terminal อื่น ⇒ Conflict "tutoring.noshow_conflict" (ตัดสินครั้งแรกชนะ)

/// เฉพาะ booking Completed และ escrow ไม่ Frozen (ไม่ใช่ Disputed) ⇒ Payout.ScheduleRelease(nowUtc) (เร็วขึ้นเท่านั้น) + `ESCROW_RELEASE_AT_UTC=now`, `ESCROW_STATE=Released` ทันที (D-A: ปล่อยทันทีเฉพาะผู้เรียกยืนยัน/admin). ซ้ำ/Frozen ⇒ Success no-op พร้อม Code บอกเหตุผล
/// ("already_released" / "escrow_frozen"). ไม่ตั้ง LEARNER_CONFIRMED_AT_UTC และไม่ตรวจความเป็นเจ้าของ — P13-10 ทำใน endpoint (ownership อยู่ใน query ของ confirm-completed).
Task<Result<SettlementOutcome>> BookingSettlementService.ReleaseEarlyAsync(Guid bookingId, DateTime nowUtc, CancellationToken ct);
//   ผู้เรียกที่ยืนยันจบคลาสแล้ว *ยังเปิด dispute ได้* ภายใน DisputeWindowHours (ตาม P13-10 §6.3): ถ้า escrow ปล่อย/เข้า batch ไปแล้ว Freeze ตอบ TooLate ⇒ แก้ด้วย refund + adjustment (§4 FreezeEscrow)

// ---- P13-14 ------------------------------------------------------------------------------------------
public sealed record FreezeEscrowCommand(Guid BookingId, Guid DisputeId, Guid ActorUserId);
Task<Result<SettlementOutcome>> BookingSettlementService.FreezeEscrowAsync(FreezeEscrowCommand command, CancellationToken ct);
//   Completed | NoShowLearner (ภายใน DisputeWindowHours — ผู้เรียกตรวจเวลา) → Disputed; Payout.Freeze; booking.ESCROW_STATE=Frozen
//   Payout ตอบ TooLate (เข้า batch/จ่ายแล้ว) ⇒ Conflict "tutoring.escrow_already_released" และ booking ไม่เปลี่ยน (ผู้เรียก P13-14 จัดการ: เปิด dispute ต่อได้แต่แก้ด้วย refund+adjustment รอบหน้า)
//   ซ้ำด้วย DisputeId เดิม ⇒ AlreadyApplied

public sealed record UnfreezeEscrowCommand(Guid BookingId, Guid DisputeId, Guid ActorUserId, DateTime? ReleaseAtUtc);   // null ⇒ ปล่อยทันที (now)
Task<Result<SettlementOutcome>> BookingSettlementService.UnfreezeEscrowAsync(UnfreezeEscrowCommand command, CancellationToken ct);

public sealed record ResolveDisputeCommand(Guid BookingId, Guid DisputeId, DisputeResolutionKind Resolution, decimal? RefundAmount, Guid AdminUserId, string Note);
Task<Result<SettlementOutcome>> BookingSettlementService.ResolveDisputeAsync(ResolveDisputeCommand command, CancellationToken ct);
//   ต้อง Disputed. FullRefund ⇒ amount = PRICE_AMOUNT − REFUNDED_AMOUNT (เหลือเท่าไรคืนหมด); PartialRefund ⇒ 0 < RefundAmount ≤ เหลือ (ไม่งั้น Validation "tutoring.refund_exceeds_cap");
//   NoRefund ⇒ ไม่มี refund. ทั้งสามแบบ: TutoringRefundService.RequestAsync(DisputeResolved, suffix = DisputeId) (ถ้ามี amount) → Payout.Unfreeze + ScheduleRelease(now) สำหรับส่วนที่ยังเหลือ
//   (คืนเต็มและ rows ยังไม่ batch ⇒ ถูก Reversed โดย ReverseBySource) · ผู้เรียก P13-14 เป็นคนตั้ง booking.STATUS สุดท้ายและบันทึกผล dispute เอง (งานนี้ไม่แตะสถานะ booking นอก Disputed→ตามผู้เรียก)
//   idempotent: key refund:{bookingId}:DisputeResolved:{disputeId:N}; ซ้ำ ⇒ AlreadyApplied (ไม่ตรวจ amount ซ้ำ)

// ---- P13-05/10 UI → ผู้เรียก/ติวเตอร์ยกเลิก (endpoint §5) -----------------------------------------------
public sealed record CancelByLearnerCommand(Guid LearnerUserId, Guid BookingId, string? Reason, decimal ExpectedRefundAmount, string? ClientIp);
public sealed record CancelByTutorCommand(Guid TutorUserId, Guid SessionId, string Reason, string? ClientIp);
Task<Result<CancellationQuoteResponse>>        BookingCancellationService.QuoteForLearnerAsync(Guid learnerUserId, Guid bookingId, CancellationToken ct);
Task<Result<CancelBookingResponse>>            BookingCancellationService.CancelByLearnerAsync(CancelByLearnerCommand command, CancellationToken ct);
Task<Result<TutorCancellationQuoteResponse>>   BookingCancellationService.QuoteForTutorAsync(Guid tutorUserId, Guid sessionId, CancellationToken ct);
Task<Result<CancelClassResponse>>              BookingCancellationService.CancelByTutorAsync(CancelByTutorCommand command, CancellationToken ct);
Task<Result<CancelClassResponse>>              BookingCancellationService.CancelSessionByPlatformAsync(Guid sessionId, string reasonCode, CancellationToken ct);   // §7.3 — job เท่านั้น (ติวเตอร์ที่ถูกระงับ); ไม่มีโทษ

// ---- ภายใน (P13-06/12/14 เรียกได้) ------------------------------------------------------------------
Task<Result<RefundRequestOutcome>> TutoringRefundService.RequestAsync(RequestRefundCommand command, CancellationToken ct);        // §6.1 — ใน txn ผู้เรียก, ไม่เรียก Stripe
Task<RefundExecutionOutcome>       TutoringRefundService.ExecuteAsync(Guid refundId, CancellationToken ct);                       // §6.2 — นอก txn (หลัง commit/ใน job)
Task<PaymentEventHandling>         TutoringRefundService.ApplyProviderRefundAsync(PaymentProviderEvent evt, CancellationToken ct); // §6.3 — webhook (P13-06 §6.6)
Task<Result<TutorReliabilityOutcome>> TutorReliabilityUpdater.RecordPenaltyAsync(RecordPenaltyCommand command, CancellationToken ct); // §7
Task<Result> TutorReliabilityUpdater.VoidPenaltyAsync(Guid sessionId, TutorPenaltyKind kind, Guid adminUserId, string note, CancellationToken ct);
```
`PaymentFulfillmentOutcome`/`ConfirmPaidCommand` นิยามที่ P13-06 §6.2 · `BookingStatus` = enum ของ P13-05

**จุดเรียก `ISessionRoomSync.ConvergeAsync(sessionId)` (P13-09 §9):** ท้ายทุก transition ที่ทำให้ "ผู้เข้าร่วมของห้องเปลี่ยน/ห้องเลิก" — `CancelByLearner` (กลุ่ม: ถอดคนเดียว; 1:1: ห้องถูกยกเลิก), `CancelByTutor`, `CancelSessionByPlatform` (§7.3) — ส่วน `Settle*` ไม่ต้องเรียก (เลยเวลาแล้ว; P13-10 เรียก `ConvergeAsync` เองตอน resolve session) — เรียกผ่าน `ITutoringUnitOfWork.TryRunInSavepointAsync` เสมอ (ล้ม ⇒ rollback ถึง savepoint + log Error + metric ไม่ทำให้ยกเลิก/คืนเงินล้ม; self-heal ใน P13-10). `ISessionRoomSync.ConvergeAsync` คืน `Task` (P13-05 §5.0 ค; ความล้มเหลวสื่อด้วย exception → savepoint ของ `uow.TryRunInSavepointAsync`)

---

## 5. API (controller: `TutoringCancellationController`, `TutorClassCancellationController`, `AdminTutoringRefundsController` ใต้ `Siri.Api/Controllers/Tutoring/`)

กฎร่วม (บังคับ): ทุก action ใส่ `[Authorize]`/`[AllowAnonymous]` ชัดเจน (ไม่มี fallback) · `userId` จาก `IUserContext` **เท่านั้น** (ไม่มีใน body/query/route) · ownership อยู่ใน query เดียวกับการดึงข้อมูล (`WHERE … AND LEARNER_USER_ID=@caller` / session ของติวเตอร์ที่ `TUTOR_PROFILES.USER_ID=@caller`) · ไม่พบ/ไม่ใช่เจ้าของ ⇒ **404 ตัวเดียวกัน** · response การเงินส่วนบุคคล `Cache-Control: no-store` · error = RFC 9457 + `reason` · ข้อความ error ไม่มีข้อความดิบของ Stripe/ชื่อตาราง/จำนวนเงินของคนอื่น
**Rate limit (partitioned ต่อผู้ใช้ — ห้าม `default`; ใช้ policy ที่ P13-01 §7 ประกาศไว้แล้ว ไม่สร้างใหม่):** ทุก endpoint ที่ login แล้วของไฟล์นี้ (quote / cancel / refunds list / tutor cancel / admin refunds) = `tutoring-user` (60 req/60 วิ/ผู้ใช้ — ชื่อ policy อยู่ในคีย์ partition ⇒ ไม่แย่งโควตากับ policy อื่น) · `GET cancellation-policy` (สาธารณะ) = `tutoring-search` (ต่อ IP, P13-04) · *ไม่มี policy ใหม่ใน P13-08*

### 5.1 `GET /api/tutoring/cancellation-policy` — `[AllowAnonymous]` · `tutoring-search` · `Cache-Control: public, max-age=300`
`CancellationPolicyResponse(int FullRefundHours, int FullRefundPercent /*100*/, decimal LateRefundPercent, int TutorCancelRefundPercent /*100*/, int TutorNoShowRefundPercent /*100*/, int LearnerNoShowRefundPercent /*0*/, int DisputeWindowHours)` — ตัวเลขจาก config เท่านั้น (ไว้แสดงนโยบายก่อนจอง; **ไม่ใช่** ราคาคืนจริงของ booking ใด)

### 5.2 `GET /api/tutoring/bookings/{bookingId:guid}/cancellation-quote` — `[Authorize]` · `tutoring-user`
`CancellationQuoteResponse(Guid BookingId, bool CanCancel, string? RefusalReason, string RuleCode, decimal AmountPaid, decimal RefundAmount, decimal RetainedAmount, decimal RefundPercent, RefundSettlementDto Settlement /*None|Money|CreditRestore*/, bool RefundIsAsync, DateTime StartsAtUtc, DateTime QuotedAtUtc, decimal HoursUntilStart)` — คำนวณจาก `CancellationPolicy` ด้วย `IClock` ณ ตอนเรียก · `PendingPayment` ⇒ `CanCancel=true`, `RuleCode="pending_payment.abandon"`, refund 0 · สถานะอื่นที่ยกเลิกไม่ได้ ⇒ `CanCancel=false` + `RefusalReason` (`booking_not_cancellable`/`after_start`) และ 200 (ไม่ใช่ 409 — เป็นข้อมูลให้ UI) · **ไม่ผูกมัดเซิร์ฟเวอร์** (ไม่เก็บ quote)

### 5.3 `POST /api/tutoring/bookings/{bookingId:guid}/cancel` — `[Authorize]` · `tutoring-user`
Request `CancelBookingRequest(string? Reason /*≤500, trim, ตัด control char; เก็บเป็นข้อความล้วน*/, decimal ExpectedRefundAmount /*≥0, 2dp — ยอดที่ผู้ใช้เห็นในหน้ายืนยัน*/)`
Response 200 `CancelBookingResponse(Guid BookingId, string Status, bool AlreadyCancelled, decimal RefundAmount, decimal RetainedAmount, RefundSettlementDto Settlement, BookingRefundSummary? Refund, bool CreditRestored)`

| status | `reason` | เมื่อ |
|---|---|---|
| 404 | `tutoring.booking_not_found` | ไม่พบ/ไม่ใช่เจ้าของ |
| 409 | `tutoring.booking_not_cancellable` | สถานะไม่ใช่ Confirmed/PendingPayment (ext `bookingStatus` — ไม่ใช้ `status`: ชื่อสงวน, README §6) |
| 409 | `tutoring.cancel_after_start` | `now ≥ STARTS_AT_UTC` |
| 409 | `tutoring.cancellation_quote_changed` | ยอดคืนจริง **น้อยกว่า** `ExpectedRefundAmount` (ขอบ 24 ชม. เพิ่งผ่านระหว่างที่ผู้ใช้อ่านหน้ายืนยัน) — ext `refundAmount`,`retainedAmount` ⇒ FE แสดงยอดใหม่ให้ยืนยันซ้ำ (ยอดจริง ≥ ที่คาด ⇒ ดำเนินต่อ ผู้ใช้ได้เปรียบ) |
| 409 | `tutoring.concurrent_update` | ชน concurrency ซ้ำหลัง retry 1 ครั้ง |
| 400 | `validation` | Reason ยาวเกิน/ExpectedRefundAmount ผิด |
| 429 | — | rate limit |
**ยกเลิกซ้ำ (ดับเบิลคลิก):** booking อยู่ `CancelledByLearner` แล้ว ⇒ **200** พร้อมผลเดิม `AlreadyCancelled=true` (ไม่ตรวจ `ExpectedRefundAmount` ซ้ำ) · การยกเลิก **ไม่ขึ้นกับ Stripe**: ถ้า Stripe ล่ม ⇒ ยกเลิกสำเร็จ + refund `Requested` (job ส่งต่อ) — ตอบ 200 ปกติ

### 5.4 `GET /api/tutoring/bookings/{bookingId:guid}/refunds` — `[Authorize]` · `tutoring-user`
`IReadOnlyList<BookingRefundSummary>` (เรียง `REQUESTED_AT_UTC` desc; เฉพาะ booking ของผู้เรียก ไม่ใช่ ⇒ 404) · `BookingRefundSummary(Guid RefundId, decimal Amount, RefundDisplayStatus Status /*Requested|Processing|Completed|Failed*/, bool IsAsync, DateTime RequestedAtUtc, DateTime? CompletedAtUtc)` — `Voided` แสดงเป็น `Failed`; **ไม่คืน** `FAILURE_CODE/PROVIDER_*`/id ของ Stripe

### 5.5 ติวเตอร์ — `[Authorize(Policy = AuthorizationPolicyNames.InstructorOnly)]` (**ไม่ใช้ `TutorOnly`** — ติวเตอร์ที่ถูกระงับต้องยกเลิกคลาสที่ค้างได้) · `tutoring-user`
- `GET /api/tutoring/tutor/classes/{sessionId:guid}/cancellation-quote` ⇒ `TutorCancellationQuoteResponse(Guid SessionId, bool CanCancel, string? RefusalReason, int AffectedBookings, decimal TotalRefundAmount, TutorPenaltyKind? PenaltyKind, int PenaltyPoints, int CurrentReliabilityScore, int ProjectedReliabilityScore, bool WillTriggerSuspension, DateTime StartsAtUtc)`
- `POST /api/tutoring/tutor/classes/{sessionId:guid}/cancel` body `CancelClassRequest(string Reason /*3–500*/)` ⇒ 200 `CancelClassResponse(Guid SessionId, string Status, bool AlreadyCancelled, IReadOnlyList<CancelledBookingResult> Bookings, TutorPenaltyKind? PenaltyKind, int PenaltyPoints, int ReliabilityScore, bool Suspended)` โดย `CancelledBookingResult(Guid BookingId, string BookingNo, decimal RefundAmount, RefundSettlementDto Settlement, RefundDisplayStatus? RefundStatus)`
- ownership: `TUTOR_SESSIONS.TUTOR_ID` ของโปรไฟล์ที่ `USER_ID = caller` (ใน WHERE เดียว) ⇒ ไม่ใช่ ⇒ 404 `tutoring.class_not_found` · 409 `tutoring.class_not_cancellable` (สถานะ session ไม่ใช่ Held/Scheduled) · 409 `tutoring.cancel_after_end` · ผลลัพธ์เห็นเฉพาะ BookingNo + ยอด (ไม่เห็นชื่อ/อีเมลผู้ปกครอง)
- ยกเลิกทั้ง session: ทุก booking `Confirmed` ⇒ `CancellationPolicy(TutorCancel)`; `PendingPayment` ⇒ ปล่อย hold + cancel PI (ไม่มีเงิน); โทษ ครั้งเดียวต่อ session; `Cancelled` session

### 5.6 Admin — `[Authorize(Policy = AuthorizationPolicyNames.AdminOnly)]` · `tutoring-user`
- `GET /api/tutoring/admin/refunds?status=&needsReview=&page=&pageSize=` ⇒ `PagedResult<AdminRefundRow>` — `AdminRefundRow(Guid RefundId, Guid PaymentId, Guid? BookingId, string? BookingNo, decimal Amount, RefundReason Reason, RefundStatus Status, string? ProviderStatus, string? FailureCode, bool RequiresManualReview, bool IsAsync, int AttemptNo, DateTime RequestedAtUtc, DateTime? CompletedAtUtc, string? DecisionNote)` (ไม่มี PII ผู้เรียก — รายละเอียดผู้เรียกดูที่หน้า booking/dispute ของ admin)
- `POST /api/tutoring/admin/refunds` body `AdminManualRefundRequest(Guid BookingId, decimal Amount, string Note /*3–500*/, Guid ClientRequestId)` ⇒ 201 `AdminRefundRow` — `RequestAsync(AdminManual, suffix=ClientRequestId:N, DecidedBy=admin)`; ดับเบิลคลิก ⇒ key เดียวกัน ⇒ คืนแถวเดิม 200 · ตรวจ cap (409 `tutoring.refund_exceeds_cap` ext `maxRefundable`) · payment ต้อง `Succeeded|PartiallyRefunded`
- `POST /api/tutoring/admin/refunds/{refundId:guid}/retry` body `RetryRefundRequest(string Note, bool ConfirmedNoRefundInStripeDashboard)` ⇒ ต้อง `ConfirmedNoRefundInStripeDashboard=true` (admin ยืนยันว่าตรวจใน Stripe แล้วไม่มี refund จริง — กันคืนซ้ำเมื่อ key เดิมหมดอายุ 24 ชม.) · `STATUS=Failed` เท่านั้น ⇒ ลำดับล็อก §6.0 แล้ว `Failed→Requested`, `ATTEMPT_NO++`, key `…:a{n}`, **จอง cap ใหม่ใต้ lock (เกิน ⇒ 409 `tutoring.refund_exceeds_cap` — เพราะ `Failed` ปล่อย cap ไปแล้ว อาจมี refund อื่นใช้ไป)** + `ReverseBySource(…:{++LEDGER_SEQ})` ลด ledger อีกครั้ง · ผลอื่น 409 `tutoring.refund_not_retryable`
- `POST /api/tutoring/admin/refunds/{refundId:guid}/void` body `VoidRefundRequest(string Note)` ⇒ `Failed→Voided` (admin ตัดสินว่าไม่คืน/คืนนอกระบบ) — **cap และ ledger ถูกปล่อยไปแล้วตั้งแต่เข้า `Failed`** (ติวเตอร์ได้ส่วนที่หักคืนมาผ่าน reinstate ของ P13-07 §5.5) ⇒ void ทำ: ลำดับล็อก §6.0 → `RecomputeRefundTotals` (ปกติไม่เปลี่ยน) → เรียก `ReverseBySourceAsync` ด้วย cumulative ปัจจุบันเป็นตาข่ายนิรภัยให้ ledger ตรงเสมอ (ปกติ `NoChange`) → audit · ห้ามปล่อยให้ติวเตอร์เสียเงินขณะผู้เรียนไม่ได้รับเงินคืนจริง
ทุก action เขียน `SECURITY_AUDIT` (`tutoring.refund.admin_manual|admin_retry|admin_void`) ใน txn เดียว

---

## 6. `TutoringRefundService` — วงจร `REFUNDS`

### 6.0 กฎล็อก + HTTP + ยอดรวมของ refund (มติกลาง D-B)
- **ลำดับล็อก:** `SESSION → BOOKING (ASC) → PACKAGE_PURCHASE → CREDITS → PAYMENT → REFUND → Payout splits → TUTOR_PROFILE` — **ทุก flow ล็อก `PAYMENT` ก่อน `REFUND` เสมอ** (`RequestAsync`: แถว refund เป็นแถวใหม่ ไม่ต้องล็อก; `ExecuteAsync` ขั้นบันทึกผล, `ApplyProviderRefundAsync`, admin retry/void, reconcile — ทุกตัวต้องล็อก payment ก่อน refund) · เส้นที่ไม่รู้ id ล่วงหน้า (provider event, job): อ่านแถว `REFUND` **ไม่ล็อก** เพื่อหา `PAYMENT_ID`/`BOOKING_ID`/`PACKAGE_PURCHASE_ID` → ล็อก booking → [purchase: `IPackageCreditService.LockPurchaseAsync`] → `LockPaymentAsync` → ล็อก refund (`FOR UPDATE`) แล้ว **อ่านสถานะซ้ำ** ตัดสินจากค่าที่ล็อกแล้ว
- **ห้ามเรียก HTTP ภายนอก (Stripe `CreateRefund`/`GetRefund`/`GetPaymentIntent`/`GetChargeFee`) ขณะถือ txn หรือ lock:** `ExecuteAsync` เรียก `CreateRefundAsync` นอก txn (§6.2 ข้อ 2) · reconcile เรียก `GetRefundAsync` ก่อนเปิด txn (§6.6) · `ApplyProviderRefundAsync` (webhook) DB-only
- **ยอดรวมคำนวณใหม่จากแถว `REFUNDS` ทุกครั้ง (ไม่ `+=`/`−=`):** `RecomputeRefundTotalsAsync(paymentId)` ใต้ lock ของ payment: `reserved = Σ AMOUNT WHERE PAYMENT_ID=@p AND STATUS IN (Requested, Processing, Completed)`, `completed = Σ AMOUNT WHERE STATUS = Completed` ⇒ `payment.ApplyRefundTotals(reserved, completed)` (P13-06 §2.1 — ครอบคลุม Succeeded→Partially/Refunded และ **revert** เมื่อ refund Failed/Voided/provider ย้อน) · ถ้ามี booking: `booking.SetRefundedAmount(Σ AMOUNT WHERE BOOKING_ID=@b AND STATUS IN (Requested, Processing, Completed))` · **`Failed` และ `Voided` ไม่นับ ⇒ ปล่อย cap อัตโนมัติ**
- **ledger ตาม refund:** ทุกครั้งที่ผลรวมของ booking เปลี่ยน (คืน, ล้ม/void, retry) เรียก `ITutoringEscrowContract.ReverseBySourceAsync(ref=bookingId, entryKey=$"adj:{refundId:N}:{++LEDGER_SEQ}", cumulative=ผลรวมใหม่ของ booking)` — P13-07 §5.5 รองรับทั้งลด (คืน) และ **reinstate (เพิ่มกลับเมื่อ cumulative ลดลง)** ⇒ ติวเตอร์ไม่เสียเงินขณะผู้เรียนไม่ได้รับเงินคืนจริง

### 6.1 `RequestAsync(RequestRefundCommand)` — **ใน txn ของผู้เรียก, ไม่เรียก Stripe**
```csharp
public sealed record RequestRefundCommand(
    Guid PaymentId, Guid? BookingId, Guid? PackagePurchaseId,
    decimal Amount, RefundReason Reason, string? IdempotencySuffix,
    Guid? RequestedByUserId, Guid? DecidedByUserId, string? Note);
public sealed record RefundRequestOutcome(Guid RefundId, bool AlreadyExisted, RefundStatus Status, bool IsAsync, decimal Amount);
```
1. **IdempotencyKey** (UQ): มี `BookingId` ⇒ `refund:{bookingId:N}:{Reason}` (+`:{suffix}`) · ไม่มี booking ⇒ `refund:p{paymentId:N}:{Reason}` (+`:{suffix}`) · AdminManual ต้องมี suffix (`ClientRequestId:N`) · DisputeResolved suffix = `DisputeId:N` · `PackageExpired` suffix = `creditId:N` (P13-12 §6.3) · **เส้น webhook/reconcile ของ P13-06 (`LatePayment`/`DuplicatePayment`/`AmountMismatch`): `BookingId=null`, `IdempotencySuffix=null` ⇒ key `refund:p{paymentId:N}:{Reason}`** (`paymentId` อยู่ในคีย์แล้ว จึงไม่ซ้ำเป็น suffix) · retry ของ admin ต่อท้าย `:a{ATTEMPT_NO}` · ยาว ≤120
2. มีแถวที่ key นี้อยู่แล้ว ⇒ คืน `AlreadyExisted=true` (ถ้า `Amount` ต่างจากเดิม ⇒ `InvalidOperationException` — บั๊กผู้เรียก)
3. ล็อก `PAYMENT` ตาม §6.0 (`LockPaymentAsync`; ผู้เรียกถือ session/booking/[purchase] อยู่แล้ว — ไม่เคยล็อก booking ทีหลัง payment) · `STATUS ∈ {Succeeded, PartiallyRefunded, Refunded}` ไม่งั้น `Conflict "tutoring.refund_not_allowed"`
4. **cap (atomic ใต้ lock):** ระดับ payment: `payment.AMOUNT − payment.REFUND_RESERVED_AMOUNT ≥ Amount` · **ระดับ booking เฉพาะเมื่อ `BookingId ≠ null`:** `booking.PRICE_AMOUNT − booking.REFUNDED_AMOUNT ≥ Amount` — ไม่งั้น `Conflict "tutoring.refund_exceeds_cap"` (ext `maxRefundable` = min ของค่าที่ใช้) · **เส้นที่ `BookingId=null` (webhook anomaly, แพ็กเกจระดับ payment) ข้าม cap ระดับ booking โดยสิ้นเชิง** — คืนบางส่วนหลายครั้งบน payment เดียวรวมกันต้องไม่เกินยอดจ่าย
5. INSERT `REFUND` (`Requested`, `IS_ASYNC = payment.METHOD == PromptPay`, `ATTEMPT_NO=1`, `LEDGER_SEQ=0`, `NEXT_ATTEMPT_AT_UTC=now`) + flush (`SaveChanges` ใน txn ผู้เรียก) ⇒ `RecomputeRefundTotalsAsync(paymentId)` ⇒ `payment.ApplyRefundTotals(reserved, completed)` · ถ้ามี booking: `booking.SetRefundedAmount(Σ ของ booking ตาม §6.0)`
6. **ถ้า `BookingId ≠ null`:** `ITutoringEscrowContract.ReverseBySourceAsync(ref=bookingId, entryKey=$"adj:{refundId:N}:{++LEDGER_SEQ}", cumulative=booking.REFUNDED_AMOUNT)` — **จุดเดียวที่ลด ledger เพราะคืนเงิน** (ผู้เรียกไม่ต้องเรียก Payout ซ้ำ); ผลลัพธ์ `NotFound` (booking ฟรี/ไม่มี split) ⇒ ข้าม; `TooLate` ไม่เกิด (Reverse ใช้ adjustment) · ล้ม ⇒ throw · **`BookingId=null` ⇒ ข้ามทั้งขั้นนี้** (ไม่มี split ของ payment นี้; ledger ของเครดิตแพ็กเกจจัดการโดย P13-12)
7. audit `tutoring.refund.requested` (detail: refundId, bookingId?, amount, reason, isAsync — ไม่มี PII/ข้อความผู้ใช้) — `RecordAuditAsync` flush ทุกอย่างที่ tracked (F5) ⇒ เรียกที่นี่ได้เฉพาะเมื่อ `RequestAsync` อยู่ใน txn ของผู้เรียก (ไม่ commit) และ **ไม่ใช่ "ขั้นสุดท้าย" ของ flow ผู้เรียก**: ผู้เรียกต้องทำการเปลี่ยนสถานะ booking/session ที่ต้อง atomic ให้ครบ (หรืออย่างน้อย stage) *ก่อน* เรียก `RequestAsync` · เรียกนอก txn ⇒ โยน

**ค่า `RequestRefundCommand` ตามเส้นทาง (ข้อ 1 รอบ 2 — ต้องตรงกันทุกจุดที่เรียก; P13-06 §6.3 / P13-12 อ้างตารางนี้):**
| เส้นทาง | PaymentId | BookingId | PackagePurchaseId | Reason | IdempotencySuffix | Amount |
|---|---|---|---|---|---|---|
| ผู้เรียก/ติวเตอร์ยกเลิก, no-show (Direct) | `booking.PAYMENT_ID` | bookingId | null | `decision.RefundReason` | null | `decision.RefundAmount` |
| เหมือนข้างบน แต่ booking จองด้วยเครดิต (`Settlement=Money`) | `booking.PAYMENT_ID` (= payment ของแพ็กเกจ) | bookingId | `booking.PACKAGE_PURCHASE_ID` | เดียวกัน | null | ส่วนของครั้งนั้น (slice) |
| ข้อพิพาท | `booking.PAYMENT_ID` | bookingId | (ถ้าแพ็กเกจ) | `DisputeResolved` | `DisputeId:N` | ตามคำสั่ง |
| admin manual | `booking.PAYMENT_ID` | bookingId | — | `AdminManual` | `ClientRequestId:N` | ที่ระบุ |
| **webhook/reconcile anomaly (P13-06 R3/R5/mismatch/orphan)** | payment ที่ได้เงิน | **null** | purchaseId ถ้า `KIND=Package` | `LatePayment`/`DuplicatePayment`/`AmountMismatch` | **null** | `payment.AMOUNT` (mismatch = `min(AmountReceived, AMOUNT)`) |
| แพ็กเกจหมดอายุ / admin refund-unused (P13-12) | `purchase.PAYMENT_ID` | null | purchaseId | `PackageExpired`/`AdminManual` | `creditId:N`/`ClientRequestId:N` | slice / Σ slice |
- `Result.IsFailure` จาก `RequestAsync` ในบริบทที่ join txn ของผู้เรียก (เช่น webhook) ⇒ **ผู้เรียกต้อง throw** (ไม่งั้นไม่ rollback)

### 6.2 `ExecuteAsync(refundId)` — **นอก DB transaction** (หลัง commit ของผู้เรียก หรือ job)
1. **claim atomic** (autocommit statement เดี่ยว — ไม่ถือ lock ต่อ): `UPDATE "TUTORING"."REFUNDS" SET "LEASE_UNTIL_UTC"=@now+lease, "FIRST_ATTEMPT_AT_UTC"=COALESCE("FIRST_ATTEMPT_AT_UTC",@now), "ROW_VERSION"=decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex') WHERE "REFUND_ID"=@id AND "STATUS"='Requested' AND ("LEASE_UNTIL_UTC" IS NULL OR "LEASE_UNTIL_UTC"<@now) AND ("NEXT_ATTEMPT_AT_UTC" IS NULL OR "NEXT_ATTEMPT_AT_UTC"<=@now)` — **raw SQL ข้าม `ConcurrencyTokenInterceptor` ⇒ ต้องหมุน `ROW_VERSION` เอง** (นิพจน์เดียวกับ P13-05 §5.3; ไม่งั้น entity ที่ track ก่อนหน้าบันทึกทับได้โดยไม่ชน) ⇒ affected 0 ⇒ `Skipped` (ใครทำอยู่/ยังไม่ถึงเวลา)
2. อ่านแถว + `PROVIDER_PAYMENT_INTENT_ID` ของ payment · `CreateRefundAsync(new CreateRefundRequest(pi, Amount, Reason: reason is DuplicatePayment ? "duplicate" : null, IdempotencyKey: row.IDEMPOTENCY_KEY, Metadata: { kind: "tutoring_booking", refundId: refundId:D, referenceId: (bookingId ?? paymentId):D }))` — **ห้ามอยู่ใน transaction และไม่ถือ lock ใด ๆ (D-B): อ่านแถว refund/payment แบบไม่ล็อกก่อนเรียก**
3. บันทึกผลใน txn สั้น (**ลำดับล็อก §6.0:** อ่านแถว refund ไม่ล็อก → lock booking → [purchase] → payment → refund; Stripe ถูกเรียกจบก่อนเปิด txn นี้) แล้ว **อ่านสถานะซ้ำ** (webhook อาจแซงไปแล้ว → ใช้กฎ rank §2.1: เก็บค่าที่ "ก้าวหน้ากว่า") — ทุกครั้งที่สถานะ refund เปลี่ยนใน txn นี้ ⇒ `RecomputeRefundTotalsAsync` + `payment.ApplyRefundTotals` + `booking.SetRefundedAmount` + (ถ้าผลรวมของ booking เปลี่ยน) `ReverseBySourceAsync(…:{++LEDGER_SEQ})`:
   - **สำเร็จ:** บันทึก `PROVIDER_REFUND_ID`, `PROVIDER_STATUS`; `succeeded` ⇒ `Completed` (`COMPLETED_AT_UTC`; completed เพิ่ม ⇒ `payment.STATUS` เป็น `PartiallyRefunded`/`Refunded` ผ่าน `ApplyRefundTotals`) · `pending`/`requires_action` ⇒ `Processing` · `failed`/`canceled` ⇒ `Failed` + manual review + **ปล่อย cap และ reinstate ledger** (reserved ลด, `ReverseBySource` ด้วย cumulative ใหม่ — ติวเตอร์ไม่เสียเงินขณะผู้เรียนไม่ได้รับเงินคืน; admin ตัดสิน retry/void)
   - **ล้ม `RetryableReason`:** `ATTEMPT` นับด้วย `FIRST_ATTEMPT_AT_UTC`: ถ้า `now − FIRST_ATTEMPT_AT_UTC ≥ MaxAutoRetryHours` (20 ชม.) ⇒ `Failed`, `FAILURE_CODE="retry_window_exhausted"`, manual review, **ปล่อย cap/ledger เหมือนข้างบน** · ไม่งั้น `NEXT_ATTEMPT_AT_UTC = now + backoff[min(n−1, len−1)]` (1,5,15,60,180 นาที), `LAST_ERROR=<code>`, คงสถานะ `Requested`, ล้าง lease
   - **ล้ม `PermanentReason`:** `Failed`, `FAILURE_CODE=<โค้ดสั้น>`, manual review, audit `tutoring.refund.failed`, **ปล่อย cap/ledger เหมือนข้างบน**
   - **`ProviderNotConfigured`:** ถือเป็นความผิดพลาดของ operator — คง `Requested`, `NEXT_ATTEMPT=now+5 นาที`, log Error (ไม่นับเป็นความพยายามล้ม)
   - ทุกกรณีสถานะเปลี่ยน: audit (`tutoring.refund.processing|completed|failed`) + อีเมล/in-app ผู้เรียก (`tutoring-refund-processing` / `-completed` / `-failed` — ล้ม = ข้อความ "ทีมงานกำลังตรวจสอบ ไม่ต้องดำเนินการใดๆ")
4. ไม่ throw ให้ผู้เรียกเมื่อ provider ล้ม (คืน `RefundExecutionOutcome(Status, Skipped/Applied/Retrying/Failed)`)
5. **crash ระหว่างข้อ 2 กับ 3:** แถวยัง `Requested` (lease หมดภายใน 2 นาที) ⇒ job รอบถัดไปเรียกซ้ำด้วย **key เดิม** ⇒ Stripe คืน refund ใบเดิม (ภายใน 24 ชม.) ⇒ ไม่คืนซ้ำ · พ้น 24 ชม. ⇒ ข้อ 3 `retry_window_exhausted` ไปก่อน (20 ชม.) จึงไม่เคยใช้ key ที่หมดอายุ

**การเรียกหลัง commit ในเส้นผู้ใช้:** `CancelByLearner`/`CancelByTutor` เรียก `ExecuteAsync` best-effort (timeout รวม ≤ 10 วิ, ทีละ refund; ล้ม/ช้า ⇒ ปล่อยให้ job) แล้วคืน `BookingRefundSummary` สถานะล่าสุด · เส้น webhook (P13-06 R3/R5) **ไม่เรียกเอง** — ปล่อย job (≤1 นาที)

### 6.3 `ApplyProviderRefundAsync(PaymentProviderEvent)` — webhook/poll, **DB-only ใน txn ของ host**
ค้นแถว (DB-only ไม่มี HTTP; **ลำดับล็อก D-B:** อ่านแถว refund ไม่ล็อกเพื่อหา `PAYMENT_ID`/`BOOKING_ID`/`PACKAGE_PURCHASE_ID` → lock booking → [purchase] → `LockPaymentAsync` → ล็อก refund → อ่านสถานะซ้ำ): `Refund.ClientRefundId` (Guid.TryParse) → `PROVIDER_REFUND_ID` → ไม่พบ (refund จาก Stripe Dashboard): หา `PAYMENT` ด้วย PI id (ไม่พบ ⇒ `ProcessResult="tutoring.refund.payment_not_found"` ไม่ throw) แล้ว **สร้างแถว** `AdminManual` (`IDEMPOTENCY_KEY="provider:{providerRefundId}"` (UQ ⇒ ซ้ำ=ใบเดิม), `REQUESTED_BY_USER_ID=null`, `DECISION_NOTE="created outside the platform (Stripe Dashboard)"`, `BOOKING_ID = PAYMENTS.REF_ID` เมื่อ `KIND=Booking`; จอง cap = `min(Amount, AMOUNT − RESERVED [, booking.PRICE_AMOUNT − REFUNDED])`; ถ้าเกิน ⇒ manual review + audit `tutoring.refund.external_over_cap` — **ห้ามให้ CHECK ใน DB ล้มจน webhook retry วน**) แล้ว `RecomputeRefundTotals` + ledger `ReverseBySource` เหมือน §6.1 ข้อ 5–6 (`KIND=Package` ⇒ ไม่มี booking ตรง ๆ — บันทึกแถว + manual review + audit เท่านั้น ให้ admin จัดการเครดิตผ่าน P13-12) · ใช้กฎ rank/`PROVIDER_STATUS_AT_UTC` ทิ้ง event เก่า · `succeeded` ⇒ `Completed` (totals ผ่าน `ApplyRefundTotals` ⇒ `payment.STATUS` เป็น `PartiallyRefunded`/`Refunded`; นับเข้า completed ครั้งเดียวตอนเปลี่ยนเข้า Completed) · `failed`/`canceled` ⇒ `Failed` + manual review + **ปล่อย cap และ reinstate ledger** (`ReverseBySource(…:{++LEDGER_SEQ})` — ติวเตอร์ไม่เสียเงินขณะผู้เรียนไม่ได้รับเงินคืนจริง; admin ตัดสิน retry/void) · `Completed→failed` (provider ย้อน) ⇒ `Failed`, `ApplyRefundTotals` revert (completed และ reserved ลด; `Refunded→PartiallyRefunded|Succeeded`), manual review, audit · เปลี่ยนสถานะจริงเท่านั้นที่ส่งอีเมล/แจ้งเตือน (กันซ้ำจาก event ซ้ำ) · `ProcessResult` = `tutoring.refund.{completed|processing|failed|ignored_stale|created_external}`

### 6.4 `retry` / `void` (admin) — ดู §5.6; ลำดับล็อกตาม §6.0 (booking → [purchase] → payment → refund) · **retry** = `Failed→Requested` + จอง cap ใหม่ใต้ lock (เกิน ⇒ 409 `tutoring.refund_exceeds_cap`) + `ReverseBySource(…:{++LEDGER_SEQ})` ลด ledger อีกครั้ง · **void** = `Failed→Voided` ปิดงาน (cap/ledger ถูกปล่อยไปแล้วตอนเข้า `Failed`) + recompute totals + เรียก `ReverseBySourceAsync` ด้วย cumulative ปัจจุบันเป็นตาข่ายนิรภัย (ปกติ `NoChange`)

### 6.5 Job `tutoring-refund-process` (ทุก 1 นาที; `RecurringJobIds.TutoringRefundProcess`)
`[DisableConcurrentExecution(55)]` · เลือก `STATUS='Requested' AND NEXT_ATTEMPT_AT_UTC<=now AND (LEASE_UNTIL_UTC IS NULL OR <now)` เรียงตาม `REQUESTED_AT_UTC` จำกัด `ProcessBatchSize` (25) ด้วย `FOR UPDATE SKIP LOCKED` **เฉพาะตอนเลือก id** ใน txn สั้นที่ **commit ก่อน** เรียก `ExecuteAsync` (ไม่ถือ lock ระหว่างเรียก Stripe — D-B) แล้วเรียก `ExecuteAsync` ทีละรายการ (หนึ่ง DI scope ต่อรายการ; exception ของรายการหนึ่งไม่หยุดรายการอื่น; timeout รวมต่อรอบ 45 วิ) · รันทั้ง API(`ServerInApi`)/Workers ได้ (claim atomic กันชน)

### 6.6 Job `tutoring-refund-reconcile` (ทุก 15 นาที; `RecurringJobIds.TutoringRefundReconcile`)
**ข้อ 1 — poll refund ที่ Processing:** ทุกแถว `STATUS='Processing'` ที่ `LAST_CHECKED_AT_UTC` เก่ากว่า `ReconcileProcessingMinAgeMinutes` (10) และอายุ ≤ `ReconcileMaxAgeDays` (30), batch `ReconcileBatchSize` (50): (ก) เลือก id ใน txn สั้นแล้ว commit (ข) `GetRefundAsync(PROVIDER_REFUND_ID)` **นอก txn / ไม่ถือ lock** (ค) เปิด txn ล็อกตาม §6.0 แล้วส่งผลเข้า `ApplyProviderRefundState` เส้นเดียวกับ §6.3 (ใช้ `OccurredAt=now`) + ตั้ง `LAST_CHECKED_AT_UTC` · นี่คือ safety net เมื่อยังไม่ได้ subscribe event `refund.*` ที่ Stripe Dashboard (OWN)
**ข้อ 2 — Processing เกิน `ReconcileMaxAgeDays` (30 วัน) ⇒ manual review**
**ข้อ 3 — mark escrow released (มติ D-A, §3.3):** SQL เดียว (ไม่เรียก Payout/ไม่มี HTTP): `UPDATE "TUTORING"."TUTOR_BOOKINGS" SET "ESCROW_STATE"='Released', "UPDATED_AT_UTC"=@now, "ROW_VERSION"=decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex') WHERE "ESCROW_STATE"='Held' AND "ESCROW_RELEASE_AT_UTC" IS NOT NULL AND "ESCROW_RELEASE_AT_UTC" <= @now AND "STATUS" IN ('Completed','NoShowLearner','CancelledByLearner')` (ใช้ `IX_TUTOR_BOOKINGS_ESCROW_DUE`; ข้ามแถว `Frozen`/`Reversed`; idempotent) — ช้าสุด 15 นาทีหลัง `AvailableAt` ซึ่งไม่กระทบเงิน (ตัวเงินจริงเข้า batch ด้วย `AVAILABLE_AT_UTC` ของ Payout)

---

## 7. คะแนนความน่าเชื่อถือ + ระงับอัตโนมัติ + ยกเลิกคลาสของติวเตอร์ที่ถูกระงับ

### 7.1 `TutorReliabilityUpdater` — **ผู้ "คำนวณ" คะแนน** (ผู้ "เขียน" `RELIABILITY_SCORE` คือ `TutorProfileStatsUpdater` ของ P13-01 ที่เดียว — ผ่าน `ITutorStatsWriter.SetReliabilityScoreAsync`)

`RecordPenaltyAsync(RecordPenaltyCommand(Guid TutorId, Guid SessionId, Guid? BookingId, TutorPenaltyKind Kind, int Points, string ReasonCode))`:
1. `Points ≤ 0` ⇒ ไม่ทำอะไร (คืน outcome ไม่เปลี่ยน)
2. `INSERT … ON CONFLICT ("SESSION_ID","KIND") DO NOTHING` (`ExecuteSqlInterpolatedAsync`) ⇒ affected 0 ⇒ **ไม่คำนวณซ้ำ** (idempotent — cancel ชนกับ no-show job, คลาสกลุ่มหลาย booking, `SettleTutorNoShowAsync` ซ้ำ)
3. `RecomputeAsync(tutorId)`: `score = clamp(StartScore − Σ POINTS ของ penalty ที่ไม่ void และ CREATED_AT_UTC ≥ now − WindowDays, 0, 100)`; `noShowCount` = จำนวน `KIND='NoShow'` ที่ไม่ void ในหน้าต่าง · เรียก `ITutorStatsWriter.SetReliabilityScoreAsync(tutorId, score)` (`ExecuteUpdateAsync` ใน transaction เดียวกัน) — **ห้ามเขียนคอลัมน์นี้จากที่อื่น** (source-scan test ของ P13-01 §9)
4. ถ้า tracked `TUTOR_PROFILE` (อ่านด้วย `TUTOR_ID`; ใช้ `ROW_VERSION` เป็นด่าน — `DbUpdateConcurrencyException` ⇒ retry หน่วยงานทั้งก้อน 1 ครั้ง) มี `STATUS == Verified` และ (`score < SuspendBelowScore` **หรือ** `noShowCount ≥ SuspendNoShowCount`) ⇒ domain `profile.Suspend("auto:reliability_score_lt_" + SuspendBelowScore | "auto:noshow_count_ge_" + SuspendNoShowCount, clock)` (ตาราง P13-01 §5.1 ระบุ "admin / P13-08 อัตโนมัติ"; `IS_LISTED=false` ⇒ หายจากค้นหา/จองใหม่ไม่ได้) · stage อีเมล+in-app ติวเตอร์ (`tutoring-tutor-suspended`) · audit `tutoring.tutor.auto_suspended` (userId = null = ระบบ) · หลัง commit: `ITutorPublicCacheInvalidator.InvalidateProfilesAsync/InvalidateSlotsAsync` best-effort · **ไม่ unsuspend อัตโนมัติ** (admin `Reinstate` เท่านั้น) · ไม่เรียก `ITutorLifecycleHook`/`TutorModerationService.SuspendAsync` (ตัวหลังต้องมี `adminUserId`) — การยกเลิกคลาสที่ค้างทำที่ §7.3 ไม่ใช่ใน txn ของการหักคะแนน
5. คืน `TutorReliabilityOutcome(int NewScore, bool Suspended, bool Inserted)`

lock order (D-B): โค้ดนี้เขียน profile เป็น **ลำดับสุดท้ายของ chain** (`SESSION→BOOKING→[PURCHASE→CREDITS]→PAYMENT→REFUND→SPLITS→TUTOR_PROFILE`) — โค้ดอื่นที่แก้ profile (admin suspend, P13-01) ห้ามล็อก session/booking/payment ต่อหลังแก้ profile ใน txn เดียวกัน · **txn ที่ตัดสินหลาย booking (คลาสกลุ่ม: `CancelByTutorAsync` ทุก booking, P13-10 finalize `SettleTutorNoShowAsync` หลายใบ) ต้องเรียก `RecordPenaltyAsync` ครั้งเดียวเป็นขั้นสุดท้ายของ txn — หลังจบ booking ทุกใบ** (ผู้เรียก `Settle*` ส่ง `applyPenalty=true` เฉพาะใบสุดท้าย หรือเรียก `RecordPenaltyAsync` แยกหลัง `Settle*` ทุกตัว — ห้ามแทรกกลาง เพราะ booking ใบถัดไปจะล็อก booking/payment ต่อหลังแตะ profile)

`VoidPenaltyAsync(sessionId, kind, adminUserId, note)`: ตั้ง `VOIDED_AT_UTC/BY/NOTE` (ไม่ลบแถว) แล้ว `RecomputeAsync` (ไม่ยกเลิกการระงับที่เกิดไปแล้ว — admin ตัดสิน) · audit `tutoring.tutor.penalty_voided`

### 7.2 Job `tutoring-reliability-recompute` (ทุกวัน 03:30; `RecurringJobIds.TutoringReliabilityRecompute`)
ติวเตอร์ที่มี penalty ใน `WindowDays+1` วัน ⇒ `RecomputeAsync` (คะแนนฟื้นเมื่อโทษหลุดหน้าต่าง; ไม่ unsuspend; ไม่ระงับเพิ่มซ้ำถ้าไม่ใช่ Verified)

### 7.3 ติวเตอร์ที่ไม่ Verified (ถูกระงับ/ถูกเรียกยืนยันใหม่) ⇒ ยกเลิกคลาสอนาคต + คืนเงิน (ทำผ่าน job — ไม่ใช้ `ITutorLifecycleHook`)
P13-01 §4.3 เปิด hook `OnSuspendedAsync` ไว้ให้ P13-08 "ยกเลิก+คืนเงินคลาสอนาคต" แต่ hook รันใน transaction ของการระงับที่ห้าม `SaveChanges` — การคืนเงิน/ledger/อีเมลหลายขั้นในนั้นทำให้ **การระงับ (ที่เกี่ยวกับความปลอดภัยผู้เยาว์) อาจล้มเพราะเรื่องเงิน** ⇒ P13-08 **เลือกไม่ implement hook** (ปล่อยว่าง) และใช้ job แทน:
- Job `tutoring-suspended-sweep` (ทุก `SuspendedSweepMinutes`=5; `RecurringJobIds.TutoringSuspendedSweep` — ชื่อเดิม ขอบเขตกว้างขึ้นตามมติรอบ 2): หา session `Held|Scheduled` ที่ `STARTS_AT_UTC > now` ของติวเตอร์ที่ **`STATUS <> 'Verified'`** — `Suspended` และสถานะอื่นที่ไม่ใช่ Verified (`PendingVerification`/`NeedsInfo`/`Rejected` รวมกรณี P13-02 `ExpiryAction=RequireReverification` ที่เปลี่ยน Verified→NeedsInfo + `IS_LISTED=false`) (index `IX_TUTOR_SESSIONS_ACTIVE_STARTS` ของ P13-05 §2.2 [STATUS IN (Held, Scheduled)] + join profile) จำกัด `SuspendedSweepBatchSize`=20 session/รอบ ⇒ `BookingCancellationService.CancelSessionByPlatformAsync(sessionId, reasonCode)` โดย `reasonCode = "tutor_suspended"` เมื่อ `Suspended` ไม่งั้น `"tutor_not_verified"` — เหตุผล: ติวเตอร์ที่ไม่ Verified จองใหม่ไม่ได้ (P13-05 preflight) แต่คลาสเก่าที่ผู้เรียกจองและจ่ายเงินแล้วยังค้าง ⇒ ต้องยกเลิก+คืนเงินเต็มไม่ให้ผู้เรียกเสียเงินกับคลาสที่ไม่มีใครสอน
- `CancelSessionByPlatformAsync` = เหมือน `CancelByTutorAsync` (§8) ทุกประการ **ยกเว้น**: ไม่มีผู้เรียกที่เป็นคน (ไม่ตรวจ ownership), `CancellationTrigger.TutorCancel` แต่ **ไม่บันทึกโทษ** (ถูกระงับไปแล้ว), อีเมลผู้เรียกใช้ข้อความ "ติวเตอร์ไม่สามารถสอนได้ เราคืนเงินเต็มจำนวนให้แล้ว" (`tutoring-cancel-by-platform`), audit `tutoring.session.cancelled_by_platform`
- ระหว่างรอ sweep (≤5 นาที): ติวเตอร์ที่ไม่ Verified ค้นหา/จองใหม่ไม่ได้ (P13-01/P13-05) และเข้า `TutorOnly` endpoint ไม่ได้; ด่าน join ฝั่งติวเตอร์ปิดแล้วที่ P13-10 §4.2 ข้อ 1 (`role=Tutor ∧ tp.STATUS ≠ Verified` ⇒ 404 — ไม่ใช่ follow-up) ส่วนผู้เรียกที่ join คลาสเก่าที่ยังไม่ถูก sweep จะเข้าห้องได้ไม่มีผู้สอน ≤5 นาทีจนกว่า sweep ยกเลิก+คืนเงิน — ยอมรับ

---

## 8. Orchestration ของ cancel (ผู้เรียก) — ขั้นตอนและขอบเขต transaction

`CancelByLearnerAsync` — `ITutoringUnitOfWork.ExecuteInTransactionAsync` ครอบทั้งหมด (ดูข้อ POST-COMMIT ท้ายตาราง):
1. อ่าน booking **ไม่ล็อก** ด้วย `BOOKING_ID=@id AND LEARNER_USER_ID=@caller` (ownership; ไม่พบ ⇒ 404) เพื่อรู้ `SESSION_ID`/`PAYMENT_ID`
2. ล็อกตามลำดับ canonical: session → booking → (ถ้า `PACKAGE_PURCHASE_ID` ไม่ null: `IPackageCreditService.LockPurchaseAsync`) → payment; **อ่านสถานะซ้ำ** (booking ที่จองด้วยเครดิตมี `PAYMENT_ID` = payment ของแพ็กเกจ และ `PRICE_AMOUNT` = ส่วนของครั้งนั้น ตาม P13-12 §7 ⇒ cap/ledger ด้านล่างทำงานโดยไม่ต้องแยกกรณี)
3. `CancelledByLearner` อยู่แล้ว ⇒ คืน 200 `AlreadyCancelled=true` + refund summary เดิม · `PendingPayment` ⇒ เส้นทาง "abandon": booking→`CancelledByLearner`, ปล่อย hold/ที่นั่ง, ไม่มี refund/escrow/โทษ, `CancelPendingIntentsAsync` หลัง commit · `Confirmed` ⇒ ต่อ · อื่น ๆ ⇒ 409 `booking_not_cancellable`
4. `decision = CancellationPolicy.Evaluate(...)` (ค่าจาก `IClock` + options + `Funding = PACKAGE_PURCHASE_ID is null ? Direct : PackageCredit`); `!Allowed` ⇒ 409 (`cancel_after_start`)
5. `decision.RefundAmount < ExpectedRefundAmount` ⇒ 409 `cancellation_quote_changed` (ไม่เขียนอะไร)
6. `booking.CancelByLearner(now, reason)`; `session.ReleaseSeat()/Cancel()` (ปล่อยช่อง/ที่นั่งให้คนอื่นจองได้)
7. **เงิน (ตาม `Settlement`):**
   - `Money`: `TutoringRefundService.RequestAsync(` command ตามตาราง §6.1 (เส้นทาง "ผู้เรียก/ติวเตอร์ยกเลิก"; ถ้า booking จองด้วยเครดิตใส่ `PackagePurchaseId` และ Amount = ส่วนของครั้งนั้น) `)` (ledger ลดอยู่ในนั้นแล้ว §6.1 ข้อ 6)
   - `CreditRestore`: `r = IPackageCreditService.RestoreCreditAsync(bookingId)` (P13-12 §5.2) — `Restored` ⇒ `Payout.ReverseBySource(ref=bookingId, key="adj:credit-restore:{bookingId:N}", cumulative=PRICE_AMOUNT)` (ยังไม่มี REFUNDS แถว) เพื่อกลับด้านกับ split ที่บันทึกตอนจอง · `AlreadyRestored` ⇒ no-op (idempotent) · **`PurchaseExpired` (แพ็กเกจหมดอายุ/ไม่ Active แล้ว ⇒ เครดิตที่คืนไม่มีประโยชน์) ⇒ เปลี่ยนเป็น `Money`:** `TutoringRefundService.RequestAsync(Reason = เหตุผลคืนเงินของ trigger นั้น [TutorCancel|TutorNoShow|NoClassHeld|DisputeResolved], Amount = booking.PRICE_AMOUNT − REFUNDED_AMOUNT)` (ledger ลดในนั้นแล้ว §6.1 ข้อ 6) แล้ว `MarkCreditRefundedAsync(bookingId)` — ผู้เรียกไม่ผิด จึงไม่ควรเสียเงินเพราะแพ็กเกจหมดอายุพอดี · เส้นทาง Settle* ของ P13-10 (`SettleTutorNoShowAsync`/`SettleBothNoShowAsync`) ใช้กฎเดียวกันทุกประการ
   - `None` (ทดลองฟรี/ไม่มียอด) ⇒ ข้าม
   - `decision.EscrowAction == ScheduleRelease` (เช่น `LateRefundPercent=0`) หรือมี **ส่วนที่ไม่คืน** (`RetainedAmount > 0`, `.late`): `Payout.ScheduleRelease(at = EscrowReleaseTime(§3.3) = max(session.ENDS_AT_UTC, now) + DisputeWindowHours)` + `booking.ScheduleEscrowRelease(at)` (ESCROW_STATE คง `Held` — D-A) — ส่วนที่ติวเตอร์ได้เป็น "ค่าเสียเวลา" ปล่อยตามจังหวะเดียวกับคลาสที่จบปกติ
   - ConsumesCredit (แพ็กเกจ, ยกเลิกช้า) ⇒ `IPackageCreditService.ConsumeCreditAsync(bookingId)`
8. `ISessionRoomSync.ConvergeAsync(sessionId)` ครอบ `uow.TryRunInSavepointAsync` (ล้ม ⇒ log Error + metric, ไม่กระทบการยกเลิก/คืนเงิน)
9. อีเมล+in-app: ผู้เรียก (`tutoring-cancel-learner`: ยอดคืน/ไม่คืน, ถ้า `IsAsync` ⇒ ข้อความ PromptPay refund async, หรือ "คืนเครดิตแล้ว") · ติวเตอร์ (`tutoring-cancel-learner-notice`: เวลา/วิชา/**ชื่อเล่นผู้เรียน** เท่านั้น; ถ้า `.late` ⇒ แจ้งว่าจะได้ค่าชดเชย)
10. audit `tutoring.booking.cancelled_by_learner` (detail: bookingId, ruleCode, refundAmount, settlement)
**COMMIT** → POST-COMMIT: `CancelPendingIntentsAsync(bookingId)` (P13-06 §6.7) ถ้าเคยมี Pending PI · `ExecuteAsync(refundId)` best-effort · ตอบ

`CancelByTutorAsync` — เหมือนกัน แต่ระดับ session: ล็อก session แล้ว booking ทั้งหมดเรียง `BOOKING_ID` ASC แล้ว **ต่อ booking ตามลำดับ chain: (ถ้า `PACKAGE_PURCHASE_ID` ไม่ null) `IPackageCreditService.LockPurchaseAsync(purchaseId)` → `RestoreCreditAsync` (หรือ Money ตามผล `PurchaseExpired`) → `LockPaymentAsync` → `RequestAsync`** (ต้องเรียก `LockPurchaseAsync` ต่อ booking แพ็กเกจ *ก่อน* `RestoreCreditAsync`/lock payment ทุกครั้ง — purchase เดียวกันหลาย booking ล็อกซ้ำได้ ไม่ deadlock เพราะเรียง `BOOKING_ID` ASC) · ต่อ booking: decision `TutorCancel` → refund 100%/CreditRestore ตาม remedy + `ReverseBySource` · `PendingPayment` ⇒ ปล่อย hold · session → `Cancelled` · **`RecordPenaltyAsync(LateCancel, points จาก tier ณ lead ของ session)` ครั้งเดียวเป็นขั้นสุดท้ายของ txn หลังทุก booking (§7.1)** · `ConvergeAsync` · อีเมลผู้เรียกทุกคน (`tutoring-cancel-by-tutor`: ยอดคืนเต็ม + ลิงก์จองใหม่) + ติวเตอร์ (`tutoring-penalty-notice`: คะแนนที่หัก/คะแนนปัจจุบัน/ถูกระงับหรือไม่) · audit ต่อ booking + `tutoring.session.cancelled_by_tutor` · ไม่มี booking Confirmed เลย (มีแต่ hold) ⇒ ไม่มีโทษ

`SettleTutorNoShowAsync` / `SettleLearnerNoShowAsync` / `SettleBothNoShowAsync` — เหมือน cancel ใช้ `CancellationPolicy(TutorNoShow|LearnerNoShow|NoShowBoth)`; โทษ `NoShow` เฉพาะ `applyPenalty=true`; **อีเมล:** P13-08 ส่งเฉพาะ `tutoring-penalty-notice` (ติวเตอร์ เมื่อมีการหักคะแนน) และอีเมลสถานะ refund (`tutoring-refund-processing`/`-completed`/`-failed` ตาม §6.2) — **อีเมลผลการเข้าเรียน/ผลตัดสิน no-show ทั้งหมด (ผู้เรียก/ติวเตอร์/ไม่คืนเงิน/ไม่มีใครมา) เป็นของ P13-10 (README §7.5)** ไม่ส่งซ้ำที่นี่ · ธง "สุ่มตรวจโดย admin" ของ NoShowBoth = audit event `tutoring.booking.noshow_both` (admin query เอา)

**ความขัดแย้ง (concurrency)**
| สถานการณ์ | กลไก | ผล |
|---|---|---|
| ยกเลิกสองคลิกพร้อมกัน | คำขอที่ 2 รอ lock booking → เห็น `CancelledByLearner` | 200 `AlreadyCancelled`; `REFUNDS` 1 แถว (UQ key), เรียก Stripe 1 ครั้ง |
| ยกเลิก vs job no-show | ล็อก booking เดียวกัน; ผู้แพ้เห็นสถานะใหม่ | ผู้แพ้ได้ 409 `booking_not_cancellable` (job: `AlreadyApplied`/`noshow_conflict`) |
| ยกเลิก vs dispute | dispute รับเฉพาะ Completed/NoShowLearner; cancel รับเฉพาะ Confirmed ⇒ สถานะไม่ทับกัน | ไม่มีทางเกิดทั้งคู่ |
| ติวเตอร์ยกเลิกพร้อมผู้เรียกยกเลิกของ booking เดียวกัน | ลำดับล็อก session→booking | ผู้แพ้ 409 |
| webhook payment ชนกับ cancel (จ่ายเสร็จขณะผู้ใช้กดยกเลิก PendingPayment) | ล็อก booking เดียว | จ่ายก่อน ⇒ cancel เห็น Confirmed → ยกเลิกพร้อมคืนเงินตามนโยบาย; ยกเลิกก่อน ⇒ webhook ตก R5 → refund 100% `LatePayment` |
| `DbUpdateConcurrencyException` (ROW_VERSION) | retry หน่วยงานทั้งก้อน 1 ครั้ง (scope ใหม่) | ชนซ้ำ ⇒ 409 `concurrent_update` |
| Payout ล้มกลาง cancel | ทั้งก้อนใน txn เดียว | rollback ทั้งหมด booking ยัง `Confirmed` |

---

## 9. Config / DI / jobs

- `TutoringCancellationOptions` (`Tutoring:Cancellation`): `FullRefundHours`=24 [0,720] · `LateRefundPercent`=50 [0,100] · `PackageTutorFaultRemedy`=`RestoreCredit` | `RefundMoney`
- `TutoringTutorPenaltyOptions` (`Tutoring:TutorPenalty`): `CancelTiers` default `[{168,0},{72,1},{24,2},{0,4}]` (ต้องเรียง `MinHoursBeforeStart` มาก→น้อยแบบ strictly, ปลายสุด `0`, points ≥0 ≤100) · `AfterStartCancelPoints`=6 · `NoShowPoints`=10 · `WindowDays`=90 [7,365] · `StartScore`=100 · `SuspendBelowScore`=60 [0,100] · `SuspendNoShowCount`=3 [1,20] — validator ปฏิเสธ list ว่าง/ไม่เรียง (ใช้กับดัก `Bind()` ต่อท้าย list เหมือน P13-06 F9 — `PostConfigure` อ่าน section ดิบ)
- `TutoringRefundOptions` (`Tutoring:Refunds`): `MaxAutoRetryHours`=20 [1,23] (**ต้อง < 24** — อายุ idempotency key ของ Stripe) · `RetryBackoffMinutes`=`[1,5,15,60,180]` · `ProcessBatchSize`=25 [1,100] · `LeaseSeconds`=120 · `ReconcileProcessingMinAgeMinutes`=10 · `ReconcileMaxAgeDays`=30 · `ReconcileBatchSize`=50 · `SuspendedSweepBatchSize`=20 · `SuspendedSweepMinutes`=5
- ใช้ `Tutoring:DisputeWindowHours` (24) จาก `TutoringOptions` (P13-01) · ทุก options `ValidateOnStart`
- **Wiring (ข้อ 21):** `Siri.Modules.Tutoring.csproj` ต้องมี `ProjectReference` → `Siri.Integrations.Payment` (P13-06 เพิ่มก่อน) และ `Siri.Modules.Payout` (Contracts เท่านั้น; ใครถึงก่อนเพิ่ม — README §4) · `appsettings.json` ของ **Api และ Workers** ต้องมี placeholder ของทั้ง `Tutoring:Cancellation`, `Tutoring:TutorPenalty`, `Tutoring:Refunds` (Workers รัน job refund/reconcile/sweep ⇒ ต้องผ่าน `ValidateOnStart`) · DI ของ Workers ต้องมี `IPaymentMethod`, `ITutoringEscrowContract`, `IPackageCreditService`
- Jobs (เพิ่มใน `RecurringJobIds.All` + `RecurringJobsRegistration`; `tutoring-refund-reconcile` ทำ 3 ข้อตาม §6.6 รวม mark escrow released): `tutoring-refund-process` (`Cron.Minutely()`), `tutoring-refund-reconcile` (`Cron.MinuteInterval(15)`), `tutoring-reliability-recompute` (`Cron.Daily(3, 30)`), `tutoring-suspended-sweep` (`Cron.MinuteInterval(5)`; `RecurringJobIds.TutoringSuspendedSweep`)
- Rate limit: ไม่เพิ่ม policy ใหม่ — ใช้ `tutoring-user` / `tutoring-search` (P13-01 §7)
- ไม่มี NuGet package ใหม่; ไม่มี secret ใหม่

## 10. Security
- เงินคืนไปยัง **วิธีจ่ายเดิมเท่านั้น** (Stripe refund ต่อ PI เดิม — ไม่มีช่องรับบัญชีปลายทางจาก client) · ยอดคืนคำนวณที่ server จากนโยบาย (client ส่งได้แค่ `ExpectedRefundAmount` ซึ่งใช้เทียบ ไม่ใช่กำหนด)
- ownership ใน WHERE เดียวกับการดึง · ไม่รับ `userId` จาก client · 404 เดียวสำหรับไม่พบ/ไม่ใช่เจ้าของ
- ทุกการเปลี่ยนสถานะเงินเขียน `SECURITY_AUDIT` ใน txn เดียว (detail เป็น id/จำนวน/โค้ด — ไม่มี PII, ไม่มี `Reason` ข้อความอิสระของผู้ใช้, ไม่มี PI/refund id ของ Stripe ใน response)
- `Reason` ข้อความอิสระ: เก็บเป็นข้อความล้วน ≤500, ตัด control char, **ไม่เรนเดอร์เป็น HTML** (อีเมลผ่าน `HtmlEncode`); ไม่แสดงให้ฝั่งตรงข้ามนอกจากที่ระบุ
- ติวเตอร์เห็นผู้เรียกเป็นชื่อเล่น/ระดับชั้นเท่านั้น; ผู้ปกครองไม่เห็นข้อมูลส่วนตัวติวเตอร์เกินโปรไฟล์สาธารณะ
- idempotency ทุกการคืนเงิน (UQ key) + ล็อก payment ก่อนจอง cap ⇒ คืนเกินยอดจ่ายไม่ได้แม้ยิงพร้อมกัน
- admin retry ต้องยืนยันว่า "ไม่มี refund จริงใน Stripe" (กันคืนซ้ำเมื่อ key หมดอายุ 24 ชม.) · void/retry/manual refund เป็น AdminOnly + audit + rate limit
- Stripe error ไม่ส่งให้ผู้ใช้ดิบ; `LAST_ERROR`/`FAILURE_CODE` เป็นโค้ดสั้น

## 11. Test checklist

**A. `CancellationPolicy` unit — ครบทุกแถวของ `TUTORING.md` §3.7:**
| แถวในตาราง §3.7 | เทสต์ (อย่างน้อย) |
|---|---|
| ผู้เรียกยกเลิก ≥24 ชม. → 100%, split ถูก Reverse, session ว่าง | exact 24h00m00.000 / +1min / 7d × (Direct, PackageCredit) × (ยอดปกติ, ฟรี) |
| ผู้เรียกยกเลิก <24 ชม. → 50%, ติวเตอร์ได้ 80% ของส่วนที่ไม่คืนหลังหักค่าธรรมเนียม | 24h−1ms / 23:59:59.999 / 12h / 1ms ก่อนเริ่ม × เวกเตอร์เงิน 333.33/0.01/1.00/1000.00 × `LateRefundPercent` 0/33.33/50/100 · **รวม integration กับ Payout (V2/V3 ของ P13-07): ledger หลัง cancel = ค่าตายตัว** |
| (เสริม) ผู้เรียกยกเลิกหลังเริ่ม | rejected ที่ T, T+1s, T+จบ |
| ติวเตอร์ยกเลิก → 100% + หักคะแนนตามระยะ | ทุก tier ขอบ inclusive (168h/167h59m59s/72h/71h59m/24h/23h59m/1ms ก่อนเริ่ม/หลังเริ่ม/หลังจบ=rejected) × Direct/Package(remedy ทั้งสอง) |
| ติวเตอร์ no-show → 100% ทันที + หักหนัก | refund เต็ม, ReverseFull, NoShowPoints, ระงับเมื่อถึงเกณฑ์ (ดู D) |
| ผู้เรียก no-show → 0%, ติวเตอร์ได้เต็มหลังพัก 24 ชม. | refund 0, `ScheduleRelease(max(ENDS, decided)+window)`, ConsumesCredit |
| ไม่มีใครเข้า → 100% ไม่หักคะแนน | refund เต็ม, ไม่มี penalty |
| คลาสเสร็จแล้วเปิดข้อพิพาท ≤24 ชม. → ตาม admin (Full/Partial/None), escrow Frozen ระหว่างพิจารณา | `ResolveDispute` ครบ 3 แบบ + cap + idempotent (ใน C) |
+ property test (Refund+Retained==Paid; 2dp; ไม่ติดลบ) · ทุก branch ของ options validator

**B. `TutoringRefundService` unit (fake `IPaymentMethod` ที่จำลอง idempotency ของ Stripe ตามคีย์ + fake Payout):** key สร้างถูกทุกรูปแบบ (booking/payment-only/AdminManual/Dispute/`:aN`) · request ซ้ำ ⇒ แถวเดิม · cap: ยอดสะสมหลายใบ = ยอดจ่ายพอดีผ่าน/เกิน 0.01 ⇒ 409 · cap ระดับ booking (package slice) · ledger เรียกครั้งเดียวด้วย cumulative ถูก · Execute: สำเร็จ(succeeded/pending/requires_action/failed) · ล้ม Retryable ⇒ backoff ตามลำดับ + หมด 20 ชม. ⇒ Failed · ล้ม Permanent ⇒ Failed ทันที · NotConfigured ⇒ คง Requested · claim/lease: เรียก Execute พร้อมกัน 2 ตัว ⇒ Stripe 1 ครั้ง · crash ระหว่าง Stripe สำเร็จกับบันทึก (จำลอง) ⇒ รอบถัดไปได้ refund id เดิมจากคีย์เดิม ⇒ ไม่เบิ้ล · `ApplyProvider`: event ก่อน/หลัง Execute (rank), event เก่า, `Completed→failed`, refund จาก Dashboard (สร้าง AdminManual, over-cap ไม่ทำให้ CHECK ล้ม), ซ้ำ event ⇒ ส่งอีเมลครั้งเดียว · `retry` ต้องมี confirm flag · `void` คืน cap + ledger

**C. `BookingCancellationService`/`BookingSettlementService` (unit + integration PostgreSQL 17 + `SiriApiFactory`):**
- ยกเลิกสองคลิกพร้อมกัน (`Task.WhenAll`) ⇒ `REFUNDS` 1 แถว + Stripe 1 ครั้ง · ยกเลิก vs no-show job ⇒ ผู้ชนะ 1 · ยิง `Complete` ซ้ำ/พร้อมกัน ⇒ ScheduleRelease 1 ผล · `ReleaseEarly` ซ้ำ
- Stripe ล่ม ⇒ ยกเลิกสำเร็จ + `Requested` ⇒ job ส่งสำเร็จรอบถัดไป · Payout ล้มกลางทาง ⇒ rollback ทั้งก้อน
- `cancellation_quote_changed` (ข้ามขอบ 24 ชม. ระหว่าง quote กับ cancel โดย `FakeClock`) · ยอดจริงมากกว่าที่คาด ⇒ ผ่าน
- PendingPayment abandon (PI ถูก cancel หลัง commit; จ่ายพอดี ⇒ R5 refund)
- ติวเตอร์ยกเลิกคลาสกลุ่ม 3 booking ⇒ refund 3 + โทษ 1 ครั้ง (UQ) · `ConvergeAsync` ล้ม ⇒ ยังยกเลิกสำเร็จ
- no-show ทุกแบบ (`applyPenalty` true/false) + `SettleCompletedAsync` (`releaseImmediately` ทั้งสอง) + `ReleaseEarlyAsync` (Frozen/ซ้ำ ⇒ no-op พร้อม Code) + Freeze (ปกติ/TooLate) + Resolve ทั้ง 3 + Unfreeze · ledger หลังทุกลำดับ = `Compute(K,F,t)` (property test ข้ามหลายเหตุการณ์)
- ownership/IDOR: ผู้ใช้ B ยิง quote/cancel/refunds ของ booking ผู้ใช้ A ⇒ 404 body เดียวกับไม่มีจริง · ติวเตอร์ B ยกเลิกคลาสของ A ⇒ 404 · ผู้ใช้ปกติยิง admin endpoint ⇒ 403 · ไม่มี endpoint รับ `userId`

**D. Reliability:** `RecordPenalty` idempotent (UQ), 0 คะแนนไม่สร้างแถว, คะแนน clamp 0..100, หน้าต่าง 90 วัน (โทษเก่ากว่าไม่นับ — ขอบวัน), void ⇒ คะแนนกลับ, ระงับที่ `score=59` ไม่ระงับที่ `60`, ระงับที่ no-show ครั้งที่ 3 ในหน้าต่าง, ติวเตอร์ที่ไม่ Verified ไม่ถูกระงับซ้ำ, คะแนนถูกเขียนผ่าน `ITutorStatsWriter.SetReliabilityScoreAsync` เท่านั้น (เทสต์ด้วย fake writer + source-scan: ไม่มีโค้ดของ P13-08 เขียน `RELIABILITY_SCORE` ตรง), reason ของการระงับขึ้นต้น `auto:`, job recompute ฟื้นคะแนนแต่ไม่ unsuspend · **sweep (§7.3):** ติวเตอร์ Suspended ที่มี 3 session อนาคต ⇒ ยกเลิกครบ + refund 100% ทุก booking + ไม่มีแถว penalty + อีเมลข้อความ platform; session ของติวเตอร์ Verified ไม่ถูกแตะ; รันซ้ำ idempotent; ล้มรายการหนึ่งไม่หยุดรายการอื่น
**E. Jobs:** `tutoring-refund-process` ข้ามแถวที่ lease ยังไม่หมด/ยังไม่ถึงเวลา, ล้มรายการหนึ่งไม่หยุดรายการอื่น · `tutoring-refund-reconcile` ใช้ `GetRefundAsync` อัปเดต Processing→Completed/Failed · `HangfireHostingTests` (`RecurringJobIds.All`) เขียว
**F. Architecture:** Tutoring ไม่ depend `Siri.Modules.Commerce`; ใช้ `Siri.Modules.Payout.Contracts`/`Live.Contracts` เท่านั้น
**G. รอบ 2 (มติ D-A/D-B + ข้อ 1,2,3,7,8,12,14,20):** `EscrowReleaseTime` เวกเตอร์ §3.3 + ทุกเส้นที่ตั้งเวลาปล่อยใช้สูตรเดียว (completed/learner no-show/ยกเลิกช้า) · `booking.ESCROW_STATE` คง `Held` หลัง `SettleCompletedAsync` และเป็น `Released` หลัง job (SQL ข้อ 3 §6.6) เมื่อถึง `ESCROW_RELEASE_AT_UTC` / ทันทีเมื่อ `releaseImmediately` · `SettleCompletedAsync`: `holdStartedAtUtc` = `ENDS_AT_UTC` ขณะ now = E−10 นาที ⇒ ผ่าน; > max(E, now+1min) ⇒ Validation; Settle* ได้ `Result.Failure` ใน txn ที่ join ⇒ ผู้เรียก throw (เทสต์ผู้เรียกจำลอง) · refund จาก webhook (`BookingId=null`, key `refund:p{paymentId:N}:{Reason}`) ไม่แตะ `booking.REFUNDED_AMOUNT`/ledger; ซ้ำ ⇒ ใบเดิม · `ApplyRefundTotals` ผ่าน `RequestAsync`/`Completed`/`Failed`/`Voided`/provider ย้อน ครบทุกคู่ และ `REFUND_RESERVED_AMOUNT` = SUM จริงเสมอ (property test) · **ledger reinstate:** คืนเต็ม-ยังไม่ batch → refund `Failed` ⇒ แถว adjustment บวก (Σ = Compute เดิม) → admin `retry` ⇒ ลดอีกครั้ง → `void` ⇒ NoChange; `entryKey` ไม่ซ้ำ (`LEDGER_SEQ`) · **lock order:** webhook refund-event ↔ `ExecuteAsync` ↔ admin retry/void ↔ cancel ↔ reconcile บน payment เดียว วน 50 รอบ ไม่มี `40P01`; fake `IPaymentMethod` ตรวจ `Database.CurrentTransaction == null` ทุกครั้งที่ถูกเรียก · claim UPDATE หมุน `ROW_VERSION` (entity ที่ track ก่อน claim บันทึกแล้วชน `DbUpdateConcurrencyException`) · `CancelByTutorAsync` คลาสกลุ่มที่มี booking แพ็กเกจ 2 ใบ purchase เดียวกัน ⇒ `LockPurchaseAsync` ก่อน `RestoreCreditAsync` ทุกใบ + `RecordPenaltyAsync` ครั้งเดียวท้ายสุด (spy ลำดับ) · **sweep ไม่ Verified:** ติวเตอร์ `NeedsInfo` (RequireReverification) มี session อนาคต ⇒ ยกเลิก+คืนเต็ม `reasonCode="tutor_not_verified"`, ไม่มี penalty

## 12. Frontend notes + DTO appendix

- **หน้ายกเลิก (ผู้เรียก) — modal ยืนยัน:** เปิดแล้วเรียก `GET …/cancellation-quote` ทันที แสดง "ยอดจ่าย / ยอดที่จะได้คืน / ส่วนที่ไม่คืน (ค่าเสียเวลาติวเตอร์)" จากเซิร์ฟเวอร์เท่านั้น (**FE ห้ามคำนวณ**) + เวลาที่เหลือจนเริ่ม + ปุ่มยืนยันส่ง `expectedRefundAmount = quote.refundAmount` · `409 cancellation_quote_changed` ⇒ แสดงยอดใหม่ให้ยืนยันซ้ำ · `settlement='CreditRestore'` ⇒ "คืนเครดิตแพ็กเกจ 1 ครั้ง" · `refundIsAsync=true` ⇒ ข้อความ **"คืนเงินผ่าน PromptPay: Stripe จะติดต่อทางอีเมลเพื่อขอข้อมูลบัญชีของคุณ อาจใช้เวลาหลายวัน"** ตรง ๆ
- **สถานะคืนเงิน** ในรายการ "การเรียนของฉัน" (`GET bookings/{id}/refunds`): `Requested|Processing` = "กำลังดำเนินการคืนเงิน", `Completed` = "คืนเงินแล้ว", `Failed` = "ทีมงานกำลังตรวจสอบ ไม่ต้องดำเนินการใด ๆ" (ห้ามแสดงรหัสภายใน)
- **ติวเตอร์ยกเลิกคลาส:** modal ใช้ quote (จำนวนผู้เรียกที่ได้รับผลกระทบ, คืนเงินรวม, **คะแนนที่จะถูกหัก** และ "จะถูกระงับบัญชีหากยืนยัน" เมื่อ `willTriggerSuspension`) + ช่องเหตุผลบังคับ 3–500 · ผลลัพธ์แสดงคะแนนใหม่
- **นโยบายก่อนจอง:** ใช้ `GET cancellation-policy` แสดงข้อความ "ยกเลิกก่อน {fullRefundHours} ชม. คืนเต็ม / หลังจากนั้นคืน {lateRefundPercent}%" (ตัวเลขจาก config ห้าม hardcode)
- **Admin:** หน้า `/admin/tutoring/refunds` (คิว: `needsReview`, ตัวกรองสถานะ, ปุ่ม retry [ต้องติ๊ก "ตรวจใน Stripe แล้วไม่มี refund"], void, manual refund [`clientRequestId` สร้างตอนเปิดฟอร์ม กันดับเบิลคลิก])
- i18n `tutoring.cancel.*`, `tutoring.refund.*`, `tutoring.errors.<reason>` (th+en) · `currencyThb` (ต้อง `providers:[CurrencyPipe]`) · `bangkokDate` · ปุ่ม submit กันกดซ้ำ

### Frontend DTO appendix (JSON = camelCase · enum = string · UTC `…Z` · เงิน = number 2dp)
```ts
type RefundSettlement = 'None' | 'Money' | 'CreditRestore';
type RefundDisplayStatus = 'Requested' | 'Processing' | 'Completed' | 'Failed';
type RefundStatus = 'Requested' | 'Processing' | 'Completed' | 'Failed' | 'Voided';
type RefundReason = 'LearnerCancelEarly' | 'LearnerCancelLate' | 'TutorCancel' | 'TutorNoShow' | 'NoClassHeld'
  | 'DisputeResolved' | 'AdminManual' | 'LatePayment' | 'DuplicatePayment' | 'AmountMismatch' | 'PackageExpired';
type TutorPenaltyKind = 'LateCancel' | 'NoShow';

interface CancellationPolicy { fullRefundHours: number; fullRefundPercent: number; lateRefundPercent: number;
  tutorCancelRefundPercent: number; tutorNoShowRefundPercent: number; learnerNoShowRefundPercent: number; disputeWindowHours: number; }

interface CancellationQuote {                                 // GET bookings/{id}/cancellation-quote
  bookingId: string; canCancel: boolean; refusalReason: string | null; ruleCode: string;
  amountPaid: number; refundAmount: number; retainedAmount: number; refundPercent: number;
  settlement: RefundSettlement; refundIsAsync: boolean; startsAtUtc: string; quotedAtUtc: string; hoursUntilStart: number;
}
interface CancelBookingRequest { reason?: string | null; expectedRefundAmount: number; }
interface BookingRefundSummary { refundId: string; amount: number; status: RefundDisplayStatus; isAsync: boolean; requestedAtUtc: string; completedAtUtc: string | null; }
interface CancelBookingResponse { bookingId: string; status: string; alreadyCancelled: boolean; refundAmount: number; retainedAmount: number;
  settlement: RefundSettlement; refund: BookingRefundSummary | null; creditRestored: boolean; }

interface TutorCancellationQuote { sessionId: string; canCancel: boolean; refusalReason: string | null; affectedBookings: number; totalRefundAmount: number;
  penaltyKind: TutorPenaltyKind | null; penaltyPoints: number; currentReliabilityScore: number; projectedReliabilityScore: number; willTriggerSuspension: boolean; startsAtUtc: string; }
interface CancelClassRequest { reason: string; }
interface CancelledBookingResult { bookingId: string; bookingNo: string; refundAmount: number; settlement: RefundSettlement; refundStatus: RefundDisplayStatus | null; }
interface CancelClassResponse { sessionId: string; status: string; alreadyCancelled: boolean; bookings: CancelledBookingResult[];
  penaltyKind: TutorPenaltyKind | null; penaltyPoints: number; reliabilityScore: number; suspended: boolean; }

interface AdminRefundRow { refundId: string; paymentId: string; bookingId: string | null; bookingNo: string | null; amount: number; reason: RefundReason; status: RefundStatus;
  providerStatus: string | null; failureCode: string | null; requiresManualReview: boolean; isAsync: boolean; attemptNo: number; requestedAtUtc: string; completedAtUtc: string | null; decisionNote: string | null; }
interface AdminManualRefundRequest { bookingId: string; amount: number; note: string; clientRequestId: string; }
interface RetryRefundRequest { note: string; confirmedNoRefundInStripeDashboard: boolean; }
interface VoidRefundRequest { note: string; }
```
C# (ตรงกับ TS; record ตำแหน่งเดียว): `CancellationQuoteResponse`, `CancelBookingRequest/Response`, `BookingRefundSummary`, `TutorCancellationQuoteResponse`, `CancelClassRequest/Response`, `CancelledBookingResult`, `AdminRefundRow`, `AdminManualRefundRequest`, `RetryRefundRequest`, `VoidRefundRequest`, `CancellationPolicyResponse` — ฟิลด์ตามลำดับที่ระบุใน §5 · `RefundSettlementDto`/`RefundDisplayStatus` เป็น enum ใน `Application` (ไม่รั่ว `RefundSettlement`/`RefundStatus` ของ Domain ออก API โดยตรง — map ใน `ToResponse()`)

`ApiProblem.reason`: `tutoring.booking_not_found`, `tutoring.booking_not_cancellable`, `tutoring.cancel_after_start`, `tutoring.cancellation_quote_changed` (+`refundAmount`,`retainedAmount`), `tutoring.concurrent_update`, `tutoring.class_not_found`, `tutoring.class_not_cancellable`, `tutoring.cancel_after_end`, `tutoring.refund_exceeds_cap` (+`maxRefundable`), `tutoring.refund_not_allowed`, `tutoring.refund_not_retryable`, `tutoring.noshow_conflict`, `tutoring.escrow_already_released`, `tutoring.booking_not_completable`

## 13. Open decisions (defaulted) — เจ้าของ/นักบัญชีเปลี่ยนได้ที่ config
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | **สูตรเงินเมื่อคืนบางส่วน** | ค่าธรรมเนียม Stripe ไม่ถูกคืน ⇒ คิดเต็มกับส่วนที่ไม่คืน; ติวเตอร์ 80% ของ `(ส่วนที่ไม่คืน − ค่าธรรมเนียม)`; คืนเต็ม = แพลตฟอร์มแบกค่าธรรมเนียม — **ต้องให้นักบัญชียืนยัน (Q14.2ค)** |
| 2 | ปัดเศษ | ยอดคืน `AwayFromZero` 2 ตำแหน่ง; ส่วนต่าง (retained) = ที่เหลือ ⇒ ผลรวมเท่ายอดจ่ายเสมอ; เศษครึ่งสตางค์ตกเป็นของผู้ซื้อ |
| 3 | ติวเตอร์ยกเลิกหลังเริ่มก่อนจบ | อนุญาต (คืนเต็ม + โทษ 6); หลังจบ ปฏิเสธ |
| 4 | **เวลาปล่อยเงิน (มติ D-A)** | `AvailableAt = max(session.ENDS_AT_UTC, decidedAt) + DisputeWindowHours` ทุกเส้นทาง (completed, ผู้เรียก no-show, ยกเลิกช้าส่วนที่ไม่คืน; `decidedAt` = เวลาตัดสิน/ยกเลิก) · ปล่อยทันทีเฉพาะผู้เรียกยืนยัน/admin · `booking.ESCROW_STATE=Held` จนถึงเวลา แล้ว job ตั้ง `Released` |
| 5 | แพ็กเกจ: ยกเลิกทัน ≥24 ชม. / ติวเตอร์ผิด | **คืนเครดิต** ไม่คืนเงิน (`PackageTutorFaultRemedy=RestoreCredit` เปลี่ยนเป็น `RefundMoney` ได้); ยกเลิกช้า ⇒ คืนเงิน 50% ของส่วนนั้น + เครดิตถูกใช้ไป |
| 6 | โทษติวเตอร์ | ต่อ **คลาส** ไม่ใช่ต่อ booking; tiers/คะแนน/เกณฑ์ระงับตามค่า default §9; ระงับอัตโนมัติไม่ยกเลิก booking ล่วงหน้า (admin queue ตัดสิน) |
| 7 | ผู้เรียกยืนยันจบคลาสแล้วยังเปิดข้อพิพาทได้ไหม | **ได้** ภายใน `DisputeWindowHours` (ตาม P13-10 §6.3 — ไม่ตัดสิทธิ์ผู้เรียก); ถ้าเงินถูกปล่อยเร็วจนเข้า batch แล้ว Freeze ตอบ `TooLate` ⇒ แก้ด้วย refund + adjustment ลบรอบถัดไป |
| 8 | refund ล้มเหลวถาวรแล้ว | **ปล่อย cap + reinstate ledger ทันทีที่เข้า `Failed`** (ติวเตอร์ไม่เสียเงินขณะผู้เรียนไม่ได้รับเงินคืน — มติรอบ 2; เดิมคง cap/ledger ไว้) แล้วให้ admin เลือก retry (จอง cap/ledger ใหม่) / void (ปิดงาน); ผู้เรียกที่ค้างรับเงินคืนเห็น `Failed` = "ทีมงานกำลังตรวจสอบ" |
| 9 | dispute หลัง batch เข้ารอบแล้ว | `Freeze` ตอบ `TooLate` ⇒ แก้ด้วย refund + adjustment ลบรอบถัดไป (ไม่ย้อน batch) |
| 10 | Stripe Dashboard ต้อง subscribe `refund.created/updated/failed` | OWN; มี poll fallback ทุก 15 นาที |

## 14. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | entity `REFUND`/`TUTOR_PENALTY_EVENT` + configuration + migration `AddTutoringRefundsAndPenalties` + `docs/DATABASE.md` | อ่านทั้งไฟล์ ไม่มี shadow FK, FK ทั้งหมด NoAction, ชื่อ ≤63; **ไม่ apply DB จริง** |
| B | `backend-developer` | `CancellationPolicy` + options/validator + unit §11.A (pure — เริ่มได้ทันทีไม่พึ่ง A) | ตารางครบทุกแถว + property test |
| C | `backend-developer` | `TutoringRefundService` + jobs refund-process/reconcile + unit §11.B (หลัง A + P13-06 §4 + P13-07) | |
| D | `backend-developer` | `TutorReliabilityUpdater` + recompute job + `tutoring-suspended-sweep` + `CancelSessionByPlatformAsync` + unit §11.D (หลัง E ส่วน cancel เพราะ sweep ใช้ cancel flow เดียวกัน) | |
| E | `backend-developer` | `BookingCancellationService` + `BookingSettlementService` (§4) + controllers/rate limits + DTO mapping (หลัง B,C,D และ P13-05) | unit + endpoint tests |
| F | `backend-developer` | integration §11.C/E/F | เขียนครบ (ระบุถ้ายังไม่เคยรันเพราะไม่มี Docker) |
ขนาน: B กับ A · FE ขนานกับ BE ทั้งหมด · `DONE` โดย integrator-qa · **ห้าม commit / apply migration เอง** · P13-10/14 เริ่มได้เมื่อ §4 signature มีใน main (stub throw ได้ระหว่างรอ)

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review — มติกลาง D-A/D-B) — ผลต่อผู้ implement
- **ข้อ 1:** refund ของเส้น webhook (R3/R5/mismatch/orphan) ใช้ `BookingId=null` + key `refund:p{paymentId:N}:{Reason}` ข้าม booking cap/ledger; ตารางค่า `RequestRefundCommand` ต่อเส้นทางใน §6.1; `Result.IsFailure` ใน webhook ⇒ ผู้เรียก throw
- **ข้อ 2/3:** §6.0 ใหม่ — lock chain D-B (payment ก่อน refund ทุก flow), ยอดรวม `REFUND_RESERVED_AMOUNT`/`REFUNDED_AMOUNT`/`booking.REFUNDED_AMOUNT` คำนวณใหม่จากแถว `REFUNDS` ผ่าน `payment.ApplyRefundTotals` (P13-06 §2.1); §6.2 ข้อ 3, §6.3, §6.4, §6.6 ล็อกตามลำดับ + Stripe นอก lock
- **ข้อ 7:** `SettleCompletedAsync` validation `STARTS ≤ holdStartedAtUtc ≤ max(ENDS, now+1min)`; Settle* ที่คืน `Failure` ใน txn ที่ join ⇒ ผู้เรียก throw (§4 (ง))
- **ข้อ 8 / D-A:** §3.3 `EscrowReleaseTime`; `ESCROW_STATE` คง `Held` จนถึงเวลา + คอลัมน์ `TUTOR_BOOKINGS.ESCROW_RELEASE_AT_UTC` + `ScheduleEscrowRelease` + job `tutoring-refund-reconcile` ข้อ 3 ตั้ง `Released` (§2.3a, §6.6); §4/§8 ข้อ 7/§13 #4 ใช้สูตรเดียว
- **ข้อ 12:** `Failed`/`Voided` ปล่อย cap และ reinstate ledger (P13-07 §5.5) — `LEDGER_SEQ` + `entryKey=adj:{refundId:N}:{seq}`; §5.6 retry/void; §13 #8 เปลี่ยน
- **ข้อ 14:** sweep ครอบ `STATUS <> Verified` (รวม `NeedsInfo` จาก RequireReverification) `reasonCode=tutor_not_verified` (§7.3) · wallet/class-cancel/quote ยัง `InstructorOnly` ตั้งใจ
- **ข้อ 20:** F5/§6.1 ข้อ 7 แก้ถ้อยคำ audit; claim UPDATE หมุน `ROW_VERSION`; `CancelByTutorAsync` เรียก `LockPurchaseAsync` ต่อ booking แพ็กเกจก่อน `RestoreCreditAsync`; `RecordPenaltyAsync`/`TUTOR_PROFILES` ไปท้ายสุดของ txn ที่ตัดสินหลาย booking (§7.1)
- **ข้อ 21:** FK ทั้งหมด `NoAction` (แก้จาก `Restrict`); wiring checklist (`ProjectReference`, appsettings Api+Workers, DI Workers) §9
- **ปิดรอบ 2 (ตามมติ README §7.5):** ตัดอีเมลผลการเข้าเรียน no-show (`tutoring-noshow-*`) ออกจาก §8 — เป็นของ P13-10; §7.3 อ้างว่าด่าน join ติวเตอร์ไม่ Verified ทำแล้วที่ P13-10 §4.2 ข้อ 1
### 2026-10-15 รอบ 3 (README §6 — ชื่อ ext สงวน) — error table: `booking_not_cancellable` ใช้ ext **`bookingStatus`** แทน `status` (ชื่อสงวนถูกทิ้งเงียบ) · ไม่เปลี่ยน endpoint/DTO อื่น

- **Changelog 2026-10-15 hardening (P13-33):** (M4 — **นโยบายเพิ่ม เจ้าของต้องรับทราบ**) config `Tutoring:Cancellation:BlockCancelAfterJoin` (default **true**): เมื่อ `LEARNER_JOINED_AT_UTC` ≠ null (ผู้เรียนเคยได้รับลิงก์ห้อง) การยกเลิกโดย **ผู้เรียน** ถูกปฏิเสธ — `CancellationPolicy.Evaluate` (ตัวเดียวกับที่ quote ใช้) คืน `Allowed=false`, `RuleCode = learner_cancel.rejected_after_join`, `RefusalReason = after_join`; `GET cancellation-quote` ⇒ `canCancel=false` (refund/retained = 0, settlement `None`); `POST cancel` ⇒ **409 `tutoring.cancel_after_join`** (ไม่มี ext key, ไม่เขียนอะไรเลย); ลำดับ: `after_start` ชนะ `after_join` · การยกเลิกโดยติวเตอร์/แพลตฟอร์มและ no-show **ไม่อ่านค่านี้** และคืนเงินเต็มเหมือนเดิม · ปิดได้ด้วย `false` · (L1) `RequestManualAsync/RetryAsync/VoidAsync` ปฏิเสธ **403 `tutoring.admin_self_action`** เมื่อ admin เป็นผู้เรียนของ booking นั้นหรือเป็นบัญชีของติวเตอร์ของคลาสนั้น · (L3) `GET admin/refunds`: `page` 1..100000

### rev (2026-10-20) — R1/R2 (D-25.1)
- §2.1/§6.1 `RefundReason` เพิ่ม `ConsentWithdrawn` (16 ตัวอักษร; `REFUNDS.REASON` varchar(24) ไม่มี CHECK ⇒ ไม่มี migration) · คืนเต็ม ไม่หัก penalty ติวเตอร์ ไม่เข้า ledger
