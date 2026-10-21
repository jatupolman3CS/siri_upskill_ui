# Tutor Marketplace Design — จับคู่ครูสอนพิเศษ + จองเวลา + Google Meet + Escrow

> **สถานะ:** DESIGN (2026-10-14) → **BUILT + gate ผ่านแบบ integration-verified (2026-10-20)** — โค้ด BE/FE ครบตาม §9 แล้ว (ยกเว้น P13-16 Drive) · สถานะรายงานจริงดู `docs/TASKS.md` §P13 + `docs/PROGRESS.md` · เอกสารนี้ยังเป็นสเปคเชิงออกแบบ (โค้ดชนะเมื่อขัด) · ต้นทาง: คำสั่ง `/goal` ของเจ้าของโปรเจ็ค 2026-10-14 ("แพลตฟอร์มจับคู่ครูสอนพิเศษ พร้อมระบบจองเวลาและเชื่อมต่อ Google Meet" — 5 กลุ่มผู้ใช้/ฟีเจอร์: นักเรียน, ติวเตอร์, Google integration, การเงิน/ความปลอดภัย, แอดมิน)
> · การตัดสินใจเชิงสถาปัตยกรรม: `docs/DECISIONS.md` **D-25** · requirement: `REQUIREMENTS.md` §7 (TM-01..) · task: `TASKS.md` **§P13**
> · เอกสารนี้คือ "แบบ" ระดับระบบ — contract ต่อ task (FROZEN) ออกที่ `docs/contracts/P13-xx-*.md` · schema ระดับคอลัมน์ออกที่ `docs/db-designs/P13-xx-*.md`
> · **ถ้าขัดกับ contract ที่ FROZEN แล้ว ให้ยึด contract**

## 0. หลักการ — ต่อยอด ไม่รื้อ (ผลสำรวจโค้ดจริง 2026-10-14 จาก method body ไม่ใช่ doc comment)

| สเปคขอ | สถานะจริงในโค้ด | ทำอะไร |
|---|---|---|
| ระบบสมัคร/อนุมัติผู้สอน | ✅ `INSTRUCTOR_PROFILE` Apply→Approve + role grantor + policy `InstructorOnly` (role **และ** โปรไฟล์ Approved) | **ติวเตอร์ = ผู้สอนที่ผ่านขั้นนี้แล้ว + เปิดโหมดติวเตอร์** (ไม่สร้าง identity ใหม่) |
| ค้นหา/กรอง | ✅ ค้นคอร์ส (Meilisearch → fallback `pg_trgm`) · ❌ ไม่มีค้นคน/เวลาว่าง/เพศ/ระดับชั้น | สร้างค้นติวเตอร์ใหม่ใน Tutoring (SQL + `pg_trgm`) |
| Google Calendar + Meet อัตโนมัติ | ✅ ชั้น Google ใช้ซ้ำได้ (OAuth ต่อบัญชีผู้สอน, refresh token เข้ารหัส, `ICalendarProvider`, fallback วางลิงก์เอง) · ❌ pipeline `Live` ผูกกับคอร์ส (ผู้เข้าร่วม/สิทธิ์เข้าห้อง/เนื้อหา event มาจาก Catalog+Learning) | **เพิ่ม "ห้องประชุมอิสระ" (ad-hoc room) ใน Live แบบ additive** ผ่าน `Live.Contracts` — ไม่แตะ pipeline คอร์ส |
| ปฏิทิน/ICS/เตือน | ✅ ICS ผ่าน EmailOutbox, เตือน 24h/1h ของ Live · ❌ ไม่มีเตือน 15 นาที (job รันทุก 5 นาที) | Tutoring มี job เตือนของตัวเอง (ทุก 1 นาที) 24h + 15m |
| จ่ายเงิน | ✅ Stripe PaymentIntent (PromptPay + บัตรเปิดด้วย config) + webhook idempotent · ❌ Order/ราคา/fulfilment **ผูกกับคอร์สทั้งหมด** (`ORDER_ITEM.COURSE_ID` เท่านั้น) | **flow จ่ายเงินของ Tutoring เอง** บน `IPaymentMethod` + seam เล็ก ๆ ที่ webhook ของ Commerce (ไม่ยัดการจองเข้า Order) |
| Escrow | ❌ ไม่มีจริง — "พักเงิน" วันนี้คือ flag ใน DB (split Pending + HoldDays 14) เงินอยู่ใน Stripe balance ของแพลตฟอร์ม | ledger ใน `PAYOUT.REVENUE_SPLITS` (เพิ่ม `SOURCE_TYPE` + `AVAILABLE_AT_UTC`) — ดู §3.8 |
| Wallet/Payout | ✅ batch, ภาษีหัก ณ ที่จ่าย 3%, บัญชีธนาคารเข้ารหัส, export CSV · ❌ รายเดือนล้วน, ไม่มี pending/available ใน API, key ผูก `INSTRUCTOR_PROFILE.Id` | ขยาย Payout (additive) + wallet reader |
| Refund | ⚠️ `RefundService.ApproveAsync` **ไม่เรียก Stripe จริง** (บันทึกอย่างเดียว) · webhook ไม่ฟัง refund/dispute event | Tutoring เรียก `IPaymentMethod.CreateRefundAsync` เอง (มี idempotency key) — ไม่สืบทอดช่องโหว่ (ดู X-35) |
| KYC / ไฟล์ละเอียดอ่อน | ❌ ไม่มี (R2 bucket เดียวกับสื่อการสอน, ไม่มี access log, ไม่เข้ารหัสไฟล์) | bucket แยก + เข้ารหัสไฟล์ชั้นแอป + access log + retention |
| รีวิว | ✅ เฉพาะคอร์ส (gate ด้วย enrollment) | `TUTOR_REVIEWS` ใหม่ (gate ด้วย booking ที่ Completed) + มี moderation |
| Dispute | ❌ ไม่มี (`REPORT` ของ Community ชี้ discussion เท่านั้น) | `DISPUTES` ใหม่ — ยืม pattern `REFUND` (decided-by/note) |
| Analytics | ❌ ไม่มี search log / retention | `SEARCH_LOGS` + query รายงานใน Tutoring |
| เพศ / ระดับชั้น / หลักสูตร / ผู้ปกครอง | ❌ ไม่มีแนวคิดเลยใน `USER` | เก็บใน Tutoring เท่านั้น (ไม่แตะ Identity) |
| LINE Notify | ⛔ LINE ปิดบริการถาวรแล้ว 31 มี.ค. 2025 | ไม่ใช้ — v1 = อีเมล+ICS+แจ้งเตือนในแอป (เจ้าของเลือก) |

**กฎที่คุมทั้งดีไซน์นี้:** server ตัดสินราคา/สิทธิ์/สถานะเงินทั้งหมด · ห้าม cascade/hard delete บน booking/payment/refund/split · ลิงก์ Meet เป็นสิทธิ์ ต้องผ่าน join gate (404 เดียวกันทุกกรณีไม่มีสิทธิ์) · เวลาเก็บ UTC แสดง Asia/Bangkok · module คุยกันผ่าน `Contracts/` เท่านั้น · ไม่มี package ใหม่ที่แตะ crypto/auth/payment โดยไม่ถาม · การเปลี่ยนแปลงโมดูลอื่น (Live/Payout/Commerce/Integrations) ต้อง **additive** และระบุไว้ใน contract

