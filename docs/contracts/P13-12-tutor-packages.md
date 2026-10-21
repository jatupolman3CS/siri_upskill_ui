# Contract: P13-12 แพ็กเกจติวเตอร์ (`TUTOR_PACKAGES` / `PACKAGE_PURCHASES` / `TUTOR_PACKAGE_CREDITS`) — ซื้อครั้งเดียว ใช้เป็นเครดิตจองทีละคลาส, escrow/คืนเงินต่อครั้ง, หมดอายุ

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE entity/DB, schema `TUTORING`) — ใช้ P13-06 (จ่ายเงิน/webhook), P13-07 (`ITutoringEscrowContract`), P13-08 (`TutoringRefundService`/ยกเลิก) และชิ้นส่วนร่วมของ P13-05 · **ไม่ต้องแก้สัญญา P13-05** — เส้นทางจองด้วยเครดิตเป็นของ P13-12 เอง (§7, ตามที่ P13-05 §7 ระบุไว้ "เพิ่ม FK + ตัดเครดิตในเส้นทางของตน") จุดแตะโค้ด P13-05 ใน §0.2 ถูก P13-05 รอบ 2 รองรับแล้ว (factory `CreateFromPackage`, seam `ILearnerProfileUsageReader`, field `packagePurchaseId` ใน `Booking`)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..G)** — เงินล่วงหน้าของผู้ปกครอง + เครดิตที่แปลงเป็นเงินได้ + การตัดสินว่าเงินส่วนไหนตกเป็นของติวเตอร์เมื่อหมดอายุ + ตัดเครดิตแบบ atomic ⇒ ตรงเกณฑ์ที่ห้ามส่ง Antigravity · **ไม่ต้องผ่าน DESIGN_DATABASE** (3 ตารางเล็ก §2 ระดับคอลัมน์/ชื่อ constraint/SQL ครบ) · ไม่มีบล็อกคำสั่ง Antigravity · FE: หน้า public/Tutor Portal ที่ไม่แตะเงินส่ง Antigravity ได้หลัง FROZEN; หน้า checkout/ใช้เครดิตให้ Claude (`frontend-developer`)

> **อ่านคู่กับ:** `docs/TUTORING.md` §2 (`TUTOR_PACKAGES`/`PACKAGE_PURCHASES`), §3.4, §3.7 ("package: คืนตามส่วนของครั้งนั้น ราคา ÷ จำนวนครั้ง") · `DECISIONS.md` D-25, Q4, Q14 · **P13-03 §4** (`TutorPriceCalculator.ForDuration` — จุดคิดราคาเดียว) · **P13-05** (§3 domain methods, §5.0 `ITutoringUnitOfWork`/lock, §5.1 ขั้น preflight 2–9, §5.2 exception→HTTP, §5.6 `BookingConfirmedNotifier`) · **P13-06** (§6.0 lock order, §6.1 สร้างการจ่าย, §6.2 ข้อ 0 hand-off ของ KIND=Package, §6.7 fee reconcile) · **P13-07** (`ITutoringEscrowContract`) · **P13-08** (`CancellationPolicy`, `TutoringRefundService.RequestAsync`, §8 ลำดับ lock ของ cancel) · **P13-10** (Settle* เรียก `IPackageCreditService` ผ่าน P13-08)

---

## 0. ข้อเท็จจริงที่กำหนดดีไซน์ (จากโค้ด/สัญญาที่ FROZEN แล้ว)

### 0.1 Facts
| # | ข้อเท็จจริง | ผล |
|---|---|---|
| F1 | ราคา = `TutorPriceCalculator.ForDuration(hourlyRate, minutes)` = `Round(rate×min/60, 2, AwayFromZero)`; `Quote(offering, format, minutes, isTrial, minChargeAmount)` (5 อาร์กิวเมนต์ — P13-03 รอบ 2) ปฏิเสธราคา `< minChargeAmount` (P13-03 §4) | แพ็กเกจใช้ตัวเดียวกัน — ห้ามคำนวณราคาซ้ำที่อื่น |
| F2 | P13-05 (FROZEN) §3.2/§7: `TUTOR_BOOKINGS.PACKAGE_PURCHASE_ID` เป็น null ที่นั่น และ "P13-12 เพิ่ม FK + ตัดเครดิตในเส้นทางของตน (`ClaimSeat`/`BookingConfirmedNotifier`/`ITutoringUnitOfWork`)"; `POST /bookings` ไม่มีเส้นทาง package และ B6 ห้ามเปลี่ยนตัวตนของ booking | P13-12 ทำ endpoint จองด้วยเครดิตของตัวเอง `POST package-purchases/{id}/bookings` (§7) ไม่ยัดเข้า `BookingService.CreateAsync` |
| F3 | P13-06 §6.2 ข้อ 0: เมื่อ `payment.KIND=Package` ให้ส่งต่อ `PackagePurchaseService.ConfirmPaidAsync` แล้วจบ (ไม่ lock session/booking) | P13-12 เป็นเจ้าของ flow ยืนยันการจ่ายของแพ็กเกจ **ทั้งหมด** ตั้งแต่ lock → ตรวจยอด → fee → `MarkSucceeded` → activate (§5.3) |
| F4 | P13-07: ledger ต่อ source ด้วย `SOURCE_REF_ID`; `RecordTutoringSplit` idempotent ด้วย `rec:{ref:N}`; ล็อกแถว split เป็นลำดับสุดท้ายของ chain; `PERIOD_KEY` = สัปดาห์ที่เงินเข้า (ไม่ใช่เงื่อนไขเข้า batch — เข้า batch ด้วย `AVAILABLE_AT_UTC` ≤ cutoff) | เงินที่ยังไม่ถูกใช้ **ไม่เข้า ledger** (เป็น "หนี้สินแพ็กเกจ" ที่ Tutoring ถือ); split เกิดตอนเครดิตถูกใช้จอง (ref = bookingId) หรือหมดอายุแล้วปล่อยให้ติวเตอร์ (ref = creditId) |
| F5 | P13-08: `CancellationPolicy` มี `Funding = Direct\|PackageCredit` → `Settlement = Money\|CreditRestore\|None`; `RequestRefundCommand(PaymentId, BookingId?, PackagePurchaseId?, Amount, Reason, IdempotencySuffix, …)`; key `refund:{bookingId:N}:{Reason}` หรือ `refund:p{paymentId:N}:{Reason}` (+suffix); cap สองชั้นกับ `payment` และ `booking.PRICE_AMOUNT` | booking ที่จองด้วยเครดิตมี `PRICE_AMOUNT` = ส่วนของครั้งนั้น (slice) **และ `PAYMENT_ID` = payment ของแพ็กเกจ** เพื่อให้ P13-08 ทำงานโดยไม่ต้องรู้เรื่องแพ็กเกจเพิ่มนอกจากสามจุดใน §5.2 |
| F6 | raw SQL (`ExecuteSql*`) ข้าม `ConcurrencyTokenInterceptor` ⇒ ต้องหมุน `ROW_VERSION` เอง ด้วยนิพจน์ P13-05 §5.3 (`decode(substr(md5(random()::text \|\| clock_timestamp()::text), 1, 16), 'hex')`) | §5.4 ใช้นิพจน์เดียวกัน (`ROT`) |
| F7 | FK ทุกเส้น `NoAction`; ห้าม cascade/hard delete บนตารางเงิน | §2 |
| F8 | **ลำดับ lock ขยายสำหรับแพ็กเกจ:** `TUTOR_SESSIONS → TUTOR_BOOKINGS (BOOKING_ID ASC) → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS (SEQ_NO ASC) → PAYMENTS → REFUNDS → (Payout splits) → TUTOR_PROFILES` (มติ D-B) — purchase ต้องถูก lock **ก่อน** payment ทุกที่ (webhook confirm, cancel/settle, expiry job, fee reviser, admin refund) | ตัด deadlock ระหว่าง webhook ↔ cancel ↔ job; P13-06 §6.0 และ P13-08 §4/§8 ถูกแก้ให้ตรงกัน (ดู Changelog) |
| F9 | `SESSIONS_USED` = จำนวนเครดิตที่ **ไม่ใช่ `Available`** (Reserved + Consumed + Refunded + Expired) — invariant `SESSIONS_USED == count(credits where STATUS <> 'Available')` เสมอ | gate การจอง `SESSIONS_USED < SESSIONS_TOTAL` ⇔ มีเครดิต `Available` อย่างน้อย 1 ใบ (ใต้ lock ของ purchase) |
| F10 | P13-05 §4 ข้อ 4 `learner_profile_in_use` นับเฉพาะ booking `PendingPayment/Confirmed` | แพ็กเกจ `Active` ที่ยังมีเครดิตไม่ถูกนับ ⇒ §0.2 จุดที่ 2 |

### 0.2 จุดที่แตะโค้ดของ task อื่น (additive ทั้งหมด — รอบ 2: P13-05 รองรับจุด 1–3 แล้ว; ห้ามเปลี่ยนพฤติกรรมเดิม)
| # | ที่ | การเปลี่ยน | เหตุผล/ข้อจำกัด |
|---|---|---|---|
| 1 | P13-05 `TUTOR_BOOKING` | factory `CreateFromPackage(bookingNo, sessionId, tutorId, learnerUserId, learnerProfileId, packagePurchaseId, paymentId, priceAmount, IClock)` — **P13-05 รอบ 2 เพิ่มแล้ว** (ลายเซ็นตรงกัน: ราคา > 0, `ESCROW_STATE=Held`, `PAYMENT_ID`/`PACKAGE_PURCHASE_ID` ตั้งค่า, `CONFIRMED_AT_UTC=now`, 1:1 เท่านั้น); P13-12 เรียกใช้ตรง ๆ · **guard "ติวเตอร์ต้อง Verified" (D-C) อยู่ที่ P13-12 (§7 ข้อ 6) ก่อนเรียก factory** ไม่ใช่ใน factory | เมทริกซ์ 10×10 ไม่เปลี่ยน |
| 2 | P13-05 `learner-profiles` (DELETE) | P13-12 **ลงทะเบียน impl ของ `ILearnerProfileUsageReader`** (Application seam ที่ P13-05 รอบ 2 ประกาศ พร้อม `NullLearnerProfileUsageReader` เป็นค่าเริ่มต้น): `HasActivePackageAsync(learnerProfileId, ct)` = มี `PACKAGE_PURCHASES.STATUS='Active'` ของโปรไฟล์นั้น ⇒ `LearnerProfileService.DeactivateAsync` ปฏิเสธ `learner_profile_in_use` — **ไม่แก้ `LearnerProfileService`** | `AddScoped<ILearnerProfileUsageReader, PackageLearnerProfileUsageReader>()` ใน `AddTutoringModule` (แทน null ที่ `TryAdd` ไว้) |
| 3 | P13-05 `Booking`/`BookingListItem` DTO | **ไม่ต้องทำ** — `Booking` ฉบับรวมของ P13-05 (รอบ 2) มี `packagePurchaseId` อยู่แล้ว (README §6) | — |
| 4 | P13-06 `TutoringPaymentService` | **เจ้าของเดียวคือ P13-06**: `CreatePaymentCoreAsync` (private), `CreateForPackageAsync(callerUserId, purchaseId, method)` และ overload `CancelPendingIntentsAsync(kind, refId, ct)` implement ที่ P13-06 (§6.1/§6.7) — P13-12 **ไม่แยก/ไม่เขียนซ้ำ** ส่วนนั้น เป็นเจ้าของเฉพาะสเปค precondition ของแพ็กเกจ (§5.1) ที่ `CreateForPackageAsync` ต้องตรวจ | P13-06 WP-D ทำตามสเปค §5.1 นี้ |

---

## 1. Scope
**ใน:** 3 ตาราง + migration `AddTutorPackages` · `PackagePricing`/`CreditAllocation` (pure) · `TutorPackageService` (ติวเตอร์จัดการแพ็กเกจ) · `PackagePurchaseService` (ซื้อ/ยกเลิก pending/`ConfirmPaidAsync`/อ่าน) · `PackageCreditService` (`IPackageCreditService`) · `PackageBookingService` (จองด้วยเครดิต) · `PackageFeeReviser` · job `tutoring-package-expiry` · admin refund-unused · endpoint สาธารณะ/ผู้เรียน/ติวเตอร์/admin · Options `Tutoring:Packages`
**นอก:** แพ็กเกจกลุ่ม/ทดลองเรียน/ข้ามติวเตอร์ · คูปอง/โปรโมชัน · โอนเครดิต/ต่ออายุ · ผู้เรียกขอคืนเครดิตที่เหลือเป็นเงินเอง (admin เท่านั้น v1) · การแก้ checkout ของ P13-06 นอกจาก §0.2 ข้อ 4 · FE · ใบกำกับภาษี (Q14)

---

## 2. Schema delta — migration `AddTutorPackages` (additive; ตารางใหม่ 3 + FK 2 เส้นบนตารางเดิม)

> UPPERCASE · `IAuditable` เป็น PascalCase (`CreatedAtUtc`…) · `timestamptz(3)` UTC · เงิน `numeric(18,2)` + `HasPrecision(18,2)` · enum เก็บ string · **FK ทั้งหมด `NoAction` ห้าม cascade/hard delete** · ชื่อ ≤63 ไบต์ ตั้งเอง (`DatabaseIdentifierLengthTests`) · อ่าน migration ที่ generate ทั้งไฟล์ (ไม่มี shadow FK, ระบุ `.HasForeignKey()`/`.WithMany(nav)`) · ห้าม apply DB จริงเอง

