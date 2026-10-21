# Contract: P13-13 รีวิวติวเตอร์ (`TUTOR_REVIEWS`) — 1 รีวิวต่อ booking ที่ Completed, ผู้เขียน = เจ้าของ booking, ชื่อผู้รีวิวเผยแพร่แบบจำกัด, admin ซ่อน/เลิกซ่อน, `RATING_*` เขียนผ่าน `ITutorStatsWriter.SetRatingAsync` ที่เดียว + คำนวณใต้ lock + job reconcile รายวัน

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE entity/DB, schema `TUTORING`) — ใช้ `Notification.Contracts` / `Identity.Contracts` (มีอยู่แล้ว) · ไม่แตะ Catalog / Payout / Commerce / Live · `Siri.Api` (controller ใหม่ 2 ตัว) · `Siri.Workers` (job 1 ตัว)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..E)** (TASKS.md ตั้ง P13-13 เป็น `AG` — **ขอเปลี่ยนเป็น CC**: งานนี้คือ "การคำนวณค่า denormalized ที่เคยพลาดแล้วใน X-20" + การตัดสินว่ารีวิวใดนับเข้าคะแนนโดยอิงสถานะเงินของ booking (refund) + ความเป็นส่วนตัวของผู้เรียนที่เป็นเด็ก ⇒ ตรงเกณฑ์ที่ห้ามส่ง Antigravity) · **ไม่ต้องผ่าน DESIGN_DATABASE** (ตารางเดียว §2 ระดับคอลัมน์/index/CHECK ครบ) · FE ขนานได้ทันทีจาก DTO appendix

> **อ่านคู่กับ:** `docs/TUTORING.md` §3.10, §5, §7 · `REQUIREMENTS.md` TM-18 · `TASKS.md` **X-20 ข้อ (5)** (ช่องว่าง rating drift ของคอร์ส) · **P13-01** (`ITutorStatsWriter.SetRatingAsync`, `TutorProfileStatsUpdater`, source-scan test, `TutoringReasons`/`TutoringErrors`, `ITutorPublicCacheInvalidator`, `TutoringOutputCache`) · **P13-04** (profile visibility rule + cache policy + JSON-LD `aggregateRating` เฉพาะ `RATING_COUNT>0`) · **P13-05** (booking domain/`ITutoringUnitOfWork`/`LockBookingAsync`/`PostgresViolations`/ข้อความ 404 ของ booking) · **P13-08** (`REFUNDED_AMOUNT` ความหมาย + `BookingStatus`) · **P13-14** (dispute — เรียก `TutorRatingService.RecomputeAsync` หลังคืนเงิน) · **P13-17** (`REDACTED_AT_UTC` เขียนโดย PDPA เท่านั้น)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body 2026-10-14 — ไม่เชื่อ doc comment)

| # | ข้อเท็จจริง | หลักฐาน | ผลต่อ contract |
|---|---|---|---|
| F1 | `SetRatingAsync(tutorId, average, count)` มีอยู่จริงแล้ว: validate (`count ≥ 0`, `0 ≤ average ≤ 5`), ปัดเฉลี่ย 2 ตำแหน่ง `AwayFromZero`, `ExecuteUpdateAsync` เขียน `RATING_AVERAGE`+`RATING_COUNT` สองคอลัมน์ใน statement เดียว, **ไม่หมุน `ROW_VERSION`**, ไม่พบติวเตอร์ = no-op, join ธุรกรรมที่เปิดอยู่ของ `AppDbContext` | `Siri.Modules.Tutoring/Infrastructure/TutorProfileStatsUpdater.cs:57-74`; interface `Application/TutoringAbstractions.cs:24` | P13-13 **ไม่เขียน `RATING_*` เอง** — เรียก `ITutorStatsWriter.SetRatingAsync` จาก `TutorRatingService` ที่เดียว (source-scan test ของ P13-01 §9 บังคับอยู่แล้ว + เพิ่มข้อห้าม "ผู้เรียก `SetRatingAsync` มีได้แค่ `TutorRatingService`") |
| F2 | **กลไก drift ของคอร์ส (X-20 ข้อ 5):** `CreateCourseReviewHandler` ① `SaveChanges` เพิ่มรีวิว ② **โหลดรีวิวทั้งหมดเข้าหน่วยความจำ** นอก transaction/lock ③ คำนวณค่าเฉลี่ยจาก `reviews.Count` ④ `course.UpdateRatingStats` + `SaveChanges` อีกรอบ — สองคำขอพร้อมกันต่างอ่านชุดที่ยังไม่เห็นรีวิวของอีกฝ่าย ⇒ ค่าสุดท้ายนับขาด · ไม่มี job reconcile (grep `reconcile` ใน Workers ไม่มีของ rating) · ปัดเฉลี่ย 1 ตำแหน่ง | `Siri.Modules.Catalog/Features/CreateCourseReview/CreateCourseReviewHandler.cs:60-92`; `Domain/COURSE.cs:818-822`; `Siri.Workers/RecurringJobIds.cs` (ไม่มี rating job) | Tutoring ต้อง (ก) คำนวณด้วย `SUM/COUNT` ใน SQL ไม่โหลดทั้งชุด (ข) **serialize ต่อติวเตอร์ด้วย `SELECT … FOR UPDATE` บนแถว `TUTOR_PROFILES` ก่อนคำนวณ** (ค) เขียนผ่าน writer ที่เดียว (ง) มี job reconcile รายวัน + เทสต์แข่งกัน — §5 |
| F3 | `CreateCourseReviewHandler` คืน `review.UserId` และชื่อเต็มผู้ใช้ออก DTO สาธารณะ | `Features/CreateCourseReview/CreateCourseReviewHandler.cs:100-107` | **ไม่ทำตาม** — Tutoring ใช้ป้ายผู้รีวิวแบบ allow-list (§4) ไม่มี userId/อีเมล/ชื่อบัญชี |
| F4 | `IUserNotificationOutbox.Stage` ตัด title 200/body 2000, **throw** ถ้า `linkUrl` ไม่ใช่ path `/…` ตัวเดียวหรือ http(s) ≤1000, `type` ≤64; `IEmailOutbox.Enqueue` เป็น stage-only (ไม่ `SaveChanges`) | `Siri.Modules.Notification/Contracts/IUserNotificationOutbox.cs`, `IEmailOutbox.cs` | แจ้งเตือนทั้งหมดของงานนี้ stage ใน unit-of-work เดียวกับการเปลี่ยนสถานะ; `linkUrl` เป็น path แอป |
| F5 | `TutoringErrors.NotFound`/`TutorNotFound` เป็น **static instance เดียว** (ไบต์เดียวกันทุกกรณี "ไม่พบ/ไม่ใช่ของฉัน"); `TutoringReasons.ConcurrentUpdate = "tutoring.concurrent_update"`; `TutoringServiceSupport.IsValidPaging(page, pageSize 1..100)` | `Application/TutoringErrors.cs`, `TutoringServiceSupport.cs` | reason ใหม่ของงานนี้เพิ่มใน `TutoringReasons`/`TutoringErrors` แบบ static instance ต่อ reason; 404 ของ booking ใช้ `tutoring.booking_not_found` ตามที่ P13-05 §8 กำหนด |
| F6 | `TutoringOutputCache` มี `ProfilePolicyName/ProfileTag`, `SlotsPolicyName/SlotsTag`, `SitemapPolicyName/SitemapTag` (+ P13-04 เพิ่ม search/subjects) · `TutorPublicCacheInvalidator.InvalidateProfilesAsync` evict `ProfileTag`+`SitemapTag` และกลืน exception ของ store | `Infrastructure/TutoringOutputCache.cs` | เพิ่ม `ReviewsPolicyName="TutoringReviews"`, `ReviewsTag="tutoring-reviews"` (additive) + เรียก `InvalidateProfilesAsync` หลังเปลี่ยน rating (การ์ด/โปรไฟล์/ค้นหาแสดงดาว) |
| F7 | `MeetingLinkText.ContainsLink` (SharedKernel) ตรวจลิงก์ห้องประชุมแม้ปลอมแปลง (zero-width, full-width, percent-encoded) | `Siri.SharedKernel/MeetingLinkText.cs` | คอมเมนต์รีวิว (สาธารณะ) **ปฏิเสธ** ถ้ามีลิงก์ห้องประชุม (ลิงก์ห้อง = capability) |
| F8 | `RecurringJobIds.All` ตรงกับที่ลงทะเบียน (`HangfireHostingTests`); jobs ที่กำหนดไว้แล้วในเวลา 02:00 analytics · 03:00 stripe · 03:30 reliability/search-log purge · 04:00 pdpa retention (Identity) | `Siri.Workers/RecurringJobIds.cs`, `RecurringJobsRegistration.cs`; P13-04/08 | job ใหม่ `tutoring-review-reconcile` ตั้ง `Cron.Daily(4, 30)` (ไม่ชนช่วงอื่น) |

---

## 1. Scope & task IDs