## 1. ค่าที่เจ้าของโปรเจ็คตัดสินแล้ว (2026-10-14) — เป็น config ไม่ hardcode

| เรื่อง | ค่า | Config key (`Tutoring:*`) |
|---|---|---|
| คอมมิชชันแพลตฟอร์ม | **20%** (ติวเตอร์ 80% **หลัง**หักค่าธรรมเนียม Stripe ตามสูตร Q4) · ปรับรายคนได้ผ่าน `TUTOR_PROFILE.COMMISSION_PERCENT_OVERRIDE` (admin + audit) | `DefaultCommissionPercent` = 20 |
| นักเรียนยกเลิก | ≥ 24 ชม. ก่อนเริ่ม → คืน **100%** · < 24 ชม. → คืน **50%** (อีก 50% = ค่าเสียเวลาติวเตอร์) | `Cancellation:FullRefundHours` = 24, `LateRefundPercent` = 50 |
| ติวเตอร์ยกเลิก / ไม่มา (no-show) | คืน **100%** ทุกกรณี + หักคะแนนติวเตอร์ | `TutorPenalty:*` |
| รอบโอนเงินติวเตอร์ | **รายสัปดาห์** (ขั้นต่ำ ฿500 ทบยอดได้ — ใช้ `Payout:MinimumPayoutAmount` เดิม) | `Payout:Tutoring:Cadence` = Weekly |
| ช่วงพักเงิน/รอข้อพิพาท | **24 ชม.** หลังจบคลาส | `DisputeWindowHours` = 24 |
| แจ้งเตือน | อีเมล + ICS + แจ้งเตือนในแอป · ล่วงหน้า **1 วัน** และ **15 นาที** · ปุ่มเข้า Meet เปิด **15 นาที**ก่อนเริ่ม | `Reminders:LeadHours` = [24], `LeadMinutes` = [15], `JoinWindowMinutes` = 15 |

ค่าที่ผมตั้ง default เองตามหลักฐาน (เป็น config เช่นกัน — เจ้าของแก้ได้): ระยะเวลาคลาส 30/60/90/120 นาที · trial 15 หรือ 30 นาที · hold ที่นั่งระหว่างจ่ายเงิน **15 นาที** · จองล่วงหน้าขั้นต่ำ default **24 ชม.** (ติวเตอร์ตั้งเองได้ 1–168 ชม.) · buffer default **10 นาที** (0–60) · จองล่วงหน้าไกลสุด 60 วัน · กลุ่มย่อย 2–6 คน

## 2. Domain model — schema `TUTORING` (module ใหม่ `Siri.Modules.Tutoring`)

Repository + Service, entity/column UPPERCASE ตาม `database.md` (ทุก property ของ `IAuditable`/`ISoftDelete` เป็น PascalCase เสมอ) · identifier ≤ 63 bytes · PK UUIDv7 · เงิน `decimal(18,2)` · เวลา `timestamptz(3)` UTC (`AtUtc`) · enum เก็บเป็น string · `ROW_VERSION bytea` ผ่าน `ConcurrencyTokenInterceptor` บน TUTOR_PROFILES/SESSIONS/BOOKINGS/DISPUTES