### 2.1 `TUTORING.TUTOR_PACKAGES` (entity `TUTOR_PACKAGE : IAuditable`)
| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `PACKAGE_ID` | uuid PK | no | |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` (`FK_TUTOR_PACKAGES_TUTOR`) |
| `OFFERING_ID` | uuid | no | FK → `TUTOR_OFFERINGS` (`FK_TUTOR_PACKAGES_OFFERING`) — ต้องมี `HOURLY_RATE_ONE_ON_ONE` (แพ็กเกจเป็น 1:1 เท่านั้น) |
| `SESSION_COUNT` | int | no | `MinSessionCount`(2)–`MaxSessionCount`(30) |
| `DURATION_MINUTES` | int | no | ∈ `AllowedDurationsMinutes` (P13-03: `[30,60,90,120]`) |
| `DISCOUNT_PERCENT` | numeric(5,2) | no | 0–`MaxDiscountPercent`(50); ติวเตอร์ตั้ง |
| `VALID_DAYS` | int | no | `MinValidDays`(7)–`MaxValidDays`(365); default `DefaultValidDays`(90) |
| `IS_ACTIVE` | boolean | no | ปิด = ซื้อใหม่ไม่ได้ (เครดิตที่ขายไปแล้วยังใช้ได้) |
| `ROW_VERSION` | bytea | no | |
| audit | | | |
Index/constraint: `PK_TUTOR_PACKAGES` · `IX_TUTOR_PACKAGES_TUTOR_ACTIVE` (`TUTOR_ID`,`IS_ACTIVE`) · `IX_TUTOR_PACKAGES_OFFERING` (`OFFERING_ID`) · **partial UQ** `UQ_TUTOR_PACKAGES_ACTIVE_SHAPE` (`OFFERING_ID`,`SESSION_COUNT`,`DURATION_MINUTES`) `HasFilter("\"IS_ACTIVE\" = true")` · CHECK `CK_TUTOR_PACKAGES_RANGES` (`SESSION_COUNT` >= 2 AND `DISCOUNT_PERCENT` >= 0 AND `DISCOUNT_PERCENT` <= 90 AND `VALID_DAYS` >= 1 AND `DURATION_MINUTES` > 0)
**ราคาไม่เก็บในตารางนี้** — คำนวณจาก offering ปัจจุบัน ณ ตอนซื้อ แล้ว snapshot ลง `PACKAGE_PURCHASES` (ติวเตอร์ปรับ rate ไม่กระทบแพ็กเกจที่ซื้อไปแล้ว)

### 2.2 `TUTORING.PACKAGE_PURCHASES` (entity `PACKAGE_PURCHASE : IAuditable`)
| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `PACKAGE_PURCHASE_ID` | uuid PK | no | = `PAYMENTS.REF_ID` ของ payment KIND=Package |
| `LEARNER_USER_ID` | uuid | no | ผู้ซื้อ/ผู้จ่าย — จาก `IUserContext` เท่านั้น (ไม่มี FK) |
| `LEARNER_PROFILE_ID` | uuid | no | FK → `LEARNER_PROFILES` (`FK_PACKAGE_PURCHASES_LEARNER`) — เครดิตใช้ได้เฉพาะโปรไฟล์นี้ |
| `PACKAGE_ID` | uuid | no | FK → `TUTOR_PACKAGES` (`FK_PACKAGE_PURCHASES_PACKAGE`) |
| `TUTOR_ID` / `OFFERING_ID` | uuid | no | FK NoAction (`FK_PACKAGE_PURCHASES_TUTOR` / `_OFFERING`) — denormalize ไว้ใช้ตอนจอง |
| `DURATION_MINUTES` / `SESSIONS_TOTAL` / `VALID_DAYS` | int | no | snapshot จากแพ็กเกจ ณ ตอนซื้อ |
| `DISCOUNT_PERCENT_SNAPSHOT` | numeric(5,2) | no | |
| `PRICE_SNAPSHOT` | numeric(18,2) | no | ราคารวมที่ **server คิด** (§4.1) = ยอดที่ส่ง Stripe |
| `TUTOR_SHARE_PERCENT` | numeric(5,2) | yes | snapshot (100 − commission) ณ ตอน **activate**; null จนกว่าจะจ่ายสำเร็จ |
| `SESSIONS_USED` | int | no | default 0 — ดู F9: = จำนวนเครดิตที่ไม่ใช่ `Available` |
| `STATUS` | varchar(16) | no | `PendingPayment` \| `Active` \| `Exhausted` \| `Expired` \| `Cancelled` |
| `PAYMENT_ID` | uuid | yes | FK → `TUTORING.PAYMENTS` (`FK_PACKAGE_PURCHASES_PAYMENT`); ตั้งตอน activate (payment ที่ `Succeeded`) |
| `PENDING_EXPIRES_AT_UTC` | timestamptz(3) | yes | ตั้งเมื่อ `PendingPayment` = now + `PendingPurchaseMinutes`(30) |
| `ACTIVATED_AT_UTC` / `EXPIRES_AT_UTC` | timestamptz(3) | yes | `EXPIRES = ACTIVATED(paidAt) + VALID_DAYS` |
| `EXPIRY_REMINDER_SENT_AT_UTC` | timestamptz(3) | yes | เตือนก่อนหมดอายุ (ครั้งเดียว) |
| `EXPIRY_BLOCKED_AT_UTC` | timestamptz(3) | yes | ตั้งครั้งแรกที่ job พบ purchase หมดอายุแต่ติวเตอร์ไม่ Verified (§6.1 ข้อ 3 — ไม่ปล่อยเงินอัตโนมัติ; ขึ้นคิว admin) |
| `ROW_VERSION` | bytea | no | |
| audit | | | |
Index/constraint: `PK_PACKAGE_PURCHASES` · `IX_PACKAGE_PURCHASES_LEARNER_STATUS` (`LEARNER_USER_ID`,`STATUS`) · `IX_PACKAGE_PURCHASES_TUTOR` (`TUTOR_ID`) · `IX_PACKAGE_PURCHASES_PROFILE` (`LEARNER_PROFILE_ID`) · `IX_PACKAGE_PURCHASES_PENDING_EXPIRY` (`PENDING_EXPIRES_AT_UTC`) `HasFilter("\"STATUS\" = 'PendingPayment'")` · `IX_PACKAGE_PURCHASES_ACTIVE_EXPIRY` (`EXPIRES_AT_UTC`) `HasFilter("\"STATUS\" = 'Active'")` · **UQ partial** `UQ_PACKAGE_PURCHASES_PAYMENT` (`PAYMENT_ID`) `HasFilter("\"PAYMENT_ID\" IS NOT NULL")` · CHECK `CK_PACKAGE_PURCHASES_USAGE` (`SESSIONS_USED` >= 0 AND `SESSIONS_USED` <= `SESSIONS_TOTAL`) · CHECK `CK_PACKAGE_PURCHASES_ACTIVE` (`STATUS` NOT IN ('Active','Exhausted','Expired') OR (`EXPIRES_AT_UTC` IS NOT NULL AND `PAYMENT_ID` IS NOT NULL AND `TUTOR_SHARE_PERCENT` IS NOT NULL)) · CHECK `CK_PACKAGE_PURCHASES_PENDING` (`STATUS` <> 'PendingPayment' OR `PENDING_EXPIRES_AT_UTC` IS NOT NULL)

### 2.3 `TUTORING.TUTOR_PACKAGE_CREDITS` (entity `PACKAGE_CREDIT`; **ไม่ implement IAuditable** — วงจรชีวิตอยู่ในคอลัมน์เวลา)
| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `CREDIT_ID` | uuid PK | no | UUIDv7 — ใช้เป็น `SOURCE_REF_ID` ของ ledger เมื่อหมดอายุแล้วปล่อยให้ติวเตอร์ |
| `PACKAGE_PURCHASE_ID` | uuid | no | FK → `PACKAGE_PURCHASES` (`FK_PACKAGE_CREDITS_PURCHASE`) |
| `SEQ_NO` | int | no | 1..`SESSIONS_TOTAL` |
| `GROSS_AMOUNT` | numeric(18,2) | no | ส่วนของครั้งนั้น = `CreditAllocation.Slice(PRICE_SNAPSHOT, N, SEQ_NO)` (§4.2) — สร้างตอน activate ไม่เปลี่ยนอีก |
| `STATUS` | varchar(12) | no | `Available` \| `Reserved` \| `Consumed` \| `Expired` \| `Refunded` |
| `BOOKING_ID` | uuid | yes | FK → `TUTOR_BOOKINGS` (`FK_PACKAGE_CREDITS_BOOKING`) — ตั้งเมื่อ Reserved; คงไว้เป็นประวัติเมื่อ Consumed/Refunded; ล้างเมื่อ restore |
| `RESERVED_AT_UTC` / `CONSUMED_AT_UTC` / `SETTLED_AT_UTC` | timestamptz(3) | yes | `SETTLED` = ตอน Expired / Refunded-โดยไม่ผ่าน booking (admin) |
| `ROW_VERSION` | bytea | no | |
Index/constraint: `PK_TUTOR_PACKAGE_CREDITS` · **UQ** `UQ_PACKAGE_CREDITS_PURCHASE_SEQ` (`PACKAGE_PURCHASE_ID`,`SEQ_NO`) · **UQ partial** `UQ_PACKAGE_CREDITS_BOOKING` (`BOOKING_ID`) `HasFilter("\"BOOKING_ID\" IS NOT NULL")` · `IX_PACKAGE_CREDITS_PURCHASE_STATUS` (`PACKAGE_PURCHASE_ID`,`STATUS`,`SEQ_NO`) · CHECK `CK_PACKAGE_CREDITS_BOOKING_STATE` ((`STATUS` NOT IN ('Available','Expired') OR `BOOKING_ID` IS NULL) AND (`STATUS` NOT IN ('Reserved','Consumed') OR `BOOKING_ID` IS NOT NULL)) · CHECK `CK_PACKAGE_CREDITS_GROSS` (`GROSS_AMOUNT` >= 0)

### 2.4 FK บนตารางเดิม (อยู่ใน migration นี้)
`FK_TUTOR_BOOKINGS_PACKAGE_PURCHASES` (`TUTOR_BOOKINGS.PACKAGE_PURCHASE_ID` → `PACKAGE_PURCHASES`, NoAction) · `FK_REFUNDS_PACKAGE_PURCHASES` (`REFUNDS.PACKAGE_PURCHASE_ID` → `PACKAGE_PURCHASES`, NoAction) · index `IX_TUTOR_BOOKINGS_PACKAGE_PURCHASE` (`PACKAGE_PURCHASE_ID`) `HasFilter("\"PACKAGE_PURCHASE_ID\" IS NOT NULL")`

### 2.5 State machines (domain method เท่านั้น; transition ผิด ⇒ `InvalidOperationException`; unit test ทุกคู่)
- **Purchase:** `PendingPayment→Active` (`Activate`) · `PendingPayment→Cancelled` (`CancelPending`: ผู้ใช้ยกเลิก/หมด `PENDING_EXPIRES`) · `Cancelled→Active` (`ReactivateAfterLatePayment` — เฉพาะ §5.3 R-P2) · `Active→Exhausted` (เครดิตที่จองได้หมด: `USED == TOTAL`) · `Exhausted→Active` (restore คืนเครดิต ขณะยังไม่หมดอายุ) · `Active→Expired` (job §6.1) · อื่น ๆ ห้าม
- **Credit:** `Available→Reserved` (`Reserve`) · `Reserved→Available` (`Restore`) · `Reserved→Consumed` (`Consume`) · `Reserved|Consumed→Refunded` (`MarkRefunded`) · `Available→Expired` (`Expire`) · `Available→Refunded` (`RefundUnused`, admin) · อื่น ๆ ห้าม
- `SESSIONS_USED` เปลี่ยนเมื่อ: `Available→Reserved` +1 · `Reserved→Available` −1 · `Available→Expired` +1 · `Available→Refunded` +1 · transition อื่นของเครดิตไม่เปลี่ยน

---

## 3. Config — `TutoringPackageOptions` (`Tutoring:Packages`, `IValidateOptions` + `ValidateOnStart`; placeholder ใน appsettings ของ Api **และ** Workers)

| Key | Default | ช่วง / หมายเหตุ |
|---|---|---|
| `MinSessionCount` / `MaxSessionCount` | 2 / 30 | 2–100, Min ≤ Max |
| `MaxDiscountPercent` | 50 | 0–90 |
| `MinValidDays` / `DefaultValidDays` / `MaxValidDays` | 7 / 90 / 365 | Min ≤ Default ≤ Max |
| `MaxActivePackagesPerTutor` | 20 | 1–100 |
| `PendingPurchaseMinutes` | 30 | 5–240 (ช่วงให้จ่ายหลังกดซื้อ; ไม่ล็อกเวลาของใคร — ต่างจาก hold ของ booking) |
| `MaxOpenPendingPurchasesPerUser` | 3 | 1–10 |
| **`ExpiredCreditSettlement`** | **`ReleaseToTutor`** | `ReleaseToTutor` \| `RefundLearner` — ดู §6.3 และ Open decision #1 |
| `ExpiryReminderDays` | 7 | 0 = ปิด, 1–30 |
| `ExpiryBatchSize` | 50 | 1–200 |
| *(ใช้จาก config อื่น)* | | `Tutoring:Cancellation:PackageTutorFaultRemedy` (P13-08), `Tutoring:DefaultCommissionPercent`, `Tutoring:Profile:MinChargeAmount`, `Tutoring:Slots:AllowedDurationsMinutes`, min-notice/max-advance ต่อติวเตอร์ (P13-05 ข้อ 7), `Tutoring:Payment:*` (P13-06) |

กฎคงที่ ไม่ใช่ config: **คลาสที่จองด้วยเครดิตต้อง "เริ่ม" ก่อน `EXPIRES_AT_UTC`** (§7 ข้อ 4)

---

## 4. คณิตศาสตร์ (pure — `Siri.Modules.Tutoring.Domain.Pricing.PackagePricing` / `CreditAllocation`; unit test ทุกเวกเตอร์)

### 4.1 ราคาแพ็กเกจ
```
single = TutorPriceCalculator.Quote(offering, SessionFormat.OneOnOne, durationMinutes, isTrial: false, minChargeAmount).Amount   // P13-03 §4 (5 อาร์กิวเมนต์; minChargeAmount = Tutoring:Profile:MinChargeAmount) — ล้ม ⇒ ส่ง reason ต่อ (format_not_offered / price_below_minimum)
total  = Round(single × sessionCount × (1 − discountPercent / 100), 2, MidpointRounding.AwayFromZero)
perSessionAfterDiscount = Round(single × (1 − discountPercent / 100), 2, AwayFromZero)           // ใช้ตรวจ MinChargeAmount
```
validator: `perSessionAfterDiscount ≥ Tutoring:Profile:MinChargeAmount` (ไม่งั้น 400 `tutoring.package_price_below_minimum`) · `total` ต้องไม่เกิน `decimal(18,2)` (ปฏิเสธที่ validator ไม่ให้ overflow)
เวกเตอร์: (450.00, 60 นาที, 10 ครั้ง, 10%) ⇒ single 450.00 ⇒ **4050.00** · (333.33, 30, 7, 12.5%) ⇒ single 166.67 ⇒ 1166.69 × 0.875 = 1020.85375 ⇒ **1020.85** · (450.00, 60, 4, 0%) ⇒ **1800.00** · (100.00, 30, 2, 50%) ⇒ single 50.00 ⇒ total **50.00**, perSession 25.00

### 4.2 การจัดสรรต่อครั้ง (ทั้งยอดเงินและค่าธรรมเนียม) — `CreditAllocation.Slice(total, count, seqNo)` (seqNo เริ่ม 1)
```
cents = total × 100 (ต้องเป็นจำนวนเต็ม) ; baseCents = cents / count ; rem = cents % count
slice(seqNo) = (baseCents + (seqNo ≤ rem ? 1 : 0)) / 100      // เศษสตางค์กระจายทีละ 1 ให้ครั้งแรก ๆ ⇒ ต่างกันไม่เกิน 0.01 และ Σ = total เป๊ะ
```
เวกเตอร์: 3000.00 ÷ 7 ⇒ ครั้ง 1 = **428.58**, ครั้ง 2–7 = **428.57** (Σ = 3000.00) · 1020.85 ÷ 7 ⇒ ครั้ง 1–4 = **145.84**, ครั้ง 5–7 = **145.83** (Σ = 1020.85) · ค่าธรรมเนียม 81.00 ÷ 7 ⇒ ครั้ง 1 = **11.58**, ที่เหลือ **11.57** (Σ = 81.00) · 1000.00 ÷ 3 ⇒ 333.34 / 333.33 / 333.33 · property test: สุ่ม total (สตางค์) และ count ⇒ Σ slices == total, max−min ≤ 0.01, ทุกตัว ≥ 0
ค่าธรรมเนียมต่อครั้ง = `CreditAllocation.Slice(payment.STRIPE_FEE_AMOUNT, N, seqNo)` (ใช้ seqNo เดิมของเครดิตนั้น) · fee ว่าง (ยังไม่ทราบ) ⇒ ส่ง `null` ให้ Payout ประมาณเอง (`Payout:EstimatedPaymentFeePercent`) แล้ว `PackageFeeReviser` (§6.2) ปรับเป็นค่าจริงภายหลัง

---

## 5. Services และพฤติกรรม

### 5.1 ซื้อแพ็กเกจ + จ่ายเงิน

**`PackagePurchaseService.CreateAsync(learnerUserId, packageId, learnerProfileId)`** → `POST /api/tutoring/packages/{packageId}/purchase` (body `PurchasePackageRequest(Guid LearnerProfileId)`):
1. `package + offering + tutor` ใน query เดียว: `WHERE PACKAGE_ID=@p AND IS_ACTIVE AND offering.IS_ACTIVE AND tutor.STATUS='Verified' AND tutor.IS_LISTED` ไม่พบ ⇒ 404 `tutoring.package_not_found` (ข้อความเดียวกันทุกเหตุ)
2. learner profile: `WHERE LEARNER_PROFILE_ID=@lp AND OWNER_USER_ID=@caller AND IS_ACTIVE` ไม่พบ ⇒ 404 `tutoring.learner_profile_not_found` · `tutor.USER_ID == caller` ⇒ 409 `tutoring.cannot_book_self`
3. idempotent: มี purchase `PendingPayment` ที่ยังไม่หมด (`PENDING_EXPIRES_AT_UTC > now`) ของ (caller, package, learnerProfile) ⇒ คืน 200 อันเดิม · นับ pending ที่ยังไม่หมดของ caller ≥ `MaxOpenPendingPurchasesPerUser` ⇒ 409 `tutoring.too_many_pending_purchases`
4. ราคา = §4.1 จาก offering **ปัจจุบัน** (ไม่รับจาก client) ⇒ INSERT `PACKAGE_PURCHASE` (`PendingPayment`, snapshot ทั้งหมด, `PENDING_EXPIRES = now + PendingPurchaseMinutes`) — **ไม่มี Stripe call ที่นี่** ⇒ 201 `PackagePurchaseSummary` (`requiresPayment=true`) แล้ว FE เรียก `POST /api/tutoring/package-purchases/{purchaseId}/payment`
5. audit `tutoring.package.purchase_created` (ids + ยอด)

**`POST /api/tutoring/package-purchases/{purchaseId:guid}/payment`** = `TutoringPaymentService.CreateForPackageAsync(callerUserId, purchaseId, method)` (body `CreateTutoringPaymentRequest`; **response 201 (ความพยายามใหม่) / 200 (คืนความพยายามเดิมที่ยัง Pending วิธีเดียวกัน) = `TutoringPayment` ของ P13-06 §10** โดย `kind='Package'`, `referenceId=purchaseId`, `holdExpiresAtUtc=PENDING_EXPIRES_AT_UTC`, `Cache-Control: no-store`; error ชุดเดียวกับ P13-06 §5.2 โดยแทน booking ด้วย purchase; rate limit `tutoring-booking`) — ใช้ `CreatePaymentCoreAsync` (§0.2 ข้อ 4) ด้วย subject:
- ownership: `WHERE PACKAGE_PURCHASE_ID=@id AND LEARNER_USER_ID=@caller` (ไม่ lock) ⇒ ไม่พบ/ไม่ใช่ของฉัน ⇒ 404 `tutoring.package_purchase_not_found`
- ต้อง `PendingPayment` ∧ `now < PENDING_EXPIRES_AT_UTC` ไม่งั้น 409 `tutoring.package_purchase_expired` (สถานะ `Active/Exhausted/Expired` ⇒ 409 `tutoring.already_paid`)
- ยอด = `PRICE_SNAPSHOT` · `KIND=Package`, `REF_ID=purchaseId` · idempotency key `tutoring:pay:package:{purchaseId:N}:{attemptNo}` · metadata `kind=tutoring_booking`, `payKind=Package`, `referenceId=purchaseId` · `OrderNo`/description ใช้ `PKG-{purchaseId:N first 8}` (ไม่มี PII) · จำกัดความพยายาม `MaxAttemptsPerBooking` (P13-06) ต่อ purchase
- **ไม่ตั้ง `PAYMENT_ID` บน purchase ตอนสร้าง** (ความพยายามหลายครั้งได้; ตั้งตอน activate) · response ใช้ `holdExpiresAtUtc = PENDING_EXPIRES_AT_UTC` (FE นับถอยหลังเหมือน booking)

**`POST /api/tutoring/package-purchases/{purchaseId:guid}/cancel`** (เฉพาะ `PendingPayment`): `CancelPending` ⇒ `Cancelled`; หลัง commit `CancelPendingIntentsAsync(Package, purchaseId)` (best-effort) · **response 200 `PackagePurchaseSummary`** (`status=Cancelled`, `requiresPayment=false` — ไม่ใช่ 204 เพราะ FE ต้องสถานะใหม่ไปแทนการ์ดทันที) · **idempotent:** `Cancelled` อยู่แล้ว (ดับเบิลคลิก/job หมดเวลาตัดหน้า) ⇒ 200 body เดิม · `Active`/`Exhausted`/`Expired` ⇒ 409 `tutoring.package_purchase_not_cancellable` (ext `purchaseStatus`) — แพ็กเกจที่ `Active` แล้ว **ผู้เรียกยกเลิกเองไม่ได้** (v1) · ownership 404 `tutoring.package_purchase_not_found`

### 5.2 `IPackageCreditService` (Application, ภายในโมดูล Tutoring; **P13-12 ประกาศ+implement**, P13-08 เป็นผู้เรียก)
```csharp
public enum CreditRestoreOutcome { Restored, PurchaseExpired, NotPackageBooking, AlreadyRestored }
public interface IPackageCreditService
{
    /// FOR UPDATE บนแถว purchase (tracked, ค่าสดหลังล็อก). ต้องเรียกก่อน LockPaymentAsync (F8) ในทุกเส้นที่แตะ booking ที่ PACKAGE_PURCHASE_ID <> null.
    Task LockPurchaseAsync(Guid packagePurchaseId, CancellationToken ct);