**ใน:** ตาราง `TUTOR_REVIEWS` + migration `AddTutorReviews` · `TutorReviewService` (สร้าง/แก้ถ้าเปิด config/อ่านของฉัน/สถานะรีวิวได้ไหม) · `TutorRatingService` (**ที่เดียวที่คำนวณและเรียก `SetRatingAsync`**) · endpoint สาธารณะ `GET tutors/{slug}/reviews` · endpoint ผู้เรียก (`/bookings/{id}/review`) · endpoint admin (list/hide/unhide) · job `tutoring-review-reconcile` · ป้ายผู้รีวิว (reviewer label) แบบปลอดภัย · แจ้งเตือน · output-cache policy+tag

**นอก:** ตอบกลับรีวิวโดยติวเตอร์ (reply) · รายงานรีวิวโดยติวเตอร์ · รีวิวคอร์ส (Catalog — ไม่แตะ X-20 ข้อ 5 ของคอร์ส; รายงานอย่างเดียว) · endpoint รายการรีวิวของติวเตอร์เอง (ใช้หน้าสาธารณะ — กัน correlation §4.3) · การให้คะแนนแบบหลายมิติ · FE (DTO appendix เป็นสัญญา)

---

## 2. Schema delta — migration `AddTutorReviews` (ตารางใหม่ 1 ตาราง; ไม่แตะตารางอื่น)

> UPPERCASE ผ่าน `ApplyUppercaseNamingConventions` · `IAuditable` เป็น PascalCase ใน C# (`CreatedAtUtc/CreatedBy/UpdatedAtUtc/UpdatedBy`, map `CREATED_AT_UTC` ฯลฯ) · เวลา `timestamptz(3)` UTC · enum เก็บ string · `ROW_VERSION bytea` (`.IsConcurrencyToken().HasColumnType("bytea")`) · **FK ทุกเส้น `NoAction` (README §2 รอบ 2 — ไม่ใช้ `Restrict`); ไม่มีเมธอดลบ** · ชื่อ ≤63 ไบต์ ตั้งเอง · accessor `TutorReviews()` · อ่าน migration ทั้งไฟล์ (ไม่มี shadow FK) · **ห้าม apply DB จริงเอง**

### 2.1 `TUTORING.TUTOR_REVIEWS` (entity `TUTOR_REVIEW : IAuditable`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `REVIEW_ID` | uuid PK | no | UUIDv7 |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` **NoAction** (`FK_TUTOR_REVIEWS_TUTOR_PROFILES_TUTOR_ID`) · denormalize จาก booking (ไว้ index/aggregate) |
| `BOOKING_ID` | uuid | no | FK → `TUTOR_BOOKINGS` **NoAction** (`FK_TUTOR_REVIEWS_TUTOR_BOOKINGS_BOOKING_ID`) · **UQ** `UQ_TUTOR_REVIEWS_BOOKING` — หนึ่งรีวิวต่อ booking (ทุกชนิด: single/group/trial/package) |
| `REVIEWER_USER_ID` | uuid | no | = `TUTOR_BOOKINGS.LEARNER_USER_ID` ณ ตอนเขียน (บัญชีเจ้าของ booking) · ไม่มี FK ข้าม schema · **ไม่ออก API สาธารณะเด็ดขาด** |
| `RATING` | smallint | no | 1–5 |
| `COMMENT` | varchar(1000) | yes | ข้อความล้วน (plain) · null/ว่าง = ไม่มีความเห็น · P13-17 ล้างเป็น null ตอน erasure |
| `REVIEWER_KIND` | varchar(12) | no | `ReviewerKind`: `Nickname` \| `Guardian` \| `Anonymous` — **snapshot ณ ตอนเขียน** (§4) |
| `REVIEWER_NICKNAME` | varchar(40) | yes | มีค่าก็ต่อเมื่อ `REVIEWER_KIND='Nickname'` (ผู้เรียนผู้ใหญ่ที่ไม่เลือกนิรนาม) |
| `REVIEWER_GRADE_BAND` | varchar(16) | yes | มีค่าก็ต่อเมื่อ `REVIEWER_KIND='Guardian'`: `Primary` \| `Secondary` \| `Vocational` \| `Other` (หยาบ — ไม่ใช่ `LearnerGrade` เต็ม) |
| `STATUS` | varchar(10) | no | `ReviewStatus`: `Published` \| `Hidden` (default `Published`) |
| `HIDDEN_BY_USER_ID` | uuid | yes | admin ที่ซ่อนล่าสุด |
| `HIDDEN_AT_UTC` | timestamptz(3) | yes | |
| `HIDE_REASON` | varchar(500) | yes | เหตุผลภายใน — **ไม่ออกให้ผู้รีวิวหรือติวเตอร์เห็น** |
| `EDITED_AT_UTC` | timestamptz(3) | yes | ตั้งเมื่อผู้รีวิวแก้ (เฉพาะเมื่อเปิด `EditWindowHours`) |
| `REDACTED_AT_UTC` | timestamptz(3) | yes | **เขียนโดย P13-17 เท่านั้น** (PDPA erasure/consent withdrawal) |
| `ROW_VERSION` | bytea | no | |
| audit | | | PascalCase |

Index / constraint (ชื่อตายตัว):
- `PK_TUTOR_REVIEWS` · **UQ** `UQ_TUTOR_REVIEWS_BOOKING` (`BOOKING_ID`)
- `IX_TUTOR_REVIEWS_TUTOR_PUBLISHED` (`TUTOR_ID`, `CREATED_AT_UTC` DESC, `REVIEW_ID` DESC) `HasFilter("\"STATUS\" = 'Published'")` — รายการสาธารณะ + aggregate
- `IX_TUTOR_REVIEWS_CREATED` (`CREATED_AT_UTC` DESC, `REVIEW_ID` DESC) — admin list
- `IX_TUTOR_REVIEWS_REVIEWER` (`REVIEWER_USER_ID`) — PDPA export/erasure (P13-17)
- **PostgreSQL ถือว่า CHECK ผ่านเมื่อนิพจน์เป็น NULL ⇒ ทุก CHECK ที่ต้องบังคับให้คอลัมน์มีค่าต้องมี `IS NOT NULL` ชัดเจน** (บทเรียน implementer P13-01) — คอลัมน์ข้างล่างเป็น `NOT NULL` อยู่แล้ว แต่ CHECK ระบุซ้ำไว้เป็นด่านที่สอง
- CHECK `CK_TUTOR_REVIEWS_RATING` (`"RATING" IS NOT NULL AND "RATING" BETWEEN 1 AND 5`)
- CHECK `CK_TUTOR_REVIEWS_STATUS` (`"STATUS" IS NOT NULL AND "STATUS" IN ('Published','Hidden')`) · CHECK `CK_TUTOR_REVIEWS_KIND` (`"REVIEWER_KIND" IS NOT NULL AND "REVIEWER_KIND" IN ('Nickname','Guardian','Anonymous')`)
- CHECK `CK_TUTOR_REVIEWS_HIDDEN` (`"STATUS" IS NOT NULL AND ("STATUS" <> 'Hidden' OR ("HIDDEN_AT_UTC" IS NOT NULL AND "HIDE_REASON" IS NOT NULL))`)
- CHECK `CK_TUTOR_REVIEWS_REVIEWER_SHAPE` (`"REVIEWER_KIND" IS NOT NULL AND ("REVIEWER_KIND" = 'Nickname') = ("REVIEWER_NICKNAME" IS NOT NULL) AND ("REVIEWER_KIND" = 'Guardian') = ("REVIEWER_GRADE_BAND" IS NOT NULL)`)

Domain (`private set`, เปลี่ยนผ่านเมธอด): `static Create(tutorId, bookingId, reviewerUserId, rating, comment, reviewer: ReviewerLabel, IClock)` · `Edit(rating, comment, reviewer, IClock)` (เฉพาะ `Published`) · `Hide(adminUserId, reason, IClock)` (Published→Hidden; Hidden อยู่แล้ว = no-op ที่ service) · `Unhide(IClock)` (Hidden→Published; ล้าง `HIDDEN_*`) · `Redact(IClock)` (P13-17: `COMMENT=null`, kind→`Anonymous`, ล้าง nickname/band, `REDACTED_AT_UTC ??= now`) · invariants: rating 1–5; comment ผ่าน `ReviewCommentRules` แล้ว; ไม่มี setter สาธารณะ · transition นอกตาราง ⇒ `InvalidOperationException` (theory test ครบ)

### 2.2 ไม่มี FK/คอลัมน์เพิ่มบนตารางอื่น
`TUTOR_PROFILES.RATING_AVERAGE/RATING_COUNT` มีแล้ว (P13-01) — **เขียนผ่าน `ITutorStatsWriter` เท่านั้น**

---

## 3. กติกาการเขียนรีวิว (gate) — `TutorReviewService.CreateAsync(callerUserId, bookingId, request, ct)`

ลำดับ **บังคับ** (ownership อยู่ใน query เดียวกับการดึงข้อมูล):

