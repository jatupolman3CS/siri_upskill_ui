# Contract: P13-06 Tutoring payment + seam ที่ webhook ของ Commerce (PaymentIntent · listener · เหตุการณ์จ่ายเงิน/คืนเงิน)

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE entity/DB, schema `TUTORING`) + **additive** ที่ `Siri.SharedKernel.Contracts` (ไฟล์ใหม่) · `Siri.Modules.Commerce` (webhook dispatch 1 จุด) · `Siri.Integrations.Payment` (field optional + method ใหม่ที่มี default) · `Siri.Api` (controller; ใช้ rate limit policy ของ P13-01)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A: entity/migration) → `backend-developer` (WP-B..F)** — เหตุผล: เงินจริง + webhook ที่ยืนยันการจ่าย + `Contracts/` ข้ามโมดูลใหม่ + แก้ `StripeWebhookHandler` ของ Commerce (โค้ดที่ enroll คนเรียนจริง) → ตรงเกณฑ์ที่ห้ามส่ง Antigravity · **ไม่ต้องผ่าน DESIGN_DATABASE** (ตารางเดียว §2 ระดับคอลัมน์/index/CHECK ครบ) · **ไม่มีบล็อกคำสั่ง Antigravity ในไฟล์นี้** · FE เริ่มขนานได้ทันทีจาก DTO appendix ท้ายไฟล์ (เจ้าของ `siri_upskill_ui/**`; BE เป็นเจ้าของ `src/**` — ไม่มีไฟล์ที่สองฝั่งต้องแก้ร่วมกัน)

> **อ่านคู่กับ:** `docs/TUTORING.md` §1/§3.4/§3.8/§4/§8 · `DECISIONS.md` D-25, Q4, Q14 · `PAYMENT.md` · `TASKS.md` X-35..X-38 (ช่องโหว่เดิมของ Commerce — **ไม่สืบทอด ไม่แก้**) · แม่แบบรูปแบบ: `P11-09-card-payment.md`, `P11-12-refund-hard-block-after-live-join.md` · คู่กัน: **P13-05** (entity `TUTOR_SESSIONS/TUTOR_BOOKINGS` — ชื่อคอลัมน์ยึด `TUTORING.md` §2 เป็น tie-breaker; ถ้า P13-05 ตั้งต่างให้ rename เชิงกลไก ไม่ใช่ redesign) · **P13-07** (`ITutoringEscrowContract`) · **P13-08** (`BookingSettlementService`/`TutoringRefundService`/ตาราง `REFUNDS`) · **P13-09** (`ISessionRoomSync`) · **P13-12** (แพ็กเกจ — เรียก listener เดียวกัน)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body 2026-10-14 — ไม่เชื่อ doc comment)

| # | ข้อเท็จจริง | หลักฐาน | ผลต่อ contract |
|---|---|---|---|
| F1 | webhook: ตรวจ signature → `ExecuteInTransactionAsync` → เช็ค event ซ้ำด้วย `GetByStripeEventIdAsync` → `switch` 3 event → `AddAsync(webhookEvent)` ท้ายสุด ทั้งหมดใน transaction เดียว; `STRIPE_EVENT_ID` มี **UQ** (ดู `STRIPE_WEBHOOK_EVENTConfiguration`) | `Commerce/Application/StripeWebhookHandler.cs:92-142`; `Infrastructure/STRIPE_WEBHOOK_EVENTConfiguration.cs:19-20` | จุดแทรก dispatch = **หลังบรรทัด 118 (`STRIPE_WEBHOOK_EVENT.Create`) ก่อน `switch` (บรรทัด 120)** — ได้ idempotency + transaction เดิมฟรี; ส่งสองรอบพร้อมกัน ⇒ ตัวที่สองชน UQ ตอน `AddAsync` ⇒ rollback ⇒ Stripe retry ⇒ เห็น event ซ้ำ ⇒ no-op |
| F2 | PI ที่ Commerce ไม่รู้จักถูก **กลืนเงียบ**: `payment is null` → `MarkProcessed("payment.not_found")` แล้ว return | `StripeWebhookHandler.cs:156-162`, `:371-376`, `:398-403` | PI ของ Tutoring ที่ยิงมายัง handler เดิมโดยไม่มี seam จะถูกกลืนทันที ⇒ **ต้อง dispatch ก่อน** ไม่ใช่หลังไม่เจอ |
| F3 | `ExecuteInTransactionAsync<T>`: ถ้ามี `CurrentTransaction` อยู่แล้ว → **join** (รันตรง ๆ); ไม่งั้น `CreateExecutionStrategy` + begin; ผลเป็น `Result` ที่ `IsSuccess=false` ⇒ **rollback**; exception ⇒ rollback + rethrow | `Commerce/Infrastructure/OrderRepository.cs:61-93` | บริการของ Tutoring ที่ถูกเรียกจาก listener (อยู่ใน txn ของ webhook แล้ว) join ได้; **แต่ `Result.Failure` ที่ join แล้วไม่ rollback ให้** ⇒ ในเส้นทาง webhook ต้อง **throw** เมื่อ business step ล้ม (Commerce ทำแบบนี้ที่ `StripeWebhookHandler.cs:255-258`) |
| F4 | `IPaymentMethod`: `CreatePaymentIntentRequest` มี metadata ตายตัว `orderId`/`orderNo` (ไม่มี kind); **idempotency key = `Guid.NewGuid()` ใหม่ทุกครั้ง** (ซ้ำได้เฉพาะ retry ภายในการเรียกเดียว) | `Siri.Integrations.Payment/Stripe/StripePaymentMethod.cs:94-98,117-121,127`; `IPaymentMethod.cs:45-52` | ต้องเพิ่ม `Kind/ReferenceId/IdempotencyKey` (optional) — คีย์สุ่มใช้ไม่ได้กับ Tutoring (retry หลัง crash ต้องได้ PI เดิม) |
| F5 | `CreateRefundAsync`: **ไม่มี `IdempotencyKey`**, ไม่มี `Metadata`, ไม่แยก error ชั่วคราว/ถาวร (ทุก `StripeException` → `payment.provider_error`) และอยู่ใน `ExecuteWithRetryAsync` | `StripePaymentMethod.cs:219-272` | ใช้กับ P13-08 ตรง ๆ ไม่ได้ ⇒ ขยายใน §4 (P13-06 เป็นเจ้าของไฟล์ `Siri.Integrations.Payment` ทั้งหมดเพื่อไม่ให้สอง task แก้ไฟล์เดียวกัน) |
| F6 | `GetChargeFeeAsync` = เรียก Stripe ครั้งเดียว ไม่ retry (ตั้งใจ เพราะอยู่ใน txn) และ **ไม่มี timeout นอกจาก default ของ SDK** | `StripePaymentMethod.cs:288-320` | Tutoring ครอบด้วย `CancellationTokenSource` timeout เอง (§6.2 ขั้น 3) |
| F7 | `SecurityAuditContract.RecordAuditAsync` เรียก `SaveChangesAsync` ของ `AppDbContext` ที่ใช้ร่วมกัน (flush ทุกอย่างที่ tracked) | `Identity/Infrastructure/Contracts/SecurityAuditContract.cs:17-19` | ในเส้นทางเงินทุกเส้นรันใต้ transaction ชัดเจน ⇒ flush ปลอดภัย (ยังไม่ commit จนกว่าจะจบ) ⇒ เรียก audit เป็นขั้นสุดท้ายก่อน commit **ในสาย webhook/ตัดสินเงิน**; (P13-09 F12 พูดถึงหน่วยงานแบบ stage-only ที่ไม่มี txn ชัดเจน — คนละกรณี) |
| F8 | accessor `Payments()` / `Refunds()` มีอยู่แล้วใน Commerce (`AppDbContextCommerceExtensions.cs:28,39`) | — | accessor ของ Tutoring ต้องชื่อ **`TutoringPayments()` / `TutoringRefunds()`** (extension method overload ด้วย return type ไม่ได้ ⇒ ambiguous เมื่อ import สอง namespace) |
| F9 | `PaymentOptions` ของ Commerce (`Payment:EnabledMethods`) **แยก**จาก Tutoring; มีกับดัก `Bind()` ต่อท้าย default list ⇒ ต้อง `PostConfigure` อ่าน section ดิบแทนที่ | `Commerce/CommerceModule.cs:57-68` | `Tutoring:Payment:EnabledMethods` ใช้วิธีเดียวกัน (§7) |
| F10 | เทสต์สร้าง `StripeWebhookHandler` แบบ positional ใน 2 ที่ | `tests/Siri.UnitTests/Commerce/StripeWebhookHandlerTests.cs:45`; `tests/Siri.IntegrationTests/PaymentFulfillmentIntegrationTests.cs:520` | ตัวแปร ctor ใหม่ต้องเป็น **optional ตัวสุดท้าย** ⇒ เทสต์เดิมคอมไพล์ผ่านโดยไม่แก้ |
| F11 | Stripe.net `52.3.0` (ตรวจจาก `Stripe.net.xml` ใน nuget cache แล้ว): มี `EventTypes.RefundCreated/RefundUpdated/RefundFailed/ChargeRefunded`, `Refund.PaymentIntentId/Status/FailureReason/Metadata/Amount`, `RefundCreateOptions.Metadata/PaymentIntent/Reason`, `RequestOptions.IdempotencyKey`, `PaymentIntent.AmountReceived/Created/Metadata/LastPaymentError`, `Event.Created`, `StripeError.Type` (`api_error`/`card_error`/`idempotency_error`/`invalid_request_error`), `RefundService.GetAsync(string, RefundGetOptions, RequestOptions, CancellationToken)`; สถานะ refund = `pending`/`requires_action`/`succeeded`/`failed`/`canceled` | `~/.nuget/packages/stripe.net/52.3.0/lib/net8.0/Stripe.net.xml` | ใช้ชื่อเหล่านี้ได้ตรง ๆ (ไม่เดา); **ไม่ใช้ `Charge.Metadata`** (ไม่ยืนยันว่า copy จาก PI) — ระบุเจ้าของ refund ด้วย metadata ของ `Refund` เอง + probe ด้วย PI id |
| F12 | `HangfireHostingTests` assert ว่า job ที่ลงทะเบียน == `RecurringJobIds.All` พอดี; Workers ลงทะเบียนผ่าน `RecurringJobsRegistration.MapRecurringJobs` | `RecurringJobsRegistration.cs`, `RecurringJobIds.cs` (+ ตามที่ P13-09 F14 บันทึก) | job ใหม่ของ P13-06 เพิ่ม id ใน `All` ด้วย |
| F13 | Controller เป็น MVC + `[Authorize]` ต้องใส่ชัดทุก action (ไม่มี fallback policy); rate limiter policy ต่อผู้ใช้ทำผ่าน `CreateUserPartition` | `Siri.Api/Configuration/RateLimiterConfiguration.cs` | ใช้ `tutoring-booking`/`tutoring-user` ของ P13-01 §7 (§5) |
| F15 | **P13-05 (FROZEN, เขียนหลังไฟล์นี้) เป็นเจ้าของ:** `ITutoringUnitOfWork`, `ISessionRoomSync`+`NullSessionRoomSync`, `IBookingExpiryService`(+`IBookingHoldExpiredHandler`), `IBookingReopenService`, `BookingConfirmedNotifier`, domain methods ของ booking/session (§3), `PostgresViolations`, SQL มีเงื่อนไข (§5.3), `LockSessionAsync/LockBookingAsync` | `docs/contracts/P13-05-learner-profiles-and-booking-core.md` §3, §5.0, §5.3-5.6 | P13-06 **เรียกใช้ตามนั้น ไม่ประกาศซ้ำ**; ที่เนื้อหาเก่าของไฟล์นี้ขัดกับ P13-05 ให้ยึด P13-05 |
| F14 | repo ไม่ได้ตั้ง `EnableRetryOnFailure` (ไม่มี retrying execution strategy) | grep ทั้ง `src` ไม่พบ | lambda ใน `ExecuteInTransactionAsync` ยังควรเขียนให้ re-run ได้ (ไม่มี side effect ภายนอกที่ทำซ้ำไม่ได้) |

---

## 1. Scope

**ใน:** `TUTORING.PAYMENTS` + migration · `SharedKernel.Contracts.IPaymentIntentEventListener` + records · Commerce `StripeWebhookHandler` dispatch + `StripeProviderEventMapper` · **ทุกการแก้ใน `Siri.Integrations.Payment`** (PI + refund + error classification + `GetRefundAsync`) · `TutoringPaymentService` + 3 endpoint · `TutoringPaymentEventListener` · `BookingSettlementService.ConfirmPaidAsync` (สเปคเต็มที่นี่) · ตาราง race จ่ายหลัง hold หมด · orphan adoption · job `tutoring-payment-reconcile` · `TutoringPaymentOptions` · `TutoringHoldExpiredHandler` (implement `IBookingHoldExpiredHandler` ของ P13-05) · *(ไม่ประกาศ `ITutoringUnitOfWork`/`ISessionRoomSync` — เป็นของ P13-05 §5.0)*