    /// Reserved → Available ; ใน txn ของผู้เรียก (ผู้เรียกถือ lock session+booking+purchase แล้ว — ไม่งั้นโยน). booking ไม่ใช่แพ็กเกจ ⇒ NotPackageBooking.
    /// เครดิตกลับเฉพาะเมื่อ purchase.STATUS ∈ {Active, Exhausted} ∧ EXPIRES_AT_UTC > nowUtc (SQL-4a) — มิฉะนั้น PurchaseExpired:
    /// เครดิตไม่ถูกแตะ; ผู้เรียก (P13-08 §8 ข้อ 7) ต้อง refund เงินของ slice (booking.PRICE_AMOUNT) แทน แล้วเรียก MarkCreditRefundedAsync.
    /// เครดิตกลับมา Available แล้ว (BOOKING_ID ว่าง) ⇒ AlreadyRestored (idempotent). เครดิตเป็น Consumed/Refunded ⇒ InvalidOperationException (บั๊กผู้เรียก).
    Task<Result<CreditRestoreOutcome>> RestoreCreditAsync(Guid bookingId, CancellationToken ct);

    /// Reserved → Consumed (เสร็จคลาส / learner no-show / ยกเลิกช้า). Consumed หรือ Refunded แล้ว ⇒ Success no-op.
    Task<Result> ConsumeCreditAsync(Guid bookingId, CancellationToken ct);

    /// Reserved|Consumed → Refunded (คืนเงินของส่วนนั้นแล้ว: dispute / PurchaseExpired fallback). Refunded แล้ว ⇒ Success no-op. SESSIONS_USED คงเดิม.
    Task<Result> MarkCreditRefundedAsync(Guid bookingId, CancellationToken ct);
}
```
ผู้เรียก P13-08/P13-10: ทุกเมธอด **join transaction ของผู้เรียก** (`ITutoringUnitOfWork`), ไม่ `SaveChanges` เอง (ยกเว้น flush ที่มากับ `RecordAuditAsync` ซึ่งปลอดภัยเพราะอยู่ใน txn), ไม่มี Stripe/HTTP, เขียน `SECURITY_AUDIT` (`tutoring.package.credit_restored|credit_consumed|credit_refunded`) โดยถือว่า audit flush ทุกอย่างที่ tracked (P13-08 F5) — เรียกหลังงานของตัวเองพร้อมแล้ว และ**ไม่ใช่ขั้นสุดท้ายของ flow ผู้เรียก** · หลัง transition: `RecomputePurchaseStatus` (Exhausted↔Active ตาม F9/§2.5)

### 5.3 `PackagePurchaseService.ConfirmPaidAsync` — flow ยืนยันการจ่ายของแพ็กเกจทั้งหมด (P13-06 §6.2 ข้อ 0 ส่งต่อมาที่นี่; **ทั้งหมดใน txn ของ webhook; THROWS เมื่อ infra/ledger ล้ม**)
`Task<PaymentFulfillmentOutcome> ConfirmPaidAsync(ConfirmPaidCommand command, CancellationToken ct)` (record ของ P13-06 §6.2; `Code` → `ProcessResult = "tutoring.payment.{Code}"`)

0. `payment` อ่านไม่ lock ด้วย `PROVIDER_PAYMENT_INTENT_ID`; `purchaseId = payment.REF_ID`; อ่าน purchase ไม่ lock — ไม่พบ หรือ `purchase.LEARNER_USER_ID <> payment.OWNER_USER_ID` ⇒ ไปข้อ 4 แถว R-P6
1. **lock ตาม F8: `LockPurchaseAsync(purchaseId)` → `LockPaymentAsync(paymentId)`** · อ่านสถานะซ้ำ · `payment.STATUS ∈ {Succeeded, PartiallyRefunded, Refunded}` ⇒ `Code="already_succeeded"` (no-op)
2. ตรวจยอด: `command.AmountReceived == payment.AMOUNT == purchase.PRICE_SNAPSHOT` และ `Currency == "thb"` มิฉะนั้น ⇒ `payment.MarkSucceeded` (เงินเข้าจริง) + `LATE_RESOLUTION=Refunded` + `TutoringRefundService.RequestAsync(Reason=AmountMismatch, PaymentId, BookingId=null, PackagePurchaseId, Amount=min(AmountReceived, payment.AMOUNT))` ตามตาราง P13-08 §6.1 + audit `tutoring.payment.amount_mismatch` ⇒ `Code="amount_mismatch_refunded"` (purchase ไม่ถูกแตะ)
3. **ค่าธรรมเนียม (D-B: ไม่เรียก HTTP ภายนอกใน txn ของ webhook — แก้ข้อ 10):** `payment.MarkSucceeded(paidAt, fee: null, isEstimate: true)` — **ไม่ดึง fee ที่นี่** (P13-06 §6.2 ข้อ 3–4 / §6.8); `STRIPE_FEE_AMOUNT` คง null จน job `tutoring-payment-reconcile` ข้อ 3 เรียก `PackageFeeReviser` (§6.2) เติมค่าจริง · เครดิตที่ถูกใช้ก่อนหน้านั้นส่ง `PaymentFeeAmount=null` ให้ Payout ประมาณเอง แล้ว reviser ปรับด้วย slice
4. แตกตาม `purchase.STATUS` ที่ lock แล้ว:

| # | `purchase.STATUS` | เงื่อนไขเพิ่ม | การกระทำ | `LATE_RESOLUTION` / Code |
|---|---|---|---|---|
| R-P1 | `PendingPayment` (แม้ `PENDING_EXPIRES_AT_UTC` เลยแล้วแต่ job ยังไม่ทำงาน) | tutor `Verified` ∧ offering `IS_ACTIVE` (**ไม่สน** `package.IS_ACTIVE` — เคารพคำสั่งซื้อที่เปิดไว้ก่อนติวเตอร์ปิดแพ็กเกจ) | **Activate** | — / `package_activated` |
| R-P1x | `PendingPayment` | tutor ไม่ Verified หรือ offering ปิด | **Refund 100%** (`LatePayment`) + purchase → `Cancelled` | `Refunded` / `package_refunded_unavailable` |
| R-P2 | `Cancelled` | package `IS_ACTIVE` ∧ tutor `Verified` ∧ offering `IS_ACTIVE` | **Reactivate + Activate** (ใช้ `PRICE_SNAPSHOT` เดิม — ไม่ขึ้นกับราคาใหม่) | `Reopened` / `package_reopened_activated` |
| R-P3 | `Cancelled` | เงื่อนไข R-P2 ไม่ครบ | **Refund 100%** (`LatePayment`) | `Refunded` / `package_refunded_late` |
| R-P4 | `Active`/`Exhausted`/`Expired` ด้วย `PAYMENT_ID == payment.PAYMENT_ID` | | no-op | — / `package_already_active` |
| R-P5 | `Active`/`Exhausted`/`Expired` ด้วย payment อื่น | จ่ายซ้ำ | **Refund 100%** (`DuplicatePayment`) | `Duplicate` / `package_refunded_duplicate` |
| R-P6 | purchase ไม่พบ / เจ้าของไม่ตรง | | `MarkSucceeded` + `LATE_RESOLUTION=Refunded` + Refund 100% (`AmountMismatch`) + audit `tutoring.payment.orphan_unmatched` | `Refunded` / `package_refunded_orphan` |

   Refund ทั้งหมดผ่าน `TutoringRefundService.RequestAsync(new RequestRefundCommand(PaymentId: payment.PAYMENT_ID, BookingId: null, PackagePurchaseId: purchaseId, Amount: payment.AMOUNT, Reason: LatePayment | DuplicatePayment | AmountMismatch, IdempotencySuffix: null, …))` ตามตาราง P13-08 §6.1 / สเปค P13-06 §6.3 (key `refund:p{paymentId:N}:{Reason}`; **`Result.IsFailure` ⇒ throw** ให้ webhook rollback) ใน txn นี้ — ส่ง Stripe ภายหลังโดย job ของ P13-08 §6.5 (ไม่เรียก Stripe ใน webhook)
5. **Activate:** `TUTOR_SHARE_PERCENT = 100 − (tutor.COMMISSION_PERCENT_OVERRIDE ?? DefaultCommissionPercent)` · `STATUS=Active`, `PAYMENT_ID=payment.PAYMENT_ID`, `ACTIVATED_AT_UTC=paidAt`, `EXPIRES_AT_UTC = paidAt + VALID_DAYS`, ล้าง `PENDING_EXPIRES_AT_UTC`, `SESSIONS_USED=0` · INSERT `SESSIONS_TOTAL` เครดิต `Available` (`GROSS_AMOUNT = Slice(PRICE_SNAPSHOT, N, seq)`) · **ไม่เรียก Payout** (F4) · stage อีเมล+in-app ผู้เรียก (`tutoring-package-purchased`: จำนวนครั้ง/วันหมดอายุ/ชื่อเล่นผู้เรียน) + ติวเตอร์ (`tutoring-package-sold`: ชื่อเล่น+ระดับชั้นเท่านั้น) · audit `tutoring.package.activated` (ขั้นสุดท้ายก่อน commit)
6. คืน `PaymentFulfillmentOutcome(Code, RefundId?)`

### 5.4 SQL ที่ต้องใช้ตรงตัว (`ExecuteSqlInterpolatedAsync`/`FromSqlInterpolated` ใน txn เดียวกับ `AppDbContext`; identifier + alias ใน double quote; `ROT` = นิพจน์หมุน token ตาม F6)
```sql
-- SQL-1  gate ของ purchase (atomic ; ล็อกแถว purchase ไว้จนจบ txn ⇒ คำขอพร้อมกันของ purchase เดียวต่อคิวกัน). rows=1 = ผ่าน. พลิกเป็น Exhausted ในคำสั่งเดียวเมื่อเป็นใบสุดท้าย
UPDATE "TUTORING"."PACKAGE_PURCHASES"
SET "SESSIONS_USED" = "SESSIONS_USED" + 1,
    "STATUS" = CASE WHEN "SESSIONS_USED" + 1 = "SESSIONS_TOTAL" THEN 'Exhausted' ELSE "STATUS" END,
    "UPDATED_AT_UTC" = {now}, "ROW_VERSION" = ROT