```
1. pre-read (ไม่ล็อก):  b = TUTOR_BOOKINGS JOIN TUTOR_SESSIONS s JOIN LEARNER_PROFILES lp JOIN TUTOR_PROFILES tp
                        WHERE b.BOOKING_ID = @id AND b.LEARNER_USER_ID = @caller
   ไม่พบ ⇒ 404 tutoring.booking_not_found (ข้อความเดียวกับ "ไม่มีจริง" — P13-05 §8)
2. feature flag Tutoring:Reviews:Enabled = false ⇒ 404 tutoring.not_found  (ปิดทั้งระบบรีวิวได้ทันที)
3. validate request (§3.2)  — ก่อนเปิด transaction
4. ITutoringUnitOfWork.ExecuteInTransactionAsync:
   4a. LockBookingAsync(b.BOOKING_ID)   (ลำดับ lock D-B: SESSIONS → BOOKINGS → … → TUTOR_PROFILES — flow นี้ล็อกเฉพาะ BOOKING → (แถวรีวิว) → TUTOR_PROFILES ซึ่งเป็น subsequence ของ chain; ไม่แตะ purchase/payment/refund)
   4b. อ่านสถานะซ้ำหลังล็อก แล้วตรวจ eligibility (§3.1)
   4c. มีรีวิวของ booking นี้แล้ว (SELECT ภายใต้ lock) ⇒ 409 tutoring.review_exists ext {reviewId}
   4d. reviewer label = ReviewerLabelBuilder.Build(lp, request.Anonymous, options)  (§4)
   4e. INSERT TUTOR_REVIEW  (UQ_TUTOR_REVIEWS_BOOKING เป็น backstop — ชน ⇒ rollback ⇒ 409 review_exists)
   4f. TutorRatingService.RecomputeAsync(tutorId)   ← ล็อกแถว profile FOR UPDATE → SUM/COUNT → SetRatingAsync  (§5)
   4g. stage in-app notification ให้ติวเตอร์ (§8)
   4h. COMMIT
5. หลัง commit: ITutorPublicCacheInvalidator.InvalidateProfilesAsync + InvalidateReviewsAsync (best-effort, ล้มไม่ทำให้ request ล้ม)
6. ตอบ 201 MyReviewResponse
```
ไม่เขียน `SECURITY_AUDIT` ตอนสร้างรีวิวปกติ (ปริมาณสูง ไม่ใช่เงิน/สิทธิ์) — มี log เชิงโครงสร้าง `tutoring.review.created` (ids เท่านั้น) · การซ่อน/เลิกซ่อน = audit (§7)

### 3.1 Eligibility (ตัดสินใต้ lock เท่านั้น)

| เงื่อนไข | ผล |
|---|---|
| `b.STATUS ≠ Completed` (รวม `Confirmed` ที่ยังไม่ตัดสิน, `NoShowLearner/Tutor/Both`, `Disputed`, `CancelledBy*`, `Expired`, `PendingPayment`) | 409 `tutoring.review_booking_not_completed` ext `{bookingStatus}` |
| `PRICE_AMOUNT > 0` และ `REFUNDED_AMOUNT ≥ PRICE_AMOUNT` (คืนเต็ม) | 409 `tutoring.review_booking_refunded` |
| `now > COMPLETED_AT_UTC + ReviewWindowDays` | 409 `tutoring.review_window_closed` ext `{reviewableUntilUtc}` |
| ทดลองเรียนฟรี (`PRICE_AMOUNT = 0`, `IS_TRIAL = true`) | **อนุญาต** (เงื่อนไขอื่นเหมือนกัน) |
| ติวเตอร์ถูกระงับ/ไม่ listed ภายหลัง | **อนุญาต** (รีวิวของคลาสที่เกิดขึ้นจริงยังเขียนได้; แต่ไม่แสดงสาธารณะจนกว่าติวเตอร์ public) |
| คลาสกลุ่ม | อนุญาตต่อ booking (แต่ละผู้ซื้อเขียนของตัวเอง) |
| booking `Disputed` | ไม่อนุญาต (สถานะไม่ใช่ Completed) — หลัง dispute ตัดสินและ booking กลับเป็น `Completed` (P13-14) จึงเขียนได้ ถ้าไม่ได้คืนเต็ม |
Partial refund (`0 < REFUNDED_AMOUNT < PRICE_AMOUNT`) ⇒ ยังรีวิวได้และนับเข้าคะแนน (คลาสเกิดขึ้นแต่มีปัญหา — เป็นข้อมูลที่ผู้ชมควรเห็น)

### 3.2 Validation (FluentValidation ผูกผ่าน `ValidationActionFilter`)

| field | กฎ |
|---|---|
| `rating` | จำนวนเต็ม 1–5 (นอกช่วง ⇒ 400 validation) |
| `comment` | null หรือ 1–`MaxCommentLength` (1000) หลัง trim · ตัด control char · **plain text**: ตรง `<\s*[a-zA-Z/!]` ⇒ 400 `tutoring.text_contains_markup` (reason เดิมของ P13-01) · `MeetingLinkText.ContainsLink` ⇒ 400 `tutoring.review_comment_contains_meeting_link` · มีรูปแบบอีเมล (`@` กับโดเมน) หรือเลขโทรศัพท์ (ตัวเลขติดกัน/คั่น ≥ 9 หลัก) ⇒ 400 `tutoring.review_comment_contains_contact` (กันเผยแพร่ช่องทางติดต่อ/PII — ติวเตอร์/เด็ก) · `rating ≤ RequireCommentBelowRating` (default 0 = ปิด) แต่ไม่มี comment ⇒ 400 `tutoring.review_comment_required` |
| กฎข้อความที่ใช้ร่วม | `TutoringTextRules` (static pure ใน `Tutoring.Application` — **ประกาศที่ P13-13**, P13-14 ใช้ซ้ำ ไม่ประกาศซ้ำ): `StripControlChars(string)`, `ContainsMarkup(string)` (`<\s*[a-zA-Z/!]`), `ContainsContactInfo(string)` (อีเมล / โทรศัพท์ ≥9 หลักรวมคั่น) · `ReviewCommentRules` ห่อกฎเฉพาะรีวิว (ความยาว, meeting link) เรียก `TutoringTextRules` |
| `anonymous` | bool (default false) |
| การเก็บ/แสดง | เก็บข้อความล้วนตามที่ส่ง (หลัง trim+ตัด control) · **ไม่ HTML-encode ที่ DB**; ผู้แสดงผลทุกที่ (FE/อีเมล) ต้องเรนเดอร์เป็นข้อความ (`{{ }}` / `HtmlEncode`) — `HtmlSanitizerHelper` ไม่จำเป็น เพราะไม่รับ HTML |

### 3.3 แก้รีวิว (`PUT /bookings/{id}/review`)
`Tutoring:Reviews:EditWindowHours` **default 0 = ปิด** ⇒ ทุกคำขอแก้ ⇒ 409 `tutoring.review_edit_disabled` · ถ้า > 0: แก้ได้ภายใน `CreatedAtUtc + EditWindowHours` ครั้งไม่จำกัด; `STATUS=Hidden` ⇒ 409 `tutoring.review_hidden_not_editable`; พ้นเวลา ⇒ 409 `tutoring.review_edit_window_closed` · ผ่าน gate เดียวกัน (validation ข้อ 3.2; booking ยัง Completed และไม่คืนเต็ม) · ล็อกลำดับเดียวกับสร้าง · ตั้ง `EDITED_AT_UTC` · `RecomputeAsync` · **ไม่มีการลบรีวิวโดยผู้เขียน** (ผู้เรียกลบไม่ได้ — ขอซ่อนผ่านผู้ดูแล; PDPA erasure ล้างเนื้อหา §P13-17)

---

## 4. ป้ายผู้รีวิว (reviewer label) — กำหนดเป๊ะ

**หลักการ:** เผยแพร่ได้แค่ "ป้ายหยาบ" ที่ไม่ชี้ตัวบุคคล — **ห้าม** อีเมล, ชื่อบัญชี (`Identity.DisplayName`), userId, LEARNER_PROFILE_ID, ชื่อเล่นของ**เด็ก**, ระดับชั้นละเอียด, เวลาคลาสที่แน่นอน

### 4.1 ตารางตัดสิน (`ReviewerLabelBuilder.Build(LearnerProfile lp, bool anonymous, ReviewsOptions)` — pure, unit test ครบทุกแถว)