```
ผู้ติวเตอร์ ─────────────────────────────────────────────────────────────
TUTOR_PROFILES        1:1 กับ CATALOG.INSTRUCTOR_PROFILES (INSTRUCTOR_PROFILE_ID UQ, USER_ID UQ — ไม่มี FK ข้าม schema)
                      SLUG UQ, HEADLINE, BIO, GENDER(Male|Female|Other|Undisclosed — ติวเตอร์ระบุ, admin ตรวจกับบัตร),
                      PHOTO_STORAGE_KEY, INTRO_VIDEO_ASSET_ID? (Media), YEARS_EXPERIENCE,
                      STATUS(Draft|PendingVerification|NeedsInfo|Verified|Rejected|Suspended), IS_LISTED (ติวเตอร์เปิด/ปิดรับงาน),
                      MIN_NOTICE_HOURS, BUFFER_MINUTES, MAX_ADVANCE_DAYS, COMMISSION_PERCENT_OVERRIDE?,
                      RATING_AVERAGE, RATING_COUNT, COMPLETED_SESSIONS_COUNT, RELIABILITY_SCORE, NEXT_AVAILABLE_AT_UTC?,
                      VERIFIED_AT_UTC?, ROW_VERSION          ← ค่า denormalized เขียนผ่าน updater ตัวเดียวเท่านั้น
TUTOR_OFFERINGS       (TUTOR_ID, SUBJECT_ID, LEVEL, CURRICULUM) UQ · HOURLY_RATE_ONE_ON_ONE, GROUP_HOURLY_RATE_PER_SEAT?, GROUP_MAX_SEATS?,
                      TRIAL_ENABLED, TRIAL_MINUTES(15|30), TRIAL_PRICE(0 = ฟรี), IS_ACTIVE
                      LEVEL = Primary|LowerSecondary|UpperSecondary|University|Competitive|Adult · CURRICULUM = Thai|EP|International
SUBJECTS              SLUG UQ, NAME_TH, NAME_EN, PARENT_ID?, SORT_ORDER, IS_ACTIVE (admin จัดการ + seed)
TUTOR_EDUCATIONS      INSTITUTION, DEGREE, FIELD, YEAR_FROM/TO  (แสดงสาธารณะหลัง Verified)
TUTOR_CERTIFICATES    TITLE, ISSUER, YEAR, DOCUMENT_ID? (ใบรับรองที่โชว์สาธารณะ — คนละอย่างกับเอกสาร KYC)

KYC ─────────────────────────────────────────────────────────────────────
TUTOR_KYC_CASES       TUTOR_ID, ATTEMPT_NO, STATUS(Submitted|InReview|NeedsInfo|Approved|Rejected), SUBMITTED_AT_UTC,
                      CONSENT_VERSION, CONSENT_AT_UTC (PDPA), DECIDED_BY_USER_ID?, DECIDED_AT_UTC?, DECISION_NOTE?
TUTOR_DOCUMENTS       CASE_ID, TYPE(IdCard|Diploma|CriminalRecord|Certificate|Other), STORAGE_KEY (bucket KYC แยก),
                      CONTENT_SHA256, STATUS(Pending|Approved|Rejected), EXPIRES_AT_UTC?, PURGE_AFTER_UTC?, PURGED_AT_UTC?
TUTOR_DOCUMENT_ACCESS_LOGS   DOCUMENT_ID, ACCESSED_BY_USER_ID, ACCESSED_AT_UTC, ACTION(View|Download|Purge), IP  (append-only)

เวลาว่าง ──────────────────────────────────────────────────────────────────
TUTOR_AVAILABILITY_RULES      TUTOR_ID, DAY_OF_WEEK(0-6), START_LOCAL(time), END_LOCAL(time), IS_ACTIVE   (Asia/Bangkok wall-clock)
TUTOR_AVAILABILITY_EXCEPTIONS TUTOR_ID, DATE_LOCAL, KIND(Closed|ExtraOpen), START_LOCAL?, END_LOCAL?, NOTE?

จอง / คลาส ────────────────────────────────────────────────────────────
LEARNER_PROFILES      OWNER_USER_ID (ผู้ปกครอง/บัญชีที่จ่ายเงิน), NICKNAME, GRADE_LEVEL, IS_MINOR, GUARDIAN_CONSENT_AT_UTC?, IS_ACTIVE
TUTOR_SESSIONS        คลาสหนึ่งครั้ง (หน่วยที่ "ล็อกเวลา" ของติวเตอร์): TUTOR_ID, OFFERING_ID, STARTS_AT_UTC, ENDS_AT_UTC,
                      BLOCK_ENDS_AT_UTC (= ENDS + buffer), FORMAT(OneOnOne|Group), CAPACITY, SEATS_TAKEN, IS_TRIAL,
                      STATUS(Held|Scheduled|Cancelled|Completed|NoShowTutor|NoShowBoth), MEETING_ROOM_ID? (Live.ADHOC_MEETINGS),
                      TUTOR_JOINED_AT_UTC?, TUTOR_CONFIRMED_AT_UTC?, FINALIZED_AT_UTC?, ROW_VERSION
                      ⛔ EXCLUDE USING gist (TUTOR_ID WITH =, tstzrange(STARTS_AT_UTC, BLOCK_ENDS_AT_UTC) WITH &&)
                         WHERE STATUS IN ('Held','Scheduled','Completed')   ← กันติวเตอร์ถูกจองซ้อนที่ระดับ DB (ต้อง btree_gist)
TUTOR_BOOKINGS        BOOKING_NO UQ, SESSION_ID, LEARNER_USER_ID, LEARNER_PROFILE_ID, PACKAGE_PURCHASE_ID?, IS_TRIAL, PRICE_AMOUNT,
                      STATUS(PendingPayment|Confirmed|CancelledByLearner|CancelledByTutor|Completed|NoShowLearner|NoShowTutor|
                             NoShowBoth|Disputed|Expired), HOLD_EXPIRES_AT_UTC?, PAYMENT_ID?,
                      CANCELLED_AT_UTC?, CANCEL_REASON?, REFUNDED_AMOUNT, ESCROW_STATE(None|Held|Released|Reversed|Frozen),
                      LEARNER_JOINED_AT_UTC?, LEARNER_CONFIRMED_AT_UTC?, REMINDER_24H_SENT_AT_UTC?, REMINDER_15M_SENT_AT_UTC?,
                      ROW_VERSION
                      UQ partial: ทดลองเรียนได้ครั้งเดียวต่อ (TUTOR_ID, LEARNER_PROFILE_ID) ที่ IS_TRIAL และสถานะไม่ใช่ยกเลิก/หมดอายุ
TUTOR_PACKAGES        TUTOR_ID, OFFERING_ID, SESSION_COUNT, DURATION_MINUTES, DISCOUNT_PERCENT (ติวเตอร์ตั้ง), VALID_DAYS, IS_ACTIVE
PACKAGE_PURCHASES     LEARNER_USER_ID, PACKAGE_ID, PRICE_SNAPSHOT, SESSIONS_TOTAL, SESSIONS_USED, EXPIRES_AT_UTC, PAYMENT_ID, STATUS
SESSION_JOIN_LOGS     SESSION_ID, BOOKING_ID?, USER_ID, ROLE(Tutor|Learner), JOINED_AT_UTC, IP, USER_AGENT  (append-only)
SESSION_MATERIALS     SESSION_ID, UPLOADED_BY_USER_ID, KIND(File|Link|Homework), TITLE, STORAGE_KEY?|URL?, ADDED_AT_UTC
SESSION_SUMMARIES     SESSION_ID, BOOKING_ID?, TOPICS_COVERED, FEEDBACK, HOMEWORK, NEXT_STEPS, CREATED_AT_UTC

เงิน ────────────────────────────────────────────────────────────────────
PAYMENTS              OWNER_USER_ID, KIND(Booking|Package), REF_ID, AMOUNT, CURRENCY('THB'), METHOD(PromptPay|Card),
                      PROVIDER_PAYMENT_INTENT_ID UQ, STATUS(Pending|Succeeded|Failed|Expired|PartiallyRefunded|Refunded),
                      STRIPE_FEE_AMOUNT?, SUCCEEDED_AT_UTC?
REFUNDS               PAYMENT_ID, BOOKING_ID?, AMOUNT, REASON(LearnerCancelEarly|LearnerCancelLate|TutorCancel|TutorNoShow|
                      NoClassHeld|DisputeResolved|AdminManual), STATUS(Requested|Processing|Completed|Failed),
                      PROVIDER_REFUND_ID?, IDEMPOTENCY_KEY UQ, DECIDED_BY_USER_ID? (null = ระบบตามนโยบาย), DECISION_NOTE?
                      → ❌ ไม่มี DELETE · ทุกการเปลี่ยนสถานะเงินเขียน audit (SECURITY_AUDIT)
(ฝั่ง Payout)         PAYOUT.REVENUE_SPLITS + SOURCE_TYPE(Course|Tutoring) + SOURCE_REF_ID (=BOOKING_ID) + AVAILABLE_AT_UTC? — ดู §3.8

ข้อพิพาท / รีวิว / วิเคราะห์ ───────────────────────────────────────────
DISPUTES              BOOKING_ID, OPENED_BY_USER_ID, OPENED_BY_ROLE(Learner|Tutor), CATEGORY(NoClass|TutorConnection|Behavior|
                      NotAsDescribed|Other), DESCRIPTION, STATUS(Open|UnderReview|Resolved|Rejected|Withdrawn),
                      RESOLUTION(FullRefund|PartialRefund|NoRefund)?, REFUND_AMOUNT?, DECIDED_BY_USER_ID?, DECIDED_AT_UTC?, DECISION_NOTE?
DISPUTE_MESSAGES      DISPUTE_ID, AUTHOR_USER_ID, AUTHOR_ROLE(Learner|Tutor|Admin), BODY, CREATED_AT_UTC  (append-only)
TUTOR_REVIEWS         TUTOR_ID, BOOKING_ID UQ, REVIEWER_USER_ID, RATING(1-5), COMMENT, STATUS(Published|Hidden), HIDDEN_BY_USER_ID?
TUTOR_PENALTY_EVENTS  TUTOR_ID, BOOKING_ID, KIND(NoShow|LateCancel|...), POINTS, CREATED_AT_UTC   (append-only → RELIABILITY_SCORE)
SEARCH_LOGS           CREATED_AT_UTC, SUBJECT_ID?, LEVEL?, CURRICULUM?, QUERY_TEXT?(trim 100), RESULT_COUNT   (ไม่เก็บ user/IP · retention 90 วัน)
```

**State machine ของ booking (สรุป — รายละเอียดใน contract P13-05/08/10):**
```
PendingPayment ──จ่ายสำเร็จ(webhook)/trial ฟรี──► Confirmed ──จบคลาส+ทั้งสองเข้า──► Completed ──(24 ชม. ไม่มี dispute)──► escrow Released
      │hold หมดเวลา/จ่ายไม่สำเร็จ                    │ผู้เรียนยกเลิก ≥24ชม.: คืน100% / <24ชม.: คืน50%  → CancelledByLearner
      ▼                                             │ติวเตอร์ยกเลิก: คืน100% + หักคะแนน               → CancelledByTutor
   Expired                                          │ติวเตอร์ไม่มา (ผู้เรียนเข้า, ติวเตอร์ไม่): คืน100% + หักคะแนน → NoShowTutor
                                                    │ผู้เรียนไม่มา (ติวเตอร์เข้า, ผู้เรียนไม่): ไม่คืน       → NoShowLearner (ติวเตอร์ได้เงิน)
                                                    │ไม่มีใครเข้า: คืน100% ไม่หักคะแนน (ไม่พิสูจน์ได้)        → NoShowBoth
                                                    └ข้อพิพาท (ภายใน 24 ชม.หลังจบ) → Disputed (escrow Frozen) → admin ตัดสิน
```