WHERE "PACKAGE_PURCHASE_ID" = {purchaseId} AND "LEARNER_USER_ID" = {userId} AND "STATUS" = 'Active'
  AND "EXPIRES_AT_UTC" > {now} AND "SESSIONS_USED" < "SESSIONS_TOTAL";

-- SQL-2  เลือกเครดิตถัดไป (ล็อกแถว) — SELECT แยก ไม่ใช้ UPDATE…RETURNING/FromSql ที่ EF อาจห่อเป็น subquery
SELECT "CREDIT_ID","SEQ_NO","GROSS_AMOUNT" FROM "TUTORING"."TUTOR_PACKAGE_CREDITS"
WHERE "PACKAGE_PURCHASE_ID" = {purchaseId} AND "STATUS" = 'Available' ORDER BY "SEQ_NO" LIMIT 1 FOR UPDATE;

-- SQL-3  ผูกกับ booking (หลัง INSERT booking — FK ต้องมีแถวแล้ว) rows ต้อง = 1 ไม่งั้นโยน
UPDATE "TUTORING"."TUTOR_PACKAGE_CREDITS"
SET "STATUS" = 'Reserved', "BOOKING_ID" = {bookingId}, "RESERVED_AT_UTC" = {now}, "ROW_VERSION" = ROT
WHERE "CREDIT_ID" = {creditId} AND "STATUS" = 'Available';

-- SQL-4a restore ฝั่ง purchase (ลองก่อน; rows=0 ⇒ PurchaseExpired และ *ห้ามแตะเครดิต*)
UPDATE "TUTORING"."PACKAGE_PURCHASES"
SET "SESSIONS_USED" = "SESSIONS_USED" - 1,
    "STATUS" = CASE WHEN "STATUS" = 'Exhausted' THEN 'Active' ELSE "STATUS" END,
    "UPDATED_AT_UTC" = {now}, "ROW_VERSION" = ROT
WHERE "PACKAGE_PURCHASE_ID" = {purchaseId} AND "STATUS" IN ('Active','Exhausted')
  AND "EXPIRES_AT_UTC" > {now} AND "SESSIONS_USED" > 0;