| `lp.IS_MINOR` | `anonymous` | `PublicReviewerNames` (config) | `REVIEWER_KIND` | `REVIEWER_NICKNAME` | `REVIEWER_GRADE_BAND` |
|---|---|---|---|---|---|
| true | false | `Safe` (default) | `Guardian` | null | `Primary` (`Primary1–6`) · `Secondary` (`Secondary1–6`) · `Vocational` · `Other` (เกรดอื่น) |
| true | true | any | `Anonymous` | null | null |
| false | false | `Safe` | `Nickname` | `lp.NICKNAME` (ผ่านตัวตรวจ P13-05 §4 แล้ว: ไม่มีอีเมล/เบอร์/`<>`) | null |
| false | true | any | `Anonymous` | null | null |
| any | any | `AnonymousOnly` | `Anonymous` | null | null |
- ผู้เยาว์ **ไม่มีทาง**เผยแพร่ชื่อเล่นได้ แม้เลือกไม่นิรนาม — แสดงเป็น "ผู้ปกครองนักเรียน{ประถม|มัธยม|อาชีวะ|…}" (i18n ที่ FE จาก `kind`+`gradeBand`; **DB ไม่เก็บข้อความภาษา**)
- `PublicReviewerNames=AnonymousOnly` เป็นสวิตช์ฉุกเฉินระดับ config: การอ่านสาธารณะ **override** เป็น `Anonymous` ทุกแถว (ไม่ต้อง migrate ข้อมูล)
- ป้ายถูก **snapshot** ตอนสร้าง/แก้ — แก้ชื่อเล่นโปรไฟล์ผู้เรียนทีหลังไม่ย้อนเปลี่ยนรีวิวเก่า (PDPA erasure ล้างผ่าน P13-17)

### 4.2 ข้อความเตือนผู้เรียน (FE ต้องแสดงก่อนส่ง)
"รีวิวจะแสดงสาธารณะ ห้ามใส่ชื่อจริง เบอร์โทร หรืออีเมล" + ถ้าเลือก "แสดงแบบไม่ระบุชื่อ": "ไม่ระบุชื่อต่อสาธารณะ — **ติวเตอร์อาจทราบว่าเป็นรีวิวของคุณ** จากเวลาที่ส่ง"

### 4.3 ทำไมไม่มี endpoint "รีวิวของฉันที่ได้รับ" ของติวเตอร์
ติวเตอร์ดูผ่านหน้าสาธารณะ (`/tutors/:slug`) — endpoint เฉพาะติวเตอร์ที่มีวันที่/booking จะทำให้จับคู่ผู้รีวิวนิรนามได้ง่ายขึ้น; ถ้าเจ้าของต้องการ ให้ออก revision (ต้องตัดวันที่เป็นระดับสัปดาห์)

---

## 5. `TutorRatingService` — ที่เดียวที่คำนวณและเขียน `RATING_*` (ไม่ทำซ้ำ X-20)

### 5.1 กติกานับ (เงื่อนไขเดียว ใช้ทุกที่: aggregate, รายการสาธารณะ, reconcile)
รีวิวนับเข้าคะแนน/แสดงสาธารณะ ⇔ `r.STATUS = 'Published'` **และ** (`b.PRICE_AMOUNT = 0` หรือ `b.REFUNDED_AMOUNT < b.PRICE_AMOUNT`) โดย `b` = booking ของรีวิว (JOIN ด้วย PK)
เหตุผล: รีวิวของ booking ที่ถูกคืนเงินเต็มภายหลัง (dispute ตัดสิน/admin manual refund) **ต้องไม่ทำให้คะแนนติวเตอร์เปลี่ยน** โดยไม่ต้องให้ทุกเส้นทางคืนเงินมาเรียก P13-13 (อ่านขณะ query = ความจริงเดียว)

### 5.2 `RecomputeAsync(Guid tutorId, CancellationToken ct)` — **ต้องเรียกภายใน transaction ที่เปิดอยู่** (ไม่มี ⇒ `InvalidOperationException`)
```
1. lock:   SELECT "TUTOR_ID" AS "Value" FROM "TUTORING"."TUTOR_PROFILES" WHERE "TUTOR_ID" = {tutorId} FOR UPDATE
           (Database.SqlQuery<Guid>(...) — ไม่ materialize entity; ไม่พบ ⇒ return no-op)
2. agg:    SELECT COUNT(*)::int AS "Count", COALESCE(SUM(r."RATING"), 0)::int AS "Sum"
           FROM "TUTORING"."TUTOR_REVIEWS" r JOIN "TUTORING"."TUTOR_BOOKINGS" b ON b."BOOKING_ID" = r."BOOKING_ID"
           WHERE r."TUTOR_ID" = {tutorId} AND r."STATUS" = 'Published' AND (b."PRICE_AMOUNT" = 0 OR b."REFUNDED_AMOUNT" < b."PRICE_AMOUNT")
3. avg:    count = 0 ? 0m : decimal.Round((decimal)sum / count, 2, MidpointRounding.AwayFromZero)      // decimal เท่านั้น ไม่ใช้ double
4. write:  ITutorStatsWriter.SetRatingAsync(tutorId, avg, count, ct)
```
- **ทำไมต้อง `FOR UPDATE` บนแถว profile:** READ COMMITTED — ธุรกรรม B ที่รอ lock จะ "เห็น" รีวิวที่ A เพิ่ง commit เมื่อได้ lock แล้วรัน aggregate (statement ใหม่ = snapshot ใหม่) ⇒ ค่าสุดท้ายถูกเสมอ แม้สองคำขอ/ซ่อน/เลิกซ่อนซ้อนกัน (นี่คือจุดที่ `CreateCourseReviewHandler` พลาด — F2)
- ใช้ `SUM`+`COUNT` เป็นจำนวนเต็มแล้วหารเป็น `decimal` ใน C# — ไม่โหลดรีวิวทั้งชุด ไม่ใช้ `double`
- **lock order (D-B ใน README §7.2):** `TUTOR_BOOKINGS → [DISPUTES] → TUTOR_REVIEWS → … → TUTOR_PROFILES (สุดท้าย)` — ห้ามผู้เรียก `RecomputeAsync` ล็อก session/booking/payment ต่อหลังเรียก (README §7.2 / P13-08 §7.1)
- ผู้เรียกที่อนุญาต: `TutorReviewService` (create/edit/hide/unhide), `ReviewReconcileService`, `DisputeService.DecideAsync` (P13-14 — เมื่อ booking ที่ตัดสินมีรีวิว) — source-scan test: **ไม่มีไฟล์นอก `TutorRatingService.cs` เรียก `SetRatingAsync`**

### 5.3 Job `tutoring-review-reconcile` (รายวัน `Cron.Daily(4, 30)`; `RecurringJobIds.TutoringReviewReconcile = "tutoring-review-reconcile"`; `[DisableConcurrentExecution(timeoutInSeconds: 1500)]`; รันใน Api(`ServerInApi`)/Workers ได้)
`ReviewReconcileService.RunAsync(ct)`:
1. หา "ติวเตอร์ที่ค่าเก็บไม่ตรงความจริง" (index scan `IX_TUTOR_REVIEWS_TUTOR_PUBLISHED`) — จำกัด `ReconcileBatchSize` (200)/รอบ:
```sql
WITH truth AS (
  SELECT r."TUTOR_ID", COUNT(*)::int AS "TrueCount", SUM(r."RATING")::int AS "RatingSum"
  FROM "TUTORING"."TUTOR_REVIEWS" r
  JOIN "TUTORING"."TUTOR_BOOKINGS" b ON b."BOOKING_ID" = r."BOOKING_ID"
  WHERE r."STATUS" = 'Published' AND (b."PRICE_AMOUNT" = 0 OR b."REFUNDED_AMOUNT" < b."PRICE_AMOUNT")
  GROUP BY r."TUTOR_ID")
SELECT p."TUTOR_ID" AS "TutorId", p."RATING_COUNT" AS "StoredCount", p."RATING_AVERAGE" AS "StoredAverage",
       COALESCE(t."TrueCount", 0) AS "TrueCount"
FROM "TUTORING"."TUTOR_PROFILES" p
LEFT JOIN truth t ON t."TUTOR_ID" = p."TUTOR_ID"
WHERE p."RATING_COUNT" <> COALESCE(t."TrueCount", 0)
   OR p."RATING_AVERAGE" <> CASE WHEN COALESCE(t."TrueCount", 0) = 0 THEN 0 ELSE ROUND(t."RatingSum"::numeric / t."TrueCount", 2) END
ORDER BY p."TUTOR_ID" LIMIT {batch}
```
(`ROUND(numeric,2)` ของ PostgreSQL ปัดครึ่งออกจากศูนย์ = `AwayFromZero` ของ .NET ⇒ เปรียบเทียบตรงกัน)
2. **ต่อติวเตอร์: หนึ่ง DI scope + หนึ่ง transaction** → `RecomputeAsync(tutorId)` (คำนวณใหม่ใต้ lock — **ไม่เชื่อตัวเลขจากข้อ 1**) ⇒ exception ของรายการหนึ่งไม่หยุดรายการอื่น (`ChangeTracker.Clear()`)
3. log Warning เมื่อพบ drift (`tutorId`, stored vs true — ไม่มี PII) + telemetry counter `tutoring.reviews.reconcile.corrected` / `…scanned` ; ถ้าแก้ ≥1 รายการ ⇒ `InvalidateProfilesAsync` ครั้งเดียวท้ายงาน
4. ครอบคลุมสาเหตุ drift ทุกแบบ: เขียนพลาดตอน crash, refund เต็มผ่าน admin manual (P13-08 §5.6 — ไม่ผ่าน P13-13), ซ่อน/เลิกซ่อนที่ล้ม, แก้ SQL มือ — **จึงไม่มีเส้นทางใดต้องพึ่ง hook**; ค่าที่คลาดเคลื่อนอยู่ได้สูงสุด ≤ 24 ชม. สำหรับเส้นทางที่ไม่เรียก `RecomputeAsync` โดยตรง (admin manual refund)