## 3. Flows หลัก

### 3.1 ติวเตอร์สมัคร + KYC (ฝั่งติวเตอร์ §2 / แอดมิน §5)
1. ผู้ใช้สมัคร **ผู้สอน** ตามขั้นเดิม (`/become-instructor` → admin อนุมัติ → role `Instructor` + โปรไฟล์ Approved) — **ไม่แตะ Catalog**. (รวมเป็นฟอร์มเดียวทีหลังได้ผ่าน contract ใหม่ของ Catalog — ไม่ทำใน v1)
2. ใน Instructor Studio มีเมนู "สอนพิเศษ (ติวเตอร์)" (`instructorStudioGuard` ผ่านอยู่แล้ว) → สร้าง `TUTOR_PROFILE` (Draft): ข้อมูลโปรไฟล์ / วิชา-ระดับ-หลักสูตร-ราคา / การศึกษา / ใบรับรอง / วิดีโอแนะนำ (อัปโหลดผ่าน Media เดิม 1–2 นาที)
3. ส่งตรวจสอบ: ยอมรับ PDPA consent (เวอร์ชัน+เวลาเก็บ) → อัปโหลดบัตรประชาชน / วุฒิ / ใบรับรองประวัติอาชญากรรม → `TUTOR_KYC_CASES` = Submitted
4. Admin ตรวจ (หน้า `/admin/tutoring/kyc`): ดูเอกสารผ่าน endpoint ที่ stream ไฟล์ถอดรหัส (ไม่มี presigned URL) ทุกครั้งเขียน `TUTOR_DOCUMENT_ACCESS_LOGS` → Approve / Reject / NeedsInfo (+เหตุผล) · Approve ⇒ `TUTOR_PROFILE.STATUS = Verified`, เขียน `SECURITY_AUDIT`, ส่งอีเมล+แจ้งเตือนในแอป
5. หลังตัดสิน เอกสาร `IdCard`/`CriminalRecord` ถูก **purge** ตาม `PURGE_AFTER_UTC` (default 30 วัน) — เก็บเฉพาะผลการตรวจ/วันที่/ผู้ตัดสิน (data minimization) · เอกสารที่หมดอายุ (`EXPIRES_AT_UTC`) ทำให้ต้องยืนยันใหม่ (job เตือน)
6. ติวเตอร์ถูกแสดงในผลค้นหา/จองได้ก็ต่อเมื่อ `STATUS = Verified AND IS_LISTED AND` มี offering active อย่างน้อย 1 รายการ

### 3.2 ตั้งเวลาว่าง (Availability)
- ติวเตอร์ตั้ง **rule รายสัปดาห์** (วัน + ช่วงเวลา local) + **exception รายวัน** (ปิดทั้งวัน/ช่วง, เปิดเพิ่ม) + `MIN_NOTICE_HOURS` + `BUFFER_MINUTES` + `MAX_ADVANCE_DAYS`
- **ไม่ materialize slot** — คำนวณตอนอ่าน: rule → ลบ exception → ลบ session ที่ใช้เวลาอยู่ (`STARTS_AT_UTC..BLOCK_ENDS_AT_UTC`, สถานะ Held/Scheduled/Completed) → ตัดตาม min-notice/max-advance → หั่นเป็นจุดเริ่มทุก 30 นาทีสำหรับ duration ที่ขอ → คืน `[{startsAtUtc,endsAtUtc,format,seatsLeft}]` · กลุ่มย่อย: slot ที่มี session Group เปิดอยู่และ `SEATS_TAKEN < CAPACITY` ขึ้นเป็น "เข้าร่วมกลุ่ม"
- `NEXT_AVAILABLE_AT_UTC` อัปเดตโดย job (ไว้ sort/filter ในหน้าค้นหา) · ไม่ sync Google free/busy ใน v1

### 3.3 นักเรียนค้นหา/ดูโปรไฟล์
- `GET /api/tutoring/tutors` (public, ไม่ต้อง login): `q` (ชื่อ/headline — `pg_trgm`), `subject`, `level`, `curriculum`, `priceMin/Max` (ต่อชั่วโมง), `gender`, `format`(OneOnOne|Group), `day`+`from`+`to` (ติวเตอร์ที่มี rule คลุมช่วงนั้น), `sort`(relevance|rating|priceAsc|priceDesc|nextAvailable|newest) + facets + paginate · บันทึก `SEARCH_LOGS` (ไม่มี user/IP)
- `GET /api/tutoring/tutors/{slug}` (SSR + `SeoService` + JSON-LD; `aggregateRating` เฉพาะ `RATING_COUNT>0`): ข้อมูลสาธารณะเท่านั้น — **ไม่มีเอกสาร KYC/อีเมล/เบอร์**
- `GET /api/tutoring/tutors/{slug}/slots?from&to&offeringId&durationMinutes&format` — ปฏิทินเวลาว่าง real-time

### 3.4 จอง + จ่ายเงิน (single / package / trial)
1. ผู้ปกครอง/นักเรียนเลือก `LEARNER_PROFILE` (สร้างได้ในบัญชี — เด็กไม่ต้องมี account ของตัวเอง; ผู้เรียนเป็น minor ⇒ บัญชีที่จ่าย = ผู้ปกครอง + บันทึก consent) + offering + slot
2. `POST /api/tutoring/bookings` — server คำนวณราคา = `HOURLY_RATE × minutes/60` (ปัดสตางค์), trial = `TRIAL_PRICE`, package = ราคา snapshot ÷ จำนวนครั้ง · **ล็อกเวลา** ใน transaction เดียว: INSERT `TUTOR_SESSIONS` (Held) — exclusion constraint กันซ้อน (ชน ⇒ 409 `tutoring.slot_taken`) หรือ `UPDATE ... SET SEATS_TAKEN=SEATS_TAKEN+1 WHERE SEATS_TAKEN<CAPACITY` (กลุ่ม) + INSERT booking `PendingPayment`, `HOLD_EXPIRES_AT_UTC = now+15 นาที`
3. ฟรี (trial ราคา 0): ข้ามจ่ายเงิน → `Confirmed` ทันที (ไม่มี escrow/คอมมิชชัน) · ที่เหลือ: `POST /api/tutoring/bookings/{id}/payment` สร้าง PaymentIntent (PromptPay หรือ Card ตาม `Tutoring:Payment:EnabledMethods`) metadata `kind=tutoring_booking` + `referenceId` → FE แสดง QR (PromptPay) / Payment Element (บัตร)
4. Stripe webhook → **seam ใน Commerce** (`IPaymentIntentEventListener`, ดู §4) → Tutoring: Payment=Succeeded, booking=`Confirmed`, session=`Scheduled`, สร้างห้อง (§3.5), บันทึก revenue split ใน Payout (Held), ส่งใบยืนยัน — ทั้งหมดใน transaction เดียวกับการบันทึก webhook event (idempotent)
5. hold หมดเวลา (job ทุก 1 นาที) หรือ payment ล้มเหลว ⇒ booking `Expired`, session `Cancelled` (คืนเวลา/ที่นั่ง), ยกเลิก PaymentIntent
6. จ่ายหลัง hold หมด (race) ⇒ ยึดผล Stripe: ถ้าเวลายังว่าง reopen อัตโนมัติ มิฉะนั้นคืนเงินเต็ม + แจ้งผู้ใช้ — **ห้ามกลืนเงินเงียบ**
- วิธีจ่าย: **PromptPay QR** (สแกนด้วยแอปธนาคารใดก็ได้ = ช่องทาง "Mobile Banking" ที่ Stripe ไทยรองรับ) + **บัตร Visa/Mastercard** (เปิดด้วย config เหมือน P11-09) · Stripe ไทย **ไม่รองรับ** Connect แบบ separate-charges-and-transfers จึงไม่มี Stripe-hosted escrow — เงินอยู่ใน balance ของแพลตฟอร์ม, escrow เป็น ledger ฝั่งเรา (§3.8) · admin amount-override ของ Commerce **ไม่มีผล**กับ Tutoring (ทดสอบด้วย trial ฟรี + Stripe test mode)