-- SQL-4b restore ฝั่งเครดิต (หลัง 4a สำเร็จ) rows ต้อง = 1 ไม่งั้นโยน (rollback ทั้งก้อน)
UPDATE "TUTORING"."TUTOR_PACKAGE_CREDITS"
SET "STATUS" = 'Available', "BOOKING_ID" = NULL, "RESERVED_AT_UTC" = NULL, "ROW_VERSION" = ROT
WHERE "BOOKING_ID" = {bookingId} AND "STATUS" = 'Reserved';
```
- ห้ามโหลด purchase/credit เข้า change tracker ก่อน raw UPDATE ในธุรกรรมเดียวกันแล้วเซฟต่อ (entity ค้างเก่า) — `AsNoTracking` หรือ `Reload` หลัง UPDATE (P13-05 §5.3)
- ถ้า SQL-1 ได้ rows=0 ⇒ อ่านซ้ำเพื่อแยกเหตุ (ในธุรกรรมเดียวกัน) ⇒ ไม่ใช่ของผู้เรียก/ไม่มี ⇒ 404 `package_purchase_not_found`; `STATUS≠Active` ⇒ 409 (`package_not_active`/`package_expired`/`package_no_credit` ตามสถานะ); `EXPIRES<=now` ⇒ 409 `package_expired`; `USED=TOTAL` ⇒ 409 `package_no_credit`
- SQL-2 ไม่พบแถวทั้งที่ SQL-1 ผ่าน ⇒ ละเมิด invariant F9 ⇒ `InvalidOperationException` (rollback, 500, log Error — **ห้ามกลืน**)

### 5.5 วงจรเครดิตตามเหตุการณ์ของ booking (ตารางเดียว — สอดคล้อง `CancellationPolicy` ของ P13-08 §3.1)

| เหตุการณ์ของ booking ที่ใช้เครดิต | เครดิต | `SESSIONS_USED` | เงิน (Payout/Stripe) |
|---|---|---|---|
| จองสำเร็จ (§7) | `Available→Reserved` (SQL-3) | +1 (SQL-1) | `RecordTutoringSplit(ref=bookingId, gross=slice, fee=SliceFee, share=TUTOR_SHARE_PERCENT)` Held |
| ผู้เรียกยกเลิก ≥24 ชม. | `Reserved→Available` (SQL-4) | −1 | `ReverseBySource` เต็ม (rows→Reversed); ไม่มี Stripe |
| ผู้เรียกยกเลิก <24 ชม. | `Reserved→Consumed` | คง | refund **50% ของ slice** (Stripe partial refund บน payment ของแพ็กเกจ, `LearnerCancelLate`) + ledger ลดตาม P13-07 + ScheduleRelease ส่วนที่ไม่คืน |
| ติวเตอร์ยกเลิก / ติวเตอร์ no-show / ไม่มีใครมา | ตาม `PackageTutorFaultRemedy`: **`RestoreCredit` (default)** `Reserved→Available` −1 + ReverseBySource เต็ม · `RefundMoney` `Reserved→Refunded` + refund 100% ของ slice | | ถ้า `RestoreCreditAsync` ตอบ `PurchaseExpired` ⇒ ใช้ **Money refund 100% ของ slice** (ผู้เรียกไม่ผิด จึงไม่ควรเสียเงินเพราะแพ็กเกจหมดอายุพอดี) แล้ว `MarkCreditRefundedAsync` |
| ผู้เรียก no-show | `Reserved→Consumed` | คง | ScheduleRelease (ไม่คืน) |
| จบคลาส | `Reserved→Consumed` | คง | ScheduleRelease (completed + DisputeWindow) |
| dispute → FullRefund | `Consumed→Refunded` (`MarkCreditRefundedAsync`) | คง | refund เงินส่วนที่เหลือของ slice |
| dispute → Partial | คงสถานะ | คง | refund ตามจำนวน |
| (admin) refund-unused | `Available→Refunded` | +1 | refund Σ slice ของเครดิตที่ `Available` (§5.7) |
| หมดอายุ (job) | `Available→Expired` หรือ `Available→Refunded` | +1 | ตาม `ExpiredCreditSettlement` (§6.3) |

หลังทุก transition ของเครดิต: `RecomputePurchaseStatus` — `USED == TOTAL` ⇒ `Exhausted`; `Exhausted` ที่ `USED < TOTAL` และ `EXPIRES > now` ⇒ `Active` (SQL-1/4a ทำให้ในคำสั่งเดียวอยู่แล้ว; เส้น admin/job ทำผ่าน domain method)

### 5.6 การอ่านและ endpoint (base `/api/tutoring`; ทุก action ใส่ `[Authorize]`/`[AllowAnonymous]` ชัดเจน)
**สาธารณะ:** `GET tutors/{slug}/packages` — `[AllowAnonymous]` · `tutoring-search` (IP) · เฉพาะติวเตอร์ Verified+Listed (ไม่งั้น 404 `tutoring.tutor_not_found` ตัวเดียวกับ P13-04) · **response 200 = array ธรรมดา `PackageOffer[]` (ไม่ใช่ `PagedResult`)** — มีเพดาน `MaxActivePackagesPerTutor` (20) แพ็กเกจ/ติวเตอร์ จึงไม่แบ่งหน้า; ไม่มีแพ็กเกจ = `[]` 200; เรียง `SESSION_COUNT` ↑ แล้ว `DURATION_MINUTES` ↑ · คืนเฉพาะแพ็กเกจ `IS_ACTIVE` ที่ offering active (ราคา = §4.1 คำนวณสด; ไม่ cache ฝั่ง server ใน v1 เพราะแพ็กเกจ/อัตราเปลี่ยนต้องเห็นทันที) · ไม่คืน `tutorId`/commission/จำนวนที่ขายได้
**ผู้เรียก** (`[Authorize]`, `tutoring-user` ยกเว้น purchase/payment/booking ที่ใช้ `tutoring-booking`; ownership ใน WHERE เดียว ไม่ใช่ ⇒ 404 `tutoring.package_purchase_not_found`):
`POST packages/{packageId}/purchase` (§5.1) · `POST package-purchases/{purchaseId}/payment` · `POST package-purchases/{purchaseId}/cancel` · **`POST package-purchases/{purchaseId}/bookings` (§7)** · `GET packages/my?status=&page=1&pageSize=20` (**200 `PagedResult<PackagePurchaseSummary>`**; pageSize ≤50; เรียง `CREATED_AT_UTC` ใหม่→เก่า; `status` กรองได้หลายค่าคั่น comma) · `GET package-purchases/{purchaseId}` (**200 `PackagePurchaseDetail`** + รายการเครดิต: seq/สถานะ/`bookingId`/`sessionStartsAtUtc` — ผู้เรียกเห็นของตัวเองเท่านั้น)
**ติวเตอร์** (`[Authorize(Policy = AuthorizationPolicyNames.TutorOnly)]`, `tutoring-user`; ownership = `TUTOR_ID` ของโปรไฟล์ที่ `USER_ID = caller` ใน WHERE): `GET tutor/packages?includeInactive=true&page=1&pageSize=20` (**200 `PagedResult<TutorPackage>`**; pageSize ≤50; เรียง `CREATED_AT_UTC` ใหม่→เก่า; `includeInactive` default true เพราะหน้า Tutor Portal ต้องเห็นแพ็กเกจที่ปิดแล้ว) · `POST tutor/packages` (`UpsertPackageRequest` ⇒ **201 `TutorPackage`**) · `PUT tutor/packages/{packageId}` (แก้ได้เฉพาะ `discountPercent`/`validDays`/`isActive`; **เปลี่ยน `sessionCount`/`durationMinutes`/`offeringId` ไม่ได้** — สร้างแพ็กเกจใหม่แทน; body เป็น `UpsertPackageRequest` เดียวกัน โดยฟิลด์ที่เปลี่ยนไม่ได้ต้องตรงกับค่าเดิม ไม่งั้น 400 `tutoring.package_immutable_field` ⇒ **200 `TutorPackage`**; ชน concurrency ⇒ 409 `tutoring.concurrent_update`) · `POST tutor/packages/{packageId}/deactivate` (**200 `TutorPackage`** ที่ `isActive=false`; ปิดอยู่แล้ว ⇒ 200 body เดิม — ไม่ใช่ 204 เพราะ FE ใช้ body อัปเดตการ์ด; ไม่ใช่ของฉัน/ไม่มี ⇒ 404 `tutoring.package_not_found`) · ติวเตอร์ **ไม่เห็น** ผู้ซื้อรายตัวนอกจากผ่านรายการ booking ปกติ (nickname/ระดับชั้น)
**admin** (`[Authorize(Policy = AuthorizationPolicyNames.AdminOnly)]`, `tutoring-user`): `GET admin/package-purchases?status=&tutorId=&needsReview=&page=` (`needsReview=true` ⇒ `STATUS='Active' AND EXPIRES_AT_UTC <= now` = หมดอายุแต่ยังไม่ปิดบัญชี) · `POST admin/package-purchases/{purchaseId}/refund-unused` (§5.7) · `POST admin/package-purchases/{purchaseId}/settle-expired` (§5.8)
`UpsertPackageRequest(Guid OfferingId, int SessionCount, int DurationMinutes, decimal DiscountPercent, int ValidDays, bool IsActive)` — validator: offering เป็นของ caller และ active และมี `HOURLY_RATE_ONE_ON_ONE` · ช่วงตาม §3 · ราคา §4.1 ผ่าน `MinChargeAmount` · `MaxActivePackagesPerTutor` (409 `tutoring.package_limit`) · ซ้ำรูป (UQ) ⇒ 409 `tutoring.package_duplicate_shape`
**Query/projection (กัน N+1 — รอบ 3):** `GET packages/my` และ `GET admin/package-purchases` = **query เดียวแบบ projection** `PACKAGE_PURCHASES p ⋈ TUTOR_PROFILES t (p.TUTOR_ID) ⋈ TUTOR_OFFERINGS o (p.OFFERING_ID) ⋈ SUBJECTS s ⋈ LEARNER_PROFILES l (p.LEARNER_PROFILE_ID)` `WHERE p.LEARNER_USER_ID=@caller [AND p.STATUS=@status]` (admin: ตามตัวกรอง) `ORDER BY p.CREATED_AT_UTC DESC` + `Skip/Take` + count (ใช้ `IX_PACKAGE_PURCHASES_LEARNER_STATUS`) — ทุกฟิลด์ของ `PackagePurchaseSummary` มาจากคอลัมน์ของ purchase หรือ join นี้: `creditsRemaining = SESSIONS_TOTAL − SESSIONS_USED` · `validDays = VALID_DAYS` · `discountPercent = DISCOUNT_PERCENT_SNAPSHOT` · `paymentId = PAYMENT_ID` (null จนกว่า Active) · `expiredPendingSettlement = STATUS='Active' ∧ EXPIRES_AT_UTC <= now` · `serverTimeUtc = IClock.UtcNow` ⇒ **ไม่เรียก detail ต่อการ์ด และไม่ query ต่อแถว** · `GET package-purchases/{id}` = projection เดียวกัน + `credits` ด้วยอีก query เดียว (`TUTOR_PACKAGE_CREDITS c LEFT JOIN TUTOR_BOOKINGS b LEFT JOIN TUTOR_SESSIONS ss WHERE c.PACKAGE_PURCHASE_ID=@id ORDER BY c.SEQ_NO`) · `GET tutor/packages` / `GET tutors/{slug}/packages` = projection `TUTOR_PACKAGES ⋈ TUTOR_OFFERINGS ⋈ SUBJECTS` เดียว แล้วคำนวณราคา §4.1 ในหน่วยความจำ (ไม่ query ต่อแพ็กเกจ) · admin list ใช้ `PagedResult<PackagePurchaseSummary>` ชนิดเดียวกัน (มีแค่ชื่อเล่นผู้เรียน ไม่มี PII อื่น)

### 5.7 admin refund-unused — `POST /api/tutoring/admin/package-purchases/{purchaseId:guid}/refund-unused`
Body `RefundUnusedPackageRequest(string Note /*3–500*/, Guid ClientRequestId)` · ล็อกตาม F8: purchase → credits → payment · `amount = Σ GROSS_AMOUNT` ของเครดิต `Available` (ไม่รวม `Reserved` — ต้องรอ booking นั้นจบ/ยกเลิก) · `amount = 0` ⇒ 409 `tutoring.package_nothing_to_refund` · `TutoringRefundService.RequestAsync(new RequestRefundCommand(PaymentId: purchase.PAYMENT_ID, BookingId: null, PackagePurchaseId: purchaseId, Amount: amount, Reason: AdminManual, IdempotencySuffix: ClientRequestId.ToString("N"), RequestedByUserId: null, DecidedByUserId: adminId, Note: note))` (cap กับ payment รวมตาม P13-08 §6.1 ข้อ 4) · เครดิตเหล่านั้น `Available→Refunded` (`SETTLED_AT_UTC=now`, `SESSIONS_USED += n`) · `RecomputePurchaseStatus` · audit `tutoring.package.refunded_unused` · **response 200 `AdminPackageSettlementResponse`** (ซ้ำ/ดับเบิลคลิก ⇒ key เดียวกัน ⇒ 200 ผลเดิม) · ใช้เมื่อ: ติวเตอร์ถูกระงับ/ถอนตัว, ผู้เรียกขอคืนกรณีพิเศษ, ข้อพิพาท
นโยบายเริ่มต้น (เจ้าของตัดสิน): **ไม่คืนเงินเครดิตที่เหลือหลังหมดอายุ**; ก่อนหมดอายุผู้เรียกยกเลิกรายครั้งตามกฎ §3.7 (ตาราง §5.5); **ผู้เรียกขอคืนเครดิตที่เหลือเป็นเงินเอง = ไม่มี endpoint ใน v1** (ต้องผ่าน admin) — ไม่มี config `AllowLearnerRefundUnused` (ไม่ทำ stub)

### 5.8 admin settle-expired — `POST /api/tutoring/admin/package-purchases/{purchaseId:guid}/settle-expired`
Body `SettleExpiredPackageRequest(string Decision /*ReleaseToTutor|RefundLearner*/, string Note /*3–500*/, Guid ClientRequestId)` · เฉพาะ purchase `Active ∧ EXPIRES_AT_UTC <= now` (ไม่งั้น 409 `tutoring.package_not_expired`) · ล็อกตาม F8 · ทำ §6.3 กับเครดิต `Available` ทุกใบตาม `Decision` (`ReleaseToTutor` ทำได้แม้ติวเตอร์ไม่ Verified — เป็นการตัดสินของ admin โดยตรง ⇒ ledger `ScheduleRelease(at = now)` ตามมติ D-A "ปล่อยทันทีเฉพาะ admin") · purchase → `Expired` · audit `tutoring.package.expiry_settled_by_admin` (decision, จำนวน — ไม่มี PII) · **response 200 `AdminPackageSettlementResponse`** (ซ้ำ/ดับเบิลคลิก ⇒ key ต่อเครดิตเดิม ⇒ 200 ผลเดิม) · ใช้กับกรณีที่ job ไม่ปล่อยเองเพราะติวเตอร์ไม่ Verified (§6.1 ข้อ 3)

---

## 6. หมดอายุ + job + fee

### 6.1 Job `tutoring-package-expiry` (`RecurringJobIds.TutoringPackageExpiry = "tutoring-package-expiry"`, `Cron.Hourly(10)`, `[DisableConcurrentExecution(timeoutInSeconds: 3000)]`; เพิ่มใน `RecurringJobIds.All` ตาม F12 ของ P13-06)
ต่อ **หนึ่ง DI scope + หนึ่ง transaction ต่อ purchase** (exception ของรายการหนึ่งไม่หยุดรายการอื่น; `ChangeTracker.Clear()` หลัง rollback; `DbUpdateConcurrencyException` ⇒ ข้ามรอบหน้า):
1. **pending หมดเวลา:** `PendingPayment ∧ PENDING_EXPIRES_AT_UTC <= now` (`IX_PACKAGE_PURCHASES_PENDING_EXPIRY`) ⇒ `CancelPending` ⇒ commit ⇒ `CancelPendingIntentsAsync(Package, purchaseId)` best-effort
2. **เตือนก่อนหมดอายุ:** `Active ∧ EXPIRES_AT_UTC > now ∧ EXPIRES_AT_UTC <= now + ExpiryReminderDays ∧ EXPIRY_REMINDER_SENT_AT_UTC IS NULL` (มีเครดิต `Available` เสมอเพราะ `Active`) ⇒ อีเมล+in-app (`tutoring-package-expiring`: เหลือกี่ครั้ง/วันหมดอายุ/ลิงก์จอง) + stamp (ใน txn เดียวกับ outbox)
3. **หมดอายุ:** `Active ∧ EXPIRES_AT_UTC <= now` (`IX_PACKAGE_PURCHASES_ACTIVE_EXPIRY`) ⇒ ล็อกตาม F8 (purchase → credits `SEQ_NO` ASC → payment) ⇒ **(มติรอบ 2) ถ้า `ExpiredCreditSettlement=ReleaseToTutor` และติวเตอร์ `STATUS <> Verified` ⇒ ไม่ปล่อยเอง:** ไม่แตะเครดิต/purchase (ค้าง `Active` ที่หมดอายุแล้ว — จองใหม่ไม่ได้เพราะ SQL-1 ตรวจ `EXPIRES_AT_UTC > now`; restore ได้ผล `PurchaseExpired`), ตั้ง `EXPIRY_BLOCKED_AT_UTC=now` (ครั้งแรก) + audit `tutoring.package.expiry_blocked_tutor_not_verified` + แจ้ง admin (in-app) ⇒ ขึ้น `GET admin/package-purchases?needsReview=true` ให้ admin ตัดสินด้วย `settle-expired` (§5.8) · job รอบถัดไปปิดบัญชีเองถ้าติวเตอร์กลับเป็น `Verified` · **ไม่งั้น** (ติวเตอร์ Verified, หรือโหมด `RefundLearner` ที่ไม่ขึ้นกับสถานะติวเตอร์) ⇒ ทุกเครดิต `Available` ปิดตาม §6.3 (`Expired` / `Refunded`; `SESSIONS_USED += n`) ⇒ purchase `Expired` · เครดิต `Reserved` **ไม่ถูกแตะ** (ตามชีวิตของ booking นั้น — คลาสเริ่มก่อน `EXPIRES` เสมอ; ยกเลิกทีหลังที่ `RestoreCreditAsync` ตอบ `PurchaseExpired` ⇒ Money refund ตาม §5.5)
- guard: payment ต้อง `Succeeded|PartiallyRefunded` และ `AMOUNT − REFUND_RESERVED_AMOUNT ≥ Σ GROSS ของเครดิตที่จะปิด` ไม่งั้นข้ามการปล่อย/คืน + audit `tutoring.package.expiry_skipped_inconsistent` + ตั้ง purchase `Expired` เฉยๆ (ให้ admin ตรวจ) — ไม่ throw วนทั้ง job
- ทุกรอบ idempotent (สถานะเครดิต + `ENTRY_KEY` ของ ledger + key ของ refund)

### 6.2 `PackageFeeReviser.ReviseAsync(Guid paymentId, CancellationToken ct)` — เรียกจาก P13-06 §6.7 ข้อ 3 เมื่อ `payment.KIND=Package ∧ STRIPE_FEE_IS_ESTIMATE=true`
1. **นอก transaction:** `realFee = IPaymentMethod.GetChargeFeeAsync(pi)` (ว่าง/ล้ม ⇒ ออก ลองรอบหน้า; ไม่ถือ lock ระหว่างเรียก Stripe)
2. transaction: ล็อกตาม F8 `LockPurchaseAsync(payment.REF_ID)` → `LockPaymentAsync` · อ่านซ้ำ `STRIPE_FEE_IS_ESTIMATE` (ไม่ใช่แล้ว ⇒ ออก) · `payment.SetFee(realFee, isEstimate:false, checkedAt:now)`
3. ต่อเครดิตของ purchase ที่มี split อยู่ — `Reserved|Consumed` (ref = `BOOKING_ID`) หรือ `Expired` (ref = `CREDIT_ID`): `ITutoringEscrowContract.ReviseFeeAsync(new ReviseTutoringFeeRequest(ref, $"fee:{ref:N}:{satang}", CreditAllocation.Slice(realFee, N, SEQ_NO)))` — outcome `NotFound`/`Reversed`/`NoChange` ⇒ ข้าม · `Refunded`/`Available` ⇒ ไม่มี split ⇒ ข้าม
4. เครดิตที่จะถูกใช้ภายหลังอ่าน `payment.STRIPE_FEE_AMOUNT` (ค่าจริงแล้ว) ตอนจอง (§7 ข้อ 14) จึงไม่ต้องปรับ
5. audit `tutoring.package.fee_revised` (ยอดรวม ไม่มี PII) · idempotent (entry key + สถานะ)

### 6.3 การปิดบัญชีเครดิตที่หมดอายุ (`Tutoring:Packages:ExpiredCreditSettlement`)
- **`ReleaseToTutor` (default):** ต่อเครดิตที่ `Available`: `RecordTutoringSplit(SourceRefId=creditId, InstructorProfileId=tutor.INSTRUCTOR_PROFILE_ID, Gross=GROSS_AMOUNT, PaymentFee=Slice(payment.STRIPE_FEE_AMOUNT, N, seq) | null, TutorSharePercent=TUTOR_SHARE_PERCENT, PaymentSucceededAtUtc=ACTIVATED_AT_UTC)` ⇒ `ScheduleRelease(creditId, AvailableAtUtc = now + Tutoring:DisputeWindowHours)` (มติ D-A สูตรเดียว: ไม่มีคลาสจึงไม่มี `ENDS` — ใช้ `decidedAt = now`; เปิดช่องให้ admin แทรกแซงภายในหน้าต่าง; ปล่อยทันทีเฉพาะ admin `settle-expired` §5.8) ⇒ เครดิต `Expired` (`SETTLED_AT_UTC`) · audit `tutoring.package.credit_expired_released` · แถว ledger ที่ `SOURCE_REF_ID` ไม่ใช่ booking ⇒ wallet ติดป้าย `sourceKind='PackageExpiry'` (P13-07 §8)
- **`RefundLearner`:** `TutoringRefundService.RequestAsync(new RequestRefundCommand(PaymentId: purchase.PAYMENT_ID, BookingId: null, PackagePurchaseId: purchaseId, Amount: GROSS_AMOUNT, Reason: PackageExpired, IdempotencySuffix: creditId.ToString("N"), …))` ⇒ เครดิต `Refunded` (ไม่บันทึก ledger — ไม่เคยบันทึก) · audit `tutoring.package.credit_expired_refunded` · อีเมลผู้เรียก (`tutoring-package-expired-refund`)
- เหตุผลของ default: นโยบายของเจ้าของ = "ไม่คืนหลังหมดอายุ" (ติวเตอร์ได้สงวนเวลาไว้ให้แล้ว; แพลตฟอร์มรับคอมมิชชันตามสูตร Q4 เหมือนคลาสที่เกิดขึ้น) — **ต้องให้เจ้าของ/นักบัญชียืนยัน** การรับรู้รายได้/ภาษีของเครดิตที่หมดอายุ (breakage) และข้อความใน ToS/หน้าซื้อ "หมดอายุแล้วไม่คืนเงิน"

---

## 7. จองด้วยเครดิต — `PackageBookingService.BookAsync(callerUserId, purchaseId, request)` → `POST /api/tutoring/package-purchases/{purchaseId:guid}/bookings`
`[Authorize]` · rate limit `tutoring-booking` · body `BookWithPackageRequest(DateTimeOffset StartsAtUtc)` (ไม่มี offering/ความยาว/โปรไฟล์/ราคา — มาจาก snapshot ของ purchase ทั้งหมด) · 201 `Booking` (status `Confirmed`, `requiresPayment=false`, `packagePurchaseId` ตั้งค่า) · 200 เมื่อ replay (ข้อ 11)

**Preflight (ไม่อยู่ใน transaction — อ่านอย่างเดียว; ใช้ตัวช่วยร่วมกับ P13-05 §5.1 ข้อ 2/4/5/7/8 ผ่าน `BookingPreflight` ถ้า P13-05 แยกไว้ — ถ้ายังไม่แยก ผู้ implement แยกเป็น refactor ที่ไม่เปลี่ยนพฤติกรรม P13-05 และครอบด้วยเทสต์ของ P13-05 เดิม):**
```
1. userId จาก IUserContext
2. startsAtUtc → .UtcDateTime ; วินาที=0 ms=0 ; นาทีท้องถิ่น (UTC+7) mod GridMinutes = 0                         → 400 tutoring.slot_not_on_grid
3. purchase = WHERE PACKAGE_PURCHASE_ID=@id AND LEARNER_USER_ID=@userId (ไม่ lock)                                 → 404 tutoring.package_purchase_not_found (ไม่มี/ไม่ใช่ของฉัน ข้อความเดียวกัน)
4. สถานะ : PendingPayment|Cancelled → 409 package_not_active ; Expired หรือ now >= EXPIRES → 409 package_expired ;
           Exhausted หรือ SESSIONS_USED = SESSIONS_TOTAL → 409 package_no_credit ;
           start >= EXPIRES_AT_UTC → 409 package_session_after_expiry (ext expiresAtUtc)