---

## 6. API (controller: `TutoringReviewsController`, `AdminTutoringReviewsController` ใต้ `Siri.Api/Controllers/Tutoring/`; base `/api/tutoring`)

กฎร่วม (บังคับ): ทุก action ใส่ `[Authorize]`/`[AllowAnonymous]` ชัดเจน (ไม่มี fallback) · `userId` จาก `IUserContext` **เท่านั้น** · ownership อยู่ใน WHERE เดียวกับการดึงข้อมูล · ไม่พบ/ไม่ใช่ของฉัน ⇒ 404 ตัวเดียวกัน · response ส่วนบุคคล `Cache-Control: no-store` · error = RFC 9457 + `reason` · `[EndpointName]`+`[EndpointSummary]`+`[ProducesResponseType]` ครบ · enum เป็น string · เวลา UTC `…Z`
**Rate limit:** public list = `tutoring-search` (ต่อ IP, P13-01 §7) · ที่ login แล้วทั้งหมด = `tutoring-user` · **ไม่มี policy ใหม่**

### 6.1 สาธารณะ
| # | Method + path | Auth | สำเร็จ | Error |
|---|---|---|---|---|
| 1 | `GET /tutors/{slug}/reviews?page=1&pageSize=10&sort=newest\|highest\|lowest&rating=` | `[AllowAnonymous]` · `tutoring-search` · `[OutputCache(PolicyName = TutoringOutputCache.ReviewsPolicyName)]` (60 วิ, `VaryByQuery` ทุก key `page,pageSize,sort,rating`, tags `tutoring-reviews`+`tutoring-profile`; ผู้ล็อกอินข้าม cache ตาม framework) | 200 `TutorReviewsResponse` | 404 `tutoring.not_found` (ติวเตอร์ไม่ public) · 400 (page/pageSize/sort/rating ผิด) · 429 |
- **การมองเห็น:** ติวเตอร์ต้อง `STATUS=Verified AND IS_LISTED` (กติกาเดียวกับ `GET tutors/{slug}` ของ P13-04 — ใช้ query/ตัวเลือกเดียวกัน) ไม่ใช่ ⇒ 404 `TutoringErrors.NotFound` ไบต์เดียวกับไม่มีจริง
- `pageSize` 1–50 (default 10) · `sort`: `newest` (`CREATED_AT_UTC DESC, REVIEW_ID DESC`, default) · `highest` (`RATING DESC, CREATED_AT_UTC DESC, REVIEW_ID DESC`) · `lowest` (`RATING ASC, …`) · `rating` กรองดาว 1–5 (summary/distribution **ไม่ถูกกรอง**)
- เฉพาะรีวิวที่ผ่านกติกานับ (§5.1) · แถวที่ `PublicReviewerNames=AnonymousOnly` ⇒ ป้าย Anonymous · query ไม่มี N+1: รายการ = 1 query (reviews ⋈ bookings ⋈ sessions ⋈ offerings ⋈ subjects), summary = 1 query (`GROUP BY RATING`)
- DTO allow-list (§9): **ไม่มี** `reviewerUserId`, `bookingId`, `bookingNo`, วันเวลาคลาส, `status`, `hide*`, ชื่อผู้เรียน/ผู้ปกครอง · เทสต์ JSON-walk ตรวจชื่อ property ทุกชั้นเป็นสมาชิก allow-list (แบบ P13-04 §9.6)

### 6.2 ผู้เรียก (`[Authorize]` — ทุกผู้ใช้ที่ login; ไม่บังคับ role)
| # | Method + path | Rate | สำเร็จ | Error |
|---|---|---|---|---|
| 2 | `GET /bookings/{bookingId:guid}/review` | `tutoring-user` | 200 `BookingReviewState` | 404 `tutoring.booking_not_found` |
| 3 | `POST /bookings/{bookingId:guid}/review` | `tutoring-user` | 201 `MyReviewResponse` + `Location: …/bookings/{id}/review` | 404 `tutoring.booking_not_found` · 409 `review_booking_not_completed` / `review_booking_refunded` / `review_window_closed` / `review_exists` (+`reviewId`) / `concurrent_update` · 400 `validation` / `tutoring.text_contains_markup` / `review_comment_contains_meeting_link` / `review_comment_contains_contact` / `review_comment_required` · 404 `tutoring.not_found` (feature ปิด) · 429 |
| 4 | `PUT /bookings/{bookingId:guid}/review` | `tutoring-user` | 200 `MyReviewResponse` | เช่นข้อ 3 + 409 `review_edit_disabled` / `review_edit_window_closed` / `review_hidden_not_editable` · 404 `tutoring.review_not_found` (ยังไม่เคยรีวิว) |
- `BookingReviewState(Guid BookingId, bool CanReview, string? ReasonCode /*โค้ดสั้น: booking_not_completed|refunded|window_closed|exists|disabled*/, DateTime? ReviewableUntilUtc, MyReviewResponse? Review, bool CanEdit, DateTime? EditableUntilUtc)` — ตัดสินด้วยกฎ §3.1/§3.3 ชุดเดียวกัน (ไม่ผูกมัดเซิร์ฟเวอร์) · `Review` = รีวิวของ booking นี้ (ถ้ามี) รวม `Hidden`
- `CreateReviewRequest(int Rating, string? Comment, bool Anonymous)` · `UpdateReviewRequest` ฟิลด์เดียวกัน · `MyReviewResponse(Guid ReviewId, Guid BookingId, int Rating, string? Comment, bool Anonymous, ReviewStatus Status, DateTime CreatedAtUtc, DateTime? EditedAtUtc)` — `Anonymous = (REVIEWER_KIND = Anonymous)` · ผู้รีวิวเห็น `Status=Hidden` ได้แต่ **ไม่เห็นเหตุผล**