### 3.5 ห้อง Google Meet + ปฏิทิน + เตือน
- เมื่อ session → `Scheduled`: Tutoring เรียก `Live.Contracts.ILiveRoomProvisioner.CreateAsync(organizerUserId = ติวเตอร์, title, startsAt, endsAt, participants[{userId,email,role}])`
  - Live สร้าง `LIVE.ADHOC_MEETINGS` + sync job (เหมือน pipeline คอร์ส: ติวเตอร์เชื่อม Google แล้ว ⇒ event + Meet อัตโนมัติบนปฏิทินติวเตอร์; ยังไม่เชื่อม/Google ล้ม ⇒ `AwaitingLink` ให้วางลิงก์เอง — **ไม่ปล่อย booking ที่ไม่มีห้อง**: ถ้า 30 นาทีก่อนเริ่มยังไม่มีห้อง ⇒ แจ้งติวเตอร์เร่งด่วน + admin queue)
  - Live ส่ง ICS (PUBLISH/REQUEST/CANCEL, UID=session id, SEQUENCE เพิ่มเมื่อแก้) ให้ผู้เรียน+ติวเตอร์ผ่าน EmailOutbox โดย ICS/อีเมลมีเฉพาะ **ลิงก์ join ของเรา** `{Tutoring:PublicBaseUrl}/tutoring/sessions/{id}/join` (ไม่มี raw Meet URL)
- Reminder: job `tutoring-reminders` (ทุก 1 นาที) ส่ง **24 ชม.** และ **15 นาที**ก่อนเริ่ม ให้ทั้งสองฝ่าย (อีเมล + แจ้งเตือนในแอป) พร้อมปุ่ม Join · flag ต่อ booking ในธุรกรรมเดียวกับ outbox (idempotent) · ถ้า job ล่มช่วงหน้าต่างเตือน ⇒ ข้ามเงียบ (เหมือน Live) แต่มี metric
- Drive folder ต่อคลาส: **ไม่อยู่ใน v1 หลัก** — `drive.file` เป็น scope non-sensitive (ยืนยันจากเอกสาร Google) แต่ยัง**ไม่ยืนยัน**ว่าสร้าง/แก้ permission ของโฟลเดอร์ด้วย scope นี้ได้ ⇒ task `P13-16` (BLOCK ต้องทดสอบจริงก่อน) · ฐานที่ใช้ได้เลย: แนบไฟล์/ลิงก์ต่อคลาสใน `SESSION_MATERIALS` (§3.6)

### 3.6 เข้าเรียน · เช็กชื่อ · จบคลาส · สรุปบทเรียน
- `POST /api/tutoring/sessions/{id}/join` — ผู้ที่เป็น participant ของ session (booking `Confirmed`/ติวเตอร์เจ้าของ) เท่านั้น · เปิด `JoinWindowMinutes` ก่อนเริ่ม (ติวเตอร์เปิดได้ก่อน) · ปิดหลังจบ · คืนลิงก์ผ่าน `ILiveRoomProvisioner.GetJoinLinkAsync` · ไม่มีสิทธิ์/ไม่พบ/ยกเลิกแล้ว ⇒ **404 body เดียวกันทุกไบต์** · เขียน `SESSION_JOIN_LOGS` ก่อนคืนลิงก์ · `Cache-Control: no-store` · rate limit ต่อผู้ใช้
- **Attendance evidence** = join log (คลิกผ่านประตูเรา) **+** ปุ่ม "เริ่มคลาส" ของติวเตอร์ (`TUTOR_JOINED_AT_UTC`) **+** (ถ้าติวเตอร์มีบัญชี Workspace + ยินยอม scope เพิ่ม — optional ภายหลัง) Meet REST conference records · **ข้อจำกัดที่ต้องรู้:** ติวเตอร์ที่มี event บนปฏิทิน Google ของตัวเองกด Meet ตรงได้โดยไม่ผ่านประตูเรา ⇒ หน้า Tutor Portal ต้องทำปุ่ม "เริ่มคลาส" เป็นทางหลัก + แจ้งเตือน "ผู้เรียนรออยู่" ที่ START+5 นาที กันตัดสิน no-show ผิด
- Job `tutoring-session-finalize` (ทุก 1 นาที, ที่ START+15 นาที และ END+grace): ตัดสินตามตาราง §2 state machine · **Completed** เมื่อทั้งสองเข้า · ติวเตอร์กด "จบคลาส + สรุปบทเรียน" (`SESSION_SUMMARIES`: หัวข้อ/ข้อเสนอแนะ/การบ้าน/ขั้นต่อไป) · ผู้เรียนกด "ยืนยันคลาสเรียบร้อย" ⇒ ปล่อยเงินเร็วขึ้นได้ (`AVAILABLE_AT = now`)
- `SESSION_MATERIALS`: ติวเตอร์แนบ **ลิงก์** (Wave 3) / **ไฟล์** (ผ่าน validator เดียวกับสื่อการสอน — ต้องดึง `AttachmentFileValidator` ขึ้น `Siri.Integrations.Storage` ก่อน; ระหว่างนั้น Tutoring ถือสำเนาของตัวเอง) · ผู้เรียน (booking Confirmed/Completed) ดู/ดาวน์โหลดผ่าน presigned URL อายุสั้น