**นอก (ห้ามทำ):** แก้ `Order/Pricing/PricingEngine/RefundService/TaxInvoice/PaymentOps/PaymentAmountOverride*` ของ Commerce · แก้ X-35/X-36/X-37 สำหรับคอร์ส · refund engine/นโยบายยกเลิก (P13-08) · ledger/escrow (P13-07) · แพ็กเกจ (P13-12 — แต่ listener dispatch ตาม `PAYMENTS.KIND` ไว้ให้) · ห้อง Meet (P13-09/10) · ใบกำกับภาษี (Q14 — Tutoring ยังไม่ออก) · `charge.dispute.*` (chargeback — ดู Open decision #9)

---

## 2. Schema delta — migration `AddTutoringPayments`

> UPPERCASE ผ่าน `ApplyUppercaseNamingConventions` · เวลา `timestamptz(3)` UTC · เงิน `numeric(18,2)` + `HasPrecision(18,2)` · enum เก็บ string · **ไม่ implement `IAuditable`/`ISoftDelete`** (ใช้ timestamp ตั้งชื่อเอง เหมือน `Commerce.PAYMENT`) · **ไม่มีเมธอดลบ** · identifier ≤ 63 ไบต์ · ตั้งชื่อ constraint/index เองทุกตัว · อ่าน migration ที่ generate ทั้งไฟล์ก่อนใช้ (ไม่มี shadow FK) · **ห้าม apply DB จริงเอง**

### 2.1 `TUTORING.PAYMENTS` (entity `PAYMENT` ใน `Siri.Modules.Tutoring.Domain`; accessor `TutoringPayments()`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `PAYMENT_ID` | uuid PK | no | UUIDv7 |
| `OWNER_USER_ID` | uuid | no | ผู้จ่าย (= `TUTOR_BOOKINGS.LEARNER_USER_ID`) — ไม่มี FK ข้าม schema |
| `KIND` | varchar(16) | no | `Booking` \| `Package` |
| `REF_ID` | uuid | no | `BOOKING_ID` หรือ `PACKAGE_PURCHASE_ID` (polymorphic ⇒ ไม่มี FK; แถว orphan ที่ไม่พบ booking ใช้ `Guid.Empty`) |
| `ATTEMPT_NO` | int | no | 1..; ความพยายามจ่ายครั้งที่ n ของ (`KIND`,`REF_ID`) |
| `METHOD` | varchar(16) | no | `PromptPay` \| `Card` |
| `PROVIDER` | varchar(16) | no | `Stripe` |
| `PROVIDER_PAYMENT_INTENT_ID` | varchar(255) | no | **UQ** |
| `AMOUNT` | numeric(18,2) | no | > 0 (CHECK) — ราคาที่ **server** อ่านจาก booking/purchase snapshot |
| `CURRENCY` | varchar(3) | no | `THB` |
| `STATUS` | varchar(24) | no | `Pending` \| `Succeeded` \| `Failed` \| `Expired` \| `PartiallyRefunded` \| `Refunded` |
| `REFUND_RESERVED_AMOUNT` | numeric(18,2) | no | default 0 — Σ `REFUNDS` ที่ Requested/Processing/Completed · **เขียนผ่าน `PAYMENT.ApplyRefundTotals(reserved, completed)` เท่านั้น** (เรียกโดย `TutoringRefundService` ใต้ lock ของ payment; ค่า = ผลรวมคำนวณใหม่จากแถว `REFUNDS` ทุกครั้ง ไม่ใช่ `+=`/`−=` เพื่อไม่ drift เมื่อ refund Failed/Voided) |
| `REFUNDED_AMOUNT` | numeric(18,2) | no | default 0 — Σ `REFUNDS` ที่ Completed (ผ่าน `ApplyRefundTotals` เช่นกัน) |
| `STRIPE_FEE_AMOUNT` | numeric(18,2) | yes | ค่าธรรมเนียมจริงหรือค่าประมาณ (ดู `STRIPE_FEE_IS_ESTIMATE`) |
| `STRIPE_FEE_IS_ESTIMATE` | bool | no | default false |
| `STRIPE_FEE_CHECKED_AT_UTC` | timestamptz(3) | yes | |
| `SUCCEEDED_AT_UTC` / `FAILED_AT_UTC` | timestamptz(3) | yes | |
| `FAILURE_REASON` | varchar(300) | yes | ข้อความจาก `last_payment_error.message` (ตัดความยาว; ไม่ใช่ข้อมูลบัตร) |
| `LATE_RESOLUTION` | varchar(16) | yes | `Reopened` \| `Refunded` \| `Duplicate` \| `Orphan` (ตั้งครั้งเดียวเมื่อ succeeded มาในทางที่ไม่ใช่ R1 §6.3) |
| `CREATED_AT_UTC` | timestamptz(3) | no | |
| `UPDATED_AT_UTC` | timestamptz(3) | yes | ตั้งทุก transition |
| `ROW_VERSION` | bytea | no | `.IsConcurrencyToken().HasColumnType("bytea")` (ตัวหมุนคือ `ConcurrencyTokenInterceptor`) |

Index/constraint (ชื่อ ≤63 ไบต์): `PK_PAYMENTS` · **UQ** `UX_PAYMENTS_PROVIDER_INTENT` (`PROVIDER_PAYMENT_INTENT_ID`) · **UQ** `UX_PAYMENTS_REF_ATTEMPT` (`KIND`,`REF_ID`,`ATTEMPT_NO`) · `IX_PAYMENTS_OWNER` (`OWNER_USER_ID`,`CREATED_AT_UTC` DESC) · `IX_PAYMENTS_PENDING` (`CREATED_AT_UTC`) `HasFilter("\"STATUS\" = 'Pending'")` · `IX_PAYMENTS_FEE_ESTIMATE` (`SUCCEEDED_AT_UTC`) `HasFilter("\"STRIPE_FEE_IS_ESTIMATE\" = true AND \"STATUS\" IN ('Succeeded','PartiallyRefunded')")` · CHECK `CK_PAYMENTS_AMOUNT_POSITIVE` (`"AMOUNT" > 0`) · CHECK `CK_PAYMENTS_REFUND_BOUNDS` (`"REFUNDED_AMOUNT" >= 0 AND "REFUNDED_AMOUNT" <= "REFUND_RESERVED_AMOUNT" AND "REFUND_RESERVED_AMOUNT" <= "AMOUNT"`)

FK: **ไม่มี** (ตารางนี้ไม่ชี้ใคร) · onDelete: n/a · ในไฟล์ migration เดียวกันเพิ่ม `FK_TUTOR_BOOKINGS_PAYMENTS_PAYMENT_ID` (`TUTOR_BOOKINGS.PAYMENT_ID` → `PAYMENTS.PAYMENT_ID`, **NoAction**) — P13-05 ประกาศ `PAYMENT_ID uuid NULL` ไว้โดยยังไม่มี FK เพราะตารางนี้เกิดทีหลัง (ถ้า P13-05 เพิ่ม FK ไปแล้วให้ข้ามบรรทัดนี้)

คอลัมน์ที่ P13-06 **ต้องใช้จาก P13-05** (ถ้าขาดให้ P13-05 เพิ่ม ไม่ใช่ P13-06 ซ้ำ): `TUTOR_BOOKINGS`: `BOOKING_ID`, `BOOKING_NO`, `SESSION_ID`, `LEARNER_USER_ID`, `LEARNER_PROFILE_ID`, `PRICE_AMOUNT`, `STATUS`, `HOLD_EXPIRES_AT_UTC`, `PAYMENT_ID`, `ESCROW_STATE`, `IS_TRIAL`, `PACKAGE_PURCHASE_ID` · `TUTOR_SESSIONS`: `SESSION_ID`, `TUTOR_ID`, `STARTS_AT_UTC`, `ENDS_AT_UTC`, `STATUS`, `FORMAT`, `CAPACITY`, `SEATS_TAKEN` · `TUTOR_PROFILES`: `TUTOR_ID`, `USER_ID`, `INSTRUCTOR_PROFILE_ID`, `STATUS`, `COMMISSION_PERCENT_OVERRIDE`

State machine ของ `PAYMENT` (domain method เท่านั้น — ห้าม setter ภายนอก): `Pending→Succeeded` (`MarkSucceeded`) · `Pending→Failed` · `Pending→Expired` · `Failed→Succeeded` (บัตรลองใหม่) · `Failed→Expired` · `Expired→Succeeded` (จ่ายช้า) · **หลัง `Succeeded` แก้ผ่านเมธอดเดียว `ApplyRefundTotals(decimal reservedTotal, decimal completedTotal)`** (เรียกโดย `TutoringRefundService` ใต้ lock ของ payment เท่านั้น — P13-08 §6.1 ข้อ 5, §6.2 ข้อ 3, §6.3, §6.4): ตั้ง `REFUND_RESERVED_AMOUNT = reservedTotal`, `REFUNDED_AMOUNT = completedTotal` (บังคับ `0 ≤ completed ≤ reserved ≤ AMOUNT` ไม่งั้น `InvalidOperationException`) แล้วคำนวณ `STATUS` จาก `completedTotal`: `0` ⇒ `Succeeded` · `0 < c < AMOUNT` ⇒ `PartiallyRefunded` · `c == AMOUNT` ⇒ `Refunded` ⇒ ครอบคลุมทุกทาง: `Succeeded→PartiallyRefunded`, `Succeeded→Refunded` (คืนเต็มครั้งเดียว), `PartiallyRefunded→PartiallyRefunded` (คืนเพิ่ม/ลดบางส่วน), `PartiallyRefunded→Refunded`, และ **revert เมื่อ refund `Failed`/`Voided`/provider ย้อน:** `Refunded→PartiallyRefunded|Succeeded`, `PartiallyRefunded→Succeeded` · เรียกกับ `STATUS` นอก {Succeeded, PartiallyRefunded, Refunded} ⇒ `InvalidOperationException` · ผู้เรียกคำนวณ `reservedTotal`/`completedTotal` ใหม่จาก `SUM` ของแถว `REFUNDS` ของ payment นั้นทุกครั้ง · ทางอื่น → `InvalidOperationException` · unit test ครบทุกคู่ (รวม revert)

---

## 3. Seam ข้ามโมดูล — `IPaymentIntentEventListener`

### 3.1 `Siri.SharedKernel/Contracts/IPaymentIntentEventListener.cs` (ไฟล์ใหม่ — ไม่ reference Stripe)

```csharp
namespace Siri.SharedKernel.Contracts;

public enum PaymentProviderEventType
{
    PaymentSucceeded,   // payment_intent.succeeded
    PaymentFailed,      // payment_intent.payment_failed
    PaymentCanceled,    // payment_intent.canceled
    RefundChanged,      // refund.created | refund.updated | refund.failed
}

/// <summary>Provider-neutral view of one webhook event, built by the payment host from a signature-verified provider event.</summary>
public sealed record PaymentProviderEvent(
    string ProviderEventId,                  // evt_… (ใช้ลง audit/log เท่านั้น — idempotency ของ event ทำที่ host แล้ว)
    string ProviderEventType,                // ค่าดิบ เช่น "payment_intent.succeeded" (log เท่านั้น)
    PaymentProviderEventType Type,
    DateTime OccurredAtUtc,                  // Stripe Event.Created เป็น UTC
    string ProviderPaymentIntentId,          // pi_…
    string? Kind,                            // metadata["kind"] ของ object ที่ event พกมา (null = ไม่มี)
    string? ReferenceId,                     // metadata["referenceId"]
    string? PayKind,                         // metadata["payKind"] = "Booking" | "Package"
    decimal Amount,                          // THB หน่วยหลัก: PI.Amount (PI event) หรือ Refund.Amount (refund event)
    decimal? AmountReceived,                 // PI.AmountReceived (เฉพาะ PaymentSucceeded)
    string Currency,                         // ตัวพิมพ์เล็กตามที่ Stripe ส่ง ("thb")
    DateTime? PaymentIntentCreatedAtUtc,     // PI.Created (PI event เท่านั้น)
    string? FailureMessage,                  // PI.LastPaymentError.Message (PaymentFailed)
    PaymentProviderRefund? Refund);          // non-null ⇔ Type == RefundChanged

public sealed record PaymentProviderRefund(
    string ProviderRefundId,                 // re_…
    string Status,                           // pending | requires_action | succeeded | failed | canceled (verbatim)
    string? FailureReason,                   // verbatim Refund.FailureReason
    string? ClientRefundId);                 // metadata["refundId"] = REFUNDS.REFUND_ID ที่เราใส่ตอนสร้าง (Guid "D")

/// <summary>ProcessResult ถูกเก็บลง STRIPE_WEBHOOK_EVENTS.PROCESS_RESULT (varchar 500 — host ตัดให้).</summary>
public sealed record PaymentEventHandling(string ProcessResult);

public interface IPaymentIntentEventListener
{
    /// <summary>ค่า metadata["kind"] ที่ listener นี้เป็นเจ้าของ (Tutoring = "tutoring_booking" ทั้งสำหรับ Booking และ Package).</summary>
    string Kind { get; }

    /// <summary>ใช้เฉพาะ event ที่ไม่มี kind (refund ที่ admin สร้างใน Stripe Dashboard) — true ถ้า PI นี้เป็นของ listener.
    /// ต้องเป็น lookup เดียวที่ index (UQ PROVIDER_PAYMENT_INTENT_ID) ไม่มี side effect.</summary>
    Task<bool> OwnsPaymentIntentAsync(string providerPaymentIntentId, CancellationToken cancellationToken);

    /// <summary>
    /// รันใน DB transaction เดียวกับการบันทึก event (host เป็นเจ้าของ transaction). สัญญา:
    /// (1) return ปกติ ⇒ host บันทึก event เป็น processed แล้ว commit; (2) THROW ⇒ host rollback ทั้งหมด (รวม event row) ตอบ 5xx ⇒ Stripe ยิงใหม่ —
    /// ห้าม swallow exception ของ DB/Result.Failure ที่เป็น infra; (3) ต้อง idempotent ตามสถานะของแถวตัวเอง (event ซ้ำ/สลับลำดับต้องลู่เข้าสถานะเดียว);
    /// (4) ห้ามเรียก HTTP ภายนอกใด ๆ (Stripe/Google/อื่น ๆ) ใน HandleAsync — ใช้ได้เฉพาะข้อมูลใน event + DB (มติ D-B: ไม่เรียกเครือข่ายขณะถือ txn/lock; ข้อมูลภายนอกอย่างค่าธรรมเนียมให้ประมาณแล้วให้ job แก้ภายหลัง); (5) anomaly ทางธุรกิจ
    /// (จ่ายหลังหมดเวลา, ยอดไม่ตรง) ต้องจบด้วยผลลัพธ์ที่บันทึกได้ (refund/audit) — ห้ามใช้ exception เป็นทางออก ไม่งั้น retry วนไม่จบ.
    /// </summary>
    Task<PaymentEventHandling> HandleAsync(PaymentProviderEvent paymentEvent, CancellationToken cancellationToken);
}
```

### 3.2 metadata keys — `Siri.Integrations.Payment/PaymentMetadataKeys.cs` (ใหม่)
`Kind="kind"` · `ReferenceId="referenceId"` · `ReferenceNo="referenceNo"` · `PayKind="payKind"` · `RefundId="refundId"` — ที่เดียวที่ทั้ง adapter (เขียน) และ Commerce mapper (อ่าน) อ้างถึง. ค่าคงที่ฝั่ง Tutoring: `TutoringPaymentKinds.Kind = "tutoring_booking"`.

### 3.3 Commerce — การแก้ (additive ล้วน)

**ไฟล์ใหม่ `Commerce/Application/StripeProviderEventMapper.cs`** (static, unit-testable): `PaymentProviderEvent? TryMap(Event stripeEvent)`:

| `stripeEvent.Type` | วัตถุ | ผล |
|---|---|---|
| `payment_intent.succeeded` / `.payment_failed` / `.canceled` | `Data.Object is PaymentIntent pi` | map ตามชื่อฟิลด์ใน record (`Amount = pi.Amount/100m`, `AmountReceived = pi.AmountReceived/100m`, `PaymentIntentCreatedAtUtc = pi.Created`, `FailureMessage = pi.LastPaymentError?.Message`, `Kind/ReferenceId/PayKind` จาก `pi.Metadata` ด้วย `TryGetValue`) |
| `refund.created` / `refund.updated` / `refund.failed` | `Data.Object is Refund r` และ `r.PaymentIntentId` ไม่ว่าง | `ProviderPaymentIntentId = r.PaymentIntentId`, `Amount = r.Amount/100m`, `Refund = new(r.Id, r.Status, r.FailureReason, r.Metadata["refundId"])`, `Kind` จาก `r.Metadata` |
| อย่างอื่นทั้งหมด / object ผิดชนิด / refund ไม่มี PI | — | `null` ⇒ เดินทางเดิมของ Commerce ไม่เปลี่ยนแม้แต่บิต |

(`charge.refunded` **ไม่ map** — ซ้ำซ้อนกับ `refund.*` และไม่มี id ของ refund รายตัว; ห้ามนับซ้ำ)

**`StripeWebhookHandler`:** เพิ่ม ctor param **ตัวสุดท้าย optional** `IEnumerable<IPaymentIntentEventListener>? listeners = null` (F10) → field `IReadOnlyList<IPaymentIntentEventListener> _listeners`. ใน lambda ของ `ExecuteInTransactionAsync` **หลัง `STRIPE_WEBHOOK_EVENT.Create(...)` ก่อน `switch`**:

```csharp
var providerEvent = StripeProviderEventMapper.TryMap(stripeEvent);
var listener = providerEvent is null ? null : await ResolveListenerAsync(providerEvent, cancellationToken).ConfigureAwait(false);
if (listener is not null)
{
    var handled = await listener.HandleAsync(providerEvent!, cancellationToken).ConfigureAwait(false);
    webhookEvent.MarkProcessed(Truncate(handled.ProcessResult, 500), _clock);   // ตัด ≤ 500 (PROCESS_RESULT)
}
else
{
    switch (stripeEvent.Type) { /* 3 case + default — ไม่แก้สักตัวอักษร */ }
}
await _webhookEventRepository.AddAsync(webhookEvent, cancellationToken).ConfigureAwait(false);   // เดิม
```

**`ResolveListenerAsync` (กฎเดียว):**
1. `kind = providerEvent.Kind`. ถ้าว่าง/whitespace: ไม่ใช่ `RefundChanged` หรือไม่มี listener เลย ⇒ `null` (เส้นทางเดิม) · เป็น `RefundChanged` ⇒ ถามทุก listener `OwnsPaymentIntentAsync(pi)` ⇒ ตัวแรกที่ตอบ true, ไม่มีเลย ⇒ `null` (ตกไป `default` เดิม = `unhandled_event:refund.updated`, พฤติกรรมเดิมของคอร์ส)
2. `kind` มีค่า: หา listener ที่ `Kind == kind` (ordinal, case-sensitive). พบ 1 ⇒ ใช้ · **ไม่พบ หรือพบ >1 ⇒ `throw new InvalidOperationException(...)`** (ข้อความมีแค่ event id + kind ที่ตัดความยาว ≤64 — ห้ามมี payload) — เหตุผล: kind ที่ไม่มีผู้รับ = เงินที่ไม่มีเจ้าของ ต้องดัง (500 → Stripe retry → log Error) ไม่ใช่กลืนเป็น `processed`

**Registration:** `AddTutoringModule`: `services.AddScoped<IPaymentIntentEventListener, TutoringPaymentEventListener>();` · Commerce ไม่ต้องลงทะเบียนอะไร (DI inject `IEnumerable<>` ว่างเมื่อไม่มี Tutoring) · **Commerce ต้องไม่ reference `Siri.Modules.Tutoring` และ Tutoring ต้องไม่ reference `Siri.Modules.Commerce`** (กัน cycle + ใช้ admin override ของ Commerce โดยไม่ตั้งใจ)

### 3.4 สิ่งที่ต้องพิสูจน์ว่า "ไม่เปลี่ยน" (เทสต์บังคับ — §9.A)
1. เทสต์เดิมทั้งหมดของ `StripeWebhookHandlerTests` (≈892 บรรทัด) และ `PaymentFulfillmentIntegrationTests` **ผ่านโดยไม่แก้ assertion/ไม่แก้ call-site ctor**
2. ลงทะเบียน listener ปลอมที่ **throw ทันทีถ้าถูกเรียก** ⇒ ยิง `payment_intent.succeeded/failed/canceled` ที่ **ไม่มี `kind`** ⇒ ผลลัพธ์/`PROCESS_RESULT`/สถานะ order-payment-enrollment-split-outbox เท่ากับก่อนแก้ทุกกรณี (`payment.marked_succeeded`, `payment.not_found`, `payment.succeeded_after_order_cancelled`, `payment.succeeded_after_order_paid`, `payment.marked_failed`, `payment.marked_canceled`, `unhandled_event:*`)
3. refund event ไม่มี kind + ทุก `OwnsPaymentIntentAsync = false` ⇒ `unhandled_event:refund.updated` เหมือนเดิม

---

## 4. `Siri.Integrations.Payment` — การแก้ทั้งหมด (P13-06 เป็นเจ้าของไฟล์นี้ทั้ง task; P13-08 ใช้ผลลัพธ์)

> หลักการ: **ทุก field/พารามิเตอร์ใหม่เป็น optional ตัวท้าย + default = พฤติกรรมเดิมทุกบิต**. Commerce ที่เรียกแบบเดิม (ไม่ส่ง field ใหม่) ต้องได้ request ไป Stripe เหมือนเดิมทุก byte (รวม metadata `orderId`/`orderNo` และ idempotency key สุ่ม).

```csharp
// IPaymentMethod.cs
public sealed record CreatePaymentIntentRequest(
    Guid OrderId, string OrderNo, decimal Amount,
    string Currency = "thb", string? Description = null, string? CustomerEmail = null,
    PaymentMethodType Method = PaymentMethodType.PromptPay,
    // ---- P13-06 (optional, ท้ายสุด) ----
    string? Kind = null,                                  // null ⇒ legacy (ไม่แตะ metadata/idempotency เดิม)
    string? ReferenceId = null,                           // default = OrderId.ToString("D")
    string? IdempotencyKey = null,                        // null ⇒ Guid.NewGuid() เหมือนเดิม; ≤255 ตัวอักษร
    IReadOnlyDictionary<string, string>? ExtraMetadata = null);

public sealed record CreateRefundRequest(
    string ProviderPaymentIntentId, decimal Amount, string? Reason = null,
    string? IdempotencyKey = null,                        // null ⇒ ไม่ส่ง (พฤติกรรมเดิมของ Commerce)
    IReadOnlyDictionary<string, string>? Metadata = null);

public interface IPaymentMethod
{
    /* …สมาชิกเดิม… */
    /// <summary>default = NotSupported (Failure "payment.not_supported") เพื่อให้ fake ในเทสต์เดิมคอมไพล์ผ่านไม่ต้องแก้.</summary>
    Task<Result<PaymentRefundResult>> GetRefundAsync(string providerRefundId, CancellationToken cancellationToken) => …;
}
// PaymentProviderErrors.cs เพิ่ม
public const string RetryableReason = "payment.retryable";
public const string PermanentReason = "payment.permanent";
```

**`StripePaymentMethod.CreatePaymentIntentAsync`:** เมื่อ `request.Kind is null` ⇒ โค้ดเดิม **ทุกบรรทัด** (ทั้งสอง branch Card/PromptPay). เมื่อ `Kind` ไม่ null: `Metadata = { kind, referenceId = ReferenceId ?? OrderId.ToString("D"), referenceNo = OrderNo } ∪ ExtraMetadata` (ไม่เขียน `orderId`/`orderNo`); `ExtraMetadata` ห้ามชนคีย์ที่จองไว้ (`kind/referenceId/referenceNo`) → `ArgumentException`; จำกัด ≤10 คีย์, key ≤40, value ≤500 (ขอบ Stripe: 50 คีย์ — เราเข้มกว่า). `RequestOptions.IdempotencyKey = request.IdempotencyKey ?? Guid.NewGuid().ToString("N")` (สร้างครั้งเดียวต่อการเรียก ใช้ซ้ำใน `ExecuteWithRetryAsync` เหมือนเดิม). Description ที่ Tutoring ส่ง = `"SIRI UpSkill tutoring {OrderNo}"` (ไม่มี PII).

**`CreateRefundAsync`:** ส่ง `RefundCreateOptions.Metadata = request.Metadata?.ToDictionary(...)` และ `RequestOptions { IdempotencyKey = request.IdempotencyKey }` เมื่อไม่ null (เรียก `service.CreateAsync(options, requestOptions, cancellationToken)`). **จัดประเภท error** (เฉพาะเส้นทางนี้): `StripeException ex` ⇒ `new DomainError("payment.provider_error", …).WithReason(retryable ? RetryableReason : PermanentReason)` โดย `retryable = IsTransient(ex) || ex.StripeError?.Type == "api_error"`; `ex.StripeError?.Type is "invalid_request_error" or "idempotency_error" or "card_error"` ⇒ `PermanentReason`; exception อื่น (ที่ไม่ใช่ cancel) ⇒ `RetryableReason`. (ผู้เรียกเดิมไม่อ่าน `Reason` ⇒ ไม่กระทบ.)

**`GetRefundAsync`:** `new RefundService(client).GetAsync(id, cancellationToken: ct)` ⇒ map เป็น `PaymentRefundResult(refund.Id, refund.Status, refund.Amount/100m, refund.Currency)`; 404 ⇒ `DomainError.NotFound`; อื่น ๆ ⇒ `provider_error` + reason จัดประเภทเหมือนข้างบน; ไม่มี secret key ⇒ `ProviderNotConfigured`.

**ข้อควรระวังที่ผู้ลงมือต้องรู้:** Stripe เก็บ idempotency key ไว้ **24 ชั่วโมง** เท่านั้น — นโยบาย retry ของ refund (P13-08) จึงจำกัดหน้าต่างอัตโนมัติ < 24 ชม. · ไม่ใช้ `expires_after_seconds` ของ PromptPay (ไม่ได้ยืนยันกับ Stripe.net 52.3.0) — ใช้การ cancel PI ตอน hold หมดแทน

---

## 5. API (controller `Siri.Api/Controllers/Tutoring/TutoringPaymentsController.cs`, base `api/tutoring`)

กฎร่วม: ทุก action ใส่ `[Authorize]` ชัดเจน · `userId` จาก `IUserContext` เท่านั้น (ไม่มี `userId` ใน body/query) · ownership อยู่ใน **query เดียวกับการดึงข้อมูล** (`WHERE BOOKING_ID=@id AND LEARNER_USER_ID=@caller`) · ไม่พบ/ไม่ใช่เจ้าของ ⇒ **404 ตัวเดียวกัน** · response ที่มี `clientSecret` ⇒ `Cache-Control: no-store` · error = RFC 9457 + `reason` sub-code (`DomainError.WithReason`) · ข้อความ error ห้ามมีข้อความดิบของ Stripe (ใช้ข้อความกลาง + log รายละเอียด)

**Rate limit (partitioned ต่อผู้ใช้ — ห้ามใช้ `default`):** `POST …/payment` = `tutoring-booking` (10 req/60 วิ/ผู้ใช้ — P13-01 §7) · `GET payments/config` = `tutoring-user` (60/นาที) · **`GET payments/{id}` = `tutoring-payment-poll` (ใหม่ — P13-06 ลงทะเบียนใน `RateLimiterConfiguration`; ต่อผู้ใช้ 40 req/60 วิ)** แยกจาก `tutoring-user` เพราะ FE poll สถานะทุก 3 วิ ≈ 20/นาที จะกินโควตา 60/นาทีที่ใช้ร่วมกับ endpoint อื่นของผู้ใช้เดียวกัน (my-bookings, profiles, packages)

### 5.1 `GET /api/tutoring/payments/config` — `[Authorize]` · `tutoring-user`
Response 200 `TutoringPaymentConfigResponse(string PublishableKey, IReadOnlyList<TutoringPaymentMethod> EnabledMethods)` · ไม่มี publishable key จริง ⇒ **503** `payment.provider_not_configured` (ไม่ส่ง key ปลอม — เหมือน `PaymentService.GetConfig`) · `enabledMethods` มาจาก `Tutoring:Payment:EnabledMethods` (default `["PromptPay"]`)

### 5.2 `POST /api/tutoring/bookings/{bookingId:guid}/payment` — `[Authorize]` · `tutoring-booking`
Request `CreateTutoringPaymentRequest(TutoringPaymentMethod Method)` (validator: `IsInEnum`) · **ราคาไม่รับจาก client** · Response **201** (สร้างความพยายามใหม่) หรือ **200** (คืนความพยายามเดิมที่ยัง Pending วิธีเดียวกัน) `TutoringPaymentResponse` · `Cache-Control: no-store`

| status | `reason` | เมื่อ |
|---|---|---|
| 404 | `tutoring.booking_not_found` | ไม่พบ หรือ `LEARNER_USER_ID ≠ caller` |
| 409 | `tutoring.booking_already_paid` | booking Confirmed ขึ้นไป (ext `bookingStatus` — ห้ามใช้ `status` เป็นชื่อ ext: ชื่อสงวน ถูกทิ้งเงียบ, README §6) |
| 409 | `tutoring.booking_not_payable` | Expired/Cancelled*/อื่น (ext `bookingStatus`) |
| 409 | `tutoring.hold_expired` | `now ≥ HOLD_EXPIRES_AT_UTC` หรือ guarded update (§6.1 ขั้น 8) แพ้ race กับ job หมดเวลา |
| 409 | `tutoring.booking_is_free` | `PRICE_AMOUNT = 0` (booking ฟรีถูก confirm โดย P13-05 แล้ว ไม่ต้องจ่าย) |
| 400 | `tutoring.payment_method_disabled` | method ไม่อยู่ใน `EnabledMethods` (ไม่เรียก Stripe) |
| 409 | `tutoring.too_many_payment_attempts` | ความพยายาม ≥ `MaxAttemptsPerBooking` |
| 409 | `tutoring.payment_in_progress` | จะสลับวิธีจ่ายแต่ cancel PI เดิมไม่ได้เพราะ Stripe บอกว่าสำเร็จ/กำลังประมวลผล (FE รอ webhook แล้ว poll) |
| 400 | `validation` | ผู้ใช้ไม่มีอีเมลในระบบ (`IUserContactReader.GetEmailAsync`) |
| 503 | `tutoring.payment_provider_unavailable` (+`Retry-After: 5`) | Stripe ล้ม/ timeout ตอนสร้างหรือ cancel PI |
| 503 | `payment.provider_not_configured` | ไม่มี secret key |
| 429 | — | rate limit |

### 5.3 `GET /api/tutoring/payments/{paymentId:guid}` — `[Authorize]` · `tutoring-payment-poll` · `no-store`
`WHERE PAYMENT_ID=@id AND OWNER_USER_ID=@caller` ⇒ 404 ตัวเดียวกัน (`tutoring.payment_not_found`) · Response `TutoringPaymentStatusResponse` (อ่านจาก DB ที่ webhook อัปเดตเท่านั้น — **ไม่เชื่อ redirect/`redirect_status` ของ FE**)

(payment ของแพ็กเกจ: `POST /api/tutoring/package-purchases/{purchaseId:guid}/payment` ใน P13-12 เรียก `TutoringPaymentService.CreateForPackageAsync` ตัวเดียวกัน — response/ error ชุดเดียวกัน)

---

## 6. Orchestration

### 6.0 กฎ lock + transaction (ใช้ทั้ง P13-06/07/08/12 — **ห้ามเปลี่ยนลำดับ**)
- **ลำดับ lock canonical (มติกลาง D-B):** `TUTOR_SESSIONS → TUTOR_BOOKINGS (เรียง BOOKING_ID) → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS (SEQ_NO) → PAYMENTS → REFUNDS → (Payout: REVENUE_SPLITS ภายใน contract) → TUTOR_PROFILES` ทุกที่ที่ต้อง lock มากกว่าหนึ่ง (กัน deadlock ระหว่าง webhook, cancel, no-show job, refund job, expiry job) · เส้นที่ไม่เกี่ยวแพ็กเกจข้าม purchase/credits · **ทุก flow (webhook, `ExecuteAsync`, `ApplyProviderRefundAsync`, retry/void, reconcile, expiry) ต้องล็อก `PAYMENT` ก่อน `REFUND` เสมอ — ห้ามล็อก refund แล้วค่อยขึ้นไปล็อก payment** · webhook ของ `KIND=Package` อ่าน payment ไม่ lock เพื่อหา `REF_ID` ก่อนแล้วล็อก purchase → payment · **ห้ามเรียก HTTP ภายนอก (Stripe `GetChargeFee`/`CreateRefund`/`GetPaymentIntent`/`GetRefund`/`CancelPaymentIntent`) ขณะถือ txn หรือ lock ใด ๆ:** ดึงข้อมูลภายนอก **ก่อน** เปิด txn/ล็อก (อ่านแถวแบบไม่ล็อกเพื่อรู้ PI id) แล้วค่อยล็อกและใช้ผล หรือเขียน estimate แล้วให้ job แก้ภายหลัง
- lock แถวด้วย `FromSqlInterpolated($@"SELECT * FROM ""TUTORING"".""TUTOR_BOOKINGS"" WHERE ""BOOKING_ID"" = {id} FOR UPDATE")` (precedent: `PromoCodeRepository.cs:40`) แล้ว materialize เป็น tracked entity; ต้องรู้ id ก่อน lock ⇒ อ่านแถว **ไม่ lock** เพื่อหา `SESSION_ID`/`REF_ID` ก่อน (query นี้เป็นตัวเช็คสิทธิ์ ownership), แล้ว lock ตามลำดับ และ **อ่านสถานะซ้ำหลัง lock** (ตัดสินจากค่าที่ lock แล้วเท่านั้น)
- `ROW_VERSION` เป็นด่านสอง: `DbUpdateConcurrencyException` ⇒ retry ทั้งหน่วยงาน 1 ครั้ง (ผู้เรียกใหม่ใน scope เดิม + `ChangeTracker.Clear()`) ⇒ ยังชน ⇒ 409 `tutoring.concurrent_update`
- **`ITutoringUnitOfWork` ประกาศโดย P13-05 §5.0(ก) (ไม่ประกาศซ้ำที่นี่)**: `ExecuteInTransactionAsync<T>/(Func<Task>)` (join ถ้ามี `CurrentTransaction`; `Result.Failure` ⇒ rollback เฉพาะเมื่อเป็นเจ้าของ) · `TryInSavepointAsync<T>(Func<Task<T>>) → SavepointOutcome<T>` / `TryRunInSavepointAsync(Func<Task>) → bool` (exception ⇒ rollback ถึง savepoint + คืน ChangeTracker; **ไม่นับ `Result.Failure` เป็นความล้มเหลว** — ถ้า operation คืน `Result` และต้องการให้ Failure rollback ให้ throw ภายใน delegate เอง เช่น `if (r.IsFailure) throw new RoomSyncFailedException(r.Error)`) · repository มี `LockSessionAsync/LockBookingAsync` (P13-05 §5.0 ข) — P13-06 เพิ่ม `LockPaymentAsync(paymentId)` แบบเดียวกัน (tracked, คืนค่าสดหลังล็อก)
- งานที่รันเป็น loop (job): **หนึ่ง DI scope + หนึ่ง transaction ต่อรายการ**, exception ของรายการหนึ่งไม่หยุดรายการอื่น, `ChangeTracker.Clear()` หลัง rollback

### 6.1 สร้างการจ่ายเงิน (`TutoringPaymentService.CreateForBookingAsync(callerUserId, bookingId, method)`)
1. `booking = SELECT … WHERE BOOKING_ID=@id AND LEARNER_USER_ID=@caller` (ไม่ lock) ⇒ ไม่พบ ⇒ 404
2. ตรวจสถานะ/hold/ราคา/method ตาม §5.2 (fail-fast ก่อนเรียกเครือข่าย) · ราคา = `booking.PRICE_AMOUNT` (ที่ P13-05 คำนวณฝั่ง server) — **ไม่เรียก `IPaymentAmountOverrideRepository` และไม่มี reference ถึง Commerce** ⇒ admin amount-override ไม่มีผลกับ Tutoring (§6.9)
3. `email = IUserContactReader.GetEmailAsync(caller)` ว่าง ⇒ 400
4. โหลดความพยายามเดิมของ (`Booking`,`bookingId`) เรียง `ATTEMPT_NO` desc:
   - ล่าสุด `Succeeded` ⇒ 409 already_paid
   - ล่าสุด `Pending` + วิธีเดียวกัน ⇒ `GetPaymentIntentAsync(pi)` (read-only) ⇒ `succeeded` ⇒ 409 `payment_in_progress`; `canceled` ⇒ ทำเป็น `Expired` แล้วสร้างใหม่; ยังใช้ได้ ⇒ **200** คืน `clientSecret`/QR ใหม่ล่าสุดจาก Stripe
   - ล่าสุด `Pending` + วิธีต่าง ⇒ `CancelPaymentIntentAsync(old)` (**ต้องสำเร็จก่อน** สร้างใหม่ — ไม่ให้มี PI ที่จ่ายได้สองใบ); Failure ⇒ 503 (ไม่สร้างใหม่); สำเร็จ ⇒ mark old `Expired` (ใน txn สั้น)
   - `count(attempts) ≥ MaxAttemptsPerBooking` ⇒ 409
5. `attemptNo = max(ATTEMPT_NO)+1` · `idempotencyKey = $"tutoring:pay:booking:{bookingId:N}:{attemptNo}"` · `CreatePaymentIntentAsync(new CreatePaymentIntentRequest(OrderId: bookingId, OrderNo: booking.BOOKING_NO, Amount: price, Currency: "thb", Description: $"SIRI UpSkill tutoring {bookingNo}", CustomerEmail: email, Method: map(method), Kind: "tutoring_booking", ReferenceId: bookingId.ToString("D"), IdempotencyKey: key, ExtraMetadata: { payKind: "Booking" }))` — **นอก DB transaction** (ไม่ถือ lock ระหว่างรอเครือข่าย) · Failure ⇒ 503 (`ProviderNotConfigured` ⇒ 503 `payment.provider_not_configured`); ไม่มีแถวถูกเขียน
6. INSERT `PAYMENT` (`Pending`, `AMOUNT = price`, `OWNER_USER_ID = caller`, `ATTEMPT_NO`) ⇒ ชน UQ (`UX_PAYMENTS_PROVIDER_INTENT` หรือ `UX_PAYMENTS_REF_ATTEMPT` — คำขอซ้ำ/พร้อมกันได้ PI เดิมเพราะ key เดียวกัน) ⇒ จับ `DbUpdateException` (unique violation `23505`) ⇒ โหลดแถวเดิมแล้วคืน 200 (idempotent) · ไม่ใช่ unique ⇒ throw
7. (ใน `SaveChanges` เดียวกับขั้น 6) `booking.AttachPayment(paymentId)` (domain method ของ P13-05 §3.2: เฉพาะ `PendingPayment`; booking ที่อ่านในขั้น 1 เป็น tracked entity) — ถ้า job หมด hold/ผู้ใช้ยกเลิก **เปลี่ยน booking ไปแล้ว** ⇒ `ROW_VERSION` ชน ⇒ `DbUpdateConcurrencyException` (หรือ `InvalidOperationException` จาก guard ของ domain) ⇒ `ChangeTracker.Clear()`, mark payment `Expired` (txn สั้น), `CancelPaymentIntentAsync` best-effort, ตอบ 409 `tutoring.hold_expired` (ไม่ใช้ raw UPDATE — raw SQL ข้าม interceptor ต้องหมุน token เอง ตาม P13-05 F5)
8. ตอบ 201 `TutoringPaymentResponse` (`holdExpiresAtUtc = booking.HOLD_EXPIRES_AT_UTC`) · audit `tutoring.payment.created` (detail: paymentId, bookingId, method, attemptNo, amount — **ไม่มี** clientSecret/PI id/อีเมล)

PI orphan (crash หลังขั้น 5 ก่อนขั้น 6): คำขอซ้ำได้ PI เดิม (คีย์เดียวกัน) · ถ้าผู้ใช้จ่ายก่อนแถวถูกสร้าง ⇒ §6.5

**ผู้ implement ต้องเขียนขั้น 4–6 เป็น `private CreatePaymentCoreAsync(PaymentSubject subject, TutoringPaymentMethod method, CancellationToken ct)`** (`PaymentSubject(Kind, RefId, OwnerUserId, Amount, ReferenceNo, Description, string? PayKind)`) ที่ `CreateForBookingAsync` เรียก (Kind=Booking) และ **`CreateForPackageAsync(callerUserId, purchaseId, method)` (P13-12 §5.1) เรียกซ้ำ** (Kind=Package, key `tutoring:pay:package:{purchaseId:N}:{attemptNo}`, ไม่มีขั้น 7 `AttachPayment`) — ห้ามสำเนา logic ปรับ PI/idempotency ซ้ำสองที่

### 6.2 `payment_intent.succeeded` (`kind=tutoring_booking`) — ทั้งหมดใน txn ของ webhook (host เป็นเจ้าของ)
`TutoringPaymentEventListener.HandleAsync` ⇒ ถ้า `Type=PaymentSucceeded` ⇒ `BookingSettlementService.ConfirmPaidAsync(ConfirmPaidCommand)`:

```csharp
public sealed record ConfirmPaidCommand(string ProviderPaymentIntentId, string ProviderEventId, DateTime PaidAtUtc, decimal AmountReceived, string Currency, string? ReferenceId, string? PayKind, DateTime? PaymentIntentCreatedAtUtc);
public sealed record PaymentFulfillmentOutcome(string Code, Guid? RefundId);   // Code → ProcessResult "tutoring.payment.{Code}"
```

0. อ่าน `payment` **ไม่ lock** ด้วย `PROVIDER_PAYMENT_INTENT_ID` (ไม่พบ ⇒ §6.5 orphan). `KIND=Package` ⇒ ส่งต่อ `PackagePurchaseService.ConfirmPaidAsync(command, ct)` (P13-12 §5.3 — ล็อก purchase → payment, ตรวจยอด, fee, activate/refund เอง; คืน `PaymentFulfillmentOutcome` ชนิดเดียวกัน) แล้วจบ (ไม่ lock session/booking)
1. lock ตามลำดับ §6.0: session → booking → payment; **อ่านสถานะซ้ำ** · `payment.STATUS ∈ {Succeeded, PartiallyRefunded, Refunded}` ⇒ `Code="already_succeeded"` (no-op)
2. ตรวจยอด: `AmountReceived == payment.AMOUNT` และ `Currency == "thb"` มิฉะนั้น ⇒ `payment.MarkSucceeded` (เงินเข้าจริง; `fee=null`, `isEstimate=true`) + `LATE_RESOLUTION=Refunded` + `RequestAsync` ตามสเปค **"refund จากเส้น webhook"** (ท้าย §6.3; Reason=`AmountMismatch`; `Result.IsFailure` ⇒ throw) + audit `tutoring.payment.amount_mismatch` ⇒ `Code="amount_mismatch_refunded"` (ไม่ confirm booking)
3. **ค่าธรรมเนียม (D-B: ไม่เรียก HTTP ภายนอกใน txn ของ webhook):** **ไม่เรียก** `GetChargeFeeAsync` ที่นี่ — ตั้ง `fee = null` ⇒ Payout ประมาณด้วย `Payout:EstimatedPaymentFeePercent` แล้ว job `tutoring-payment-reconcile` ข้อ 3 (§6.7) ดึงค่าจริงนอก txn และปรับผ่าน `ReviseFee` (§6.8)
4. `payment.MarkSucceeded(paidAt, fee: null, isEstimate: true)` — Payout คืนค่าประมาณใน snapshot (ขั้น 6b) เพื่อเก็บ `STRIPE_FEE_AMOUNT` ให้ตรงกับที่ ledger ใช้ (ยังเป็น estimate จน job แก้)
5. แตกตามสถานะ booking ที่ **lock แล้ว** — ตาราง race §6.3 (R1..R5)
6. (R1/R2 → confirm) ใน txn เดียว ตามลำดับนี้:
   a. (R2 เท่านั้น: `IBookingReopenService.TryReopenAsync` ทำให้ booking เป็น `PendingPayment` + session กลับ `Held` แล้ว) `booking.Confirm(clock, paymentId)` (P13-05 §3.2: `PendingPayment→Confirmed`, `PAYMENT_ID`, `ESCROW_STATE=Held`, ล้าง `HOLD_EXPIRES_AT_UTC`, `CONFIRMED_AT_UTC ??= now`) · session `Held→Scheduled` ผ่าน SQL (ค) ของ P13-05 §5.3 (`ExecuteScheduleAsync` — idempotent; กลุ่มที่ Scheduled อยู่แล้วไม่ถูกแตะ)
   b. `ITutoringEscrowContract.RecordTutoringSplitAsync(new RecordTutoringSplitRequest(SourceRefId: bookingId, InstructorProfileId: tutor.INSTRUCTOR_PROFILE_ID, GrossAmount: payment.AMOUNT, PaymentFeeAmount: fee, TutorSharePercent: 100 − (tutor.COMMISSION_PERCENT_OVERRIDE ?? options.DefaultCommissionPercent), PaymentSucceededAtUtc: paidAt))` ⇒ เก็บ `snapshot.PaymentFeeAmount` ลง `payment.STRIPE_FEE_AMOUNT` (+`IS_ESTIMATE`) · ล้ม ⇒ **throw** (F3)
   c. `ISessionRoomSync.ConvergeAsync(sessionId)` **ครอบ `uow.TryRunInSavepointAsync`** (P13-05 §5.0 ค / P13-09 §9 / P13-10 §7.1b): ล้ม (exception ใด ๆ — implementation ของ P13-10 ต้อง throw เมื่อ Live คืน Failure) ⇒ rollback ถึง savepoint + log Error + metric, **booking ยัง Confirmed** (self-heal ใน P13-10 ขั้น 0 — "ห้ามกลืนเงินเงียบ" มี booking Confirmed เสมอ)
   d. `BookingConfirmedNotifier.Stage(new BookingConfirmedNotification(…))` (P13-05 §5.6 — ตัวเดียวกับที่ trial ฟรีใช้ ไม่สร้างเทมเพลตซ้ำ; stage ผ่าน `IEmailOutbox.Enqueue`/`IUserNotificationOutbox.Stage` ไม่ `SaveChanges`): ผู้เรียน (`tutoring-booking-confirmed`) และติวเตอร์ (`tutoring-booking-new`) — เวลา Asia/Bangkok · ติวเตอร์เห็น **ชื่อเล่น + ระดับชั้น** เท่านั้น · **ไม่มี URL ห้องจริง** (ลิงก์ join ของแพลตฟอร์มได้) · ICS มาจาก Live ตาม P13-09 · (อีเมล R3/R5 `tutoring-payment-refunded-late` เป็นของ P13-06 เอง)
   e. audit `tutoring.payment.succeeded` (ขั้นสุดท้ายก่อน commit — flush ปลอดภัย F7)
7. `PaymentFulfillmentOutcome("confirmed" | "reopened_confirmed" | …, refundId?)` ⇒ listener คืน `PaymentEventHandling($"tutoring.payment.{code}")`

### 6.3 ตาราง "จ่ายสำเร็จมาถึงตอนไหน" (race ที่ต้องมีเทสต์ทุกแถว)

| # | `booking.STATUS` ตอน lock | เงื่อนไขเพิ่ม | การกระทำ | `LATE_RESOLUTION` | audit |
|---|---|---|---|---|---|
| R1 | `PendingPayment` | (แม้ `HOLD_EXPIRES_AT_UTC` ผ่านไปแล้วไม่กี่วินาที — job ยังไม่ทำงาน; session ยัง `Held` ของ booking นี้) | **Confirm** ตามปกติ (ตัดสินด้วย *สถานะ* ไม่ใช่นาฬิกา) | — | `tutoring.payment.succeeded` |
| R2 | `Expired` | `IBookingReopenService.TryReopenAsync` = `Reopened` | **Reopen + confirm**: `TryReopenAsync` (session `Cancelled→Held` หรือจองที่นั่งกลุ่มคืนแบบ atomic; booking `Expired→PendingPayment` hold ชั่วคราว) แล้ว §6.2 ข้อ 6a `Confirm` ใน txn เดียวกัน (session `Held→Scheduled`) | `Reopened` | `tutoring.payment.reopened_after_expiry` |
| R3 | `Expired` | `TryReopen` ≠ `Reopened` (`SlotTaken`/`SessionTooSoon`/`TutorUnavailable`/`NotReopenable`) | **Refund 100%** เหตุผล `LatePayment` (`RequestAsync` ตามสเปค "refund จากเส้น webhook" ด้านล่าง: `BookingId=null`, key `refund:p{paymentId:N}:LatePayment` — สร้าง `REFUNDS` แถว `Requested` ใน txn เดียวกัน, `Result.IsFailure` ⇒ throw; ส่ง Stripe หลัง commit ด้วย job P13-08 §6.5); booking คง `Expired`; ไม่บันทึก split; อีเมล `tutoring-payment-refunded-late` (บอกตรง ๆ: เวลานี้ไม่ว่างแล้ว คืนเงินเต็มจำนวน; PromptPay อาจใช้เวลา/Stripe จะติดต่อขอบัญชี) | `Refunded` | `tutoring.payment.refunded_late` |
| R4 | `Confirmed` ∧ `PAYMENT_ID = payment.PAYMENT_ID` | — | no-op (`already_confirmed`) | — | — |
| R5 | อื่นทั้งหมด (`Confirmed` ด้วย payment อื่น, `CancelledBy*`, `Completed`, `NoShow*`, `Disputed`) | — | **Refund 100%**: เหตุผล `DuplicatePayment` ถ้า booking มี payment อื่นที่ `Succeeded` แล้ว, ไม่งั้น `LatePayment` — คำสั่งเดียวกับ R3 (`BookingId=null`, key `refund:p{paymentId:N}:{Reason}`) | `Duplicate` / `Refunded` | `tutoring.payment.refunded_duplicate` / `…refunded_late` |

`IBookingReopenService.TryReopenAsync(Guid bookingId, DateTime nowUtc, TimeSpan minLead, CancellationToken)` → `ReopenResult { Reopened, SlotTaken, SessionTooSoon, TutorUnavailable, NotReopenable }` — **ประกาศ + implement โดย P13-05 §5.5** (ห่อการ re-claim ด้วย SAVEPOINT; ผลที่ไม่ใช่ `Reopened` ไม่ทิ้งผลข้างเคียง). ตัวนี้ทำ booking `Expired→PendingPayment` (hold ชั่วคราว) — **ผู้เรียก (P13-06) ต้องเรียก `booking.Confirm(clock, paymentId)` ใน txn เดียวกันทันที**.
ค่า `minLead = TimeSpan.FromMinutes(TutoringBookingOptions.ReopenMinLeadMinutes)` (`Tutoring:Booking:ReopenMinLeadMinutes`, default 60 — ของ P13-05; P13-06 ไม่มี knob ซ้ำ). เงินจาก R3/R5 **ต้องไม่ถูกกลืน** — `REFUNDS` แถวเกิดใน txn เดียวกับการ mark payment Succeeded; ถ้า Stripe ส่ง refund ไม่ได้ ⇒ job retry + ธง manual review (P13-08)

**สเปค "refund จากเส้น webhook/reconcile" (R3, R5, `amount_mismatch`, orphan — คำสั่งเดียวกันทุกจุด; ตรงกับ P13-08 §6.1):**
`TutoringRefundService.RequestAsync(new RequestRefundCommand(PaymentId: payment.PAYMENT_ID, BookingId: null, PackagePurchaseId: <purchaseId ถ้า KIND=Package ไม่งั้น null>, Amount: <ด้านล่าง>, Reason: LatePayment | DuplicatePayment | AmountMismatch, IdempotencySuffix: null, RequestedByUserId: null, DecidedByUserId: null, Note: null))`
- key = `refund:p{paymentId:N}:{Reason}` (ผูกกับ payment ⇒ event ซ้ำ/reconcile ซ้ำได้ `AlreadyExisted=true` ใบเดิม; ไม่ต้องมี suffix เพราะ `paymentId` อยู่ในคีย์แล้ว)
- **`BookingId=null` โดยตั้งใจ:** เงินนี้ไม่เคยถูกบันทึกเป็นรายได้ของ booking ⇒ **ข้าม** cap `booking.REFUNDED_AMOUNT`, ไม่เรียก `SetRefundedAmount`, ไม่เรียก `ReverseBySource` (ไม่มี split ของ payment นี้) — เหลือเฉพาะ cap ระดับ payment (`AMOUNT − REFUND_RESERVED_AMOUNT`)
- `Amount` = `payment.AMOUNT` (R3/R5/orphan) · `amount_mismatch` = `min(AmountReceived, payment.AMOUNT)` (ถ้า `AmountReceived > AMOUNT` — เกิดไม่ได้จาก PI ที่ server ตั้งยอด — ให้ log Error และใส่ทั้งสองยอดใน audit เพื่อให้ ops เก็บกวาดใน Stripe Dashboard)
- **`Result.IsFailure` จาก `RequestAsync` ภายใน webhook txn ⇒ `throw` (rollback → Stripe retry)** ห้ามคืนเป็น `Code` ปกติ (ไม่งั้นเงินเข้าแล้วไม่มี `REFUNDS`) — host txn ที่ join อยู่จะไม่ rollback ให้เองเมื่อได้ `Result.Failure` (F3)
- ส่ง Stripe หลัง commit โดย job `tutoring-refund-process` (P13-08 §6.5) — ไม่เรียก Stripe ใน webhook

### 6.4 `payment_intent.payment_failed` / `payment_intent.canceled`
- **failed:** `Pending → Failed` (+`FAILURE_REASON` ตัด 300, `FAILED_AT_UTC`); `Failed`/`Expired`/`Succeeded*` ⇒ no-op (`ignored_after_success` เมื่อ Succeeded — event มาสลับลำดับ). **booking ไม่ถูก expire** (ค่า `ExpireBookingOnPaymentFailed=false`): บัตรถูกปฏิเสธครั้งแรกยังลองบัตรอื่นบน PI เดิมได้ และ hold 15 นาทีจะหมดเอง — *ต่างจากถ้อยคำใน `TASKS.md` P13-06 ("failed → Expired")* ⇒ ดู Open decision #3; เปิด flag เป็น `true` ⇒ ทำตามลำดับบังคับด้านล่าง (ExpireAsync ก่อน แล้วค่อยล็อก payment) + cancel PI หลัง commit
- **canceled:** `Pending|Failed → Expired`; ถ้า booking ยัง `PendingPayment` **และ** `booking.PAYMENT_ID = payment.PAYMENT_ID` (ความพยายามล่าสุด) ⇒ `IBookingExpiryService.ExpireAsync(bookingId)` (คืนช่วงเวลา/ที่นั่ง); ความพยายามเก่า (สลับวิธีจ่าย) ⇒ ไม่แตะ booking · `Succeeded*` ⇒ no-op
- **ลำดับบังคับของ failed(flag)/canceled (D-B — ห้ามล็อก payment ก่อน session/booking):** (1) อ่าน `payment` + `booking` **แบบไม่ล็อก** เพื่อตัดสินว่าต้อง expire booking หรือไม่ (2) ถ้าต้อง: `IBookingExpiryService.ExpireAsync(bookingId)` — ภายในล็อก session → booking และอ่านสถานะซ้ำ (idempotent; สถานะอื่น ⇒ `false`) (3) **แล้วจึง** `LockPaymentAsync` และ mark `Expired`/`Failed` โดยอ่านสถานะซ้ำ (ถ้า payment กลายเป็น `Succeeded*` แล้ว ⇒ no-op — PI ที่ `canceled` สำเร็จต่อไม่ได้ จึงไม่มี race ที่ทำให้ booking ถูก expire ทั้งที่จ่ายสำเร็จ; กรณี `failed` + flag `true` ที่ภายหลังจ่ายสำเร็จบน PI เดิม ⇒ ตกตาราง R2 reopen ตามปกติ)

`IBookingExpiryService.ExpireAsync(Guid bookingId, CancellationToken) → Task<bool>` (**P13-05 §5.4**; idempotent; ทำงานใน txn ผู้เรียก; `PendingPayment→Expired` + session 1:1 `Cancel` / กลุ่ม `ReleaseSeat`; สถานะอื่น ⇒ `false`) — P13-06 เรียกจาก `payment_intent.canceled` และ flag `ExpireBookingOnPaymentFailed`; job หมด hold เป็นของ P13-05.

### 6.5 Orphan adoption (`payment_intent.succeeded` ที่ไม่มีแถว `PAYMENTS`)
เกิดเมื่อ crash ระหว่าง §6.1 ขั้น 5–6 แล้วผู้ใช้จ่ายสำเร็จ หรือ webhook ชนก่อน commit แถว:
1. `PaymentIntentCreatedAtUtc` ใหม่กว่า `now − OrphanGraceMinutes` (default 10) ⇒ **throw** (ให้ Stripe retry — น่าจะแค่ race กับ commit)
2. เก่ากว่า: `ReferenceId` parse เป็น Guid + `PayKind=Booking` + พบ booking ที่ `PRICE_AMOUNT == AmountReceived` ⇒ INSERT `PAYMENT` (`Succeeded` ทันที, `ATTEMPT_NO = max+1`, `LATE_RESOLUTION=Orphan`) แล้วเดินตาม §6.2 ขั้น 1+ ต่อ (ใช้ตาราง race ตามปกติ)
3. ไม่พบ booking / ยอดไม่ตรง / `PayKind` อื่น ⇒ INSERT `PAYMENT` (`REF_ID = ReferenceId ?? Guid.Empty`, `Succeeded`, `LATE_RESOLUTION=Orphan`) แล้ว `RequestAsync` ตามสเปค "refund จากเส้น webhook" (§6.3: Reason=`AmountMismatch`, Amount=`payment.AMOUNT`, `BookingId=null`, `Result.IsFailure` ⇒ throw) + audit `tutoring.payment.orphan_unmatched` (ไม่มี PII) ⇒ `Code="orphan_refunded"`
`failed`/`canceled` ที่ไม่มีแถว ⇒ `Code="payment_not_found"` (ไม่ throw)

### 6.6 Refund events (`RefundChanged`)
listener เรียก `TutoringRefundService.ApplyProviderRefundAsync(PaymentProviderEvent)` (**implement ใน P13-08 §4.5**) ซึ่งหาแถว `REFUNDS` ด้วย `ClientRefundId` → `PROVIDER_REFUND_ID` → (refund จาก Stripe Dashboard ที่ไม่มี metadata) สร้างแถว `AdminManual` โดยอัตโนมัติ · ทุกอย่างใน txn ของ webhook และ DB-only · **งานที่ต้องทำใน Stripe Dashboard (OWN):** เพิ่ม `refund.created`, `refund.updated`, `refund.failed` ในรายการ event ของ webhook endpoint — ไม่งั้น Stripe ไม่ส่ง; มี fallback poll (`tutoring-refund-reconcile`, P13-08) จึง *ไม่ใช่* ตัวบล็อก แต่ช้ากว่า

### 6.7 Job `tutoring-payment-reconcile` (ทุก 5 นาที; `RecurringJobIds.TutoringPaymentReconcile`)
`[DisableConcurrentExecution(55)]` · batch `ReconcileBatchSize` (50) · **ลำดับต่อรายการ (D-B — ไม่ถือ lock ข้ามการเรียก Stripe):** (ก) เลือก id ด้วย `SELECT "PAYMENT_ID" … ORDER BY "CREATED_AT_UTC" LIMIT @n FOR UPDATE SKIP LOCKED` ใน txn สั้นที่ **commit ก่อนทำอะไรต่อ** (SKIP LOCKED ใช้เฉพาะตอนเลือก id — แบบเดียวกับ P13-08 §6.5) (ข) เรียก Stripe แบบอ่านอย่างเดียว **นอก txn / ไม่ถือ lock** (`GetPaymentIntentAsync` / `GetChargeFeeAsync`) (ค) เปิด txn ใหม่ ล็อกตาม §6.0 (session → booking → [purchase] → payment) แล้ว **อ่านสถานะซ้ำ** และตัดสินจากค่าที่ล็อกแล้วร่วมกับผลของ (ข) — idempotent ด้วยสถานะ payment (สองรอบ/สอง instance ชนกัน ⇒ ตัวที่สองเห็นสถานะใหม่แล้ว no-op) จึงไม่ต้องมี lease ข้าม HTTP · แต่ละรายการ scope+txn ของตัวเอง:
1. `Pending` อายุ ∈ [`ReconcileMinAgeMinutes`(20), `ReconcileMaxAgeHours`(48)]: (ข) `GetPaymentIntentAsync` ⇒ (ค) `succeeded` ⇒ เข้าเส้นเดียวกับ §6.2 ด้วย `ProviderEventId="reconcile:{paymentId:N}"` (ไม่เขียน `STRIPE_WEBHOOK_EVENTS`; idempotent ด้วยสถานะ payment) · `canceled` ⇒ §6.4 · ยัง `requires_*` และ booking terminal (Expired/Cancelled*) ⇒ `CancelPaymentIntentAsync` best-effort **หลัง commit / นอก txn**
2. `Pending` ของ booking ที่ Expired/Cancelled* (อายุ ≤ 48 ชม.) ⇒ cancel PI (ปิดช่องที่ cancel หลัง commit ของ job หมด hold ล้มเหลว) · ผู้เรียกปกติ: **P13-06 implement `IBookingHoldExpiredHandler.OnHoldExpiredAsync` (P13-05 §5.4; ลงทะเบียนใน DI) ให้เรียก** `TutoringPaymentService.CancelPendingIntentsAsync(Guid bookingId, CancellationToken)` **หลัง commit ของ job หมด hold** (เป็น overload ของ `CancelPendingIntentsAsync(TutoringPaymentKind kind, Guid refId, CancellationToken)` ที่ P13-12 ใช้กับ `kind=Package` เมื่อยกเลิก/หมดเวลา purchase — ตัวรับ `bookingId` เรียกต่อด้วย `kind=Booking`); `CancelByLearner` ของ P13-08 เรียกตัวเดียวกันหลัง commit (best-effort, idempotent: `Pending→Expired` + `CancelPaymentIntentAsync` ทุกความพยายามที่ยัง Pending; Stripe ปฏิเสธเพราะ PI สำเร็จไปแล้ว ⇒ log + ปล่อยให้ webhook เดิน §6.3)
3. ค่าธรรมเนียมประมาณ (`STRIPE_FEE_IS_ESTIMATE=true`, อายุ ≥ `FeeReconcileMinAgeMinutes` (3) และ ≤ `FeeReconcileMaxAgeDays` (7)): (ข) `GetChargeFeeAsync(pi)` **นอก txn** ⇒ ได้ค่า ⇒ (ค) txn: ล็อก payment ⇒ `ITutoringEscrowContract.ReviseFeeAsync(sourceRef, key: "fee:{sourceRef:N}:{feeSatang}", newFee)` สำหรับ split ของ booking นี้ (chain: payment → splits) ⇒ `IS_ESTIMATE=false`, `STRIPE_FEE_CHECKED_AT_UTC=now` · `payment.KIND=Package` ⇒ **ไม่ทำ (ข)–(ค) ที่นี่** แต่เรียก `PackageFeeReviser.ReviseAsync(paymentId, ct)` ของ P13-12 §6.2 (ดึง fee นอก txn แล้วล็อก purchase → payment เอง และปรับ split ของเครดิตที่ถูกใช้/หมดอายุทีละใบด้วย slice; payment ที่ยังไม่มี split แม้แต่ใบเดียวก็เติม `STRIPE_FEE_AMOUNT` จริงเท่านั้น)

### 6.8 ค่าธรรมเนียม Stripe — เวลา/fallback (ตาม Q4)
**ไม่ดึงค่าธรรมเนียมใน webhook** (มติ D-B: ห้ามเรียก HTTP ภายนอกขณะถือ txn/lock — เดิม precedent P11-09 ดึงใน txn พร้อม timeout 5 วิ; ฉบับนี้ตัดออก) · ตอน `succeeded` เก็บ `fee = null` ⇒ Payout ประมาณด้วย `Payout:EstimatedPaymentFeePercent` ⇒ `STRIPE_FEE_IS_ESTIMATE=true` ⇒ job §6.7 ข้อ 3 ดึงค่าจริงนอก txn เมื่ออายุ ≥ `FeeReconcileMinAgeMinutes` (3 นาที ⇒ แก้ภายใน ~8 นาทีโดยปกติ — ก่อน escrow จะปล่อยเสมอ เพราะปล่อยได้ ≥ จบคลาส + หน้าต่างข้อพิพาท) · แก้ได้เฉพาะแถวที่ยังไม่เข้า batch (P13-07 `ReviseFee`; แถวที่เข้า batch/Paid แล้วเป็นส่วนต่างรอบถัดไป) ⇒ ที่เหลือยอมรับค่าประมาณ + audit · **ต้องตั้ง `Payout:EstimatedPaymentFeePercent` ให้ตรงเรตจริงก่อน launch และ Production guard บังคับ `> 0` (§7)** (default 0.00 ⇒ ติวเตอร์ได้เกินจริงชั่วคราว)

### 6.9 admin amount-override ไม่มีผล (ตั้งใจ + มีเทสต์)
`TutoringPaymentService` ไม่อ้าง `PAYMENT_AMOUNT_OVERRIDE`/`IPaymentAmountOverrideRepository`/`Siri.Modules.Commerce` เลย ⇒ ส่ง Stripe = `booking.PRICE_AMOUNT` เสมอ. ทดสอบบน Stripe test mode ด้วย **trial ฟรี** ตามที่ TUTORING.md กำหนด (ไม่ผ่านการจ่ายจริง) และด้วย fake `IPaymentMethod` ที่จับ `CreatePaymentIntentRequest.Amount`.

---

## 7. Config / Options / DI

`TutoringPaymentOptions` (section `Tutoring:Payment`, `ValidateOnStart`, `IValidateOptions`):

| Key | Default | ช่วง / หมายเหตุ |
|---|---|---|
| `EnabledMethods` | `["PromptPay"]` | ต้องไม่ว่าง; **ต้อง `PostConfigure` อ่าน section ดิบแทนที่ default** (กับดัก `Bind()` ต่อท้าย list — F9) |
| `MaxAttemptsPerBooking` | 5 | 1–20 |
| `ExpireBookingOnPaymentFailed` | false | |
| `OrphanGraceMinutes` | 10 | 1–120 |
| `ReconcileMinAgeMinutes` / `ReconcileMaxAgeHours` / `ReconcileBatchSize` | 20 / 48 / 50 | 5–240 / 1–168 / 1–200 |
| `FeeReconcileMinAgeMinutes` / `FeeReconcileMaxAgeDays` | 3 / 7 | 1–120 / 1–30 |

`Tutoring:DefaultCommissionPercent` (20; `[0,50]` — P13-01 §8 เป็นเจ้าของ) · **P13-06 เพิ่ม `Tutoring:DisputeWindowHours` (flat key ตาม `TUTORING.md` §1) ลง `TutoringOptions` ของ P13-01 + validator: default `24`, ช่วง `0–168`** (ที่ P13-10 §2.1 อ้างว่า "P13-06 §8" — อยู่ที่หัวข้อนี้ §7) · ใช้ร่วมกับ P13-07/08/10/14 · `Tutoring:Profile:MinChargeAmount` (10.00, P13-01 §8) บังคับขั้นต่ำของราคา booking ที่ P13-01/05 — P13-06 ไม่ตรวจซ้ำแต่ถ้า `PRICE_AMOUNT` ต่ำกว่านั้น ๆ ผล Stripe จะ `payment.provider_error` ⇒ 503 `tutoring.payment_provider_unavailable` · Stripe keys ใช้ `StripeOptions` ชุดเดียวกับ Commerce (`Payment:Stripe:*`) — `ProductionConfigurationGuard` เดิมครอบอยู่แล้ว · **ไม่มี secret ใหม่ ไม่มี NuGet package ใหม่**

**Production guard (เพิ่มใน `ProductionConfigurationGuard` ของ Api และ `WorkersProductionRequirements` ของ Workers — ไฟล์ที่ P13-01 ประกาศ, README §4):** (ก) `Payout:EstimatedPaymentFeePercent` ต้อง **> 0** ใน Production — default 0.00 ทำให้ ledger ติวเตอร์ไม่หักค่าธรรมเนียมระหว่างรอ fee จริง (§6.8) ⇒ startup ล้มพร้อมข้อความชัด (key เดียวกับคอร์ส) · (ข) `Tutoring:PublicBaseUrl` ต้องเป็น absolute `https` origin ที่ `Live:AdHoc:AllowedJoinUrlOrigins` (P13-09) รับ — ไม่งั้นลิงก์ join ที่ `BookingConfirmedNotifier`/P13-10 สร้างจะถูก Live ปฏิเสธ (ฝั่ง Live เพิ่ม key+validator ของตน; ฝั่ง Tutoring เทียบ origin ตอน startup) · ทั้งสองกฎ **ไม่บังคับใน Development/Test**

**Rate limit ใหม่:** `tutoring-payment-poll` (ต่อผู้ใช้ `CreateUserPartition`, 40 req/60 วิ) — P13-06 ลงทะเบียนใน `RateLimiterConfiguration` (README §4)

**Wiring checklist (P13-06 WP-D/E):** `Siri.Modules.Tutoring.csproj` เพิ่ม `ProjectReference` → `Siri.Integrations.Payment` (เรียก `IPaymentMethod` ตรงตามแบบ Commerce) และ → `Siri.Modules.Payout` (ใช้เฉพาะ `Payout.Contracts` — ArchitectureTest ต้องเขียว ห้าม reference Domain/Infrastructure ของ Payout; ใครถึงก่อนเพิ่ม ใครมาทีหลังข้าม — README §4) · `appsettings.json` ของ **Api และ Workers** ต้องมี placeholder `Tutoring:Payment:*` ครบทุก key (ค่า default ตามตารางนี้) — Workers รัน job reconcile/refund จึงต้องผ่าน `ValidateOnStart` เหมือน Api · เพิ่ม `tutoring-payment-reconcile` ใน `RecurringJobIds.All` · ตรวจว่า DI ของ Workers มี `IPaymentMethod` (job เรียก Stripe)

DI (`AddTutoringModule`): `TutoringPaymentService`, `BookingSettlementService`, `PaymentRepository`, `IBookingHoldExpiredHandler`→`TutoringHoldExpiredHandler`, `TutoringPaymentEventListener` เป็น `IPaymentIntentEventListener`, `TryAddScoped<ISessionRoomSync, NullSessionRoomSync>`, `TryAddScoped<IPaymentMethod, StripePaymentMethod>` · Job: `RecurringJobIds.TutoringPaymentReconcile = "tutoring-payment-reconcile"` (เพิ่มใน `All`) + `AddOrUpdate<TutoringPaymentReconcileJob>(…, Cron.MinuteInterval(5))`

`ITutoringUnitOfWork`, `ISessionRoomSync` + `NullSessionRoomSync` (`TryAddScoped`) **ประกาศโดย P13-05 §5.0 — P13-06 ไม่ประกาศซ้ำ** (ผู้ลงมือ P13-06 ที่พบว่ายังไม่มีใน main ให้รอ/ประสานกับ P13-05 ไม่สร้างสำเนา) · `ISessionRoomSync.ConvergeAsync` คืน `Task` (stage-only, idempotent) — ความล้มเหลวสื่อด้วย exception ที่ถูกจับโดย savepoint (§6.2 ข้อ 6c)

---

## 8. Security

- ยืนยันการจ่ายจาก **webhook + signature เท่านั้น**; `redirect_status`/return_url ของ FE ใช้เป็นสัญญาณให้เริ่ม poll เท่านั้น (ตรงข้ามกับ "ห้ามเชื่อ redirect")
- ราคาจาก server; `PAYMENT.AMOUNT` ถูกเทียบกับ `AmountReceived` ทุกครั้ง; metadata ของ PI ตั้งเฉพาะโดยเซิร์ฟเวอร์ (ผู้โจมตีสร้าง PI ในบัญชีเราไม่ได้ และ event ผ่านการตรวจ signature แล้ว)
- IDOR: booking/payment ownership ใน WHERE เดียวกับการดึง; 404 ตัวเดียว · ไม่ใช้ `userId` จาก body/query
- ไม่ log: `clientSecret`, PI id เต็มใน response, อีเมล, ชื่อผู้เรียน, payload ดิบ (payload อยู่ใน `STRIPE_WEBHOOK_EVENTS` ตามเดิม) · audit detail เป็น id + จำนวนเงิน
- ผู้เยาว์: อีเมล/ใบยืนยันส่งหา **บัญชีผู้ปกครอง (ผู้จ่าย)**; ติวเตอร์ได้ชื่อเล่น + ระดับชั้นเท่านั้น
- webhook endpoint เดิม (`[AllowAnonymous]`) — **rate limit `webhook` ถูกยกเลิกแล้ว (X-45, D-25.1 2026-10-20): ตรวจ signature ก่อน, นับ limiter เฉพาะ request ที่ signature ผิด/ขาด/timestamp เกิน/body เกิน (`WebhookFailureLimiter`, `Webhooks:Protection`) + เพดาน body 256 KB (413); event เซ็นถูกไม่โดน 429**; listener ไม่ได้เปิด HTTP surface เพิ่ม
- Stripe error ไม่ถูกส่งต่อให้ผู้ใช้ดิบ (ข้อความกลาง + `reason`)

---

## 9. Test checklist

**A. Commerce ไม่ regress (ต้องเขียวก่อนเปิด listener):** ข้อ 1–3 ของ §3.4 · `StripeProviderEventMapper` (ทุก event type/ object ผิดชนิด/ metadata ขาด/ refund ไม่มี PI/ เงินหน่วยสตางค์→บาท) · dispatch: kind ตรง ⇒ listener เรียกครั้งเดียว + repository ของ Commerce **ไม่ถูกแตะ** (spy) + `PROCESS_RESULT` = ที่ listener ส่ง (ตัดที่ 500) · kind ไม่รู้จัก ⇒ throw + **ไม่มีแถว `STRIPE_WEBHOOK_EVENTS`** (integration, PG จริง) · listener throw ⇒ rollback (ไม่มีแถว event, การเขียนของ listener หาย) · event id ซ้ำ ⇒ listener ครั้งเดียว · ลายเซ็นผิด ⇒ listener ไม่ถูกเรียก · สองคำขอ event เดียวกันพร้อมกัน ⇒ ผลลัพธ์สุดท้ายหนึ่งแถว event + หนึ่ง confirm (ตัวที่สอง 500 ชน UQ แล้ว retry เป็น no-op)
**B. `Siri.Integrations.Payment`:** `Kind=null` ⇒ metadata `orderId/orderNo` + request เหมือนเดิม (`StripePaymentMethodTests` เดิมไม่แก้) · `Kind` ⇒ metadata ถูก ไม่มี `orderId` · idempotency key ที่ส่งถูกใช้/ซ้ำข้าม retry · `ExtraMetadata` ชนคีย์จอง ⇒ `ArgumentException` · refund: key+metadata ถูกส่ง, `Reason` retryable/permanent ถูกแมป (api_error/429/5xx ⇒ retryable; invalid_request/idempotency/card ⇒ permanent), legacy ไม่มี key · `GetRefundAsync` map + default interface ไม่ทำให้ fake เก่าคอมไพล์ล้ม
**C. Unit (`TutoringPaymentService`/`BookingSettlementService.ConfirmPaidAsync`):** ทุกแถว §5.2 · ทุกแถว R1–R5 + orphan 3 ทาง + amount mismatch · webhook **ไม่เรียก** `GetChargeFeeAsync` เลย (fake จับว่าไม่ถูกเรียก) ⇒ estimate เสมอ ⇒ reconcile แก้ · `PAYMENT.ApplyRefundTotals` ทุก transition (Succeeded→Partially/Refunded, Partially→Partially/Refunded, revert Refunded→Partially|Succeeded, Partially→Succeeded, ขอบเขตผิด ⇒ throw) · refund จาก R3/R5/mismatch/orphan ใช้ `BookingId=null` + key `refund:p{paymentId:N}:{Reason}` และ `RequestAsync` Failure ⇒ throw ใน webhook · split ถูกเรียกด้วย gross/fee/share ที่ถูก (commission override vs default) · ConvergeAsync ล้ม ⇒ booking ยัง Confirmed · domain transition ผิด ⇒ throw · admin override เปิดอยู่ ⇒ Amount ไป Stripe = ราคา booking · `Tutoring` assembly ไม่ depend `Siri.Modules.Commerce` (architecture test ใหม่) และ `Siri.Modules.Commerce` ไม่ depend `Siri.Modules.Tutoring`
**D. Integration (PostgreSQL 17 + Redis จริง, `SiriApiFactory`):** จ่ายสำเร็จ end-to-end ⇒ booking Confirmed, session Scheduled, split Held (1 แถว), outbox 2 ฉบับ, audit · webhook ซ้ำ/ลายเซ็นปลอม/ลำดับสลับ (failed หลัง succeeded; canceled หลัง succeeded) · จ่ายหลัง hold หมดทั้ง reopen และ refund (slot ถูกจองโดยคนอื่น — พิสูจน์ด้วย exclusion constraint จริงว่า txn ไม่ aborted) · duplicate PI (สลับวิธีจ่ายแล้วสองใบสำเร็จ) ⇒ refund 1 ใบ · orphan adoption · สร้างจ่ายสองคำขอพร้อมกัน ⇒ PI/แถว payment เดียว · สลับ PromptPay→Card ⇒ PI เก่าถูก cancel ก่อนสร้างใหม่ · reconcile job (succeeded ที่ webhook หลุด) · fee estimate → revise · `GET payments/{id}` ของคนอื่น ⇒ 404 body เดียวกับไม่มีจริง · **ไม่มี HTTP ใน txn/lock:** fake `IPaymentMethod` ทุกเมธอดตรวจ `Database.CurrentTransaction == null` ตอนถูกเรียก (reconcile/cancel-pending/ฯลฯ) ⇒ ล้มทันทีถ้าถูกเรียกใน txn · **deadlock:** webhook refund-event ↔ `ExecuteAsync` ↔ cancel ↔ reconcile รันพร้อมกันบน payment เดียว (วนซ้ำ 50 รอบ) ไม่มี `40P01`

---

## 10. Frontend notes (`siri_upskill_ui`)

- เส้นทาง `/tutoring/checkout/:bookingId` (CSR, `authGuard`, `noindex`, `RenderMode.Client`) · reuse `card-payment-panel` ของ P11-09 ตามเดิม (input `clientSecret`/`paymentId`/`publishableKey`/`returnUrl`; `returnUrl = ${origin}/tutoring/checkout/${bookingId}`; sessionStorage key ใหม่ `siri.tutoring.checkout.pendingPaymentId`) — **ห้าม copy-paste ตรรกะ**: ถ้า panel ผูกกับ `commerce-api` ให้ refactor เป็น input ล้วน (งานของ P13-22)
- state ที่ต้องมี: ยังไม่เลือกวิธี / รอสแกน QR (PromptPay: แสดง `qrCodeUrl`, นับถอยหลังจาก `holdExpiresAtUtc`, poll `GET payments/{id}` ทุก 3 วิ — rate limit `tutoring-payment-poll` 40/นาที; เมื่อได้ 429 ให้ถอย (backoff) ไม่ poll ถี่ขึ้น) / กรอกบัตร / ประมวลผล / **สำเร็จ** ⇒ ไป `/my-tutoring` / **ล้มเหลว** (`Failed` ⇒ ปุ่มลองใหม่ = `POST …/payment` อีกครั้ง) / **หมดเวลา** (`Expired`/409 `hold_expired` ⇒ จองใหม่) / **จ่ายหลังหมดเวลา** (`lateResolution=Refunded` ⇒ ข้อความ "เวลานี้ไม่ว่างแล้ว คืนเงินเต็มจำนวน" + หมายเหตุ PromptPay refund อาจต้องให้ Stripe ติดต่อขอบัญชี) / `Reopened` ⇒ ถือเป็นสำเร็จ
- ข้อความ statement descriptor เดียวกับ Commerce (`STRIPE PAYMENTS (THAILAND) LTD`) ใต้ปุ่มจ่าย ทั้งสองวิธี
- i18n `tutoring.checkout.*`, `tutoring.errors.<reason>` (th+en, `i18n-guard.spec` เขียว) · เงินใช้ `currencyThb` (ต้อง `providers:[CurrencyPipe]`) · เวลา `bangkokDate` · ห้ามคำนวณราคา/ส่วนลดที่ FE

### Frontend DTO appendix (JSON = camelCase · enum = string · เวลา = ISO-8601 UTC `…Z` · เงิน = number 2 ตำแหน่ง)
```ts
type TutoringPaymentMethod = 'PromptPay' | 'Card';
type TutoringPaymentKind = 'Booking' | 'Package';
type TutoringPaymentStatus = 'Pending' | 'Succeeded' | 'Failed' | 'Expired' | 'PartiallyRefunded' | 'Refunded';
type LatePaymentResolution = 'None' | 'Reopened' | 'Refunded' | 'Duplicate' | 'Orphan';

interface TutoringPaymentConfig { publishableKey: string; enabledMethods: TutoringPaymentMethod[]; }          // GET payments/config
interface CreateTutoringPaymentRequest { method: TutoringPaymentMethod; }                                        // POST bookings/{id}/payment
interface TutoringPayment {                                                                                      // 201 | 200
  paymentId: string; kind: TutoringPaymentKind; referenceId: string; attemptNo: number;
  method: TutoringPaymentMethod; amount: number; currency: 'THB'; status: TutoringPaymentStatus;
  holdExpiresAtUtc: string | null; clientSecret: string | null; qrCodeUrl: string | null; qrCodeData: string | null; createdAtUtc: string;
}
interface TutoringPaymentStatusDto {                                                                             // GET payments/{id}
  paymentId: string; kind: TutoringPaymentKind; referenceId: string; status: TutoringPaymentStatus;
  method: TutoringPaymentMethod; amount: number; refundedCompletedAmount: number; refundPendingAmount: number;
  lateResolution: LatePaymentResolution; bookingStatus: string | null; updatedAtUtc: string;
}
```
C#: `TutoringPaymentConfigResponse(string PublishableKey, IReadOnlyList<TutoringPaymentMethod> EnabledMethods)` · `CreateTutoringPaymentRequest(TutoringPaymentMethod Method)` · `TutoringPaymentResponse(Guid PaymentId, TutoringPaymentKind Kind, Guid ReferenceId, int AttemptNo, TutoringPaymentMethod Method, decimal Amount, string Currency, TutoringPaymentStatus Status, DateTime? HoldExpiresAtUtc, string? ClientSecret, string? QrCodeUrl, string? QrCodeData, DateTime CreatedAtUtc)` · `TutoringPaymentStatusResponse(Guid PaymentId, TutoringPaymentKind Kind, Guid ReferenceId, TutoringPaymentStatus Status, TutoringPaymentMethod Method, decimal Amount, decimal RefundedCompletedAmount, decimal RefundPendingAmount, LatePaymentResolution LateResolution, string? BookingStatus, DateTime UpdatedAtUtc)` (`RefundedCompletedAmount = REFUNDED_AMOUNT` = เฉพาะ refund สถานะ `Completed` — ต่างจาก `Booking.refundedAmount` ที่นับ Requested+Processing+Completed ตาม README §6; `RefundPendingAmount = REFUND_RESERVED_AMOUNT − REFUNDED_AMOUNT`; `LateResolution` null ⇒ `None`)

`ApiProblem.reason` ที่ FE ต้อง map i18n: `tutoring.booking_not_found`, `tutoring.booking_already_paid`, `tutoring.booking_not_payable`, `tutoring.hold_expired`, `tutoring.booking_is_free`, `tutoring.payment_method_disabled`, `tutoring.too_many_payment_attempts`, `tutoring.payment_in_progress`, `tutoring.payment_provider_unavailable` (+`Retry-After`), `payment.provider_not_configured`, `tutoring.payment_not_found`; 429 ⇒ "ลองใหม่อีกสักครู่" (ไม่มี reason)

---

## 11. Open decisions (defaulted) · ความเสี่ยงที่เหลือ

| # | เรื่อง | ค่าที่ตั้ง | เปลี่ยนได้ที่ |
|---|---|---|---|
| 1 | จ่ายหลัง hold หมด: reopen หรือ refund | reopen เมื่อ slot ว่าง + เหลือเวลา ≥ 60 นาที + ติวเตอร์ Verified/ไม่ Suspended; ไม่งั้น refund 100% | `Tutoring:Booking:ReopenMinLeadMinutes` (P13-05) |
| 2 | ตัดสิน R1 ด้วยสถานะแทนนาฬิกา | จ่ายสำเร็จขณะ booking ยัง `PendingPayment` ⇒ confirm เสมอแม้ hold เลยกำหนดไม่กี่วินาที | — |
| 3 | `payment_failed` ไม่ expire booking (ต่างจากถ้อยคำ TASKS) | booking อยู่จนครบ hold; ผู้ใช้ลองใหม่ได้ | `ExpireBookingOnPaymentFailed=true` |
| 4 | orphan PI (เงินเข้าแต่ไม่มีแถว) | adopt ถ้าตรง booking+ยอด ไม่งั้น refund เต็ม | `OrphanGraceMinutes` |
| 5 | ค่าธรรมเนียม | **ไม่ดึงใน webhook** (D-B) — ประมาณ (`Payout:EstimatedPaymentFeePercent`, guard > 0 ใน Production) → job `tutoring-payment-reconcile` ดึงค่าจริงนอก txn ภายใน ~8 นาที → `ReviseFee` | `FeeReconcileMinAgeMinutes` |
| 6 | PI ซ้ำของ booking เดียว | ห้ามมี Pending สองใบ (cancel เก่าก่อนสร้างใหม่); ถ้าสองใบสำเร็จ ⇒ refund ใบที่สอง | — |
| 7 | webhook ไม่มี listener ของ `kind` | throw (ดัง) ไม่กลืน | — |
| 8 | Stripe Dashboard ต้องเพิ่ม `refund.*` events | OWN; มี poll fallback | — |
| 9 | `charge.dispute.*` (chargeback) | **ไม่ทำ** ใน P13 (X-36 ยังเปิดสำหรับคอร์ส) — ควรเป็น task ต่อ: ธง booking + Freeze escrow | task ใหม่ |
| 10 | `STRIPE_FEE_AMOUNT` ของ Card กับ PromptPay | เรตต่างกัน — OWN ตั้ง `Payout:EstimatedPaymentFeePercent` ให้เหมาะก่อนเปิด Card | config |

**ความเสี่ยงที่ยอมรับ:** (1) ledger ใช้ค่าธรรมเนียมประมาณช่วงสั้น ๆ หลังจ่าย (ก่อน job แก้) — ไม่กระทบเงินที่ยังอยู่ใน escrow (2) listener ใหม่เพิ่มเส้นทางใน webhook ของโค้ดเงินเดิม ⇒ ต้องผ่านชุดเทสต์ §9.A ก่อน merge (3) idempotency key ของ Stripe หมดอายุ 24 ชม. ⇒ ผลกับ refund retry (P13-08)

## 12. Work packages

| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | entity `PAYMENT` + config + migration `AddTutoringPayments` (+FK `TUTOR_BOOKINGS.PAYMENT_ID`) + `docs/DATABASE.md` | อ่านทั้งไฟล์ ไม่มี shadow FK; `DatabaseIdentifierLengthTests` เขียว; **ไม่ apply DB จริง** |
| B | `backend-developer` | §4 `Siri.Integrations.Payment` ทั้งหมด + unit §9.B | `StripePaymentMethodTests` เดิมไม่แก้และผ่าน; build 0 warning |
| C | `backend-developer` | §3 SharedKernel + Commerce mapper/dispatch + เทสต์ §9.A (ขนานกับ B/A ได้ — ไม่พึ่ง Tutoring) | เทสต์เดิมของ Commerce ผ่านไม่แก้; architecture เขียว |
| D | `backend-developer` | `TutoringPaymentService` + controller + validator + rate limit + options (หลัง A,B; ต้องมี P13-05) | unit §9.C ส่วน service |
| E | `backend-developer` | listener + `ConfirmPaidAsync` + race + orphan + reconcile job (หลัง C,D และ P13-07/08 merge) | unit+integration §9.C/D |
| F | `backend-developer` | integration tests §9.D | เขียนครบ (ระบุถ้ายังไม่เคยรันเพราะไม่มี Docker) |
ขนาน: FE กับ BE ทั้งหมด · `DONE` ตั้งโดย integrator-qa · **ห้าม commit / apply migration เอง** · เปิดใช้ listener จริง (ลงทะเบียน DI) ต่อเมื่อ C เขียว + P13-07/08 พร้อม

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review — มติกลาง D-A/D-B/D-C) — ไม่เปลี่ยนตาราง/endpoint เดิม นอกจากที่ระบุ
- §2.1: `PAYMENT.ApplyRefundTotals(reserved, completed)` เป็นทางเดียวที่แก้ `REFUND_RESERVED_AMOUNT`/`REFUNDED_AMOUNT`/`STATUS` หลัง Succeeded — รองรับ Succeeded→Refunded, Partially→Partially, และ revert เมื่อ refund Failed/Voided (ข้อ 2)
- §6.0: lock chain มติ D-B (…PAYMENTS → REFUNDS → splits → TUTOR_PROFILES; payment ก่อน refund เสมอ) + ห้าม HTTP ภายนอกขณะถือ txn/lock (ข้อ 3)
- §3.1 listener ห้ามเรียก HTTP ภายนอก; §6.2 ข้อ 3–4 + §6.8: **ตัด** fee lookup ออกจาก webhook ⇒ estimate เสมอ + reconcile แก้ (ข้อ 10); ลบ `FeeLookupTimeoutSeconds`; `FeeReconcileMinAgeMinutes` 10→3
- §6.3/§6.5/§6.2 ข้อ 2: refund จาก R3/R5/mismatch/orphan ใช้ `BookingId=null` + key `refund:p{paymentId:N}:{Reason}` ข้าม booking cap/ledger; `Result.IsFailure` ⇒ throw (ข้อ 1)
- §6.4: ลำดับอ่านไม่ล็อก → `ExpireAsync` (session→booking) → ล็อก payment (ข้อ 4); §6.7: SKIP LOCKED เฉพาะตอนเลือก id, Stripe นอก txn, ล็อกหลัง (ข้อ 4)
- §5/§7: policy ใหม่ `tutoring-payment-poll` (ข้อ 21); Production guard (`Payout:EstimatedPaymentFeePercent > 0`, `Tutoring:PublicBaseUrl` ∈ `Live:AdHoc:AllowedJoinUrlOrigins`) (ข้อ 15); wiring checklist (`ProjectReference`, appsettings Api+Workers) (ข้อ 21)
- §10: `refundedAmount` → `refundedCompletedAmount` ใน payment DTO ตาม README §6
### 2026-10-15 รอบ 3 (README §6 — ชื่อ ext สงวน) — แก้ถ้อยคำ error table §5: `booking_already_paid` / `booking_not_payable` ใช้ ext **`bookingStatus`** แทน `status` (ชื่อสงวนใน `DomainErrorHttpResults` ถูกทิ้งเงียบ) · ไม่เปลี่ยน endpoint/DTO อื่น