### 6.3 Admin (`[Authorize(Policy = AuthorizationPolicyNames.AdminOnly)]` · `tutoring-user`)
| # | Method + path | สำเร็จ | Error |
|---|---|---|---|
| 5 | `GET /admin/reviews?status=&tutorId=&rating=&q=&page=1&pageSize=20` | 200 `PagedResult<AdminReviewListItem>` (เรียง `CREATED_AT_UTC DESC, REVIEW_ID DESC`; pageSize ≤100; `q` = ค้นใน `COMMENT` ด้วย `ILIKE` escape `% _ \`, ≤100 ตัวอักษร) | 400 |
| 6 | `POST /admin/reviews/{reviewId:guid}/hide` body `HideReviewRequest(string Reason /*3–500*/)` | 200 `AdminReviewListItem` | 404 `tutoring.review_not_found` · 409 `tutoring.concurrent_update` · 400 |
| 7 | `POST /admin/reviews/{reviewId:guid}/unhide` body `UnhideReviewRequest(string? Note /*≤500*/)` | 200 `AdminReviewListItem` | 404 · 409 `concurrent_update` |
- `AdminReviewListItem(Guid ReviewId, Guid TutorId, string TutorDisplayName, string TutorSlug, Guid BookingId, string BookingNo, Guid ReviewerUserId, int Rating, string? Comment, ReviewerKind ReviewerKind, string? ReviewerNickname, string? ReviewerGradeBand, ReviewStatus Status, string? HideReason, Guid? HiddenByUserId, DateTime? HiddenAtUtc, DateTime CreatedAtUtc, DateTime? EditedAtUtc, bool CountsTowardRating /*ตามกติกา §5.1*/, bool Redacted)` — admin เห็น `ReviewerUserId` (id ภายใน) แต่ **ไม่มีอีเมล/ชื่อบัญชี** (ต้องใช้ก็ไปหน้าผู้ใช้ของ Identity)
- **Hide** (idempotent — Hidden แล้ว ⇒ 200 ไม่ audit ซ้ำ): ลำดับ lock `review row FOR UPDATE → profile (ใน RecomputeAsync)` · `Hide()` · `RecomputeAsync(tutorId)` · stage in-app ให้ผู้รีวิว (`tutoring.review_hidden` — ข้อความกลาง ไม่มีเหตุผล) · **`ISecurityAuditContract.RecordAuditAsync("tutoring.review.hidden", adminUserId, json{reviewId, tutorId, bookingId, reasonCode?}, ip)` เป็นขั้นสุดท้าย (commit) — detail ไม่มี `HIDE_REASON` ข้อความอิสระ/คอมเมนต์** (เก็บใน DB เท่านั้น) · หลัง commit evict cache
- **Unhide**: `Unhide()` (+ถ้า booking ถูกคืนเต็มแล้ว รีวิวกลับเป็น Published แต่ไม่นับ — `CountsTowardRating=false`) · `RecomputeAsync` · audit `tutoring.review.unhidden` · ผู้รีวิวไม่ถูกแจ้งซ้ำ

---

## 7. Config / DI / jobs

`TutoringReviewsOptions` (`Tutoring:Reviews`, `IValidateOptions` + `ValidateOnStart`):

| Key | Default | ช่วง / หมายเหตุ |
|---|---|---|
| `Enabled` | `true` | ปิด = POST/PUT 404, GET สาธารณะคืนรายการว่างไม่ได้ ⇒ **404** ทั้งหมดของ §6.1–6.2 (admin ยังใช้ได้) |
| `ReviewWindowDays` | `90` | 1–365 หลัง `COMPLETED_AT_UTC` |
| `EditWindowHours` | `0` | 0–720 (0 = ไม่ให้แก้) |
| `MaxCommentLength` | `1000` | 100–1000 (เพดานคอลัมน์) |
| `RequireCommentBelowRating` | `0` | 0–5 (0 = ไม่บังคับ; เช่น 2 = ≤2 ดาวต้องมีความเห็น) |
| `PublicReviewerNames` | `Safe` | `Safe` \| `AnonymousOnly` |
| `PublicPageSizeMax` | `50` | 10–100 |
| `NotifyTutorOnReview` | `true` | in-app เท่านั้น (ไม่ส่งอีเมล) |
| `ReconcileBatchSize` | `200` | 10–1000 |
| `PublicCacheSeconds` | `60` | 0–600 (0 = ไม่ cache) |

- **DI (`AddTutoringModule`):** `TutorReviewService`, `TutorRatingService`, `ReviewReconcileService`, `ITutorReviewRepository`→`TutorReviewRepository` (Scoped; **ไม่มี `I…Service`**) · `ReviewerLabelBuilder` (static) · validators · Options · `TutoringReviewReconcileJob`
- **`TutoringOutputCache`** (ไฟล์ของ P13-01 — เพิ่มต่อท้าย): `ReviewsPolicyName = "TutoringReviews"`, `ReviewsTag = "tutoring-reviews"` · `ITutorPublicCacheInvalidator` เพิ่ม `Task InvalidateReviewsAsync(CancellationToken)` (evict `ReviewsTag`) — แบบเดียวกับ `InvalidateSubjectsAsync` ของ P13-04 · `InvalidateProfilesAsync` ยัง evict `ProfileTag`+`SitemapTag` (ดาวบนการ์ด/โปรไฟล์)
- **Job:** `RecurringJobIds.TutoringReviewReconcile` (+ใน `All`) · `recurringJobManager.AddOrUpdate<TutoringReviewReconcileJob>(RecurringJobIds.TutoringReviewReconcile, job => job.RunAsync(CancellationToken.None), Cron.Daily(4, 30));`
- **appsettings:** section `Tutoring:Reviews` ใน `appsettings.json` ของ **Api และ Workers** (placeholder = default) · ไม่มี secret/NuGet ใหม่ · ไม่มี production guard ใหม่
- **Telemetry:** `TutoringTelemetry` (Meter `Siri.Tutoring`): `tutoring.reviews.created{rating}`, `tutoring.reviews.hidden`, `tutoring.reviews.reconcile.scanned`, `tutoring.reviews.reconcile.corrected`

---

## 8. แจ้งเตือน (ผ่าน `IUserNotificationOutbox`/`IEmailOutbox` — stage ใน unit-of-work เดียวกับการเปลี่ยนสถานะ)

| เหตุการณ์ | ผู้รับ | ช่องทาง | in-app `type` | `linkUrl` | ข้อความ in-app (TH) |
|---|---|---|---|---|---|
| รีวิวใหม่ (ถ้า `NotifyTutorOnReview`) | ติวเตอร์ (`TUTOR_PROFILES.USER_ID`) | in-app | `tutoring.review_received` | `/tutors/{slug}` | `คุณได้รับรีวิวใหม่ {rating} ดาว` (**ไม่มีเนื้อหาความเห็น/ชื่อ**) |
| admin ซ่อนรีวิว | ผู้รีวิว (`REVIEWER_USER_ID`) | in-app | `tutoring.review_hidden` | `/my-tutoring` | `รีวิวของคุณถูกซ่อนโดยผู้ดูแลระบบเนื่องจากไม่เป็นไปตามแนวทางการใช้งาน` |
ไม่ส่งอีเมลในงานนี้ · ไม่มี PII/ความเห็นในข้อความ · ผู้รับที่เป็นบัญชี anonymised (อีเมล `@deleted.siriupskill.com`) ⇒ in-app เท่านั้น (ไม่มีอีเมลอยู่แล้ว)

---

## 9. Security / IDOR / privacy (เมทริกซ์ — ทุกแถวมี integration test)

| ทรัพยากร | เจ้าของ booking | คนอื่น (ผู้ใช้ทั่วไป) | ติวเตอร์เจ้าของคลาส | admin | anonymous |
|---|---|---|---|---|---|
| `GET/POST/PUT bookings/{id}/review` | ✔ | 404 `booking_not_found` (เท่ากับไม่มีจริง) | 404 (ไม่ใช่ผู้เรียก) | 404 (ไม่ bypass — admin ใช้ endpoint admin) | 401 |
| `GET tutors/{slug}/reviews` | ✔ | ✔ | ✔ | ✔ | ✔ (public) |
| `admin/reviews*` | 403 | 403 | 403 | ✔ `AdminOnly` | 401 |
- คอมเมนต์เก็บ plain text; แสดงเป็นข้อความเท่านั้น (ไม่ `bypassSecurityTrustHtml`) · ไม่มี userId/bookingId/วันคลาส/ชื่อบัญชี/อีเมลใน response สาธารณะ · ผู้เยาว์: ชื่อเล่นไม่เผยแพร่ (§4.1)
- ซ่อนรีวิว: `HIDE_REASON` และ `HIDDEN_BY_USER_ID` ไม่ออกฝั่งผู้รีวิว/ติวเตอร์/สาธารณะ · audit detail ไม่มีข้อความอิสระ
- `IUserContext.UserId` เท่านั้น; ไม่มี `reviewerUserId`/`tutorId` ใน body/query ของ endpoint ผู้ใช้ · rate limit ต่อผู้ใช้ (ชื่อ policy อยู่ในคีย์ partition)
- รีวิวที่ถูกซ่อน/ไม่นับ: ไม่ทำให้ **ตัวเลขสาธารณะ** เปลี่ยนจนกว่า recompute (ทำใน transaction เดียวกับการซ่อน)

---

## 10. Test checklist

**Unit:** `ReviewerLabelBuilder` ทุกแถว §4.1 (รวมเกรดทุกค่า → band, `AnonymousOnly`) · `ReviewCommentRules` (markup `<a`, `< b`, `<!--`; meeting link แปลงรูป — ใช้เวกเตอร์ของ `MeetingLinkText`; อีเมล/โทร: `a@b.co`, `081-234-5678`, `0812345678`, เลขไทยผสม, เลขสั้น 8 หลักผ่าน; ยาว 1000/1001; ว่าง/เว้นวรรคล้วน) · eligibility ทุกสถานะ booking (10 ค่า) × คืนเงิน (ไม่คืน/บางส่วน/เต็ม/ฟรี) × หน้าต่างเวลา (ขอบ `COMPLETED_AT_UTC + 90d` ±1 ms) · แก้รีวิว (ปิด/เปิด/พ้นเวลา/Hidden) · domain transitions (`Hide`/`Unhide`/`Redact`/`Edit`) ครบทุกคู่ · คณิต: `Round(sum/count,2,AwayFromZero)` เวกเตอร์ (1×5; 2 ดาว+3 ดาว = 2.50; 1,1,2 = 1.33; 4,5,5 = 4.67; 5×1000 + 4 → ค่าที่ถูก) · **source-scan:** ไม่มีไฟล์นอก `TutorRatingService.cs` เรียก `SetRatingAsync`; ไม่มีไฟล์นอก `TutorProfileStatsUpdater.cs` เขียน `RATING_*` (ของ P13-01 §9) · ทุก action มี `[Authorize]`/`[AllowAnonymous]` (reflection) · options validator ทุก branch
**Integration (PostgreSQL 17 จริง; ห้าม InMemory; แต่ละงานแข่งใช้ scope/DbContext ของตัวเอง):**
1. **แข่งรีวิว (regression ของ X-20):** ติวเตอร์ 1 คน + 8 booking Completed ของผู้ใช้ 8 คน ยิง `POST …/review` พร้อมกัน (`Task.WhenAll` + barrier) ⇒ `RATING_COUNT == 8` และ `RATING_AVERAGE` = ค่าเฉลี่ยจริงของ 8 รีวิว (rating คละ) · ทำซ้ำ 20 รอบ (กัน flaky) · เปรียบเทียบกับ baseline: พิสูจน์ว่าโค้ดแบบ "โหลดแล้วคำนวณนอก lock" จะพลาด (เทสต์ยืนยันว่า lock อยู่จริงโดยอ่าน `pg_locks`/เวลารอ หรือใช้ barrier ภายใน transaction)
2. **แข่ง create vs hide vs unhide** ของติวเตอร์เดียวกัน (3 งานพร้อมกัน ×20 รอบ) ⇒ `RATING_*` = aggregate จริงตอนจบเสมอ
3. หนึ่งรีวิวต่อ booking: POST ซ้ำ 2 ครั้งพร้อมกัน ⇒ 201 หนึ่ง + 409 `review_exists` หนึ่ง; DB มีแถวเดียว
4. gate: booking `Confirmed`/`NoShow*`/`Disputed`/`CancelledBy*`/`Expired` ⇒ 409 ตามตาราง; คืนเต็ม ⇒ `review_booking_refunded`; คืนบางส่วน ⇒ ผ่านและนับ; trial ฟรี ⇒ ผ่าน; พ้น 90 วัน ⇒ `review_window_closed`
5. **คืนเงินเต็มหลังรีวิว:** รีวิวแล้ว → จำลอง `REFUNDED_AMOUNT = PRICE_AMOUNT` ผ่าน P13-08 service → รายการสาธารณะไม่แสดงรีวิวนั้นทันที (predicate) และ `RATING_*` กลับเป็นค่าที่ถูกหลัง `RecomputeAsync`/job reconcile
6. **reconcile:** แก้ `RATING_COUNT/AVERAGE` ด้วย SQL ตรงให้ผิดหลายรูปแบบ (นับเกิน, ขาด, เฉลี่ยผิด, ติวเตอร์ไม่มีรีวิวแต่ค่า ≠0) ⇒ รัน job ⇒ ถูกแก้ทั้งหมด, ติวเตอร์ที่ถูกอยู่แล้วไม่ถูกเขียน (ไม่มี `UPDATE` ที่ไม่จำเป็น — ตรวจด้วย `xmin` ไม่เปลี่ยน/ตัวนับ), batch ขอบเขต, ล้มรายการเดียวไม่หยุดทั้งงาน
7. IDOR: ผู้ใช้ B เรียก `GET/POST/PUT` ของ booking ผู้ใช้ A ⇒ 404 body เท่ากับ id ไม่มีจริง (diff หลังตัด `traceId`) · ติวเตอร์เรียก `POST bookings/{id}/review` ของคลาสตัวเอง ⇒ 404 · ผู้ใช้ทั่วไปเรียก `admin/reviews*` ⇒ 403
8. **leak test:** serialize `GET tutors/{slug}/reviews` → เดินทุก property ต้องอยู่ใน allow-list; seed ผู้ใช้ที่มีอีเมล/ชื่อบัญชี/ชื่อเล่นเด็ก ⇒ ไม่พบสตริงเหล่านั้นใน response · ผู้เยาว์ ⇒ `kind=Guardian`+band เท่านั้น · `PublicReviewerNames=AnonymousOnly` ⇒ ทุกแถว Anonymous โดยไม่แก้ DB
9. visibility: ติวเตอร์ Suspended/unlisted/Draft ⇒ `GET reviews` 404 เท่ากับ slug ไม่มีจริง · ติวเตอร์ Suspended ภายหลัง ⇒ ผู้เรียกยัง `POST review` ของคลาสที่จบแล้วได้
10. admin hide/unhide: ซ่อน ⇒ หายจากสาธารณะ + `RATING_*` ปรับใน transaction เดียว + audit มีแถว (detail ไม่มี `HIDE_REASON`) + ผู้รีวิวได้ in-app; เลิกซ่อน ⇒ กลับ; ซ่อนซ้ำ ⇒ 200 ไม่ audit ซ้ำ; rollback เมื่อ audit ล้ม ⇒ สถานะเดิม
11. cache: ก่อน/หลังรีวิวใหม่ `GET reviews` เปลี่ยนทันที (evict tag) · `VaryByQuery` ไม่ปนหน้า/sort
12. migration บน PG17: CHECK/UQ/FK `NoAction` (insert ตรงด้วย `NULL` ในคอลัมน์ที่ CHECK คุม ต้องล้มเพราะ `IS NOT NULL`) · insert ตรง `RATING=6`/`STATUS='Hidden'` ไม่มี `HIDDEN_AT` ⇒ ล้ม · `REVIEWER_KIND='Nickname'` ไม่มี nickname ⇒ ล้ม · model ไม่มี shadow column · `DatabaseIdentifierLengthTests` เขียว
13. job ลงทะเบียนใน `RecurringJobIds.All` และเรียกได้ใน Api/Workers (`HangfireHostingTests`)

---

## 11. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | entity `TUTOR_REVIEW` + configuration + accessor + migration `AddTutorReviews` + `docs/DATABASE.md` | อ่านทั้งไฟล์ ไม่มี shadow FK · FK ทั้งหมด NoAction · ชื่อ ≤63 · **ไม่ apply DB จริง** |
| **B** | `backend-developer` | domain + `ReviewerLabelBuilder` + `ReviewCommentRules` + `TutorRatingService` + unit §10 | unit เขียว |
| **C** | `backend-developer` | repository (raw SQL §5.2/§5.3 quoted identifiers) + `TutorReviewService` + `ReviewReconcileService` + notifications + Options | unit + service tests |
| **D** | `backend-developer` | 2 controller + rate-limit attributes + job + `RecurringJobIds`/registration + `TutoringOutputCache` constants + `InvalidateReviewsAsync` + appsettings (Api+Workers) | ทุก action มี attribute auth |
| **E** | `backend-developer`/`integrator-qa` | integration §10 (ข้อ 1–6 ต้องรันจริงบน PG ก่อนตั้ง `DONE`) | เขียนครบ (ระบุถ้ายังไม่เคยรันเพราะไม่มี Docker) |
ลำดับ: A → B ∥ C(หลัง A) → D → E · P13-14 เรียก `TutorRatingService.RecomputeAsync` ได้เมื่อ WP-B มีใน main · **ห้ามส่ง Antigravity · ห้าม apply migration / commit เอง**

---

## 12. Frontend notes + DTO appendix (สร้างขนานได้ — ห้าม mock)

- **ผู้เรียก:** ใน "การเรียนของฉัน" (`/my-tutoring`) การ์ดคลาส `Completed` แสดงปุ่ม "ให้คะแนน" เมื่อ `GET bookings/{id}/review` → `canReview` · ฟอร์ม: ดาว 1–5 เป็น radio group ที่ใช้คีย์บอร์ดได้ (label มองเห็น, ไม่ใช้สีอย่างเดียว) · textarea ≤1000 + ตัวนับ · checkbox "แสดงแบบไม่ระบุชื่อ" + ข้อความเตือน §4.2 · ปุ่ม submit กันกดซ้ำ · สถานะ `Hidden` แสดง "รีวิวของคุณถูกซ่อน" (ไม่มีเหตุผล) · `409 review_exists` ⇒ โหลดรีวิวเดิมแสดง · FE **ไม่คำนวณ** เงื่อนไขเอง ใช้ `canReview`/`reasonCode`
- **สาธารณะ:** `/tutors/:slug` แท็บรีวิว — summary (ค่าเฉลี่ย, จำนวน, distribution เป็นแถบ CSS), ตัวกรองดาว, sort, pagination · ป้ายผู้รีวิวจาก `reviewer.kind`: `Nickname` ⇒ ชื่อเล่น · `Guardian` ⇒ i18n "ผู้ปกครองนักเรียน{band}" · `Anonymous` ⇒ i18n "ผู้ใช้ไม่ระบุชื่อ" · เรนเดอร์ comment เป็นข้อความล้วน · JSON-LD `aggregateRating` เฉพาะ `ratingCount>0` (P13-04) · empty state "ยังไม่มีรีวิว"
- **Admin:** `/admin/tutoring/reviews` (ตาราง + ตัวกรองสถานะ/ดาว/ติวเตอร์/ค้นหา) + ปุ่มซ่อน (modal เหตุผลบังคับ) / เลิกซ่อน · แสดง `countsTowardRating=false` เป็นป้าย "ไม่นับเข้าคะแนน (คืนเงินแล้ว)"
- i18n (README §6 E7): `tutoring.public.reviews.*` (แท็บรีวิวสาธารณะ) · `tutoring.learner.review.*` (ฟอร์ม/สถานะของผู้เรียก) · `tutoring.admin.reviews.*` · `tutoring.enums.reviewerKind.*` / `tutoring.enums.reviewStatus.*` · `tutoring.errors.<reason ตัดคำนำหน้า tutoring.>` (th+en ครบ — `i18n-guard.spec`) · `bangkokDate` · token/`tone-*` เท่านั้น · loading/error/empty ครบ · `RenderMode.Client` สำหรับเส้นทางที่ต้อง login

```ts
type Guid = string; type IsoUtc = string;
type ReviewStatus = 'Published' | 'Hidden';
type ReviewerKind = 'Nickname' | 'Guardian' | 'Anonymous';
type ReviewerGradeBand = 'Primary' | 'Secondary' | 'Vocational' | 'Other';
interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number; totalPages: number; }