### 3.7 ยกเลิก / คืนเงิน / no-show (ใช้ตารางเดียวจริงใน `CancellationPolicy` — unit test ทุก branch)
| เหตุการณ์ | คืนผู้เรียน | ติวเตอร์ | ผลอื่น |
|---|---|---|---|
| ผู้เรียนยกเลิก ≥ 24 ชม. ก่อนเริ่ม | **100%** | ไม่ได้เงิน (split ถูก Reverse) | session ว่างกลับ |
| ผู้เรียนยกเลิก < 24 ชม. | **50%** | ได้ส่วนแบ่ง 80% ของ **ส่วนที่ไม่คืน** (ค่าเสียเวลา, หักค่าธรรมเนียม Stripe ก่อนตาม Q4) | — |
| ติวเตอร์ยกเลิก (เวลาใดก็ตาม) | **100%** | ไม่ได้ | หักคะแนน (ยิ่งใกล้เวลายิ่งหนัก) |
| ติวเตอร์ no-show | **100% ทันที** | ไม่ได้ | หักคะแนนหนัก · ถึงเกณฑ์ ⇒ ระงับอัตโนมัติ + admin queue |
| ผู้เรียน no-show | 0% | ได้เต็ม (หลังพัก 24 ชม.) | — |
| ไม่มีใครเข้า | **100%** | ไม่ได้ | ไม่หักคะแนน, สุ่มตรวจโดย admin |
| คลาสเสร็จ แล้วเปิดข้อพิพาทภายใน 24 ชม. | ตาม admin (Full/Partial/None) | ตามผล | escrow Frozen ระหว่างพิจารณา |
- ทุกการคืนเงิน = แถว `REFUNDS` + **เรียก Stripe จริง** ด้วย `IdempotencyKey` คงที่ต่อ (booking, reason) · สถานะ Processing→Completed ตามผลตอบกลับ/webhook · **PromptPay refund เป็น async — Stripe ติดต่อผู้ซื้อขอเลขบัญชีเอง** ต้องบอกผู้ใช้ตรง ๆ ใน UI (สถานะ "กำลังดำเนินการคืนเงิน") · package: คืนตามส่วนของครั้งนั้น (ราคา ÷ จำนวนครั้ง)
- **ค่าธรรมเนียม Stripe เมื่อคืนบางส่วน:** Stripe ไม่คืนค่าธรรมเนียมของส่วนที่คืน ⇒ คิดค่าธรรมเนียมเต็มจำนวนเข้ากับส่วนที่ "ไม่คืน" (ติวเตอร์/แพลตฟอร์มรับร่วมตามสัดส่วน 80/20) — **ตัวเลขนี้ต้องให้นักบัญชียืนยัน** (Q14)

### 3.8 Escrow → Wallet → Payout (ขยาย `Siri.Modules.Payout` แบบ additive)
- **Escrow = ledger**: จ่ายสำเร็จ ⇒ Tutoring เรียก `IRevenueSplitContract.RecordTutoringSplitAsync` (gross, fee จริงจาก `GetChargeFeeAsync`, commission% snapshot) ⇒ แถว `REVENUE_SPLITS` `SOURCE_TYPE=Tutoring`, `SOURCE_REF_ID=BOOKING_ID`, `INSTRUCTOR_ID=InstructorProfile.Id`, `AVAILABLE_AT_UTC = NULL` (ติด escrow — ไม่เข้า batch เด็ดขาด)
- สูตร (Q4 เดิม): `net = gross − stripeFee` · `tutor = ROUND(net × (100−commission)/100, 2)` · `platform = net − tutor`
- **ปล่อยเงิน:** booking `Completed` ⇒ `AVAILABLE_AT_UTC = completedAt + DisputeWindowHours` (ถ้าผู้เรียนกดยืนยัน ⇒ `now`) · เปิด dispute ⇒ `Freeze` (AVAILABLE_AT = NULL, `ESCROW_STATE=Frozen`) · ตัดสิน ⇒ Release หรือ Reverse
- eligibility query ของ batch เปลี่ยนเป็น `(SOURCE_TYPE=Course ∧ CreatedAtUtc ≤ now−HoldDays) ∨ (SOURCE_TYPE=Tutoring ∧ AVAILABLE_AT_UTC ≤ now)` ∧ ยังไม่อยู่ใน batch ∧ บัญชีรับเงินยืนยันแล้ว
- **รอบรายสัปดาห์:** `PERIOD_KEY` ขยายจาก `YYYY-MM` เป็นรองรับ `YYYY-Www` (ISO week) · batch ต่อ `(SOURCE_TYPE, PERIOD_KEY)` — คอร์สยังรายเดือนตาม Q4 ไม่เปลี่ยน · ภาษีหัก ณ ที่จ่าย 3% + ใบรับรองใช้ของเดิม (**ต้องให้นักบัญชียืนยันว่าค่าสอนพิเศษเข้าข่ายหักเหมือนค่าคอร์สหรือไม่ — Q14**)
- **Wallet ติวเตอร์** `GET /api/tutoring/tutor/wallet` (อ่านผ่าน `IPayoutWalletReader` ของ Payout): `held` (escrow + ยังไม่พ้น 24 ชม. + frozen) · `available` (พ้นแล้ว ยังไม่เข้า batch) · `paid` · `nextPayoutAt` · ประวัติ — Payout เดิมไม่แยก pending/available ใน API (รวมทุกอย่างเป็น "EstimatedNextPayout") ต้องเพิ่ม
- บัญชีธนาคาร/ภาษี: ใช้ endpoint `payout-account` **เดิมไม่แก้** (ติวเตอร์เป็น `InstructorOnly` อยู่แล้ว) · refund หลังจ่ายไปแล้ว ⇒ แถวติดลบรอบถัดไปตาม Q4 (Reverse ต้องรองรับ partial และ `AVAILABLE_AT` ของแถวติดลบ = ทันที — ต่างจากคอร์สที่ต้องรอ hold ใหม่ 14 วัน)

### 3.9 ข้อพิพาท (Admin Dispute Resolution)
- ผู้เรียน/ติวเตอร์เปิดได้ภายใน `DisputeWindowHours` หลังจบ (หรือหลังเวลาเริ่มกรณี no-show) · หมวด: เรียนไม่ได้ / สัญญาณติวเตอร์หลุด / พฤติกรรม / ไม่ตรงคำโฆษณา / อื่น ๆ · เธรดข้อความสามฝ่าย + แนบหลักฐาน (ลิงก์/ไฟล์)
- Admin (`/admin/tutoring/disputes`) ดูหลักฐาน (join logs ทั้งสองฝ่าย, ข้อความ, ประวัติติวเตอร์) แล้วตัดสิน: Full / Partial (ระบุจำนวน) / None ⇒ เรียก refund service (Stripe จริง) หรือปล่อยเงิน · ทุกการตัดสิน = audit + อีเมลสองฝ่าย · ติวเตอร์ถูกร้องเรียนซ้ำ ⇒ ธง/ระงับ

### 3.10 รีวิว
- รีวิวได้เมื่อ booking = `Completed` (หนึ่งรีวิวต่อ booking) · เผยแพร่ทันที · admin ซ่อนได้ (มี audit) · `RATING_AVERAGE/COUNT` อัปเดตผ่าน updater ตัวเดียว + job reconcile รายวัน (ไม่ทำซ้ำช่องโหว่ X-20 ของคอร์ส)

## 4. Contracts ข้ามโมดูล (ทั้งหมด additive — ต้องผ่าน ArchitectureTests)