5. learner = WHERE LEARNER_PROFILE_ID = purchase.LEARNER_PROFILE_ID AND OWNER_USER_ID=@userId AND IS_ACTIVE          → 409 tutoring.learner_profile_inactive
6. offering+tutor = JOIN WHERE OFFERING_ID = purchase.OFFERING_ID AND offering.IS_ACTIVE AND offering มี HOURLY_RATE_ONE_ON_ONE AND **tutor.STATUS='Verified'** (**มติ D-C: ไม่ต้อง `IS_LISTED`** — ติวเตอร์ที่ซ่อนจากการค้นหาแต่ยัง Verified รับคลาสจากเครดิตที่ขายไปแล้วได้ เหมือน `TryReopenAsync` ของ P13-05; guard นี้อยู่ที่ P13-12 ก่อนเรียก `CreateFromPackage`; การ *ซื้อ* แพ็กเกจใหม่ (§5.1) ยังต้อง Verified+Listed)  → 409 tutoring.package_tutor_unavailable
7. tutor.USER_ID == userId → 409 tutoring.cannot_book_self
8. now = IClock ; start ≥ now + tutor.MIN_NOTICE_HOURS → 400 tutoring.slot_too_soon ; start ≤ now + MAX_ADVANCE_DAYS → 400 tutoring.slot_too_far
9. SlotCalculator.IsStartAvailable(Busy=[], durationMinutes = purchase.DURATION_MINUTES) ต้อง true                    → 409 tutoring.slot_unavailable
```
**Transaction (`ITutoringUnitOfWork.ExecuteInTransactionAsync`, ReadCommitted; สั้น — ไม่มี HTTP/Stripe/Google):**
```
10. session = TUTOR_SESSION.CreateHeld(tutor, offering, start, end = start + DURATION, bufferMinutes = tutor.BUFFER_MINUTES, OneOnOne, capacity 1, isTrial=false, clock) → INSERT + SaveChanges
    ← exclusion violation (23P01 EX_TUTOR_SESSIONS_NO_OVERLAP) ⇒ ปล่อยออกนอก txn → ข้อ 11
12. SQL-1 gate (§5.4) rows=0 ⇒ อ่านซ้ำแยกเหตุ ⇒ Result.Failure (ตามข้อความข้อ 4) ⇒ rollback ทั้งก้อน (รวม session ที่เพิ่ง insert)
13. SQL-2 เลือกเครดิตถัดไป (FOR UPDATE) → credit(CreditId, SeqNo, GROSS_AMOUNT)
14. sliceFee = payment.STRIPE_FEE_AMOUNT is null ? null : CreditAllocation.Slice(payment.STRIPE_FEE_AMOUNT, N, SeqNo) ;
    bookingNo = TB-… (P13-05 §6.3, retry ≤3 เมื่อชน UQ_TUTOR_BOOKINGS_NO) ;
    booking = TUTOR_BOOKING.CreateFromPackage(bookingNo, session.SESSION_ID, tutor.TUTOR_ID, userId, purchase.LEARNER_PROFILE_ID, purchaseId, purchase.PAYMENT_ID, credit.GROSS_AMOUNT, clock) → INSERT