### rev 2 (2026-10-20) — X-45 (มติเจ้าของ D-25.1)
- `StripeWebhookHandler` แยก `VerifySignature` (ไม่แตะ DB) กับ `ProcessVerifiedEventAsync`; `HandleAsync` = สองขั้นต่อกัน (พฤติกรรม/ข้อความเดิม) · `StripeWebhookController`/`BunnyWebhookController` ไม่มี `[EnableRateLimiting]` หน้า signature อีก · policy `webhook` ใน `RateLimiterConfiguration` ถูกลบ · ดู `src/Siri.Api/Webhooks/**` และ `PROGRESS.md` 2026-10-20

### rev 3 (2026-10-20) — R1/R2 (D-25.1)
- §6.2/§6.3 แถวใหม่: `BookingSettlementService.ConfirmBookingPaymentAsync` ล็อก `LEARNER_PROFILES` FOR SHARE ขั้นแรก (id อ่านก่อนล็อก + ตรวจซ้ำหลังล็อก) — โปรไฟล์ถอน consent/anonymised/inactive ⇒ ไม่ confirm / ไม่ reopen Expired + คืนเต็ม `ConsentWithdrawn` (webhook code `refunded_consent_withdrawn`, audit `tutoring.payment.refunded_consent_withdrawn`) · lock chain ขึ้นต้น `LEARNER_PROFILES` (P13-README §7.2)