| Contract | ประกาศที่ | implement ที่ | ใช้โดย | ทำอะไร |
|---|---|---|---|---|
| `ILiveRoomProvisioner` (Create/Update/Cancel/GetJoinLink/GetStatus/SetManualLink) | `Live.Contracts` | `Live` | Tutoring | ห้องอิสระ + ICS + sync Google (§3.5) |
| `IPaymentIntentEventListener` (Kind, Succeeded/Failed/Canceled) | `SharedKernel.Contracts` | `Tutoring` | `Commerce` webhook | dispatch event ที่ metadata `kind=tutoring_booking` — **Commerce เพิ่มแค่ 1 branch หลังตรวจ signature + บันทึก event idempotency แล้ว** (ไม่มี Commerce→Tutoring reference จึงไม่เกิด cycle) |
| `CreatePaymentIntentRequest` + `Kind`/`ReferenceId` metadata | `Siri.Integrations.Payment` | Stripe adapter | Tutoring/Commerce | เพิ่ม field optional (default = ของเดิม) |
| `IRevenueSplitContract` + `RecordTutoringSplit`/`Release`/`Freeze`/`ReverseBySource` | `Payout.Contracts` | `Payout` | Tutoring | §3.8 |
| `IPayoutWalletReader` | `Payout.Contracts` | `Payout` | Tutoring | pending/available/paid |
| `IInstructorProfileReader` (มีแล้ว) | `Catalog.Contracts` | `Catalog` | Tutoring | ยืนยัน profile Approved + แปลง userId↔profileId |
| `IUserContactReader` (มีแล้ว) | `Identity.Contracts` | `Identity` | Tutoring | อีเมลผู้รับ |
| `ISecurityAuditContract` (มีแล้ว) | `Identity.Contracts` | `Identity` | Tutoring | audit KYC/เงิน/dispute |
| `IEmailOutbox` / `IUserNotificationOutbox` (มีแล้ว) | `Notification.Contracts` | `Notification` | Tutoring | อีเมล/แจ้งเตือนในแอป |
| `ITutorVerificationReader` | `Tutoring.Contracts` | `Tutoring` | `Siri.Api` (policy `TutorOnly`) | ยืนยัน Verified ที่ API |
| `IKycFileStorage : IFileStorage` | `Siri.Integrations.Storage` | R2 (bucket แยก) | Tutoring | ไฟล์ KYC + `ISensitiveDataProtector` เพิ่ม overload ไบต์ (ไม่มี package ใหม่) |

## 5. API surface (สรุป — รายละเอียด request/response/error ไปอยู่ใน contract ต่อ task) · base `/api/tutoring` · MVC controllers ใต้ `Siri.Api/Controllers/Tutoring/`

- **Public:** `GET tutors`, `GET tutors/{slug}`, `GET tutors/{slug}/slots`, `GET tutors/{slug}/reviews`, `GET subjects`
- **Learner (`[Authorize]`):** `learner-profiles` CRUD · `POST bookings`, `POST bookings/{id}/payment`, `GET bookings/my`, `GET bookings/{id}`, `POST bookings/{id}/cancel`, `POST bookings/{id}/confirm-completed`, `POST bookings/{id}/review`, `POST bookings/{id}/dispute` · `GET sessions/{id}/materials` · `POST sessions/{id}/join` · `GET packages/my` · `POST packages/{id}/purchase`
- **Tutor (`TutorOnly` = Instructor+Approved profile; KYC-สถานะ Verified ที่ endpoint ที่ต้องการ):** `tutor/profile` GET/PUT, `tutor/offerings`, `tutor/educations`, `tutor/certificates`, `tutor/kyc` (consent/submit/documents upload), `tutor/availability` (rules/exceptions/settings), `tutor/classes` (upcoming/history), `tutor/classes/{id}/start|complete|cancel|summary|materials`, `tutor/packages`, `tutor/wallet`, `tutor/disputes`
- **Admin (`AdminOnly`):** `admin/tutoring/kyc` (queue/case/document stream/decide), `tutors` (list/suspend/commission), `disputes` (list/detail/message/decide), `refunds` (manual), `analytics/*`, `subjects` CRUD, `reviews/{id}/hide`
- ทุก action ใส่ `[Authorize]`/`[AllowAnonymous]` ชัดเจน (ไม่มี fallback policy) · rate limit ใหม่: `tutoring-search` (ต่อ IP), `tutoring-booking`, `tutoring-join`, `tutoring-upload` (ต่อผู้ใช้) — ห้ามใช้ `default` (global ไม่ partition)

## 6. Frontend (Angular 22) — อ้างผลสำรวจ `siri_upskill_ui`

- **Public (SSR):** `/tutors` (ค้นหา+filter+facets, state ใน URL), `/tutors/:slug` (โปรไฟล์ + วิดีโอแนะนำ + ปฏิทิน slot + รีวิว + JSON-LD) · **ต้องสร้างใหม่:** calendar/slot picker (ไม่มีใน shared kit; ใช้ `@angular/cdk` ได้), ช่องให้คะแนนดาว
- **Learner (CSR, `authGuard`):** `/tutors/:slug/book` (เลือก learner-profile/ชนิด/slot → สรุปราคา), `/tutoring/checkout/:bookingId` (QR PromptPay + บัตร — reuse รูปแบบ `card-payment-panel` เดิมถ้าแยกจาก Commerce ได้), `/my-tutoring` (ตารางเรียน + ปุ่ม Join + ประวัติ + เอกสาร/การบ้าน + รีวิว), `/tutoring/sessions/:id/join` (mirror `live-join-page`: POST ครั้งเดียวใน `afterNextRender`, state machine, `noindex`), `/account/learner-profiles`
- **Tutor Portal:** ใต้ `/instructor/tutoring/*` (ผ่าน `instructorStudioGuard` อยู่แล้ว; **หน้า onboarding KYC เข้าได้ตั้งแต่ยังไม่ Verified**; หน้าที่ต้อง Verified ใช้ guard เพิ่ม): onboarding/KYC, โปรไฟล์+วิชา+ราคา, ความพร้อม (week grid + exception), คลาส (รออนุมัติ/กำลังจะมา/ย้อนหลัง + start/complete/cancel/summary/materials), กระเป๋าเงิน (ใช้ endpoint payout-account เดิมสำหรับบัญชีธนาคาร) · เพิ่มใน `INSTRUCTOR_NAV_LINKS` + ลงทะเบียน icon ใน `instructor-layout.ts`
- **Admin:** `/admin/tutoring/{kyc,tutors,disputes,analytics}` ใน `ADMIN_NAV_LINKS` · กราฟ = CSS bars + KPI tiles (ไม่มี chart lib; ห้ามเพิ่มโดยไม่ถาม)
- ทุกหน้า: loading/error/empty ครบ · i18n key `tutoring.<audience>.<screen>.<element>` (th+en, `i18n-guard.spec` เขียว) · token/`tone-*` เท่านั้น (`theme-guard.spec` เขียว) · `bangkokDate` pipe · `currencyThb` (ต้อง `providers:[CurrencyPipe]`) · เพิ่ม `RenderMode.Client` ใน `app.routes.server.ts` ให้เส้นทางที่ต้อง login ทุกเส้น · เมนู "การสอนพิเศษของฉัน" ใน `buildAccountMenuItems()` + ลิงก์ "ติวเตอร์" ใน `SITE_NAV_LINKS`

## 7. Security / PDPA (เพิ่มจาก `SECURITY.md` §ใหม่ "Tutoring")