15. SQL-3 ผูกเครดิตกับ booking (rows ต้อง = 1)
16. session.MarkScheduled(clock) ; SaveChanges
17. ITutoringEscrowContract.RecordTutoringSplitAsync(new RecordTutoringSplitRequest(SourceRefId: bookingId, InstructorProfileId: tutor.INSTRUCTOR_PROFILE_ID, GrossAmount: credit.GROSS_AMOUNT, PaymentFeeAmount: sliceFee, TutorSharePercent: purchase.TUTOR_SHARE_PERCENT!.Value, PaymentSucceededAtUtc: purchase.ACTIVATED_AT_UTC!.Value)) ⇒ ล้ม ⇒ throw (rollback ทั้งก้อน — ห้ามมี booking ที่มีเงินแต่ไม่มี split)
18. ISessionRoomSync.ConvergeAsync(sessionId) ครอบ uow.TryRunInSavepointAsync (ล้ม ⇒ log Error + metric; booking ยัง Confirmed — self-heal ที่ P13-10 ขั้น 0)
19. BookingConfirmedNotifier.Stage(new BookingConfirmedNotification(… PriceAmount: credit.GROSS_AMOUNT, IsTrial: false))
20. audit tutoring.package.credit_reserved (purchaseId, creditSeq, bookingId — ไม่มี PII) ; SaveChanges → commit
```
**หลัง commit (best-effort):** `ITutorPublicCacheInvalidator.InvalidateSlotsAsync()` · `ITutorNextAvailableRefresher.TryRefreshAsync(tutorId)` · **ตอบ** `201` + `Location: /api/tutoring/bookings/{id}` + `Booking`

**11. การจับ exception → HTTP (นอก transaction; `ChangeTracker.Clear()` ก่อนค้น DB):** ใช้ตารางของ P13-05 §5.2 ยกเว้นข้อต่อไปนี้:
| จับได้ | แปลงเป็น |
|---|---|
| `IsExclusionViolation("EX_TUTOR_SESSIONS_NO_OVERLAP")` | ถ้ามี booking `Confirmed` ของ **ผู้ใช้คนเดียวกัน** ที่ `PACKAGE_PURCHASE_ID = purchaseId ∧ TUTOR_ID ∧ session.STARTS_AT_UTC เท่ากัน` ⇒ **200** คืน booking เดิม (replay/ดับเบิลคลิก — ธุรกรรมที่สองถูก rollback แล้ว เครดิตไม่ถูกตัดซ้ำ) · ไม่งั้น 409 `tutoring.slot_taken` |
| `IsUniqueViolation("UQ_TUTOR_BOOKINGS_NO")` | สร้างเลขใหม่ + retry ≤3 (ภายใน txn ใหม่ทั้งก้อน) แล้ว 500 |
| `DbUpdateConcurrencyException` | 409 `tutoring.concurrent_update` |

**ลำดับ lock ของเส้นทางนี้:** แถว session **ใหม่** (ไม่มีใครล็อกได้) → purchase (SQL-1) → credit (SQL-2) → booking **ใหม่** → splits (Payout) ⇒ สอดคล้อง F8 (ไม่ตัดกับ cancel/settle/webhook/job เพราะเส้นทางเหล่านั้นล็อก purchase ก่อน payment และไม่รอแถวใหม่) — พิสูจน์ด้วย integration test แข่ง (§9)
**ข้อจำกัดโดยตั้งใจ:** ไม่มี trial/Group/คูปองกับเครดิต · ไม่มี hold (booking `Confirmed` ทันที จึงไม่มี `HOLD_EXPIRES_AT_UTC`/PaymentIntent) · ไม่มี reschedule (v1)

---

## 8. Security
- ราคาแพ็กเกจและ slice ทั้งหมดคิดที่ server; client ส่งได้แค่ `packageId`/`learnerProfileId`/`method`/`startsAtUtc` · `userId` จาก `IUserContext` เท่านั้น · ownership ใน WHERE เดียวกับการดึง (purchase/credit/booking) · ไม่พบ/ไม่ใช่ของฉัน ⇒ 404 ตัวเดียวกัน
- ผู้ปกครองผูกเครดิตกับ `LEARNER_PROFILE` — ติวเตอร์เห็นแค่ nickname+ระดับชั้น (เหมือน booking ปกติ) ไม่เห็นผู้ซื้อ/จำนวนครั้งที่เหลือ/ราคาที่จ่าย
- ทุกการเปลี่ยนสถานะเงิน/เครดิตเขียน `SECURITY_AUDIT` ใน txn เดียวกัน (id + จำนวน; ไม่มี PII) — events: `tutoring.package.created|updated|deactivated|purchase_created|activated|purchase_cancelled|credit_reserved|credit_restored|credit_consumed|credit_refunded|credit_expired_released|credit_expired_refunded|refunded_unused|fee_revised|expiry_skipped_inconsistent`
- ไม่มี hard delete; ไม่มี cascade; เครดิตที่ขายไปแล้วไม่หายแม้ติวเตอร์ปิดแพ็กเกจ/ถูกระงับ (admin refund-unused เป็นทางออก)
- rate limit: ใช้ `tutoring-booking` (purchase + payment + จองด้วยเครดิต) และ `tutoring-user` (อื่น ๆ) / `tutoring-search` (public) — ไม่มี policy ใหม่
- webhook: เส้นเดียวกับ P13-06 (ยืนยันจ่ายจาก signature + event idempotent เท่านั้น; ไม่เชื่อ FE) · ไม่มี endpoint ที่ตั้งสถานะ `Active` จาก client

## 9. Test checklist
**Unit (pure):** `PackagePricing` เวกเตอร์ §4.1 + overflow/ขอบ (discount 0/50/90, count 2/30) · `CreditAllocation` เวกเตอร์ §4.2 + property (Σ=total, max−min ≤ 0.01) · state machine purchase/credit ทุกคู่ + invariant `SESSIONS_USED == count(non-Available)` ทุก transition · `UpsertPackage` validator ทุก field/ขอบ + `price_below_minimum` + ซ้ำรูป · `PackagePurchaseService.CreateAsync` ทุกข้อ §5.1 (ข้อความ 404 เดียวกัน, idempotent pending, cap pending, self-purchase) · `ConfirmPaidAsync` ทุกแถว R-P1..R-P6 + amount mismatch + fee ล้ม · `RestoreCreditAsync` (Restored/PurchaseExpired/NotPackageBooking/AlreadyRestored/Consumed⇒โยน) · `Consume`/`MarkRefunded` idempotent · ตาราง §5.5 กับ `CancellationPolicy` (Direct vs PackageCredit × remedy ทั้งสอง × หมดอายุ/ไม่หมด) · expiry settlement ทั้งสองโหมด (ledger เรียกด้วย gross/fee/ref/at ที่ถูก; refund ถูกขอด้วย key `refund:p{payment}:PackageExpired:{credit}`) + guard inconsistent · reminder once · `CreateFromPackage` invariant B1–B6 · source-scan: ไม่มีโค้ดใดอ่าน/เขียน `SESSIONS_USED` นอก `PackageCreditRepository`/SQL §5.4
**Integration (PostgreSQL 17 + Redis จริง, `SiriApiFactory`):** **แข่งใช้เครดิต:** แพ็กเกจ 3 ครั้ง, 10 request จองพร้อมกันคนละเวลา ⇒ สำเร็จ **3** ที่เหลือ 409 `package_no_credit`; `SESSIONS_USED=3`, status `Exhausted`; ไม่มีเครดิตถูกผูกสอง booking; ไม่มี session กำพร้า (rollback ถูก) · จองเวลาชน (exclusion) ⇒ rollback เครดิต (`SESSIONS_USED` ไม่เพิ่ม) · replay จองเวลาเดียวกัน ⇒ 200 booking เดิม เครดิตไม่ตัดซ้ำ · จ่ายสำเร็จ → activate: เครดิต N แถว, Σ gross = ราคา, **ไม่มีแถว `REVENUE_SPLITS`** · จองด้วยเครดิต ⇒ split Held 1 แถวด้วย slice/fee ที่ถูก, booking `Confirmed` `PAYMENT_ID` = payment ของแพ็กเกจ · ยกเลิก ≥24 ชม. ⇒ เครดิตกลับ (`Exhausted→Active`) + split Reversed · ยกเลิก <24 ชม. ⇒ refund 50% ของ slice ผ่าน fake Stripe + split ลดตาม V2 ของ P13-07 + เครดิต Consumed · ติวเตอร์ยกเลิก ⇒ restore (default) / money (config) · restore หลังหมดอายุ ⇒ Money 100% + `Refunded` · dispute full ⇒ credit Refunded · หมดอายุทั้งสองโหมด (ledger/REFUNDS ตรง; Reserved ไม่ถูกแตะ) · fee estimate → real: `PackageFeeReviser` ปรับ split ที่มีอยู่ถูก slice · จ่ายซ้ำ/จ่ายหลัง pending หมด (R-P2/R-P3/R-P5) · webhook ซ้ำ/ปลอม · **ไม่ deadlock:** webhook confirm ↔ cancel ↔ expiry job ↔ fee reviser รันพร้อมกันบน purchase เดียว (วนซ้ำ 50 รอบ) · IDOR (ผู้ใช้ B ซื้อด้วย learnerProfile ของ A ⇒ 404; B ดู/จ่าย/ยกเลิก/จอง purchase ของ A ⇒ 404 body เดียวกับไม่มีจริง; ติวเตอร์ B แก้แพ็กเกจของ A ⇒ 404) · ทุก action มี `[Authorize]`/`[AllowAnonymous]` (reflection) · migration: CHECK/UQ/FK `NoAction` ทำงานจริง, ไม่มี shadow column, SQL-1..4 ผ่านบน PG จริง (ไม่ใช่ InMemory) · `learner_profile_in_use` นับแพ็กเกจ Active ผ่าน seam `ILearnerProfileUsageReader` · **รอบ 2:** จองด้วยเครดิตกับติวเตอร์ `IS_LISTED=false` แต่ Verified ⇒ ผ่าน; ติวเตอร์ไม่ Verified ⇒ `package_tutor_unavailable` · expiry job: ติวเตอร์ไม่ Verified + `ReleaseToTutor` ⇒ ไม่ปล่อย/ไม่ Expired + `EXPIRY_BLOCKED_AT_UTC` + audit + ขึ้น `needsReview`; `RefundLearner` ⇒ ปิดบัญชีตามปกติแม้ติวเตอร์ไม่ Verified; ติวเตอร์กลับ Verified ⇒ รอบถัดไปปล่อย (ledger `at = now + DisputeWindowHours`) · `settle-expired` ทั้งสอง Decision + idempotent + ปฏิเสธเมื่อยังไม่หมดอายุ · webhook confirm ไม่เรียก `GetChargeFee` (fake จับ) ⇒ fee estimate → `PackageFeeReviser` · refund จาก R-P* ใช้ `BookingId=null` + key `refund:p{paymentId:N}:{Reason}` และ Failure ⇒ throw · fake `IPaymentMethod` ตรวจไม่ถูกเรียกใน txn/lock

## 10. Frontend notes + DTO appendix
- **โปรไฟล์ติวเตอร์** (SSR, P13-21): ส่วน "แพ็กเกจ" จาก `GET tutors/{slug}/packages` (การ์ด: จำนวนครั้ง × ความยาว, ส่วนลด, ราคารวม, ราคาต่อครั้งโดยประมาณ, ประหยัดไป X, อายุใช้งาน N วัน, "หมดอายุแล้วไม่คืนเงินส่วนที่เหลือ") · ปุ่มซื้อ ⇒ เลือกโปรไฟล์ผู้เรียน ⇒ `POST packages/{id}/purchase` ⇒ `/tutoring/checkout/package/:purchaseId` (หน้า checkout ของ P13-22 โหมด `package` — payment API ชุดเดียวกัน; นับถอยหลังจาก `holdExpiresAtUtc` = `PENDING_EXPIRES`)
- **จองด้วยเครดิต:** ในขั้นเลือก slot ถ้าผู้ใช้มีแพ็กเกจ `Active` ที่ตรงติวเตอร์/วิชา/ความยาว/โปรไฟล์ ⇒ ตัวเลือก "ใช้เครดิตแพ็กเกจ (เหลือ N ครั้ง, หมดอายุ …)" ⇒ `POST package-purchases/{id}/bookings` ⇒ ได้ `Confirmed` ทันที (ไม่ผ่านหน้าชำระเงิน) · slot ที่เริ่มหลังวันหมดอายุ ⇒ แจ้งเหตุผล (`package_session_after_expiry`) · FE **ไม่คำนวณ**ว่ามีเครดิตเหลือ/ใช้ได้ไหมเอง — อ่านจาก `GET packages/my` · หน้า checkout แพ็กเกจ poll `GET payments/{id}` ของ P13-06 ด้วย policy `tutoring-payment-poll` (40/นาที — ไม่ชนโควตา `tutoring-user`) และถอยเมื่อได้ 429
- **"แพ็กเกจของฉัน"** ใน `/my-tutoring`: เครดิตคงเหลือ (`creditsRemaining`), วันหมดอายุ (นับถอยหลัง), รายการครั้งที่ใช้, ปุ่มจองต่อ · ยกเลิกคลาสที่ใช้เครดิต: modal ยืนยันของ P13-08 แสดง `settlement='CreditRestore'` = "คืนเครดิต 1 ครั้ง" (`Booking.packagePurchaseId != null`)
- **Tutor Portal** `/instructor/tutoring/packages`: CRUD (ปิด/เปิดได้ แก้ส่วนลด/วันใช้งานได้ ไม่แก้จำนวนครั้ง/ความยาว) · ราคาที่แสดงมาจาก response ของ server (ห้ามคำนวณราคาที่ FE)
- ข้อความบังคับบนหน้าซื้อ: นโยบายหมดอายุไม่คืนเงิน + วันหมดอายุที่แน่ชัด (`validDays`) · i18n `tutoring.packages.*` และ `tutoring.errors.<reason>` (th+en, `i18n-guard.spec` เขียว) · `currencyThb` (ต้อง `providers:[CurrencyPipe]`) · `bangkokDate` · loading/error/empty ครบ · ปุ่ม submit กันกดซ้ำ · หน้าผู้เรียก/ติวเตอร์เป็น CSR + noindex

```ts
type PackagePurchaseStatus = 'PendingPayment' | 'Active' | 'Exhausted' | 'Expired' | 'Cancelled';
type PackageCreditStatus = 'Available' | 'Reserved' | 'Consumed' | 'Expired' | 'Refunded';
interface PackageOffer {                                   // GET tutors/{slug}/packages (public) → PackageOffer[] (array ธรรมดา ≤20, ไม่ paged)
  packageId: string; offering: BookingOfferingSummary;   // รูปเดียวกับ P13-05 appendix (offeringId, subjectNameTh/En, level, curriculum) — ไม่นิยามซ้ำ
  sessionCount: number; durationMinutes: number; discountPercent: number; validDays: number;
  singleSessionPrice: number; totalPrice: number; pricePerSession: number; savingsAmount: number; currency: 'THB';
}
interface UpsertPackageRequest { offeringId: string; sessionCount: number; durationMinutes: number; discountPercent: number; validDays: number; isActive: boolean; }
interface TutorPackage extends PackageOffer { isActive: boolean; rowVersion: string; }   // GET tutor/packages → PagedResult<TutorPackage> · POST 201 / PUT 200 / deactivate 200 → TutorPackage (ไม่มีจำนวนที่ขาย/ข้อมูลผู้ซื้อ)
interface PurchasePackageRequest { learnerProfileId: string; }
interface PackagePurchaseSummary {   // POST packages/{id}/purchase 201|200 · POST package-purchases/{id}/cancel 200 · GET packages/my → PagedResult<…> · admin list
  purchaseId: string; packageId: string; tutor: { slug: string; displayName: string; photoUrl: string | null };
  learner: { learnerProfileId: string; nickname: string };
  offering: BookingOfferingSummary;   // P13-05 — ไม่ต้องยิง detail/offering ต่อการ์ด
  status: PackagePurchaseStatus; durationMinutes: number; sessionsTotal: number; sessionsUsed: number; creditsRemaining: number;
  validDays: number; discountPercent: number;   // snapshot ณ ตอนซื้อ (ไม่ตามแพ็กเกจต้นทางที่ติวเตอร์แก้ทีหลัง)
  priceSnapshot: number; currency: 'THB'; pendingExpiresAtUtc: string | null; activatedAtUtc: string | null; expiresAtUtc: string | null;
  paymentId: string | null;   // = PAYMENT_ID ที่ activate; null จนกว่า Active
  requiresPayment: boolean; expiredPendingSettlement: boolean;   // true = Active แต่หมดอายุแล้ว รอทีมงานตรวจสอบ (ติวเตอร์ไม่ Verified) — แสดง "หมดอายุ (รอทีมงานตรวจสอบ)"
  serverTimeUtc: string;   // ใช้นับถอยหลัง `expiresAtUtc`/`pendingExpiresAtUtc` ฝั่ง FE โดยไม่พึ่งนาฬิกาเครื่องผู้ใช้
}
interface SettleExpiredPackageRequest { decision: 'ReleaseToTutor' | 'RefundLearner'; note: string; clientRequestId: string; }   // admin
interface AdminPackageSettlementResponse { purchase: PackagePurchaseSummary; decision: 'RefundUnused' | 'ReleaseToTutor' | 'RefundLearner'; amount: number; creditsSettled: number; refundId: string | null; }   // refund-unused / settle-expired (200)
interface PackageCreditDto { seqNo: number; status: PackageCreditStatus; bookingId: string | null; sessionStartsAtUtc: string | null; }
interface PackagePurchaseDetail extends PackagePurchaseSummary { credits: PackageCreditDto[]; }
interface BookWithPackageRequest { startsAtUtc: string; }                                   // POST package-purchases/{id}/bookings  → Booking (201 | 200 replay)
// POST package-purchases/{id}/payment → TutoringPayment (P13-06 §10; kind='Package', referenceId=purchaseId, 201|200) · POST package-purchases/{id}/cancel → PackagePurchaseSummary (200)
interface RefundUnusedPackageRequest { note: string; clientRequestId: string; }             // admin
// Booking / BookingListItem (P13-05) เพิ่มแบบ additive:  packagePurchaseId: string | null
```
C# (record ตำแหน่งเดียว ตรงกับ TS): `PackageOffer(Guid PackageId, BookingOfferingSummary Offering, int SessionCount, int DurationMinutes, decimal DiscountPercent, int ValidDays, decimal SingleSessionPrice, decimal TotalPrice, decimal PricePerSession, decimal SavingsAmount, string Currency)` · `UpsertPackageRequest(Guid OfferingId, int SessionCount, int DurationMinutes, decimal DiscountPercent, int ValidDays, bool IsActive)` · `TutorPackageResponse(PackageOffer + bool IsActive, string RowVersion)` · `PurchasePackageRequest(Guid LearnerProfileId)` · `PackagePurchaseSummary(Guid PurchaseId, Guid PackageId, BookingTutorSummary Tutor, PackageLearnerSummary Learner, BookingOfferingSummary Offering, PackagePurchaseStatus Status, int DurationMinutes, int SessionsTotal, int SessionsUsed, int CreditsRemaining, int ValidDays, decimal DiscountPercent, decimal PriceSnapshot, string Currency, DateTime? PendingExpiresAtUtc, DateTime? ActivatedAtUtc, DateTime? ExpiresAtUtc, Guid? PaymentId, bool RequiresPayment, bool ExpiredPendingSettlement, DateTime ServerTimeUtc)` (`BookingTutorSummary`/`BookingOfferingSummary` จาก P13-05; `PackageLearnerSummary(Guid LearnerProfileId, string Nickname)`) / `PackagePurchaseDetail(… Summary ทุกฟิลด์ …, IReadOnlyList<PackageCreditDto> Credits)` / `SettleExpiredPackageRequest(string Decision, string Note, Guid ClientRequestId)` / `AdminPackageSettlementResponse(PackagePurchaseSummary Purchase, string Decision, decimal Amount, int CreditsSettled, Guid? RefundId)` / `PackageCreditDto(int SeqNo, PackageCreditStatus Status, Guid? BookingId, DateTime? SessionStartsAtUtc)` · `BookWithPackageRequest(DateTimeOffset StartsAtUtc)` · `RefundUnusedPackageRequest(string Note, Guid ClientRequestId)` · `PricePerSession = Round(total / count, 2, AwayFromZero)` (แสดงผลเท่านั้น), `SavingsAmount = single × count − total`
`ApiProblem.reason`: `tutoring.package_not_found`, `tutoring.package_purchase_not_found`, `tutoring.package_purchase_expired`, `tutoring.package_purchase_not_cancellable`, `tutoring.too_many_pending_purchases`, `tutoring.package_not_active`, `tutoring.package_expired`, `tutoring.package_session_after_expiry`, `tutoring.package_no_credit`, `tutoring.package_tutor_unavailable`, `tutoring.learner_profile_inactive`, `tutoring.package_duplicate_shape`, `tutoring.package_limit`, `tutoring.package_price_below_minimum`, `tutoring.package_nothing_to_refund`, `tutoring.package_not_expired`, `tutoring.package_immutable_field`, `tutoring.already_paid`, `tutoring.cannot_book_self`, `tutoring.learner_profile_not_found`, `tutoring.tutor_not_found` · การจอง: ชุดของ P13-05 §8 (`slot_*`, `concurrent_update`) · payment/refund: ชุดของ P13-06/P13-08

## 11. Open decisions (defaulted) · ข้อควรยืนยัน
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | **เครดิตที่หมดอายุ** | ปล่อยให้ติวเตอร์/แพลตฟอร์มตามสูตร Q4 (`ReleaseToTutor`); เปลี่ยนเป็นคืนผู้เรียกได้ด้วย `RefundLearner` — **ต้องให้เจ้าของ/นักบัญชียืนยัน** (รายได้ที่ไม่มีการให้บริการ, ภาษี, ข้อความ ToS) |
| 2 | ติวเตอร์ผิด/no-show ของคลาสที่ใช้เครดิต | **คืนเครดิต** (ไม่คืนเงิน) — TUTORING.md §3.7 พูดว่า "คืนตามส่วนของครั้งนั้น" แต่การคืนเป็นเครดิตตรงเจตนาแพ็กเกจกว่าและไม่เสียค่าธรรมเนียม Stripe; `PackageTutorFaultRemedy=RefundMoney` สลับเป็นเงิน |
| 3 | ผู้เรียกยกเลิกช้า (<24 ชม.) | เครดิตหมดไป + คืนเงิน 50% ของ slice (ตามนโยบายเจ้าของ; ไม่มี "เครดิตครึ่งใบ") |
| 4 | commission snapshot | ณ ตอน activate (จ่ายสำเร็จ) ใช้กับทุกครั้งของแพ็กเกจนั้น แม้ admin เปลี่ยนเรตทีหลัง |
| 5 | คลาสต้องเริ่มก่อนวันหมดอายุ | ใช่ (ตายตัว) — ไม่มีสถานะหลังหมดอายุให้ตีความ |
| 6 | ผู้เรียกขอคืนเครดิตที่เหลือเอง | ไม่มีใน v1; admin refund-unused เท่านั้น |
| 7 | ติวเตอร์ถูกระงับ | เครดิตยังอยู่ จองไม่ได้ (`package_tutor_unavailable`); คลาสที่จองไว้ถูกยกเลิกโดย sweep (P13-08 §7.3) ⇒ เครดิตกลับ (remedy) · admin refund-unused เมื่อจำเป็น — ไม่มีคืนอัตโนมัติ |
| 8 | ราคาแพ็กเกจ | คำนวณจากอัตรา offering ณ ตอนกดซื้อ และ snapshot; การปรับอัตราทีหลังไม่กระทบ |
| 9 | แพ็กเกจกลุ่ม/ทดลองเรียน | ไม่รองรับ (1:1 เท่านั้น) |
| 10 | PI ที่จ่ายสำเร็จแต่ไม่มีแถว `PAYMENTS` (orphan) ของแพ็กเกจ | คืนเงินเต็ม (P13-06 §6.5 ข้อ 3 `PayKind` อื่น) แล้วให้ผู้เรียกซื้อใหม่ — ไม่ "รับ" orphan เป็นแพ็กเกจ เพื่อไม่ต้องมีเส้นทางสร้าง purchase ย้อนหลัง |
| 11 | ผู้เรียกปิดโปรไฟล์ผู้เรียนขณะถือเครดิต | ถูกบล็อกโดยกฎ `learner_profile_in_use` ที่ขยายแล้ว (§0.2 ข้อ 2) — ถ้าโปรไฟล์ถูกปิดโดยทางอื่น จองไม่ได้ (`learner_profile_inactive`) จนกว่าจะเปิดใหม่ |
| 12 | ค่าธรรมเนียม Stripe ของเครดิตที่คืนเป็นเงิน | ไม่ได้คืนจาก Stripe — แพลตฟอร์มรับเป็นต้นทุน (ไม่ผ่าน ledger ของติวเตอร์) — **นักบัญชียืนยัน** |
| 13 | **D-C: จองด้วยเครดิต** | ต้องติวเตอร์ `Verified` เท่านั้น (ไม่ต้อง `IS_LISTED`) — เหมือน reopen ของ P13-05; ซื้อแพ็กเกจใหม่ต้อง Verified+Listed |
| 14 | เครดิตหมดอายุขณะติวเตอร์ไม่ Verified | **ไม่ปล่อยอัตโนมัติ** — ค้างเงิน + ธง `EXPIRY_BLOCKED_AT_UTC` + คิว admin (`needsReview`) + `settle-expired`; ติวเตอร์กลับ Verified ⇒ job ปล่อยเอง; โหมด `RefundLearner` ไม่ถูกบล็อก |
| 15 | เวลาปล่อยเงินของเครดิตหมดอายุ (D-A) | `now + DisputeWindowHours` โดย job; ทันทีโดย admin `settle-expired` |

## 12. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | entity ×3 + configuration + migration `AddTutorPackages` (+FK §2.4) + `docs/DATABASE.md` | อ่านทั้งไฟล์ ไม่มี shadow FK; FK `NoAction`; ชื่อ ≤63; **ไม่ apply DB จริง** |
| B | `backend-developer` | `PackagePricing`/`CreditAllocation`/state machines (pure, เริ่มได้ทันที) + unit §9 ส่วน pure | เวกเตอร์ตรงตัว |
| C | `backend-developer` | `TutorPackageService` + `PackagePurchaseService` (create/cancel/read) + `PackageCreditService` + SQL §5.4 + controllers + options + §0.2 ข้อ 1–3 | unit §9 |
| D | `backend-developer` | `ConfirmPaidAsync` + `CreateForPackageAsync` (§0.2 ข้อ 4) + ผูกกับ P13-06 listener ข้อ 0 (หลัง P13-06 WP-D/E) | unit R-P1..R-P6 |
| E | `backend-developer` | job `tutoring-package-expiry` + `PackageFeeReviser` + admin refund-unused + ผูก P13-08 (`RestoreCredit`/`Consume`/`MarkRefunded` + `LockPurchaseAsync`) | unit + integration |
| F | `backend-developer` | `PackageBookingService` §7 (หลัง P13-05 WP เสร็จ) | integration "แข่งใช้เครดิต" + "ไม่ deadlock" ผ่านบน PG จริง |
| G | `backend-developer`/`integrator-qa` | integration §9 | เขียนครบ (ระบุถ้ายังไม่เคยรันเพราะไม่มี Docker) |
ขนาน: B กับ A · FE ขนานกับ BE (หน้า public/tutor portal); หน้า checkout/ใช้เครดิตหลัง WP-C,F · `DONE` โดย integrator-qa เท่านั้น · **ห้าม commit / apply migration เอง** · ลำดับ migration: ต่อท้าย `AddTutoringRefundsAndPenalties` และ `AddTutoringSessionContent` (ต้องมี `TUTOR_BOOKINGS`/`REFUNDS`/`PAYMENTS` ก่อน)
**Wiring checklist (ข้อ 21):** `AddTutoringModule` ลงทะเบียน `IPackageCreditService`→`PackageCreditService`, `PackagePurchaseService`, `PackageBookingService`, `TutorPackageService`, `PackageFeeReviser`, **`ILearnerProfileUsageReader`→`PackageLearnerProfileUsageReader`** (ทั้ง Api และ Workers — Workers ใช้ job/reviser) · `RecurringJobIds.TutoringPackageExpiry` ใน `All` + `RecurringJobsRegistration` · `appsettings.json` ของ **Api และ Workers** มี placeholder `Tutoring:Packages:*` ครบ + `ValidateOnStart` · ไม่เพิ่ม `ProjectReference` ใหม่ (ใช้ Payment/Payout ที่ P13-06/07 เพิ่มแล้ว) · ไม่มี rate limit policy ใหม่ (ใช้ `tutoring-booking`/`tutoring-user`/`tutoring-search`; poll สถานะจ่ายใช้ `tutoring-payment-poll` ของ P13-06)

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review — มติกลาง D-A/D-B/D-C)
- **ตาม P13-05 รอบ 2:** §0.2 จุด 1 factory `CreateFromPackage` มีแล้ว; จุด 2 ใช้ seam `ILearnerProfileUsageReader` (ไม่แก้ `LearnerProfileService`); จุด 3 `packagePurchaseId` อยู่ใน `Booking` ฉบับรวม; guard Verified อยู่ที่ P13-12 ก่อนเรียก factory; §4.1 ใช้ `Quote(..., minChargeAmount)` 5 อาร์กิวเมนต์
- **D-C:** §7 ข้อ 6 จองด้วยเครดิตต้อง Verified เท่านั้น (ไม่ต้อง `IS_LISTED`)
- **ข้อ 13:** expiry job ไม่ปล่อยให้ติวเตอร์ที่ไม่ Verified อัตโนมัติ — `EXPIRY_BLOCKED_AT_UTC`, คิว `needsReview`, `settle-expired` (§5.8); เครดิตหมดอายุปล่อยด้วย `now + DisputeWindowHours` (D-A)
- **ข้อ 10:** §5.3 ข้อ 3 ตัด fee lookup ออกจาก webhook (estimate เสมอ + `PackageFeeReviser`)
- **ข้อ 1/20/21:** refund จาก R-P* ใช้คำสั่งตามตาราง P13-08 §6.1 (`BookingId=null`, ไม่มี suffix, Failure ⇒ throw); ถ้อยคำ audit §5.2; `CreatePaymentCoreAsync` เจ้าของ P13-06 เดียว; wiring checklist; F8 chain เพิ่ม REFUNDS (D-B)

### 2026-10-15 รอบ 3 (ช่องว่างที่ FE พบ — additive ทั้งหมด ไม่เปลี่ยนตาราง/endpoint)
- `PackagePurchaseSummary`/`Detail` เพิ่ม `offering` (`BookingOfferingSummary` ของ P13-05), `validDays`, `discountPercent`, `paymentId?`, `serverTimeUtc` + ระบุ projection query เดียว/ไม่ N+1 (§5.6 ท้าย) · `PackageOffer.offering` ใช้ type เดียวกัน
- envelope: `GET tutors/{slug}/packages` = `PackageOffer[]` (array ธรรมดา เพดาน 20), `GET tutor/packages` = `PagedResult<TutorPackage>`, `GET packages/my`/admin list = `PagedResult<PackagePurchaseSummary>`
- response body: payment = `TutoringPayment` (P13-06), `cancel` = 200 `PackagePurchaseSummary` (idempotent เมื่อ Cancelled), `POST/PUT/deactivate tutor/packages` = `TutorPackage` (201/200/200; deactivate idempotent), refund-unused/settle-expired = 200 `AdminPackageSettlementResponse`; PUT: ฟิลด์ที่เปลี่ยนไม่ได้ต้องตรงค่าเดิม ไม่งั้น 400 `tutoring.package_immutable_field`

*ผลต่อไฟล์อื่นที่ฉบับนี้บังคับ (ได้แก้ในชุดเดียวกันแล้ว — ผู้ implement ใช้ฉบับปัจจุบันของแต่ละไฟล์):* P13-06 §6.0 (chain ขยายเป็น …BOOKINGS→PACKAGE_PURCHASES→PAYMENTS→REFUNDS) + §6.1 (`CreatePaymentCoreAsync`) + §6.2 ข้อ 0 (ลายเซ็น `ConfirmPaidAsync`) + §6.7 ข้อ 2–3 (`CancelPendingIntentsAsync(kind, refId)`, `PackageFeeReviser`) · P13-07 §8 `TutorLedgerRow.sourceKind` · P13-08 §4(ข) + §8 ข้อ 2/7 (ลำดับ lock มี purchase; `RestoreCredit → PurchaseExpired ⇒ Money`)

### rev 2 (2026-10-20) — B-1 + R1/R2 (มติเจ้าของ D-25.1; โค้ดชนะ)
- §3 Options: เพิ่ม `Tutoring:Packages:UnbookableRefundWindowDays` (default 14; 0 = ปิดกฎ; 0–90; ใน appsettings Api+Workers) · `ExpiredCreditSettlement` default **ไม่เปลี่ยน** (`ReleaseToTutor`)
- §6.1 ข้อ 3 / §6.3 (settle ตอนหมดอายุ): `Domain/Policy/ExpiredCreditPolicy` — ติวเตอร์ **ไม่ Verified ต่อเนื่องตลอด N วันสุดท้าย** (`STATUS_CHANGED_AT_UTC <= EXPIRES - N`) ⇒ **RefundLearner เต็ม** (1 refund/เครดิต, ไม่เข้า ledger, idempotent) · เปลี่ยนสถานะภายในช่วง ⇒ Blocked รอแอดมินเหมือนเดิม · Verified ⇒ เป็นของติวเตอร์ · ใช้เฉพาะเงื่อนไขที่พิสูจน์จาก DB ได้ (ไม่นับ "ไม่มีเวลาว่าง" เพราะไม่มีประวัติ) · ข้อความถึงผู้เรียนระบุเหตุที่ติวเตอร์ (`PackageNotifier`), audit มี `cause`
- §7 ข้อ 6: การจองด้วยเครดิต **ไม่ใช้** `Offering.IS_ACTIVE` เป็นเงื่อนไขปฏิเสธอีก (ยังเช็คติวเตอร์ Verified, notice/horizon, slot, ราคา/ความยาวที่ตรึง, ล็อกโปรไฟล์ rank 0)
- ใหม่: `TutorOfferingService.UpdateAsync` ปิด offering ที่มี purchase `Active|Exhausted` ไม่หมดเวลา + เครดิต `Available|Reserved` ⇒ **409 `tutoring.offering_has_open_credits`** (ไม่มี ext, ไม่เขียนอะไร; ไม่นับ PendingPayment/หมดเวลา/Expired/Cancelled)
- §5.3 แถว R-P ใหม่ (R1/R2): `ConfirmPaidAsync` ล็อก `LEARNER_PROFILES` FOR SHARE ขั้นแรก (ตรวจซ้ำหลังล็อกว่าไม่เปลี่ยนมือ) — โปรไฟล์ถอน consent/anonymised/inactive ⇒ ไม่ activate/reactivate (PendingPayment→Cancelled) + คืนเต็ม `RefundReason.ConsentWithdrawn` (key `refund:p{paymentId:N}:ConsentWithdrawn`, BookingId=null)
- ช่องว่างที่รู้: การแก้ subject/level/curriculum ของ offering ที่มีเครดิตค้างยังทำได้ (นอกขอบเขต) · แพ็กเกจอายุสั้นกว่า window / ติวเตอร์กลับ Verified ก่อน job ⇒ ไปแอดมิน/นับเป็น Verified