interface PublicReviewer { kind: ReviewerKind; nickname: string | null; gradeBand: ReviewerGradeBand | null; }
interface PublicTutorReview { reviewId: Guid; rating: number; comment: string | null; reviewer: PublicReviewer;
  subjectNameTh: string; subjectNameEn: string; createdAtUtc: IsoUtc; edited: boolean; }
interface RatingDistribution { star1: number; star2: number; star3: number; star4: number; star5: number; }
interface TutorReviewsSummary { ratingAverage: number; ratingCount: number; distribution: RatingDistribution; }
interface TutorReviewsResponse { summary: TutorReviewsSummary; reviews: PagedResult<PublicTutorReview>; }
// GET /api/tutoring/tutors/{slug}/reviews?page&pageSize&sort=newest|highest|lowest&rating=

interface CreateReviewRequest { rating: number; comment?: string | null; anonymous: boolean; }
type UpdateReviewRequest = CreateReviewRequest;
interface MyReview { reviewId: Guid; bookingId: Guid; rating: number; comment: string | null; anonymous: boolean;
  status: ReviewStatus; createdAtUtc: IsoUtc; editedAtUtc: IsoUtc | null; }
interface BookingReviewState { bookingId: Guid; canReview: boolean;
  reasonCode: 'booking_not_completed' | 'refunded' | 'window_closed' | 'exists' | 'disabled' | null;
  reviewableUntilUtc: IsoUtc | null; review: MyReview | null; canEdit: boolean; editableUntilUtc: IsoUtc | null; }