- **เอกสาร KYC เป็นข้อมูลอ่อนไหวสูง** (บัตรประชาชน + ประวัติอาชญากรรม): bucket R2 แยก (ไม่มี public domain) · เข้ารหัสไฟล์ชั้นแอป AES-256-GCM ก่อนอัปโหลด · magic-byte + ขนาด ≤ 10 MB + allow-list (pdf/jpg/png) · **ไม่มี presigned URL** — admin ดูผ่าน endpoint ที่ stream ไฟล์ถอดรหัส + `Cache-Control: no-store` + access log · retention/purge ตาม config · ไม่ log เนื้อหา/ชื่อไฟล์ดิบ · ขอ consent PDPA พร้อมเวอร์ชันข้อความ · **ก่อนเปิด production ต้องบังคับ 2FA ของ Admin** (ปัจจุบัน `TwoFactorEnabled` ยังไม่ถูก enforce ทั้งที่ SECURITY.md ระบุ)
- **ผู้เยาว์:** ไม่เก็บวันเกิด/บัตร — เก็บแค่ `NICKNAME` + ระดับชั้น + `IS_MINOR` + consent ของผู้ปกครอง · ติวเตอร์เห็นเฉพาะชื่อเล่น/ระดับชั้น · ไม่มีแชตตรงนอกแพลตฟอร์มใน v1 · ลิงก์ห้องผ่าน join gate เท่านั้น · **แพลตฟอร์มไม่บันทึกคลาส** (ห้ามบันทึกโดยติวเตอร์ตาม ToS)
- **IDOR:** ทุก endpoint ที่รับ `{id}` เช็คเจ้าของ (booking → learner/tutor เจ้าของ; session → participant; dispute → สองฝ่าย; wallet → ติวเตอร์ตัวเอง) ใน query เดียวกับการดึงข้อมูล (ไม่ query แล้วค่อยเช็ค) · ไม่มี `userId` ใน body/query
- **เงิน:** ราคาจาก server · ยืนยันจ่ายจาก webhook+signature เท่านั้น · idempotency key ทุก refund · ห้าม hard delete payment/refund/booking/split · ทุกการเปลี่ยนสถานะเงินเขียน `SECURITY_AUDIT`
- **PDPA hooks:** Tutoring ต้องมี export + erasure + retention ของตัวเอง (Identity `AnonymizeAccount`/`DataExport` ไม่ข้ามโมดูล) — task `P13-17`
- สิ่งที่**ต้องให้ที่ปรึกษากฎหมาย/นักบัญชียืนยัน** (ผมออกแบบระบบได้ ไม่ใช่คำแนะนำกฎหมาย/ภาษี) → Q14

## 8. งานที่กระทบของเดิม (ทุกจุด additive; บันทึก X-ใหม่ใน `TASKS.md` สำหรับปัญหาเดิมที่พบ — **ไม่แก้นอกขอบเขต**)

| โมดูล | สิ่งที่เปลี่ยน | ความเสี่ยง |
|---|---|---|
| Live | ตาราง `ADHOC_MEETINGS`(+participants) + service + sync job + `ILiveRoomProvisioner` + ICS สำหรับห้องอิสระ · **ไม่แก้** pipeline คอร์ส/`SESSION_JOIN_LOG` | ต่ำ (ไฟล์ใหม่) |
| Payout | `REVENUE_SPLITS` + 3 คอลัมน์ (backfill `SOURCE_TYPE='Course'`) · eligibility query · `PERIOD_KEY` กว้างขึ้น · contracts ใหม่ · earnings summary แยก pending/available | **กลาง (โค้ดเงิน)** — ต้องมี unit test ครอบ query เดิมไม่ regress |
| Commerce | webhook เพิ่ม dispatch ไป listener หลัง idempotency insert (1 branch) · **ไม่แตะ** Order/Pricing/Refund/TaxInvoice | ต่ำ-กลาง |
| Siri.Integrations.Payment | request เพิ่ม metadata optional | ต่ำ |
| Siri.Integrations.Storage | `IKycFileStorage` + options ชุดที่สอง | ต่ำ |
| SharedKernel | `IPaymentIntentEventListener`, `ISensitiveDataProtector` overload ไบต์, policy name `TutorOnly` | ต่ำ |
| Api / Workers / sln / ArchitectureTests | wire module ใหม่ · `ModuleAssemblyCatalog` + `DatabaseIdentifierLengthTests` (นับ module 11→12) · rate limiter ใหม่ · jobs ใหม่ | ต่ำ |
| Identity | **ไม่เปลี่ยน** (ไม่มี role/gender ใหม่) — ข้อสังเกตเดิม: register ด้วยรหัสผ่านไม่ assign role Learner (มีแค่ Google sign-up) | — |

## 9. ลำดับส่งมอบ (เรียงตาม dependency จริง · ดูราย task ใน `TASKS.md` §P13)

- **Wave 1 — โครง + ผู้ติวเตอร์ + ค้นหา (ไม่มีเงิน):** P13-01 module+ติวเตอร์+KYC workflow · P13-02 เอกสาร KYC (เข้ารหัส/access log/purge) · P13-03 availability + slots · P13-04 ค้นหา/โปรไฟล์สาธารณะ/search log
- **Wave 2 — จอง + เงิน:** P13-05 learner profiles + booking core (hold/seat/trial ฟรี) · P13-06 payment + webhook seam · P13-07 Payout ขยาย + wallet reader · P13-08 cancellation/refund/no-show engine · P13-12 packages
- **Wave 3 — Meet + เรียนจริง:** P13-09 Live ad-hoc rooms · P13-10 join gate/attendance/finalize/summary/materials · P13-11 reminders
- **Wave 4 — ความเชื่อมั่น + ปฏิบัติการ:** P13-13 รีวิว · P13-14 disputes · P13-15 admin analytics · P13-17 PDPA hooks
- **Wave 5 (flag/ต้องทดสอบจริง):** P13-16 Drive folder · attendance ผ่าน Meet REST (Workspace)
- **FE** ตามหลัง contract ของแต่ละ wave (เริ่มขนานกับ BE ได้เมื่อ DTO FROZEN) · **E2E + security review** (P13-30/31) ปิดท้าย

## 10. ความเสี่ยงเฉพาะ

| ความเสี่ยง | การรับมือ |
|---|---|
| ติวเตอร์ไม่เชื่อม Google / OAuth app ยังไม่ผ่าน verification (จำกัด 100 ผู้ใช้) | โหมด Manual link ใช้ได้เต็ม · แจ้งเตือนติวเตอร์ · ไม่ปล่อยคลาสที่ไม่มีห้อง |
| ตัดสิน no-show ผิดเพราะติวเตอร์เข้า Meet ตรงจากปฏิทิน | ปุ่ม "เริ่มคลาส" เป็นทางหลัก + เตือน START+5 นาที + ติวเตอร์ appeal ผ่าน dispute |
| เงินของบุคคลที่สามพักในบัญชีแพลตฟอร์ม | เป็นโมเดลเดียวกับ payout คอร์สที่มีอยู่ (collect→hold→pay) · **ขอความเห็นกฎหมายก่อน launch** (Q14) |
| PromptPay refund ช้า/ต้องการเลขบัญชีผู้ซื้อ | UI บอกสถานะตรง ๆ · `REFUNDS` ติดตามสถานะ · ops queue ตาม |
| จองซ้อน/แย่งที่นั่งพร้อมกัน | exclusion constraint + atomic seat claim + integration test แข่งกัน (ไม่ใช่แค่เช็คใน memory) |
| Double refund / ยิง webhook ซ้ำ | `IDEMPOTENCY_KEY` UQ + idempotent webhook เดิม |
| นักเรียนเด็ก / ความปลอดภัย | §7 + ไม่มีแชตตรง + ไม่บันทึกคลาส + dispute/ระงับติวเตอร์เร็ว |
| ทำงานชนกับ session อื่นในรีโปเดียวกัน (ตอนนี้มีงาน Meilisearch refactor ค้างอยู่ใน Catalog/SharedKernel/Search) | ไม่แตะไฟล์ Catalog/Search · migration ใหม่ต้องเช็ค snapshot ก่อน · build ใน HEAD snapshot ถ้า tree พัง |