interface AdminReviewListItem { reviewId: Guid; tutorId: Guid; tutorDisplayName: string; tutorSlug: string; bookingId: Guid; bookingNo: string;
  reviewerUserId: Guid; rating: number; comment: string | null; reviewerKind: ReviewerKind; reviewerNickname: string | null; reviewerGradeBand: ReviewerGradeBand | null;
  status: ReviewStatus; hideReason: string | null; hiddenByUserId: Guid | null; hiddenAtUtc: IsoUtc | null;
  createdAtUtc: IsoUtc; editedAtUtc: IsoUtc | null; countsTowardRating: boolean; redacted: boolean; }
interface HideReviewRequest { reason: string; }
interface UnhideReviewRequest { note?: string | null; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: string; reason?: string; bookingStatus?: string; reviewId?: Guid; reviewableUntilUtc?: IsoUtc; }
```
C# (record ตำแหน่งเดียว ชื่อเดียวกับ TS, ฟิลด์ตามลำดับข้างบน): `PublicReviewerDto`, `PublicTutorReviewDto`, `RatingDistributionDto`, `TutorReviewsSummaryDto`, `TutorReviewsResponse(TutorReviewsSummaryDto Summary, PagedResult<PublicTutorReviewDto> Reviews)`, `CreateReviewRequest(int Rating, string? Comment, bool Anonymous)`, `UpdateReviewRequest`, `MyReviewResponse`, `BookingReviewState`, `AdminReviewListItem`, `HideReviewRequest(string Reason)`, `UnhideReviewRequest(string? Note)` · `ReviewStatus`/`ReviewerKind` เป็น enum ใน Domain (map ใน `ToResponse()` ไม่รั่ว entity)

`ApiProblem.reason` ใหม่ (i18n `tutoring.errors.*`): `tutoring.review_booking_not_completed` (+`bookingStatus`) · `tutoring.review_booking_refunded` · `tutoring.review_window_closed` (+`reviewableUntilUtc`) · `tutoring.review_exists` (+`reviewId`) · `tutoring.review_edit_disabled` · `tutoring.review_edit_window_closed` · `tutoring.review_hidden_not_editable` · `tutoring.review_not_found` · `tutoring.review_comment_contains_meeting_link` · `tutoring.review_comment_contains_contact` · `tutoring.review_comment_required` · ที่ใช้ซ้ำ: `tutoring.booking_not_found`, `tutoring.not_found`, `tutoring.text_contains_markup`, `tutoring.concurrent_update`

---

## Deviations from TUTORING.md / ข้อกำหนดก่อนหน้า
| # | ที่เดิม | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | `TUTOR_REVIEWS`: TUTOR_ID, BOOKING_ID UQ, REVIEWER_USER_ID, RATING, COMMENT, STATUS, HIDDEN_BY_USER_ID | เพิ่ม `REVIEWER_KIND/NICKNAME/GRADE_BAND`, `HIDDEN_AT_UTC`, `HIDE_REASON`, `EDITED_AT_UTC`, `REDACTED_AT_UTC`, `ROW_VERSION`, audit | ป้ายผู้รีวิวที่ปลอดภัยต่อผู้เยาว์; admin ซ่อนต้องมีเหตุผล/เวลา; PDPA |
| D2 | "รีวิวได้เมื่อ Completed" | + ไม่นับ/ไม่แสดงรีวิวของ booking ที่ **คืนเงินเต็ม** (predicate §5.1) + ไม่ให้เขียนถ้าคืนเต็ม | ความถูกต้องของคะแนนเมื่อมี dispute/refund โดยไม่พึ่ง hook ทุกเส้นทาง |
| D3 | "RATING_* อัปเดตผ่าน updater ตัวเดียว + job reconcile รายวัน" | `RecomputeAsync` ใต้ `FOR UPDATE` บนแถว profile + SUM/COUNT เป็นจำนวนเต็ม + job `tutoring-review-reconcile` 04:30 | ปิดกลไก drift ของ X-20 (F2) |
| D4 | path รีวิว `POST bookings/{id}/review` | คงตาม §5 + เพิ่ม `GET`/`PUT` ของ path เดียวกัน | สถานะฟอร์มฝั่ง FE โดยไม่แก้ DTO ที่ FROZEN ของ P13-05 |
| D5 | (ไม่ระบุ) | `ITutorPublicCacheInvalidator.InvalidateReviewsAsync` + `TutoringOutputCache.Reviews*` เพิ่มต่อท้ายไฟล์ P13-01 (additive) | cache รายการรีวิว |

## Open decisions (defaulted — เจ้าของเปลี่ยนที่ config/revision ได้)
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | แก้รีวิวได้ไหม | ไม่ได้ (`EditWindowHours=0`); ผู้เขียนลบไม่ได้ |
| 2 | หน้าต่างเขียนรีวิว | 90 วันหลัง Completed |
| 3 | รีวิวก่อนพ้นช่วงข้อพิพาท 24 ชม. | เขียนได้ทันที (ไม่ต้องรอ); ถ้าถูกคืนเต็มภายหลัง ⇒ ไม่นับ (§5.1) |
| 4 | ผู้เยาว์ | ไม่เผยแพร่ชื่อเล่นเด็กเด็ดขาด (`Guardian`+band) |
| 5 | ความเห็นบังคับสำหรับดาวต่ำ | ไม่บังคับ (`RequireCommentBelowRating=0`) |
| 6 | ติวเตอร์ตอบรีวิว/รายงานรีวิว | นอก v1 |
| 7 | admin manual refund เต็มหลังรีวิว | คะแนนปรับโดย job ≤24 ชม. (ไม่มี hook เข้า P13-08 เพื่อไม่ผูก task) |
| 8 | รีวิวคอร์ส (X-20 ข้อ 5) | ไม่แก้ — รายงานเป็นช่องว่างของ Catalog (ใช้รูปแบบ §5 เป็นแบบอย่างได้) |

## Changelog
- **rev 1 (2026-10-20) — จัดให้ตรงโค้ดที่ build แล้ว (โค้ดชนะ):**
  1. **§5.2 lock:** เส้นทาง "สร้างรีวิว" ต้องเรียก `TutorRatingService.LockTutorAsync` (`FOR UPDATE` บน `TUTOR_PROFILES`) **ก่อน** `INSERT` (FK ไป `TUTOR_PROFILES` ทำให้ INSERT ถือ KEY SHARE เอง → deadlock กับ `RecomputeAsync` ที่ขอ `FOR UPDATE` ทีหลัง) — ดู `P13-README.md` §9 ข้อ 10 · ซ่อน/เลิกซ่อน/แก้ไข/PDPA เป็น UPDATE ที่ไม่แตะคอลัมน์ FK จึงไม่ต้อง
  2. admin list รับทั้ง `q` (contract) และ `search` (FE ส่งชื่อนี้) — `q` ชนะเมื่อมีทั้งคู่
  3. `reasonCode: "disabled"` ไม่เคยถูกส่ง — ฟีเจอร์ปิดตอบ 404 `tutoring.not_found` ทุก route (ตาม §7)
  4. 400 จาก validate ธรรมดา (rating นอกช่วง, comment ยาวเกิน) ไม่มี `traceId` (เป็นเอกสารของ `ValidationActionFilter` กลาง ไม่แก้ไฟล์กลาง) · 400 ที่มี `reason` มีครบ
  5. `AnonymousOnly` มีผลทั้งตอนเขียน (builder) และตอนอ่าน (override แถวเก่า)
  6. PDPA: ไม่มี retention ของรีวิว (contract ไม่กำหนด) · export `reviews[]` รวมรีวิวที่ถูกซ่อน (ไม่มีเหตุผลซ่อน/ผู้ซ่อน/accountId)
