# SIRI UpSkill — Database Design (MSSQL)

## กติกาทั่วไป

| เรื่อง | มาตรฐาน |
|-------|---------|
| PK | `uniqueidentifier` ค่า **UUIDv7** (sequential — ไม่ทำ index fragment เหมือน v4) |
| เวลา | `datetime2(3)` เก็บ **UTC** เสมอ, ชื่อคอลัมน์ลงท้าย `...AtUtc` |
| เงิน | `decimal(18,2)` + `Currency char(3)` — ห้าม `float`/`money` |
| ข้อความ | `nvarchar` เสมอ (ต้องรองรับภาษาไทย), ไม่ใช้ `varchar` |
| Soft delete | `IsDeleted bit` + `DeletedAtUtc` เฉพาะตารางที่ต้องกู้คืนได้ (Course, Post, Discussion) |
| Concurrency | `RowVersion rowversion` บนตารางที่แก้พร้อมกันได้ (Course, Order, Enrollment) |
| Audit | ทุกตารางหลักมี `CreatedAtUtc, CreatedBy, UpdatedAtUtc, UpdatedBy` (ใส่ผ่าน EF interceptor) |
| Delete rule | ตารางเกี่ยวกับเงิน (Order/Payment/RevenueSplit) **ห้าม cascade delete** และห้ามลบจริง |
| Schema | แยกตาม module: `identity`, `catalog`, `media`, `learning`, `commerce`, `payout`, `cms`, `community`, `notify`, `analytics` |
| Collation | `Thai_100_CI_AS_SC_UTF8` (เรียงภาษาไทยถูก + รองรับ emoji) |

> **อัปเดต 2026-08-20 (`docs/DECISIONS.md` D-17):** ตาราง/entity ใน 7 schema `MEDIA`/`LEARNING`/`COMMERCE`/`PAYOUT`/`CMS`/`COMMUNITY`/`ANALYTICS` **สร้างจริงแล้ว** (migration `AddCommerceMediaLearningPayoutCmsCommunityAnalytics`, ยังไม่ apply ขึ้น DB จริง — ดู CLAUDE.md) โดยใช้ชื่อ **UPPERCASE ทั้งหมด** (schema/table/column และ C# entity class/property) แทนที่ PascalCase ตามสเก็ตช์เดิมด้านล่าง — สเก็ตช์ยังคงไว้เพราะบอก "มีคอลัมน์อะไรบ้าง" ถูกต้อง แค่การสะกดชื่อไม่ตรง (เช่น `Orders.SubtotalAmount` ในสเก็ตช์ = `COMMERCE.ORDERS.SUBTOTAL_AMOUNT` จริง) กฎการแปลงชื่อเต็มอยู่ที่ `.claude/rules/database.md`'s "ชื่อ entity/DB แบบ UPPERCASE" ตารางที่ **ยังไม่ได้สร้าง** จากสเก็ตช์ด้านล่าง: `catalog.EpisodeAttachments`/`LearningPaths`/`LearningPathItems`, `notify.Announcements`/`Notifications` (ยังเป็น PascalCase ปกติเพราะอยู่ schema เดิมที่ไม่ใช่ 7 โมดูลใหม่ — จะสร้างเมื่อ task ที่เกี่ยวข้องเริ่มจริง)

---

## identity
```
Users(Id PK, Email, NormalizedEmail UQ, PasswordHash, DisplayName, AvatarUrl, PhoneNumber,
      Status, EmailConfirmedAt, TwoFactorEnabled, LastLoginAtUtc,
      MaxConcurrentSessionsOverride int NULL,   -- SE-03 per-account override; NULL = ใช้ system default
                                                 -- (Identity:Security:MaxConcurrentSessions, default 2)
      ...audit)
Roles(Id, Name UQ)                         -- Learner, Instructor, Admin, SuperAdmin
UserRoles(UserId, RoleId) PK(UserId,RoleId)
UserSessions(Id PK, UserId FK, DeviceId, DeviceName, UserAgent, IpAddress,
             CreatedAtUtc, LastSeenAtUtc, RevokedAtUtc, RevokeReason)
             IX(UserId, RevokedAtUtc)      -- ใช้บังคับ concurrent login limit
RefreshTokens(Id PK, UserId FK, SessionId FK, TokenHash UQ, ExpiresAtUtc,
              RevokedAtUtc, ReplacedByTokenId)
SecurityAudits(Id, UserId, EventType, Detail(json), IpAddress, OccurredAtUtc)
UserSecurityTokens(Id PK, UserId FK, TokenHash UQ, Purpose, ExpiresAtUtc, ConsumedAtUtc)
                   -- generic one-time token: Purpose = EmailConfirmation (P0-15, ใช้จริง, หมดอายุ 24 ชม.) |
                   -- PasswordReset (P0-21, ใช้จริงแล้ว — /forgot-password ออก token, /reset-password
                   -- ใช้ token, หมดอายุ 1 ชม. คำขอใหม่ invalidate token เก่าที่ยังไม่หมดอายุของ user เดียวกัน
                   -- เสมอ, reset สำเร็จ revoke session/refresh token ทั้งหมดของ user) — เหมือน RefreshTokens
                   -- เก็บแค่ TokenHash ไม่เก็บ raw token, hash ด้วย SHA-256 (ไม่ใช่ PBKDF2 เพราะ raw
                   -- token สุ่มจาก RandomNumberGenerator อยู่แล้ว ไม่ใช่รหัสผ่านที่มนุษย์เดาได้)
                   IX(UserId, Purpose) WHERE ConsumedAtUtc IS NULL   -- filtered, หาโทเคนที่ยังใช้ได้ของผู้ใช้+purpose
```

## catalog
```
Categories(Id PK, ParentId FK->self, Slug UQ, NameTh, NameEn, IconKey, SortOrder, IsActive)
InstructorProfiles(Id PK, UserId FK UQ, DisplayName, Headline, Bio, AvatarUrl,
                   RevenueSharePercent decimal(5,2) default 70.00, Status, ApprovedAtUtc)
Courses(Id PK, Slug UQ, Title, Subtitle, Description, InstructorId FK, CategoryId FK,
        Level, Language, ThumbnailUrl, TrailerMediaAssetId FK,
        Price decimal(18,2), ComparePrice, Currency,
        AccessDurationDays int NULL,          -- NULL = ตลอดชีพ
        Status,                                -- Draft|InReview|Published|Archived|Rejected
        PublishedAtUtc, TotalDurationSeconds, EpisodeCount,
        RatingAverage decimal(3,2), RatingCount, EnrollmentCount,   -- denormalized
        SeoTitle, SeoDescription, RowVersion, IsDeleted, ...audit)
        IX(Status, PublishedAtUtc) / IX(CategoryId, Status) / FULLTEXT(Title,Subtitle,Description)
CourseSections(Id PK, CourseId FK, Title, SortOrder)
CourseEpisodes(Id PK, CourseId FK, SectionId FK, Title, Description, SortOrder,
               MediaAssetId FK NULL, DurationSeconds, IsFreePreview bit, Status)
               UQ(SectionId, SortOrder)
EpisodeAttachments(Id PK, EpisodeId FK, FileName, StorageKey, ContentType, SizeBytes)
LiveSessionAttachments(Id PK, SessionId FK→CourseLiveSessions, FileName, StorageKey, ContentType, SizeBytes)
               IX(SessionId, CreatedAtUtc)   -- P4-03c · StorageKey = key ใน Cloudflare R2 (private bucket), ไม่ส่งออก API
                                              -- migration AddLiveSessionAttachments · ไม่ soft-delete (ไฟล์ล้วน)
CourseOutcomes(Id, CourseId FK, Text, SortOrder)        -- "สิ่งที่จะได้เรียนรู้"
CourseRequirements(Id, CourseId FK, Text, SortOrder)
CourseTags(CourseId, TagId) / Tags(Id, Slug UQ, Name)
CourseReviews(Id PK, CourseId FK, UserId FK, Rating tinyint, Comment, Status,
              CreatedAtUtc) UQ(CourseId, UserId)
```

## media — สร้างจริงแล้วเป็น schema `MEDIA` UPPERCASE (D-17, ดูหมายเหตุด้านบน)
```
MediaAssets(Id PK, Provider, ProviderAssetId, PlaybackId, Status,
            DurationSeconds, OriginalFileName, SizeBytes, DrmEnabled bit,
            ThumbnailUrl, UploadedByUserId, CreatedAtUtc, ReadyAtUtc, ErrorMessage)
            IX(Provider, ProviderAssetId) UQ
MediaUploadSessions(Id PK, MediaAssetId FK, UploadUrl, ExpiresAtUtc, Status)
PlaybackSessions(Id PK, UserId, EpisodeId, SessionId, IssuedAtUtc, ExpiresAtUtc,
                 IpAddress, DeviceId)       -- ใช้สืบสวนกรณีรั่วไหล
```

## learning — สร้างจริงแล้วเป็น schema `LEARNING` UPPERCASE (D-17, ดูหมายเหตุด้านบน)
```
Enrollments(Id PK, UserId FK, CourseId FK, OrderId FK NULL, Source,   -- Purchase|Gift|Admin|Corporate (P9)
            EnrolledAtUtc, ExpiresAtUtc NULL, Status,
            ProgressPercent decimal(5,2), CompletedAtUtc, LastAccessedAtUtc, RowVersion)
            UQ(UserId, CourseId)  IX(CourseId, Status)
EpisodeProgress(Id PK, EnrollmentId FK, EpisodeId FK, LastPositionSeconds,
                WatchedSeconds, IsCompleted bit, CompletedAtUtc, UpdatedAtUtc)
                UQ(EnrollmentId, EpisodeId)
WatchEvents(Id bigint identity PK, EnrollmentId, EpisodeId, EventType,   -- play|pause|seek|ended|heartbeat
            PositionSeconds, OccurredAtUtc)
            -- volume สูง: partition ตามเดือน + purge > 12 เดือน หลัง rollup แล้ว
Quizzes(Id PK, EpisodeId FK, Title, PassingScorePercent, MaxAttempts, IsActive)
QuizQuestions(Id PK, QuizId FK, Type, Text, Explanation, Points, SortOrder)
QuizOptions(Id PK, QuestionId FK, Text, IsCorrect bit, SortOrder)
QuizAttempts(Id PK, QuizId FK, EnrollmentId FK, AttemptNo, ScorePercent,
             IsPassed bit, StartedAtUtc, SubmittedAtUtc)
QuizAttemptAnswers(Id PK, AttemptId FK, QuestionId FK, SelectedOptionIds(json), IsCorrect)
Assignments(Id PK, EpisodeId FK, Title, Instructions, DueDays, MaxFileSizeMb, AllowedExtensions)
AssignmentSubmissions(Id PK, AssignmentId FK, EnrollmentId FK, StorageKey, Note,
                      SubmittedAtUtc, Status, Score, Feedback, GradedByUserId, GradedAtUtc)
Certificates(Id PK, EnrollmentId FK UQ, SerialNo UQ, VerifyCode UQ,
             IssuedAtUtc, PdfStorageKey, RevokedAtUtc)
```

## commerce — สร้างจริงแล้วเป็น schema `COMMERCE` UPPERCASE (D-17, ดูหมายเหตุด้านบน) — `Refunds` เพิ่ม `DecidedByUserId`/`DecidedAtUtc`/`DecisionNote`/`StripeRefundId` เกินสเก็ตช์เดิม (approve/reject workflow) และเพิ่มตารางใหม่ `TaxInvoices` (ไม่มีในสเก็ตช์เดิม) — ทั้งสองจุดเป็น gap-fill ตาม D-17
```
Carts(Id PK, UserId FK UQ, UpdatedAtUtc) / CartItems(Id, CartId FK, ItemType, RefId, AddedAtUtc)
Orders(Id PK, OrderNo UQ, UserId FK, SubtotalAmount, DiscountAmount, TaxAmount,
       TotalAmount, Currency, Status,          -- Pending|AwaitingPayment|Paid|Failed|Cancelled|Refunded
       PromoCodeId FK NULL, CreatedAtUtc, PaidAtUtc, RowVersion)
OrderItems(Id PK, OrderId FK, ItemType, CourseId FK NULL, BundleId FK NULL,
           TitleSnapshot, UnitPrice, DiscountAmount, LineTotal,
           InstructorId, RevenueSharePercentSnapshot)   -- snapshot กันเรตเปลี่ยนย้อนหลัง
-- ⚠️ v1 ใช้ Stripe — PromptPay QR ผ่าน PaymentIntent + webhook (แก้ไข 2026-08-18 จาก EasySlip) — สเปคเต็มอยู่ใน PAYMENT.md
Payments(Id PK, OrderId FK, Method,               -- PromptPay | (อนาคต) Card
         Provider,                                -- 'Stripe'
         ProviderPaymentIntentId UQ,              -- ← ผูก 1:1 กับ Stripe PaymentIntent
         Amount, Status,                          -- Pending|Processing|Succeeded|Failed|Expired|Refunded
         OriginalAmount NULL,                     -- มีค่าเฉพาะตอน admin override ลดยอด (Amount < ยอดออเดอร์) — ดู PaymentAmountOverrides
         SucceededAtUtc, FailureReason, CreatedAtUtc)
PaymentAmountOverrides(Id PK, IsEnabled, OverrideAmount, Reason, ChangedByUserId, ChangedAtUtc)
                                                  -- append-only (ห้าม update/delete): แถวล่าสุด = ค่าที่ใช้อยู่ + เป็น audit trail ในตัว
                                                  -- admin ตั้งยอดคงที่ที่จะส่งให้ Stripe แทนยอดออเดอร์ (ลดได้อย่างเดียว) — ดู PAYMENT.md
StripeWebhookEvents(Id PK, StripeEventId UQ,      -- ← กัน replay/ยิงซ้ำ ต้องอยู่ที่ระดับ DB เท่านั้น
                    EventType, PayloadJson,       -- raw JSON ไว้ dispute/ตรวจย้อนหลัง
                    ReceivedAtUtc, ProcessedAtUtc, ProcessResult)
PaymentOpsQueue(Id PK, PaymentId FK, Reason, Status,   -- จ่ายซ้ำ/จ่ายหลังหมดอายุ/refund ค้าง
                AssignedToUserId, ResolvedByUserId, ResolvedAtUtc, Note)
Refunds(Id PK, PaymentId FK, Amount, Reason, Status, RequestedByUserId, CreatedAtUtc, CompletedAtUtc)
PromoCodes(Id PK, Code UQ, DiscountType, DiscountValue, MaxRedemptions, RedeemedCount,
           MaxPerUser, MinOrderAmount, StartsAtUtc, EndsAtUtc, Scope, ScopeRefId, IsActive, RowVersion)
PromoRedemptions(Id PK, PromoCodeId FK, OrderId FK, UserId FK, RedeemedAtUtc) UQ(PromoCodeId, OrderId)
Bundles(Id PK, Slug UQ, Title, Description, Price, IsActive, StartsAtUtc, EndsAtUtc)
BundleItems(BundleId, CourseId) PK(BundleId, CourseId)
FlashSales(Id PK, Title, StartsAtUtc, EndsAtUtc, IsActive)
FlashSaleItems(Id PK, FlashSaleId FK, CourseId FK, SalePrice) UQ(FlashSaleId, CourseId)
```

## payout — สร้างจริงแล้วเป็น schema `PAYOUT` UPPERCASE (D-17, ดูหมายเหตุด้านบน)
```
RevenueSplits(Id PK, OrderItemId FK UQ, InstructorId FK, GrossAmount, PaymentFeeAmount,
              PlatformFeeAmount, InstructorAmount, PeriodKey char(7),   -- 'YYYY-MM'
              Status, CreatedAtUtc)          -- Pending|Payable|Paid|Reversed
              IX(InstructorId, PeriodKey, Status)
InstructorPayoutAccounts(Id PK, InstructorId FK, BankCode, AccountNoEncrypted,
                         AccountName, TaxId, VerifiedAtUtc)
PayoutBatches(Id PK, PeriodKey, TotalAmount, Status, CreatedAtUtc, ExecutedAtUtc, ExecutedBy)
PayoutBatchItems(Id PK, BatchId FK, InstructorId FK, Amount, WithholdingTaxAmount,
                 NetAmount, Status, TransferRef)
```

### P13-07 — escrow ledger ของติวเตอร์ (migration `AddTutoringEscrowToPayout`, สร้างจริงแล้ว, additive ล้วน, **ยังไม่ apply DB จริง**)
เงินของ booking ติวเตอร์อยู่ใน `PAYOUT.REVENUE_SPLITS` ตารางเดิม (ไม่มีตารางใหม่) — แถวคอร์สเดิมทุกแถวเป็น `SOURCE_TYPE='Course'` ด้วย default ของ DB เอง
```
PAYOUT.REVENUE_SPLITS (+)  SOURCE_TYPE varchar(16) NOT NULL DEFAULT 'Course'   -- Course | Tutoring
                           SOURCE_REF_ID uuid NULL          -- Tutoring: BOOKING_ID (หรือ CREDIT_ID ของเครดิตแพ็กเกจหมดอายุ) · Course: NULL
                           ENTRY_KEY varchar(80) NULL       -- rec:{ref:N} | adj:{refundId:N}:{seq} | fee:{ref:N}:{satang} · Course: NULL
                           ESCROW_STATE varchar(16) NULL    -- Held | Frozen | Releasable (Tutoring เท่านั้น)
                           AVAILABLE_AT_UTC timestamptz(3) NULL   -- NULL = ติด escrow (Held/Frozen) ⇒ batch ไม่มีทางหยิบ
                           PERIOD_KEY: char(7) -> varchar(8)      -- 'YYYY-MM' (คอร์ส) หรือ 'YYYY-Www' (ติวเตอร์ = สัปดาห์ที่เงินเข้า)
                           ORDER_ITEM_ID ของแถว Tutoring = SOURCE_REF_ID (คอลัมน์ NOT NULL เดิม ไม่เปลี่ยนชนิด)
  CK_REVENUE_SPLITS_SOURCE_SHAPE: (Course AND 4 คอลัมน์ใหม่ IS NULL) OR (Tutoring AND SOURCE_REF_ID/ENTRY_KEY/ESCROW_STATE IS NOT NULL
                                  AND (ESCROW_STATE='Releasable') = (AVAILABLE_AT_UTC IS NOT NULL) AND PERIOD_KEY ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')
  UX_REVENUE_SPLITS_ENTRY_KEY(ENTRY_KEY) WHERE ENTRY_KEY IS NOT NULL            -- idempotency ระดับ DB ของ ledger ติวเตอร์
  IX_REVENUE_SPLITS_SOURCE_REF(SOURCE_REF_ID) WHERE SOURCE_REF_ID IS NOT NULL   -- ล็อกแถวต่อ source
  IX_REVENUE_SPLITS_TUTORING_OPEN(AVAILABLE_AT_UTC, INSTRUCTOR_ID) WHERE SOURCE_TYPE='Tutoring' AND ESCROW_STATE='Releasable'
                                  AND PAYOUT_BATCH_ITEM_ID IS NULL AND STATUS IN ('Pending','Payable')   -- query เลือกเข้ารอบสัปดาห์
PAYOUT.PAYOUT_BATCHES (+)  SOURCE_TYPE varchar(16) NOT NULL DEFAULT 'Course' · PERIOD_KEY char(7) -> varchar(8)
  CK_PAYOUT_BATCHES_TUTORING_PERIOD: SOURCE_TYPE <> 'Tutoring' OR PERIOD_KEY ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'
  UX_PAYOUT_BATCHES_TUTORING_PERIOD(PERIOD_KEY) WHERE SOURCE_TYPE='Tutoring' AND STATUS <> 'Failed'   -- 1 รอบต่อสัปดาห์ (คอร์สไม่มี unique เหมือนเดิม)
  IX_PAYOUT_BATCHES_SOURCE_TYPE(SOURCE_TYPE, CREATED_AT_UTC DESC)
```
> **หมายเหตุ:** (1) ledger **append-only**: refund/คืน/ปรับค่าธรรมเนียมคือ "แถวส่วนต่าง" ใหม่ (อาจติดลบ) — แก้สถานะแถวเดิมได้เฉพาะ `Pending|Payable→Reversed` เมื่อคืนเต็มและยังไม่เข้ารอบ กับ `ESCROW_STATE/AVAILABLE_AT_UTC` ตามวงจร; แถวที่เข้ารอบแล้วไม่ถูกแก้เลย (รอบจ่ายของคอร์สเดิม `MarkPaid` ทุกแถวของ item โดยไม่ตรวจ — ความปลอดภัยของ Tutoring จึงอยู่ที่ "ไม่เคยแตะแถว in-flight") (2) `CHECK` เขียน `IS NOT NULL` ชัดเจนทุกส่วนที่ต้องมีค่า เพราะ CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL — `PayoutEscrowSchemaIntegrationTests` โจมตีด้วย raw SQL ทีละ clause (3) `ALTER COLUMN PERIOD_KEY TYPE varchar(8)` เขียนตารางใหม่ภายใต้ ACCESS EXCLUSIVE ช่วงสั้น ๆ (ตารางเล็ก) และค่าเดิมยาว 7 ตัวพอดีไม่มีช่องว่างท้าย — `PayoutEscrowMigrationIntegrationTests` พิสูจน์บนตารางที่มีข้อมูลคอร์สว่าทุกค่า/ทุกแถว/ผลของ query เดิมเหมือนก่อน apply (4) `Down()` ปฏิเสธ (`RAISE EXCEPTION`) เมื่อมีแถว `SOURCE_TYPE<>'Course'` — fix-forward เท่านั้น (5) ไม่มี FK ข้าม schema/ข้ามโมดูล (`SOURCE_REF_ID` ไม่ผูก `TUTORING.TUTOR_BOOKINGS`) · ห้าม cascade/hard delete ตามเดิม

## cms / community / notify / analytics
`cms`/`community`/`analytics` สร้างจริงแล้วเป็น schema UPPERCASE (`CMS`/`COMMUNITY`/`ANALYTICS`, D-17, ดูหมายเหตุด้านบน) — `notify` ยังไม่แตะ (`Announcements`/`Notifications` ยังไม่สร้าง, มีแค่ `EmailOutbox` ที่สร้างมาตั้งแต่ P0-19 และยังเป็น PascalCase ปกติเหมือนเดิมเพราะ Notification ไม่ใช่ 1 ใน 7 โมดูลใหม่)
```
cms.Banners(Id, Placement, ImageUrl, MobileImageUrl, LinkUrl, Title, SortOrder,
            StartsAtUtc, EndsAtUtc, IsActive)
cms.MenuItems(Id, ParentId, Label, Url, SortOrder, IsActive)
cms.Posts(Id, Slug UQ, Title, Excerpt, ContentHtml, CoverImageUrl, AuthorUserId,
          Status, PublishedAtUtc, SeoTitle, SeoDescription, IsDeleted)
cms.Redirects(Id, FromPath UQ, ToPath, StatusCode)

community.Discussions(Id, CourseId, EpisodeId NULL, UserId, ParentId NULL, Body,
                      IsInstructorAnswer bit, Status, UpvoteCount, CreatedAtUtc, IsDeleted)
                      IX(EpisodeId, Status, CreatedAtUtc)
community.Reports(Id, DiscussionId, ReportedByUserId, Reason, Status, ResolvedAtUtc)

notify.Announcements(Id, CourseId, InstructorId, Title, Body, SendEmail bit,
                     ScheduledAtUtc, SentAtUtc, RecipientCount)
notify.Notifications(Id, UserId, Type, Title, Body, LinkUrl, ReadAtUtc, CreatedAtUtc,
                     PublishedAtUtc timestamptz(3) NULL)             -- D-23 (migration AddNotificationKafkaDelivery, apply แล้ว 2026-10-10 บน DB ที่ `.env` ชี้): outbox ของ event "มีแจ้งเตือนใหม่" · NULL = relay ยังไม่ประกาศ (migration backfill แถวเดิมเป็น `PUBLISHED_AT_UTC = CREATED_AT_UTC`) ·
                                                                     --   partial index IX_NOTIFICATIONS_UNPUBLISHED (ID) WHERE "PUBLISHED_AT_UTC" IS NULL
notify.EmailOutbox(Id, ToEmail, Subject, BodyHtml, TemplateKey, Status,
                   Attempts, NextRetryAtUtc, SentAtUtc, LastError,
                   CalendarIcs text NULL, CalendarMethod varchar(10) NULL,   -- P11-04 (migration AddEmailOutboxCalendarPart, ยังไม่ apply) ดูส่วน "ส่วนขยาย P11–P12"
                   QueuedAtUtc timestamptz(3) NULL)                          -- D-23 (AddNotificationKafkaDelivery): relay ส่งเข้า Kafka เมื่อไหร่ · Status ใหม่ 'Queued' (เก็บเป็น string เหมือนเดิม ไม่ต้อง migrate ค่า)
                                                                             --   Pending → Queued → Sent | Failed(retry → Queued อีกรอบ) · Failed + NextRetryAtUtc NULL = หมดสิทธิ์ (dead letter)

analytics.DailyCourseStats(Date, CourseId, Views, Enrollments, Revenue, CompletionRate) PK(Date,CourseId)
analytics.EpisodeDropOff(Date, EpisodeId, StartCount, CompleteCount, AvgWatchPercent) PK(Date,EpisodeId)
-- ทั้งสองตารางสร้างจาก WatchEvents ด้วย Hangfire job รายคืน (ไม่ query realtime)

dbo.OutboxMessages(Id, Type, Payload, OccurredAtUtc, ProcessedAtUtc, Attempts, Error)
```

## ส่วนขยาย P8–P10 (สเปค SiriLearn — D-16, 2026-08-19 · sketch เบื้องต้น รายละเอียดสรุปตอนเริ่ม phase)
```
-- P8 Growth & Engagement
identity.UserExternalLogins(Id PK, UserId FK, Provider,        -- Google|Facebook|Apple
                            ProviderUserId, EmailAtLink, LinkedAtUtc)
                            UQ(Provider, ProviderUserId)
learning.LearnerNotes(Id PK, EnrollmentId FK, EpisodeId FK, PositionSeconds,
                      Body nvarchar(2000), CreatedAtUtc, UpdatedAtUtc)
                      IX(EnrollmentId, EpisodeId)
catalog.LearningPaths(Id PK, Slug UQ, Title, Description, IsActive, SortOrder)
catalog.LearningPathItems(PathId FK, CourseId FK, SortOrder) PK(PathId, CourseId)
learning.XpEvents(Id bigint identity PK, UserId, SourceType,   -- EpisodeCompleted|QuizPassed|CourseCompleted
                  SourceRefId, Points, OccurredAtUtc)
                  UQ(UserId, SourceType, SourceRefId)          -- กันได้แต้มซ้ำที่ระดับ DB
learning.LeaderboardSnapshots(PeriodKey char(7), UserId, TotalXp, Rank)
                  PK(PeriodKey, UserId)                        -- rollup รายคืน ห้าม query สดจาก XpEvents
                  -- รายเดือน = 'YYYY-MM' · ตลอดกาล = sentinel 'ALL' (char(7) พอดี) rollup job เดียวกันเขียนทั้งสอง key

-- P9 B2B Corporate (module ใหม่ Siri.Modules.Corporate — รอ Q7 ก่อนสรุปส่วน license)
-- ห้าม hard delete/cascade บน licenses/assignments — เป็นข้อมูลสิทธิ์เรียน ใช้ Status แทน (กฎเหล็ก #5)
-- OrgRole เป็น per-org บน OrgMembers เท่านั้น ไม่ใช่ global role ใน identity.Roles — สิทธิ์ HR มาจาก membership ของ org นั้น
corporate.Organizations(Id PK, Name, TaxIdEncrypted NULL, Status, CreatedAtUtc)
corporate.OrgMembers(Id PK, OrgId FK, UserId FK, OrgRole,      -- HRAdmin|CorporateLearner
                     Department NULL, Status, InvitedAtUtc, JoinedAtUtc)
                     UQ(OrgId, UserId)
corporate.OrgCourseLicenses(Id PK, OrgId FK, CourseId FK, SeatCount,
                            Status,                            -- Active|Suspended|Revoked|Expired
                            ActivatedByUserId, ActivatedAtUtc, ExpiresAtUtc NULL)
                            -- นับที่นั่งที่ใช้ไปจาก COUNT(OrgCourseAssignments) แบบ atomic ที่ระดับ SQL
                            -- (UPDATE...WHERE เงื่อนไขนับ) ห้ามอ่านมาเช็คใน memory แล้วค่อยเขียน (database.md)
corporate.OrgCourseAssignments(Id PK, OrgId FK, CourseId FK, UserId FK,
                               IsMandatory bit, DueAtUtc NULL, EnrollmentId FK NULL,
                               AssignedByUserId, AssignedAtUtc)
                               UQ(OrgId, CourseId, UserId)

-- P10 Subscription (รอ Q6 ก่อนสรุปส่วน split — ห้าม hard delete/cascade เหมือนข้อมูลเงินทั้งหมด)
commerce.SubscriptionPlans(Id PK, Code UQ, Name, Price, Interval,   -- Monthly|Yearly
                           IsActive)
commerce.Subscriptions(Id PK, UserId FK, PlanId FK, ProviderSubscriptionId UQ,  -- Stripe subscription id
                       Status,                                  -- Active|PastDue|Cancelled|Expired
                       CurrentPeriodStartsAtUtc, CurrentPeriodEndsAtUtc, CancelledAtUtc NULL, RowVersion)
                       IX(UserId, Status)
-- entitlement ตอน playback = enrollment active หรือ subscription active (แก้ที่ P2-04 ใน task P10-04)
-- คอร์สร่วม subscription = flag บน Courses (เพิ่มตอน P10-02 — instructor opt-in ตาม Q6)
```

---

## ส่วนขยาย P11–P12 (Hybrid Live + AI Study — D-21, 2026-09-16 · P11-01/P11-11 (Catalog) **สร้างจริงแล้ว** · P11-03/04/05 (schema `LIVE` + Notification + Catalog) **สร้างจริงแล้ว 2026-10-07 แต่ migration ยังไม่ apply** · P12 ยังเป็น sketch ไม่สร้าง)

> แบบเต็ม `docs/HYBRID_LIVE.md` §1 · Catalog = PascalCase property/ตาราง UPPERCASE ตาม convention เดิมของโมดูล · `LIVE`/`MEDIA`/`LEARNING` = UPPERCASE ตาม D-17 · ห้าม hard delete/cascade บน invite/join log (เป็นสิทธิ์เรียน+forensics)
>
> **P11-01 เสร็จแล้ว (2026-09-16, Claude Code):** `CATALOG.COURSES.DELIVERY_FORMAT` + `CATALOG.COURSE_LIVE_SESSIONS` สร้างจริงตาม sketch ด้านล่างเป๊ะ ผ่าน migration `AddCourseDeliveryFormatAndLiveSessions` (apply ขึ้น DB จริงแล้ว 2026-09-16) — เพิ่ม index ที่ sketch เดิมไม่ได้เขียนไว้ 1 ตัว: `IX(RecordingEpisodeId)` (EF auto-generate ให้ FK ที่ไม่มี index ปิดทับอยู่แล้ว)
>
> **✅ Q10/Q13 ตอบแล้ว 2026-09-16 — แก้ sketch ด้านล่างให้ตรง**: Q10=B (ผู้สอนเชื่อม Google เอง) → ตัด `HOST_ACCOUNT`/แนวคิด service-account กลางออก เพิ่ม `LIVE.INSTRUCTOR_GOOGLE_ACCOUNTS` ใหม่ · Q13.1/13.2 → เพิ่ม `EnrollmentDeadlineUtc`/`MaxSeats`/`SeatsUsed` บน `COURSES` (migration ใหม่ **ต่อจาก** P11-01 ไม่ใช่แก้ของเดิม เพราะ P11-01 apply ขึ้น DB จริงแล้ว — ห้ามแก้ migration ที่ apply แล้วตาม `database.md`) · **ไม่รวม** `GOOGLE_ATTENDEE_SYNC_ENABLED` ในบรรทัดด้านล่าง — คอลัมน์นั้นยังเป็นของ P11-04 ตรง ๆ (ไม่ติด Q แล้ว แค่ยังไม่ถึงคิวสร้าง) · **`AI_ENRICHMENT_ENABLED` ตัดออกจากแผนไปเลยในรอบนี้** (P12 เลื่อนทั้งเฟสตาม Q12 — ไม่สร้าง schema ล่วงหน้าให้ฟีเจอร์ที่ยังไม่มีคำสั่งเปิด)
```
-- P11 Catalog (แก้ตารางเดิม + ตารางใหม่ 1 ตัว) — migration AddCourseDeliveryFormatAndLiveSessions — สร้างจริงแล้ว, apply แล้ว
CATALOG.COURSES            + DELIVERY_FORMAT varchar(20) NOT NULL DEFAULT 'OnDemand'   -- OnDemand|Live|Hybrid (string enum)
CATALOG.COURSE_LIVE_SESSIONS(Id PK uuidv7, CourseId FK→COURSES Cascade, Title(200), Description text NULL,
                           StartsAtUtc timestamptz(3), EndsAtUtc timestamptz(3), SortOrder,
                           Status varchar(20),              -- Scheduled|Cancelled (Upcoming/Live/Ended คำนวณจาก IClock ไม่เก็บ)
                           CancelReason(500) NULL,
                           RecordingEpisodeId FK→COURSE_EPISODES NoAction NULL,   -- catch-up = ไม่ null + episode Ready
                           RowVersion bytea (ConcurrencyTokenInterceptor), audit)
                           IX(CourseId, StartsAtUtc) · IX(StartsAtUtc) WHERE Status='Scheduled' (job หา upcoming) · IX(RecordingEpisodeId) (FK)
                           -- ไม่ทับกันในคอร์สเดียว/ระยะ 15 นาที–8 ชม. บังคับที่ aggregate (unit test) ไม่ใช่ constraint DB

-- P11-11 Catalog เสร็จแล้ว (2026-09-16, Claude Code, docs/contracts/P11-11-enrollment-deadline-seat-cap.md)
-- migration AddCourseEnrollmentDeadlineAndSeatCap (ชื่อต่างจาก sketch เดิม "AddCourseEnrollmentPolicy" —
-- contract ที่ FROZEN ตั้งชื่อไว้ตรง ๆ ยึดตามนั้น) — สร้างจริงตาม sketch ด้านล่างเป๊ะ, additive ล้วน 3
-- AddColumn ไม่มี shadow property/FK ใหม่ — ยังไม่ apply ขึ้น DB จริง (รอคำสั่ง "migration database")
CATALOG.COURSES            + ENROLLMENT_DEADLINE_UTC timestamptz(3) NULL   -- null = ไม่ปิดรับสมัคร
                           + MAX_SEATS int NULL, SEATS_USED int NOT NULL DEFAULT 0   -- null MaxSeats = ไม่จำกัด
                           -- SEATS_USED เพิ่ม/ลดแบบ atomic ผ่าน ExecuteUpdateAsync จาก Commerce เท่านั้น
                           -- (ICatalogPriceContract.TryReserveSeatAsync/ReleaseSeatAsync, pattern เดียวกับ
                           -- PROMO_CODE.REDEEMED_COUNT) — เขียนตอนสร้าง/ยกเลิก/หมดอายุ order เท่านั้น ไม่ลดเมื่อ
                           -- refund หลังจ่ายเงินแล้ว (ตัดสินใจแล้ว ดูรายละเอียดใน contract §4.5)

-- ✅ P11-03 / P11-04 / P11-05 WP-A สร้างจริงแล้ว (2026-10-07, DATABASE agent) — 5 migration ตามลำดับนี้ **ยังไม่ apply ขึ้น DB จริง**
--    1 AddLiveMeetings → 2 AddEmailOutboxCalendarPart → 3 AddLiveSessionInvites → 4 AddCourseGoogleAttendeeSync → 5 AddLiveSessionJoinLogs
--    (แทนที่ sketch เดิมของ LIVE.* ที่เคยอยู่ตรงนี้ทั้งก้อน — ที่มา: docs/contracts/P11-03 §2, P11-04 §2, P11-05 §2 ซึ่ง FROZEN)
-- ทุกตาราง LIVE: entity UPPERCASE (property ของ IAuditable เป็น PascalCase), PK uuid UUIDv7, timestamptz(3) UTC, enum เก็บเป็น string,
--    ROW_VERSION bytea (ConcurrencyTokenInterceptor), **ไม่มี FK ข้าม schema/โมดูล** (SESSION_ID/USER_ID/COURSE_ID ชี้ไป CATALOG/IDENTITY โดยไม่มี constraint),
--    **ไม่มี cascade delete ทุกเส้น**, ไม่ hard delete invite/join log (เป็นหลักฐานว่าใครถูกเชิญ/เข้าห้อง)

-- migration 1: AddLiveMeetings (P11-03)
LIVE.INSTRUCTOR_GOOGLE_ACCOUNTS(INSTRUCTOR_GOOGLE_ACCOUNT_ID PK,
                      INSTRUCTOR_USER_ID uuid UQ,         -- key ด้วย user id (ไม่ใช่ InstructorProfileId ตาม sketch เดิม) — 1 ผู้สอน = 1 บัญชี Google
                      GOOGLE_SUBJECT(64), GOOGLE_EMAIL(320),
                      REFRESH_TOKEN_ENCRYPTED text NULL,  -- ISensitiveDataProtector.Encrypt เท่านั้น · null หลัง revoke/disconnect · ห้าม plaintext
                      SCOPES(500), CONNECTED_AT_UTC, LAST_VALIDATED_AT_UTC NULL, REVOKED_AT_UTC NULL,
                      REVOKED_REASON(40) NULL,            -- invalid_grant | user_disconnected | scope_missing | insufficient_scope
                      ROW_VERSION, audit)
                      PK_INSTRUCTOR_GOOGLE_ACCOUNTS · UQ IX_INSTR_GOOGLE_ACCT_USER_ID
LIVE.SESSION_MEETINGS(SESSION_MEETING_ID PK,
                      SESSION_ID UQ,                      -- CATALOG.COURSE_LIVE_SESSIONS.Id (ไม่มี FK — แถวถูก stage ก่อนที่ session จะอยู่ใน DB)
                      INSTRUCTOR_USER_ID NULL,            -- denormalize ตอน job ประมวลผลครั้งแรก (ใช้ reset ตอนผู้สอน reconnect)
                      PROVIDER varchar(20) NULL,          -- GoogleMeet | Manual | Logging(dev เท่านั้น) · null = ยังไม่ตัดสิน
                      INSTRUCTOR_GOOGLE_ACCOUNT_ID FK→INSTRUCTOR_GOOGLE_ACCOUNTS NoAction NULL,   -- FK_SESSION_MEETINGS_GOOGLE_ACCT
                      PROVIDER_EVENT_ID(200) NULL,
                      MEET_URL_ENCRYPTED text NULL,       -- ลิงก์ห้อง = capability URL → เข้ารหัส (sketch เดิมเป็น MEET_URL(500) plaintext)
                      SYNC_STATUS varchar(20),            -- Pending | AwaitingLink | Synced | NeedsReconnect | Failed | PendingDelete | Deleted
                      ICS_SEQUENCE int NOT NULL DEFAULT 0, -- (sketch เดิมชื่อ SEQUENCE) เพิ่มเมื่อเวลา/ชื่อคาบเปลี่ยนหรือยกเลิก
                      ATTEMPTS int NOT NULL DEFAULT 0, NEXT_RETRY_AT_UTC NULL, LAST_SYNC_AT_UTC NULL,
                      ERROR(500) NULL,                    -- error code สั้น ๆ เท่านั้น — ห้ามมี token/URL/อีเมล (sketch เดิม 2000)
                      MEETING_ALERT_SENT_AT_UTC NULL,     -- กัน alert ผู้สอนซ้ำ ("วางลิงก์" ของ P11-03 — ตั้งทันทีที่เป็น AwaitingLink)
                      READINESS_ALERT_SENT_AT_UTC NULL,   -- P11-04 (migration AddSessionMeetingReadinessAlert) กัน alert "ห้องยังไม่พร้อม" ที่ T−24 ชม. ซ้ำ —
                                                          --   แยกจากข้างบนเพราะอันนั้นถูกใช้ไปแล้วหลายวันก่อน ไม่งั้น alert ใกล้วันสอนจะไม่มีวันส่ง
                      ATTENDEE_SYNC_ALERT_SENT_AT_UTC NULL, -- P11-04 WP-F (migration AddSessionMeetingAttendeeSyncAlert) กัน alert "เกินเพดาน attendee Google (Live:GoogleAttendeeCap)" ซ้ำ ·
                                                          --   เคลียร์เมื่อจำนวนกลับมาต่ำกว่าเพดาน
                      ROW_VERSION, audit)
                      PK_SESSION_MEETINGS · UQ IX_SESSION_MEETINGS_SESSION_ID ·
                      IX_SESSION_MEETINGS_SYNC_DUE (SYNC_STATUS, NEXT_RETRY_AT_UTC) WHERE "SYNC_STATUS" IN ('Pending','PendingDelete') ·
                      IX_SESSION_MEETINGS_INSTR_USER_ID (INSTRUCTOR_USER_ID) ·
                      IX_SESSION_MEETINGS_GOOGLE_ACCT_ID (INSTRUCTOR_GOOGLE_ACCOUNT_ID)   -- index ของ FK (EF สร้างให้เองอยู่แล้ว ตั้งชื่อให้ชัด — ไม่อยู่ในรายการ index ของ contract)
                      -- IsUsable (ไม่ใช่คอลัมน์) = MEET_URL_ENCRYPTED IS NOT NULL AND SYNC_STATUS <> 'Deleted' — ใช้ทั้ง publish gate และ join gate

-- migration 2: AddEmailOutboxCalendarPart (P11-04) — Notification, additive 2 AddColumn
NOTIFY.EMAIL_OUTBOX        + CALENDAR_ICS text NULL, CALENDAR_METHOD varchar(10) NULL   -- REQUEST | CANCEL | PUBLISH → MimeKit text/calendar · มาคู่กันเสมอ (domain บังคับ)

-- migration 3: AddLiveSessionInvites (P11-04)
LIVE.SESSION_INVITES(SESSION_INVITE_ID PK, SESSION_ID, USER_ID,
                      ROLE varchar(16),                   -- Learner | Instructor (enum LiveParticipantRole — ใช้ร่วมกับ SESSION_JOIN_LOGS) · sketch เดิมไม่มี
                      STATUS varchar(16),                 -- Pending | Invited | Cancelled | Skipped
                      ICS_SEQUENCE_SENT int NULL,         -- SEQUENCE ล่าสุดที่ส่ง (รวม CANCEL) — monotonic ต่อ invite
                      INVITE_SENT_AT_UTC NULL, CANCEL_SENT_AT_UTC NULL,
                      REMINDER_24H_SENT_AT_UTC NULL, REMINDER_1H_SENT_AT_UTC NULL,
                      GOOGLE_ATTENDEE_SYNCED_AT_UTC NULL,
                      ERROR(300) NULL,                    -- code สั้น เช่น no_contact — ห้ามมีอีเมล
                      ROW_VERSION, audit)                 -- ตัด ENROLLMENT_ID ออกจาก sketch เดิม (Live ไม่เห็น enrollment id ผ่าน contract)
                      PK_SESSION_INVITES · UQ IX_SESSION_INVITES_SESSION_USER (SESSION_ID, USER_ID) ·
                      IX_SESSION_INVITES_USER_ID (USER_ID) · IX_SESSION_INVITES_PENDING (SESSION_ID) WHERE "STATUS" = 'Pending'
                      -- ชื่อคอลัมน์ REMINDER_24H/1H: ApplyUppercaseNamingConventions แยก "ตัวเลข+ตัวพิมพ์ใหญ่" เป็น 24_H ได้ถ้าตั้งชื่ออัปเปอร์เคสตรง ๆ —
                      -- SessionInviteConfiguration จึงตั้ง HasColumnName แบบตัวพิมพ์เล็กโดยตั้งใจ (convention ทำเป็นตัวใหญ่ให้ทีหลัง) · LiveSchemaTests ล็อกชื่อไว้

-- migration 4: AddCourseGoogleAttendeeSync (P11-04) — Catalog, additive 1 AddColumn
CATALOG.COURSES            + GOOGLE_ATTENDEE_SYNC_ENABLED bool NOT NULL DEFAULT false   -- opt-in ต่อคอร์ส (Q11) — ส่งอีเมลผู้เรียนไป Google จึงต้องเป็นการตัดสินใจของผู้สอน

-- migration 5: AddLiveSessionJoinLogs (P11-05)
LIVE.SESSION_JOIN_LOGS(SESSION_JOIN_LOG_ID PK, SESSION_ID, COURSE_ID,   -- COURSE_ID denormalize ให้ refund (P11-12) เช็ค (USER_ID, COURSE_ID) ได้โดยไม่ join ข้ามโมดูล
                      USER_ID,                            -- จาก IUserContext เท่านั้น
                      ROLE varchar(16),                   -- Learner | Instructor — refund/KPI นับเฉพาะ Learner
                      AUTH_SESSION_ID uuid NULL,          -- claim sid ของ JWT (sketch เดิมเป็น varchar(200))
                      JOINED_AT_UTC,                      -- เวลาที่เปิดเผยลิงก์
                      IP_ADDRESS(64) NULL, USER_AGENT(300) NULL)
                      -- append-only เหมือน MEDIA.PLAYBACK_SESSIONS: ไม่ implement IAuditable/ISoftDelete, ไม่มี ROW_VERSION, entity ไม่มี method แก้ — มีแต่ SESSION_JOIN_LOG.Record(...)
                      PK_SESSION_JOIN_LOGS · IX_SESSION_JOIN_LOGS_SESSION_USER (SESSION_ID, USER_ID) · IX_SESSION_JOIN_LOGS_USER_COURSE (USER_ID, COURSE_ID)
                      -- ต่างจาก sketch เดิม: IX(SESSION_ID, JOINED_AT_UTC)/IX(USER_ID, JOINED_AT_UTC) → ตาม contract P11-05 §2
                      -- retention ของ IP/UA (scrub หลัง 12 เดือน) เป็น follow-up · USER_ID/COURSE_ID/SESSION_ID ต้องเก็บไว้ตามกฎ refund Q13.4

-- migration 6: AddLiveRecordingImport (P11-13, docs/contracts/P11-13-live-recording-auto-import.md §3) — additive ล้วน (1 ตาราง + 2 คอลัมน์ + 2 index) ยังไม่ apply ขึ้น DB จริง
LIVE.INSTRUCTOR_GOOGLE_ACCOUNTS + HOSTED_DOMAIN varchar(255) NULL,           -- userinfo "hd" เก็บทุกครั้งที่ connect/reconnect · NULL + ACCOUNT_KIND_CHECKED_AT_UTC มีค่า = บัญชีส่วนตัว
                               + ACCOUNT_KIND_CHECKED_AT_UTC timestamptz(3) NULL   -- ครั้งสุดท้ายที่อ่าน hd จาก Google · NULL ทั้งคู่ (แถวเก่า) = AccountKind "Unknown" จนกว่า TryResolveAccountKindAsync เติมให้
                               -- AccountKind (Personal|Workspace|Unknown) และ HasRecordingScopes เป็น property คำนวณ ไม่ใช่คอลัมน์
LIVE.SESSION_RECORDING_IMPORTS(SESSION_RECORDING_IMPORT_ID PK,
                      SESSION_ID UQ, COURSE_ID, INSTRUCTOR_USER_ID,   -- ไม่มี FK เลย (ข้าม schema) · 1 คาบ = มากสุด 1 แถว · แถวถูกเขียนเมื่อมีงานต้องทำเท่านั้น
                      STATUS varchar(24),                 -- Waiting|Transferring|Processing|Attached|NoRecording|Failed|NeedsReconnect|Skipped
                      ATTEMPTS int NOT NULL DEFAULT 0,    -- ความล้มเหลวชั่วคราว "ติดกัน" (สำเร็จขั้นหนึ่ง/เจอผลค้นว่าง = นับใหม่) · retry = 0
                      NEXT_ATTEMPT_AT_UTC NULL,           -- Waiting/Processing: เมื่อไหร่ job แตะได้ · Transferring/สถานะปลายทาง = NULL
                      LEASE_UNTIL_UTC NULL,               -- Transferring: lease ของการคัดลอก · Processing: deadline ของ transcode (6 ชม.) · อื่น ๆ NULL
                      GOOGLE_RECORDING_NAME(200) NULL, GOOGLE_FILE_ID(200) NULL,   -- id ภายใน ไม่ใช่ secret แต่ไม่ log/ไม่คืน API
                      MEDIA_ASSET_ID uuid NULL, EPISODE_ID uuid NULL,
                      ERROR_CODE(60) NULL,                -- รหัสเสถียรเท่านั้น (file_too_large, recording_scope_missing, ...) ห้ามเป็นข้อความ/URL/id
                      SEARCH_UNTIL_UTC,                   -- จบคาบ + SearchWindowHours: หลังจากนี้หาไม่เจอ = NoRecording
                      COMPLETED_AT_UTC NULL,              -- สถานะปลายทาง · retry เคลียร์
                      ROW_VERSION, audit)                 -- ROW_VERSION = claim แถวของ job (Waiting→Transferring บันทึกด้วย version ที่อ่าน)
                      PK_SESSION_RECORDING_IMPORTS · UQ IX_SESSION_RECORDING_IMPORTS_SESSION_ID (SESSION_ID) · IX_SESSION_RECORDING_IMPORTS_DUE (STATUS, NEXT_ATTEMPT_AT_UTC)
                      -- ไม่มี FK/cascade/hard delete · ไม่มี "poll count" แยก: ระยะค้นซ้ำคำนวณจากเวลาที่ผ่านไปตั้งแต่ถึงรอบค้นแรก (RecordingImportBackoff.ForSearch)

-- P13-09 ห้องประชุมอิสระ (ห้องเบื้องหลังคลาสติว Tutoring) — migration AddLiveAdhocMeetings (สร้างจริงแล้ว 2026-10-15 · ยังไม่ apply) · ที่มา docs/contracts/P13-09 §2
--   ไม่แตะ SESSION_MEETINGS/SESSION_INVITES (job คอร์สจะลบแถวที่ไม่มี course ทิ้งเงียบ ๆ) · ไม่มี FK ข้าม schema/module · ไม่มี cascade/hard delete · ทุก CHECK เขียน IS NOT NULL ชัด (CHECK ที่ได้ NULL ถือว่าผ่าน)
LIVE.ADHOC_MEETINGS(ADHOC_MEETING_ID PK,                 -- = RoomId ที่ส่งกลับผู้เรียก
                      SOURCE_KEY varchar(20) NOT NULL,    -- 'tutoring' (ค่าปิด · CK_ADHOC_MEETINGS_SOURCE_KEY)
                      SOURCE_REF_ID uuid NOT NULL,        -- TUTORING.TUTOR_SESSIONS.SESSION_ID (ไม่มี FK) · ICS UID + id ใน JOIN_URL
                      ORGANIZER_USER_ID uuid NOT NULL,    -- ติวเตอร์ = เจ้าของ INSTRUCTOR_GOOGLE_ACCOUNT · immutable
                      TITLE varchar(200), DESCRIPTION varchar(2000) NULL,   -- scrub ลิงก์ห้องประชุม + ตัด control char แล้วก่อนเก็บ
                      STARTS_AT_UTC, ENDS_AT_UTC timestamptz(3) NOT NULL,   -- CK_ADHOC_MEETINGS_TIME_ORDER (STARTS < ENDS)
                      JOIN_URL varchar(500) NOT NULL,     -- URL หน้า join ของ "แพลตฟอร์ม" (ไม่ใช่ลิงก์ห้อง) · immutable · host = ICS uidHost
                      JOIN_OPENS_MINUTES_BEFORE int NOT NULL,   -- 0..120 (CK_ADHOC_MEETINGS_JOIN_OPENS)
                      MANAGE_PATH varchar(200) NOT NULL,  -- /instructor/... ใช้ในอีเมล/แจ้งเตือนติวเตอร์
                      SEND_CALENDAR_INVITES bool NOT NULL DEFAULT true, SYNC_GOOGLE_ATTENDEES bool NOT NULL DEFAULT false,
                      CANCELLED_AT_UTC NULL, CANCEL_REASON varchar(300) NULL,   -- ล้างได้ทางเดียวคือ Revive (CreateAsync บนห้อง cancelled ที่ยังไม่จบ — RoomId/UID/JOIN_URL เดิม)
                      PROVIDER varchar(20) NULL,          -- GoogleMeet|Manual|Logging · NULL = ยังไม่ตัดสิน (CK_ADHOC_MEETINGS_PROVIDER)
                      INSTRUCTOR_GOOGLE_ACCOUNT_ID uuid NULL FK→INSTRUCTOR_GOOGLE_ACCOUNTS NoAction,   -- FK_ADHOC_MEETINGS_GOOGLE_ACCT
                      PROVIDER_EVENT_ID varchar(200) NULL,
                      MEET_URL_ENCRYPTED text NULL,       -- ISensitiveDataProtector.Encrypt(url) · อ่านผ่าน AdhocRoomService.RevealUrl ที่เดียว (GetJoinLinkAsync) · ห้าม log
                      SYNC_STATUS varchar(20) NOT NULL,   -- MeetingSyncStatus เดิม (CK_ADHOC_MEETINGS_SYNC_STATUS)
                      ICS_SEQUENCE int NOT NULL DEFAULT 0, ATTEMPTS int NOT NULL DEFAULT 0,   -- CK_ADHOC_MEETINGS_COUNTERS (>= 0)
                      NEXT_RETRY_AT_UTC NULL, LAST_SYNC_AT_UTC NULL,
                      BLOCKED_AT_UTC NULL,                -- เข้า AwaitingLink/NeedsReconnect/Failed ครั้งล่าสุด · ล้างตอน RequestResync/ได้ URL · self-heal ใช้เทียบกับ CONNECTED_AT_UTC ของบัญชี Google
                      ERROR varchar(500) NULL,            -- รหัสสั้นเท่านั้น
                      MEETING_ALERT_SENT_AT_UTC NULL, READINESS_ALERT_SENT_AT_UTC NULL,   -- alert "ห้องติดขัด" / "เหลือ ≤ ReadinessAlertMinutes แต่ยังไม่มีห้อง" ครั้งเดียว (Revive ล้างทั้งคู่)
                      LAST_REQUEST_ID uuid NULL,          -- idempotency ของ Update/Cancel/Create(revive)
                      ROW_VERSION bytea, audit)
                      PK_ADHOC_MEETINGS · UQ IX_ADHOC_MEETINGS_SOURCE_REF (SOURCE_KEY, SOURCE_REF_ID) ·
                      IX_ADHOC_MEETINGS_SYNC_DUE (SYNC_STATUS, NEXT_RETRY_AT_UTC) WHERE "SYNC_STATUS" IN ('Pending','PendingDelete') ·
                      IX_ADHOC_MEETINGS_BLOCKED (ORGANIZER_USER_ID) WHERE "SYNC_STATUS" IN ('AwaitingLink','NeedsReconnect','Failed') AND "CANCELLED_AT_UTC" IS NULL ·
                      IX_ADHOC_MEETINGS_UPCOMING (STARTS_AT_UTC) WHERE "CANCELLED_AT_UTC" IS NULL · IX_ADHOC_MEETINGS_GOOGLE_ACCT_ID (INSTRUCTOR_GOOGLE_ACCOUNT_ID)
LIVE.ADHOC_MEETING_PARTICIPANTS(ADHOC_MEETING_PARTICIPANT_ID PK,
                      ADHOC_MEETING_ID FK→ADHOC_MEETINGS NoAction,   -- FK_ADHOC_PARTICIPANTS_MEETING
                      USER_ID uuid NOT NULL,              -- ไม่มี FK · อีเมลอ่านจาก Identity ตอนส่ง — ไม่เก็บ
                      ROLE varchar(16) NOT NULL,          -- Organizer|Participant (CK_ADHOC_PARTICIPANTS_ROLE)
                      DISPLAY_NAME varchar(100) NOT NULL, -- ชื่อเล่น/ชื่อสาธารณะที่ Tutoring ส่งมา (CN ของ ATTENDEE) — ไม่ใช่ชื่อจริงของเด็ก/ผู้ปกครอง
                      STATUS varchar(16) NOT NULL,        -- InviteStatus เดิม: Pending|Invited|Cancelled|Skipped (CK_ADHOC_PARTICIPANTS_STATUS)
                      WITHDRAWN_AT_UTC NULL,              -- Tutoring ถอดออก · รอส่ง CANCEL (Reinvite ล้าง)
                      ICS_SEQUENCE_SENT int NULL,         -- monotonic ต่อแถว (CANCEL นับด้วย)
                      INVITE_SENT_AT_UTC NULL, CANCEL_SENT_AT_UTC NULL, GOOGLE_ATTENDEE_SYNCED_AT_UTC NULL,
                      ERROR varchar(60) NULL,             -- 'no_contact'
                      ROW_VERSION bytea, audit)
                      PK_ADHOC_PARTICIPANTS · UQ IX_ADHOC_PARTICIPANTS_MEETING_USER (ADHOC_MEETING_ID, USER_ID) · IX_ADHOC_PARTICIPANTS_USER_ID (USER_ID)
                      -- แถวไม่ถูกลบ (เป็นหลักฐานว่าใครถูกเชิญ/ถอด) · PK สร้างฝั่ง client (ValueGeneratedNever) เพื่อให้ EF มอง participant ที่เพิ่มเข้าห้องที่ track อยู่เป็น INSERT ไม่ใช่ UPDATE
                      -- CHECK ที่เพิ่มเกินตาราง §2 ของ contract (ไม่มีผลต่อ API): CK_ADHOC_MEETINGS_{SOURCE_KEY,TIME_ORDER,JOIN_OPENS,SYNC_STATUS,PROVIDER,COUNTERS} · CK_ADHOC_PARTICIPANTS_{ROLE,STATUS}

-- P11 Commerce: ไม่มีตารางใหม่ (PAYMENT.METHOD รองรับ Card แล้ว) · Config Payment:EnabledMethods

-- P12 (AI Study) — เลื่อนทั้งเฟส (Q12, 2026-09-16) — sketch ด้านล่างยังไม่สร้าง ไม่ผูกกับ P11 เลย เก็บไว้ revisit ได้ทันที
-- P12 Media (schema MEDIA) — migration AddMediaAiEnrichments
MEDIA.MEDIA_AI_ENRICHMENTS(MEDIA_AI_ENRICHMENT_ID PK, MEDIA_ASSET_ID FK→MEDIA_ASSETS NoAction UQ,
                      STATUS varchar(20),              -- Pending|Transcribing|Summarizing|Ready|Failed|Skipped
                      TRANSCRIPT_LANG(10), TRANSCRIPT_TEXT text NULL, CHAPTERS_JSON jsonb NULL, MOMENTS_JSON jsonb NULL,
                      SUMMARY_JSON jsonb NULL,         -- {summaryTh, keyPoints[], reviewQuestions[], suggestedTitle}
                      MODEL(100) NULL, ATTEMPTS int, ERROR(2000) NULL,
                      TRANSCRIBED_AT_UTC NULL, SUMMARIZED_AT_UTC NULL, audit)
MEDIA.AI_GENERATION_LOG(AI_GENERATION_LOG_ID bigint identity PK, PURPOSE varchar(40),   -- Summary|WatchPlan|MarketingCopy
                      MODEL(100), INPUT_TOKENS int, OUTPUT_TOKENS int, COST_USD decimal(10,4),
                      REF_TYPE(40), REF_ID uuid NULL, REQUESTED_BY_USER_ID uuid NULL, OCCURRED_AT_UTC)
                      IX(OCCURRED_AT_UTC)              -- budget guard: SUM(COST_USD) เดือนนี้ ก่อนเรียกทุกครั้ง

-- P12 Learning — migration AddStudyPlans
LEARNING.STUDY_PLANS(STUDY_PLAN_ID PK, ENROLLMENT_ID FK→ENROLLMENTS NoAction UQ, PLAN_JSON jsonb,
                      SOURCE varchar(20),              -- Llm|RuleBased
                      GENERATED_AT_UTC, VALID_UNTIL_UTC, PROGRESS_FINGERPRINT(64))   -- invalidate เมื่อ progress เปลี่ยน
```

## ส่วนขยาย P13 (Tutor Marketplace — D-25, 2026-10-14 · **P13-01 (5 ตาราง) + P13-02 (3 ตาราง KYC) + P13-03 (2) + P13-04 (1) + P13-05 (3 ตาราง จอง) + … + P13-17 (3 คอลัมน์ + 6 partial index, `AddTutoringPdpa`) + P13-15 (8 index, `AddTutoringAnalyticsIndexes`) + P13-13 (1 ตาราง `TUTOR_REVIEWS`, `AddTutorReviews`) สร้างโค้ด+migration แล้ว, ยังไม่ apply DB จริง · ตารางที่เหลือออกแบบแล้วยังไม่สร้าง** · รายละเอียดคอลัมน์ต่อ task ที่ `docs/contracts/P13-xx-*.md`)

### สร้างจริงแล้ว — P13-01 · migration `AddTutoringCore` (2026-10-14) · schema `TUTORING` · entity UPPERCASE ใน `Siri.Modules.Tutoring`
> ทุกตารางมี audit 4 คอลัมน์ (`CREATED_AT_UTC`/`CREATED_BY`/`UPDATED_AT_UTC`/`UPDATED_BY`, property เป็น PascalCase) · PK `uuid` UUIDv7 · เวลา `timestamptz(3)` · enum เก็บ `varchar` (ชื่อ member) · **FK ภายใน schema ทุกเส้น `NoAction`, ไม่มี FK ข้ามโมดูล** (`USER_ID`/`INSTRUCTOR_PROFILE_ID`/`INTRO_VIDEO_ASSET_ID`/`DOCUMENT_ID` เป็นแค่คอลัมน์) · ไม่มี DELETE บน `SUBJECTS`/`TUTOR_PROFILES`/`TUTOR_OFFERINGS` (ปิดด้วย `IS_ACTIVE`/`STATUS`), `TUTOR_EDUCATIONS`/`TUTOR_CERTIFICATES` ลบจริงได้ (ข้อมูลโปรไฟล์ ไม่ใช่เงิน/สิทธิ์)
```
TUTORING.SUBJECTS(SUBJECT_ID PK, SLUG varchar(80) UQ[UQ_SUBJECTS_SLUG], NAME_TH varchar(120), NAME_EN varchar(120),
                  PARENT_ID? FK→SUBJECTS NoAction[FK_SUBJECTS_PARENT], SORT_ORDER int, IS_ACTIVE bool)
                  IX_SUBJECTS_PARENT_SORT(PARENT_ID, SORT_ORDER) · ลึกสุด 2 ระดับ (กลุ่ม→วิชา) บังคับที่ service · SLUG แก้ไม่ได้
                  seed 50 แถว (8 กลุ่ม + 42 วิชา) ใน migration ผ่าน TutoringSubjectSeedSql (INSERT … ON CONFLICT("SLUG") DO NOTHING, id เป็น UUIDv7 literal, ไม่ใช้ HasData)
TUTORING.TUTOR_PROFILES(TUTOR_ID PK, USER_ID UQ[UQ_TUTOR_PROFILES_USER_ID], INSTRUCTOR_PROFILE_ID UQ[UQ_TUTOR_PROFILES_INSTR_PROFILE],
                  SLUG varchar(100) UQ[UQ_TUTOR_PROFILES_SLUG], DISPLAY_NAME varchar(80), HEADLINE? varchar(120), BIO varchar(4000) plain text,
                  GENDER varchar(16), PHOTO_STORAGE_KEY? varchar(500), INTRO_VIDEO_ASSET_ID?, YEARS_EXPERIENCE int,
                  STATUS varchar(24) [Draft|PendingVerification|NeedsInfo|Verified|Rejected|Suspended], STATUS_REASON? varchar(1000), STATUS_CHANGED_AT_UTC,
                  IS_LISTED bool, MIN_NOTICE_HOURS int, BUFFER_MINUTES int, MAX_ADVANCE_DAYS int, COMMISSION_PERCENT_OVERRIDE? numeric(5,2),
                  RATING_AVERAGE numeric(3,2), RATING_COUNT int, COMPLETED_SESSIONS_COUNT int, RELIABILITY_SCORE int, NEXT_AVAILABLE_AT_UTC?,   ← denormalized: เขียนผ่าน TutorProfileStatsUpdater เท่านั้น
                  VERIFIED_AT_UTC?, ROW_VERSION bytea [concurrency token])
                  IX_TUTOR_PROFILES_STATUS(STATUS, STATUS_CHANGED_AT_UTC)
                  CHECK: CK_TUTOR_PROFILES_LISTED (IS_LISTED=false OR STATUS='Verified') · _SETTINGS (MIN_NOTICE_HOURS 1-168, BUFFER_MINUTES 0-60, MAX_ADVANCE_DAYS 7-180, YEARS_EXPERIENCE 0-60)
                         · _COMMISSION (NULL หรือ 0-50) · _RELIABILITY (RELIABILITY_SCORE 0-100, RATING_COUNT>=0, COMPLETED_SESSIONS_COUNT>=0, RATING_AVERAGE 0-5)
                  index ค้นหา (GIN trigram / partial) ยังไม่มี — เป็นของ P13-04 (`AddTutorSearch`)
TUTORING.TUTOR_OFFERINGS(OFFERING_ID PK, TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_OFFERINGS_TUTOR], SUBJECT_ID FK→SUBJECTS NoAction[FK_TUTOR_OFFERINGS_SUBJECT],
                  LEVEL varchar(24), CURRICULUM varchar(16), HOURLY_RATE_ONE_ON_ONE numeric(18,2), GROUP_HOURLY_RATE_PER_SEAT? numeric(18,2), GROUP_MAX_SEATS? int,
                  TRIAL_ENABLED bool, TRIAL_MINUTES? int, TRIAL_PRICE? numeric(18,2), IS_ACTIVE bool)
                  UQ_TUTOR_OFFERINGS_COMBO(TUTOR_ID, SUBJECT_ID, LEVEL, CURRICULUM) · IX_TUTOR_OFFERINGS_SUBJECT_ACTIVE(SUBJECT_ID, LEVEL, CURRICULUM) WHERE IS_ACTIVE
                  CHECK: _GROUP (ราคากลุ่ม+จำนวนที่นั่งต้องมาคู่กัน, ที่นั่ง 2-6) · _TRIAL (ปิด ⇒ ไม่มีนาที/ราคา; เปิด ⇒ นาที 15|30 และราคา>=0) · _RATES (HOURLY_RATE_ONE_ON_ONE > 0)
TUTORING.TUTOR_EDUCATIONS(EDUCATION_ID PK, TUTOR_ID FK NoAction[FK_TUTOR_EDUCATIONS_TUTOR], INSTITUTION varchar(160), DEGREE varchar(120), FIELD? varchar(120),
                  YEAR_FROM int, YEAR_TO? int, SORT_ORDER int)  IX_TUTOR_EDUCATIONS_TUTOR(TUTOR_ID, SORT_ORDER) · CHECK _YEARS (1950-2100, YEAR_TO>=YEAR_FROM)
TUTORING.TUTOR_CERTIFICATES(CERTIFICATE_ID PK, TUTOR_ID FK NoAction[FK_TUTOR_CERTIFICATES_TUTOR], TITLE varchar(160), ISSUER? varchar(160), YEAR int,
                  DOCUMENT_ID? [สงวนไว้ — null เสมอใน v1], SORT_ORDER int)  IX_TUTOR_CERTIFICATES_TUTOR(TUTOR_ID, SORT_ORDER) · CHECK _YEAR (1950-2100)
```
> **หมายเหตุ deviation จาก `TUTORING.md` §2:** `TUTOR_PROFILES` เพิ่ม `DISPLAY_NAME`/`STATUS_REASON`/`STATUS_CHANGED_AT_UTC` · CHECK `_GROUP`/`_TRIAL` ใส่ `IS NOT NULL` ชัดเจนในฝั่ง "ต้องมีค่า" เพราะ CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL (พิสูจน์ด้วย integration test บน PostgreSQL จริง — ตัวที่ contract เขียนไว้ปล่อย "ราคากลุ่มมี แต่ไม่มีจำนวนที่นั่ง" ผ่าน) · ค่า default ของคอลัมน์ (เช่น `MIN_NOTICE_HOURS`=24, `RELIABILITY_SCORE`=100, `IS_ACTIVE`=true) อยู่ที่ entity ไม่ใช่ DB default (DB default ที่ต่างจาก CLR default ทำให้ EF ละคอลัมน์เมื่อค่าเท่า sentinel)

### สร้างจริงแล้ว — P13-02 · migration `AddTutorKyc` (2026-10-14, ต่อจาก `AddTutoringCore`) · schema `TUTORING` · เอกสาร KYC (ข้อมูลอ่อนไหวสูง)
> ไฟล์เอกสารไม่อยู่ใน DB เลย — อยู่ใน bucket R2 แยก (`Storage:R2Kyc`, ไม่มี public domain/presigned URL) แบบ**เข้ารหัส AES-256-GCM ที่ชั้นแอป**ก่อนอัปโหลด (blob `[0x01][nonce 12B][tag 16B][ciphertext]`, subkey HKDF ต่อเอกสาร, AAD = `DOCUMENT_ID`) · DB เก็บแค่ metadata · FK ภายใน schema ทุกเส้น `NoAction` · ไม่มี DELETE บนทั้ง 3 ตาราง (เอกสารที่ purge แล้วคงแถวไว้ + `PURGED_AT_UTC`)
```
TUTORING.TUTOR_KYC_CASES(CASE_ID PK, TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_KYC_CASES_TUTOR], ATTEMPT_NO int, STATUS varchar(16) [Draft|Submitted|InReview|NeedsInfo|Approved|Rejected],
                  SUBMITTED_AT_UTC?, CONSENT_VERSION varchar(32), CONSENT_AT_UTC, DECIDED_BY_USER_ID?, DECIDED_AT_UTC?, DECISION_NOTE? varchar(1000),
                  ROW_VERSION bytea [concurrency token], + audit 4 คอลัมน์)
                  UQ_TUTOR_KYC_CASES_ATTEMPT(TUTOR_ID, ATTEMPT_NO) · UQ_TUTOR_KYC_CASES_OPEN(TUTOR_ID) WHERE STATUS IN ('Draft','Submitted','InReview','NeedsInfo') [เคสเปิดได้ครั้งละ 1 ต่อติวเตอร์]
                  IX_TUTOR_KYC_CASES_QUEUE(STATUS, SUBMITTED_AT_UTC)
                  CHECK: _ATTEMPT (ATTEMPT_NO>=1) · _DECIDED (STATUS NOT IN ('Approved','Rejected') OR (DECIDED_AT_UTC IS NOT NULL AND DECIDED_BY_USER_ID IS NOT NULL))
TUTORING.TUTOR_DOCUMENTS(DOCUMENT_ID PK [สร้างก่อนแถว — ใช้เป็น storage key + AAD], CASE_ID FK→TUTOR_KYC_CASES NoAction[FK_TUTOR_DOCUMENTS_CASE],
                  TYPE varchar(16) [IdCard|Diploma|CriminalRecord|Certificate|Other], STORAGE_KEY varchar(300) [ไม่มีชื่อไฟล์/ID number], CONTENT_TYPE varchar(40) [application/pdf|image/jpeg|image/png],
                  SIZE_BYTES bigint [ขนาด plaintext], CONTENT_SHA256 varchar(64) [hex ของ plaintext — ตรวจซ้ำ/กันไฟล์ซ้ำ ไม่ใช่ความลับ],
                  STATUS varchar(12) [Pending|Approved|Rejected — ผลการตรวจรายเอกสาร; ไม่มีค่า Purged, ใช้ PURGED_AT_UTC], EXPIRES_AT_UTC? [กรอกเมื่อมีวันหมดอายุ — ใช้กับ job เตือน], EXPIRY_REMINDER_SENT_AT_UTC?,
                  PURGE_AFTER_UTC? [ตั้งตอนเคสตัดสิน: IdCard/CriminalRecord +30 วัน, ชนิดอื่น +90 วัน (Tutoring:Kyc:*RetentionDays)], PURGED_AT_UTC?, + audit 4 คอลัมน์)
                  IX_TUTOR_DOCUMENTS_CASE(CASE_ID) · IX_TUTOR_DOCUMENTS_SHA256(CONTENT_SHA256)
                  IX_TUTOR_DOCUMENTS_EXPIRY(EXPIRES_AT_UTC) WHERE EXPIRES_AT_UTC IS NOT NULL AND EXPIRY_REMINDER_SENT_AT_UTC IS NULL
                  IX_TUTOR_DOCUMENTS_PURGE_DUE(PURGE_AFTER_UTC) WHERE PURGED_AT_UTC IS NULL AND PURGE_AFTER_UTC IS NOT NULL
                  CHECK: _SIZE (SIZE_BYTES BETWEEN 1 AND 20971520)
TUTORING.TUTOR_DOCUMENT_ACCESS_LOGS(ACCESS_LOG_ID PK, DOCUMENT_ID FK→TUTOR_DOCUMENTS NoAction[FK_TUTOR_DOC_ACCESS_LOGS_DOC], ACCESSED_BY_USER_ID?,
                  ACCESSED_AT_UTC, ACTION varchar(12) [View|Download|Purge], IP_ADDRESS? varchar(64))   ← append-only: ไม่มี audit 4 คอลัมน์, ไม่มี UPDATE/DELETE ในโค้ด
                  IX_TUTOR_DOC_ACCESS_LOGS_DOC(DOCUMENT_ID, ACCESSED_AT_UTC) · แถว View ถูกเขียน**ก่อน**คืน bytes เสมอ (ล้มเหลว = ไม่คืนไฟล์)
```
> **หมายเหตุ:** `PURGE_AFTER_UTC` เป็นข้อยกเว้นของกฎ "ชื่อลงท้าย `AtUtc`" (ตามสัญญา P13-02, ทดสอบไว้ใน `TutoringSchemaTests`) · CHECK `_DECIDED` ใส่ `IS NOT NULL` ชัดเจนเพราะ CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL (พิสูจน์ด้วย raw-SQL integration test ทุก CHECK) · migration เป็น additive ล้วน (3 CreateTable, Down = DropTable ตามลำดับย้อน, ไม่มี Drop*/shadow column) · ชื่อ identifier ยาวสุด `FK_TUTOR_DOC_ACCESS_LOGS_DOC`/`IX_TUTOR_DOC_ACCESS_LOGS_DOC` (≤63 ไบต์ — ย่อชื่อเอง ไม่ใช่ truncate)

### สร้างจริงแล้ว — P13-03 · migration `AddTutorAvailability` (2026-10-14, ต่อจาก `AddTutorKyc`) · schema `TUTORING` · เวลาว่างของติวเตอร์
> 2 ตาราง ทั้งคู่มี audit 4 คอลัมน์ (property PascalCase) · PK `uuid` UUIDv7 · เวลาท้องถิ่นเป็น Asia/Bangkok (UTC+7 คงที่ ไม่มี DST) เก็บเป็น `time`/`date` **ไม่ใช่** `timestamptz` · FK `NoAction` · **ลบแถวจริงได้** (ไม่ใช่เงิน/สิทธิ์ — ติวเตอร์แทนที่ rule ทั้งชุดแบบ delete+insert; คลาสที่จองแล้วไม่ผูกกับ rule)
```
TUTORING.TUTOR_AVAILABILITY_RULES(RULE_ID PK, TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_AVAIL_RULES_TUTOR], DAY_OF_WEEK int [0=อาทิตย์ … 6=เสาร์ ตรง System.DayOfWeek/JS getDay()],
                  START_LOCAL time, END_LOCAL time [END <= START = ข้ามเที่ยงคืน; END=00:00 = เที่ยงคืนพอดี], IS_ACTIVE bool)
                  IX_TUTOR_AVAIL_RULES_TUTOR_DOW(TUTOR_ID, DAY_OF_WEEK)
                  CHECK: CK_TUTOR_AVAIL_RULES_DOW (DAY_OF_WEEK BETWEEN 0 AND 6) · CK_TUTOR_AVAIL_RULES_RANGE (START_LOCAL <> END_LOCAL)
TUTORING.TUTOR_AVAILABILITY_EXCEPTIONS(EXCEPTION_ID PK, TUTOR_ID FK NoAction[FK_TUTOR_AVAIL_EXC_TUTOR], DATE_LOCAL date, KIND varchar(12) [Closed|ExtraOpen],
                  START_LOCAL? time, END_LOCAL? time, NOTE? varchar(200))   IX_TUTOR_AVAIL_EXC_TUTOR_DATE(TUTOR_ID, DATE_LOCAL)
                  CHECK: CK_TUTOR_AVAIL_EXC_SHAPE ((START IS NULL AND END IS NULL AND KIND='Closed') OR (START IS NOT NULL AND END IS NOT NULL AND END > START))
```
> **หมายเหตุ:** `TUTOR_PROFILES.MIN_NOTICE_HOURS`/`BUFFER_MINUTES`/`MAX_ADVANCE_DAYS` มีมาตั้งแต่ P13-01 (ไม่มีคอลัมน์ใหม่) · `CK_TUTOR_AVAIL_EXC_SHAPE` ทุกกิ่งเป็น `IS NULL`/`IS NOT NULL` หรือเปรียบเทียบค่าที่ไม่ null จึงไม่มีทางประเมินเป็น NULL (CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL) — พิสูจน์ทุกกิ่งด้วย raw-SQL integration test (`TutoringAvailabilitySchemaIntegrationTests`) · ไม่มี slot ใน DB (คำนวณตอนอ่านโดย `SlotCalculator`) · การแทนที่ rule ทั้งชุดทำใน transaction เดียวโดยล็อกแถว `TUTOR_PROFILES` ของติวเตอร์ด้วย `FOR NO KEY UPDATE` (กันสองคำขอพร้อมกันได้ชุดผสม — พิสูจน์ด้วย test ที่ล้มเมื่อถอดล็อก) · migration เป็น additive ล้วน (2 CreateTable + 2 CreateIndex, Down = DropTable; ไม่มี Drop*/shadow column ใน Up) · ชื่อ identifier ยาวสุด `PK_TUTOR_AVAILABILITY_EXCEPTIONS` (32 ไบต์)

### สร้างจริงแล้ว — P13-04 · migration `AddTutorSearch` (2026-10-14, ต่อจาก `AddTutorAvailability`) · schema `TUTORING` · ค้นหาติวเตอร์ + search log
> 1 ตารางใหม่ + 5 index บน `TUTOR_PROFILES` (ไม่มีคอลัมน์ใหม่บนตารางเดิม) · migration เป็น additive ล้วน (`CreateTable` ×1, `CreateIndex` ×7; `Down` = `DropTable` + `DropIndex` ×5; ไม่มี Drop*/Alter* ใน `Up`) · ยังไม่ apply DB จริง
```
TUTORING.SEARCH_LOGS(SEARCH_LOG_ID PK[PK_SEARCH_LOGS], CREATED_AT_UTC timestamptz(3), SUBJECT_ID? uuid [ไม่มี FK — log ต้องอยู่รอดแม้วิชาถูกปิด],
                  LEVEL? varchar(24) [TutorLevel], CURRICULUM? varchar(16) [TutorCurriculum], QUERY_TEXT? varchar(100) [sanitize แล้ว], RESULT_COUNT int)
                  IX_SEARCH_LOGS_CREATED(CREATED_AT_UTC)  ← retention · IX_SEARCH_LOGS_SUBJECT_CREATED(SUBJECT_ID, CREATED_AT_UTC) ← analytics P13-15
                  ← append-only: ไม่มี audit 4 คอลัมน์/ISoftDelete · **ไม่มีคอลัมน์ user/IP/UA/session ใด ๆ** (เทสต์ reflection + information_schema + EF model)
                  ← DELETE ได้เฉพาะ job `tutoring-search-log-purge` (ไม่ใช่เงิน/สิทธิ์) · ไม่มี CHECK (NOT NULL ของ CREATED_AT_UTC/RESULT_COUNT พิสูจน์ด้วย raw-SQL insert → 23502)
TUTORING.TUTOR_PROFILES  (+5 index ทั้งหมด partial: WHERE "STATUS" = 'Verified' AND "IS_LISTED" = true — ข้อความตรงกับที่ทุก query ค้นหาใช้ เพื่อให้ planner พิสูจน์ implication ได้)
                  IX_TUTOR_PROFILES_NAME_TRGM     GIN (DISPLAY_NAME gin_trgm_ops)        ← ILIKE '%…%' ชื่อ
                  IX_TUTOR_PROFILES_HEADLINE_TRGM GIN (HEADLINE gin_trgm_ops)            ← ILIKE '%…%' headline (BIO ไม่ทำ index: ใช้ rank เท่านั้น)
                  IX_TUTOR_PROFILES_LISTED_RATING (RATING_AVERAGE DESC, RATING_COUNT DESC, TUTOR_ID)   ← sort rating / relevance ไม่มี q
                  IX_TUTOR_PROFILES_LISTED_NEXT   (NEXT_AVAILABLE_AT_UTC, TUTOR_ID)       ← sort nextAvailable
                  IX_TUTOR_PROFILES_LISTED_NEWEST (VERIFIED_AT_UTC DESC, TUTOR_ID)        ← sort newest
```
> **หมายเหตุ:** ใช้ `pg_trgm` (ประกาศใน `AppDbContext.OnModelCreating` แล้ว) ไม่ใช่ `tsvector` เพราะภาษาไทยไม่มีช่องว่างคั่นคำ · พิสูจน์ด้วย `EXPLAIN` จริง (10,000 ติวเตอร์, `enable_seqscan=off`, statement ที่ดักจาก repository จริง): q → `…_NAME_TRGM`/`…_HEADLINE_TRGM`, sort → `…_LISTED_RATING`/`_NEXT`/`_NEWEST` · ที่ติวเตอร์ ~2,500 ราย planner เลือก `IX_TUTOR_PROFILES_STATUS` แทน trigram เพราะต้นทุนคงที่ของ GIN สูงกว่า — เป็นพฤติกรรมปกติ ไม่ใช่ index ผิด · `CK_TUTOR_PROFILES_LISTED` (`IS_LISTED = false OR STATUS = 'Verified'`) ทำให้ "ไม่เช็ค STATUS" กับ "เช็ค" ให้ผลเหมือนกันเมื่อมี `IS_LISTED` อยู่ — query ยังเช็คทั้งสอง (partial-index predicate) · sitemap เรียงด้วย `TUTOR_ID` (PK) · ชื่อ index ยาวสุด 31 ไบต์ (≤63)

### สร้างจริงแล้ว — P13-05 · migration `AddTutorBookingCore` (2026-10-15, ต่อจาก `AddTutorSearch`) · schema `TUTORING` · โปรไฟล์ผู้เรียน + คลาส + การจอง
> 3 ตารางใหม่ + extension `btree_gist` + exclusion constraint (raw SQL) · **FK ภายใน schema ทุกเส้น `NoAction`, ไม่มี FK ข้ามโมดูล/ข้ามงาน** (`OWNER_USER_ID`/`LEARNER_USER_ID`/`MEETING_ROOM_ID` เป็นแค่คอลัมน์; `PAYMENT_ID` — FK มากับ P13-06; `PACKAGE_PURCHASE_ID` — FK มากับ P13-12) · ไม่มี DELETE บน `TUTOR_SESSIONS`/`TUTOR_BOOKINGS` (ปิดด้วย `STATUS`), `LEARNER_PROFILES` ปิดด้วย `IS_ACTIVE` (ไม่ลบแถว — การจองเก่ายังชี้ถึง) · migration: `AlterDatabase` (เพิ่ม extension) + `CreateTable` ×3 + `CreateIndex` ×12 + `Sql` ×1 · `Down` ดรอป constraint ก่อน `DropTable` ×3 (ไม่ `DROP EXTENSION`) · ยังไม่ apply DB จริง
```
TUTORING.LEARNER_PROFILES(LEARNER_PROFILE_ID PK, OWNER_USER_ID uuid [ไม่มี FK], NICKNAME varchar(40), GRADE_LEVEL varchar(24) [ชื่อ member ของ LearnerGrade],
                  IS_MINOR bool, GUARDIAN_CONSENT_AT_UTC? timestamptz(3), GUARDIAN_CONSENT_VERSION? varchar(32), IS_ACTIVE bool + audit 4 คอลัมน์)
                  IX_LEARNER_PROFILES_OWNER(OWNER_USER_ID, IS_ACTIVE)
                  CHECK: CK_LEARNER_PROFILES_CONSENT (IS_MINOR=false OR (GUARDIAN_CONSENT_AT_UTC IS NOT NULL AND GUARDIAN_CONSENT_VERSION IS NOT NULL))
TUTORING.TUTOR_SESSIONS(SESSION_ID PK, TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_SESSIONS_TUTOR], OFFERING_ID FK→TUTOR_OFFERINGS NoAction[FK_TUTOR_SESSIONS_OFFERING],
                  STARTS_AT_UTC, ENDS_AT_UTC, BLOCK_ENDS_AT_UTC [= ENDS + BUFFER_MINUTES ที่ snapshot ไว้ตอนสร้าง], FORMAT varchar(12) [OneOnOne|Group], CAPACITY int, SEATS_TAKEN int, IS_TRIAL bool,
                  STATUS varchar(16) [Held|Scheduled|Completed|Cancelled|NoShowTutor|NoShowBoth], MEETING_ROOM_ID?, TUTOR_JOINED_AT_UTC?, TUTOR_CONFIRMED_AT_UTC?, FINALIZED_AT_UTC?,
                  ROW_VERSION bytea [concurrency token — ConcurrencyTokenInterceptor] + audit 4 คอลัมน์)
                  IX_TUTOR_SESSIONS_TUTOR_STARTS(TUTOR_ID, STARTS_AT_UTC) · IX_TUTOR_SESSIONS_OFFERING(OFFERING_ID) · IX_TUTOR_SESSIONS_ACTIVE_STARTS(STARTS_AT_UTC) WHERE STATUS IN ('Held','Scheduled')
                  CHECK: _FORMAT (FORMAT<>'OneOnOne' OR CAPACITY=1) · _SEATS (CAPACITY>=1 AND SEATS_TAKEN>=0 AND SEATS_TAKEN<=CAPACITY) · _TIME (ENDS>STARTS AND BLOCK_ENDS>=ENDS) · _TRIAL (IS_TRIAL=false OR FORMAT='OneOnOne')
                  **EX_TUTOR_SESSIONS_NO_OVERLAP** EXCLUDE USING gist (TUTOR_ID WITH =, tstzrange(STARTS_AT_UTC, BLOCK_ENDS_AT_UTC) WITH &&) WHERE (STATUS IN ('Held','Scheduled','Completed'))
TUTORING.TUTOR_BOOKINGS(BOOKING_ID PK, BOOKING_NO varchar(24) [TB-yymmdd-XXXXXX], SESSION_ID FK→TUTOR_SESSIONS NoAction[FK_TUTOR_BOOKINGS_SESSION], TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_BOOKINGS_TUTOR],
                  LEARNER_USER_ID uuid [ไม่มี FK], LEARNER_PROFILE_ID FK→LEARNER_PROFILES NoAction[FK_TUTOR_BOOKINGS_LEARNER], PACKAGE_PURCHASE_ID? FK→PACKAGE_PURCHASES NoAction[FK_TUTOR_BOOKINGS_PACKAGE_PURCHASES — เพิ่มโดย P13-12 `AddTutorPackages`], IS_TRIAL bool,
                  PRICE_AMOUNT numeric(18,2), STATUS varchar(24) [PendingPayment|Confirmed|Completed|CancelledByLearner|CancelledByTutor|Expired|NoShowLearner|NoShowTutor|NoShowBoth|Disputed],
                  HOLD_EXPIRES_AT_UTC?, PAYMENT_ID? [ไม่มี FK — มากับ P13-06], CANCELLED_AT_UTC?, CANCEL_REASON? varchar(500), REFUNDED_AMOUNT numeric(18,2), ESCROW_STATE varchar(12) [None|Held|Released|Refunded|Disputed],
                  CONFIRMED_AT_UTC?, COMPLETED_AT_UTC?, LEARNER_JOINED_AT_UTC?, LEARNER_CONFIRMED_AT_UTC?, REMINDER_24H_SENT_AT_UTC?, REMINDER_15M_SENT_AT_UTC?, ROW_VERSION bytea + audit 4 คอลัมน์)
                  UQ_TUTOR_BOOKINGS_NO(BOOKING_NO) · UQ_TUTOR_BOOKINGS_SESSION_LEARNER(SESSION_ID, LEARNER_PROFILE_ID) WHERE STATUS NOT IN ('CancelledByLearner','CancelledByTutor','Expired')
                  UQ_TUTOR_BOOKINGS_TRIAL(TUTOR_ID, LEARNER_PROFILE_ID) WHERE IS_TRIAL AND STATUS NOT IN (เหมือนข้างบน) [โควตาทดลองเรียนฟรี 1 ครั้ง/ติวเตอร์/โปรไฟล์ผู้เรียน]
                  IX_TUTOR_BOOKINGS_HOLD_EXPIRY(HOLD_EXPIRES_AT_UTC) WHERE STATUS='PendingPayment' [job `tutoring-hold-expiry`] · IX_TUTOR_BOOKINGS_LEARNER_STATUS(LEARNER_USER_ID, STATUS)
                  IX_TUTOR_BOOKINGS_TUTOR_STATUS(TUTOR_ID, STATUS) · IX_TUTOR_BOOKINGS_SESSION(SESSION_ID) · IX_TUTOR_BOOKINGS_LEARNER_PROFILE(LEARNER_PROFILE_ID)
                  CHECK: _AMOUNTS (PRICE_AMOUNT>=0 AND REFUNDED_AMOUNT>=0 AND REFUNDED_AMOUNT<=PRICE_AMOUNT) · _HOLD (STATUS<>'PendingPayment' OR HOLD_EXPIRES_AT_UTC IS NOT NULL)
```
> **หมายเหตุ:** (1) **exclusion constraint** อยู่นอก model snapshot (EF ไม่มี API) — `TutoringBookingSchemaIntegrationTests` ยืนยันว่ามีจริงและทดสอบด้วย raw SQL (ทับกัน/เริ่มพร้อมกัน/อยู่ข้างใน/ขอบ buffer/ติดกันแบบ half-open/คนละติวเตอร์/ตาม status/revive เข้าเวลาที่ถูกจองไปแล้ว) · session ที่ `Cancelled`/`NoShow*` หลุดออกจาก `WHERE` จึงคืนเวลาให้เอง · (2) **ข้อควรระวัง (เจอจริงจาก race test):** สอง transaction ที่ INSERT แถวทับกันพร้อมกัน ต่างมองเห็นแถว uncommitted ของอีกฝ่ายแล้วรอกัน → PostgreSQL ตัดทิ้งฝั่งหนึ่งด้วย **40P01 deadlock** หลัง `deadlock_timeout` แทนที่จะเป็น 23P01 · แก้ที่ชั้นแอป: `ITutorSessionRepository.LockTutorCalendarAsync(tutorId)` = `pg_advisory_xact_lock(hashtextextended(tutorId, 1305))` เป็น lock **ตัวแรก** ของ transaction (ก่อน lock แถวใด ๆ) — ใช้ใน `BookingService` (สร้าง session) และ `BookingReopenService` (revive) · **โค้ดใหม่ที่ INSERT / revive / เปลี่ยน status ของ session ระหว่าง Held↔Scheduled↔Completed (P13-06 confirm, P13-08, P13-10, P13-12) ต้องเรียกตัวเดียวกันก่อน** · (3) `btree_gist`: เป็น trusted extension (PG13+) — **ยืนยันแล้วบน PG 18.6 ด้วย role ที่เป็น owner ของ database และไม่ใช่ superuser** (`superuser=false;trusted=true;installed=1`); production เป็น PG17 + `siriupskill_app` เป็น database owner ⇒ ควรทำงานเหมือนกัน แต่**ยืนยันซ้ำตอน apply จริง** · `Down` ไม่ดรอป extension (ตารางอื่นอาจใช้) · (4) `REMINDER_24H_SENT_AT_UTC`/`REMINDER_15M_SENT_AT_UTC`: convention `ToSnakeCaseUpper` แยก "ตัวเลขตามด้วยตัวพิมพ์ใหญ่" จึงต้องกำหนด `HasColumnName("reminder_24h_sent_at_utc")` เป็นตัวพิมพ์เล็กให้ convention ยก uppercase เอง — ใครเพิ่มคอลัมน์ที่มีตัวเลขกลางชื่อ (P13-11) ให้ใช้วิธีเดียวกันและมีเทสต์ตรวจชื่อ · (5) ค่า default (`STATUS`, `ESCROW_STATE`, `REFUNDED_AMOUNT`=0, `SEATS_TAKEN`) อยู่ที่ entity ไม่ใช่ DB default · (6) ชื่อ identifier ยาวสุด `UQ_TUTOR_BOOKINGS_SESSION_LEARNER`/`IX_TUTOR_SESSIONS_ACTIVE_STARTS` (≤63 ไบต์ — `DatabaseIdentifierLengthTests` เขียว) · (7) SQL ดิบที่ทำ atomic เพียงสี่ตัว (`ExecuteClaimSeat/ReleaseSeat/Schedule/Revive`) หมุน `ROW_VERSION` + ตั้ง `UPDATED_AT_UTC` เองเพราะข้าม interceptor

### สร้างจริงแล้ว — P13-06 · migration `AddTutoringPayments` (2026-10-15, ต่อจาก `AddTutorBookingCore`) · schema `TUTORING` · การจ่ายเงินค่าจองติวเตอร์
> 1 ตารางใหม่ + 1 FK + 1 index บนตารางเดิม · **FK `NoAction` เส้นเดียว (`TUTOR_BOOKINGS.PAYMENT_ID → PAYMENTS`)** — `OWNER_USER_ID`/`REF_ID` เป็นแค่คอลัมน์ (ข้าม schema / polymorphic Booking|Package) · ไม่มี DELETE บน `PAYMENTS` (ปิดด้วย `STATUS` / `ApplyRefundTotals`) · ไม่มี audit 4 คอลัมน์ (เหมือน `COMMERCE.PAYMENTS`: มี timestamp ของตัวเอง) · migration: `CreateTable` ×1 + `CreateIndex` ×6 + `AddForeignKey` ×1 · `Down` ดรอป FK ก่อน `DropTable` · **ยังไม่ apply DB จริง**
```
TUTORING.PAYMENTS(PAYMENT_ID PK[PK_PAYMENTS], OWNER_USER_ID uuid [ไม่มี FK; Guid.Empty เฉพาะ PaymentIntent ที่ไม่ตรงอะไรเลย], KIND varchar(16) [Booking|Package], REF_ID uuid [booking id หรือ package purchase id — ไม่มี FK],
                  ATTEMPT_NO int, METHOD varchar(16) [PromptPay|Card], PROVIDER varchar(16) ['Stripe'], PROVIDER_PAYMENT_INTENT_ID varchar(255), AMOUNT numeric(18,2) [ราคาจาก booking ฝั่ง server ตั้งครั้งเดียว],
                  CURRENCY varchar(3) ['THB'], STATUS varchar(24) [Pending|Succeeded|Failed|Expired|PartiallyRefunded|Refunded],
                  REFUND_RESERVED_AMOUNT numeric(18,2) default 0, REFUNDED_AMOUNT numeric(18,2) default 0 [เขียนผ่าน PAYMENT.ApplyRefundTotals เท่านั้น],
                  STRIPE_FEE_AMOUNT? numeric(18,2), STRIPE_FEE_IS_ESTIMATE bool default false, STRIPE_FEE_CHECKED_AT_UTC?, SUCCEEDED_AT_UTC?, FAILED_AT_UTC?, FAILURE_REASON? varchar(300),
                  LATE_RESOLUTION? varchar(16) [Reopened|Refunded|Duplicate|Orphan — NULL = จ่ายในเวลาตามปกติ], CREATED_AT_UTC timestamptz(3), UPDATED_AT_UTC?, ROW_VERSION bytea [ConcurrencyTokenInterceptor])
                  UX_PAYMENTS_PROVIDER_INTENT(PROVIDER_PAYMENT_INTENT_ID) UNIQUE · UX_PAYMENTS_REF_ATTEMPT(KIND, REF_ID, ATTEMPT_NO) UNIQUE [คำขอสร้างซ้ำพร้อมกันชนกันที่นี่]
                  IX_PAYMENTS_OWNER(OWNER_USER_ID, CREATED_AT_UTC DESC) · IX_PAYMENTS_PENDING(CREATED_AT_UTC) WHERE STATUS='Pending' [job tutoring-payment-reconcile]
                  IX_PAYMENTS_FEE_ESTIMATE(SUCCEEDED_AT_UTC) WHERE STRIPE_FEE_IS_ESTIMATE AND STATUS IN ('Succeeded','PartiallyRefunded') [แก้ค่าธรรมเนียมประมาณการเป็นของจริง]
                  CHECK: CK_PAYMENTS_AMOUNT_POSITIVE (AMOUNT>0) · CK_PAYMENTS_REFUND_BOUNDS (0<=REFUNDED<=RESERVED<=AMOUNT) · CK_PAYMENTS_ATTEMPT_POSITIVE (ATTEMPT_NO>=1)
                         CK_PAYMENTS_SUCCEEDED_STAMP (STATUS NOT IN ('Succeeded','PartiallyRefunded','Refunded') OR SUCCEEDED_AT_UTC IS NOT NULL) · CK_PAYMENTS_FEE_NONNEGATIVE (STRIPE_FEE_AMOUNT IS NULL OR >=0)
TUTORING.TUTOR_BOOKINGS (+) FK_TUTOR_BOOKINGS_PAYMENTS_PAYMENT_ID(PAYMENT_ID → PAYMENTS) NoAction · IX_TUTOR_BOOKINGS_PAYMENT(PAYMENT_ID) WHERE PAYMENT_ID IS NOT NULL
```
> **หมายเหตุ:** (1) CHECK ที่ "ต้องมีค่า" เขียน `IS NOT NULL` ชัดเจน (`SUCCEEDED_STAMP`) เพราะ CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL — `TutoringPaymentSchemaIntegrationTests` พิสูจน์ด้วย raw SQL ว่าปฏิเสธ NULL, และพิสูจน์ว่า `FEE_NONNEGATIVE` ยอมรับ NULL ตามเจตนา (ค่าธรรมเนียมยังไม่ทราบ) · (2) `PAYMENT` ใน `Siri.Modules.Tutoring.Domain` ชื่อเดียวกับ `Siri.Modules.Commerce.Domain.PAYMENT` โดยตั้งใจ (ตาม contract) — คนละ namespace/schema/ตาราง; ห้าม `using` ทั้งสองพร้อมกันโดยไม่ใช้ alias · (3) `PROVIDER_PAYMENT_INTENT_ID` UNIQUE + กฎ "ทุก PaymentIntent ของโมดูลนี้มี metadata `kind=tutoring_booking`" คือสิ่งที่ผูก webhook กับแถว · (4) การจ่ายที่มาถึงช้า/ซ้ำ/ผิดยอด บันทึกเป็น `STATUS=Succeeded` + `LATE_RESOLUTION` เสมอ (เงินเข้าแล้วต้องมีแถว) แล้วสร้าง refund ใน transaction เดียวกัน · (5) ชื่อ identifier ยาวสุด `FK_TUTOR_BOOKINGS_PAYMENTS_PAYMENT_ID` (37 ไบต์) · (6) migration เป็น additive ล้วน: ไม่มี `Drop*` ใน `Up`, ไม่มีคอลัมน์ shadow, `HasFilter` เขียนแบบ PostgreSQL

### สร้างจริงแล้ว — P13-08 · migration `AddTutoringRefundsAndPenalties` (2026-10-15, ต่อจาก `AddTutoringEscrowToPayout`) · schema `TUTORING` · คืนเงิน + โทษความน่าเชื่อถือของติวเตอร์
> 2 ตารางใหม่ + 1 คอลัมน์/1 index/1 CHECK บนตารางเดิม · **FK `NoAction` ทุกเส้น ไม่มี cascade** (`REFUNDS → PAYMENTS`, `REFUNDS → TUTOR_BOOKINGS`, `TUTOR_PENALTY_EVENTS → TUTOR_PROFILES`, `→ TUTOR_SESSIONS`) · `REFUNDS.PACKAGE_PURCHASE_ID` ไม่มี FK (P13-12 เพิ่มเอง) และ `TUTOR_PENALTY_EVENTS.BOOKING_ID` ไม่ใช่ FK (เป็นแค่ตัวอ้างอิงว่า booking ไหนเป็นต้นเหตุ) · **ไม่มี DELETE บนทั้งสองตาราง** (`REFUNDS` ปิดด้วย `STATUS`; โทษที่ยกเลิกใช้การประทับ `VOIDED_*` แถวยังอยู่) · ไม่มี audit 4 คอลัมน์ (มี timestamp ของตัวเอง เหมือน `PAYMENTS`) · migration: `AddColumn` ×1 + `CreateTable` ×2 + `CreateIndex` ×10 + `AddCheckConstraint` ×1 · `Down` **ปฏิเสธ (`RAISE EXCEPTION`) ถ้ามีแถวใน `REFUNDS` หรือ `TUTOR_PENALTY_EVENTS`** (เงินและประวัติความประพฤติไม่ถูกลบจากการ rollback) · **ยังไม่ apply DB จริง**
```
TUTORING.REFUNDS(REFUND_ID PK[PK_REFUNDS], PAYMENT_ID FK→PAYMENTS NoAction[FK_REFUNDS_PAYMENTS_PAYMENT_ID], BOOKING_ID? FK→TUTOR_BOOKINGS NoAction[FK_REFUNDS_TUTOR_BOOKINGS_BOOKING_ID] [null = คืนทั้งก้อนของ payment: จ่ายช้า/ซ้ำ/ผิดยอด],
                 PACKAGE_PURCHASE_ID? FK→PACKAGE_PURCHASES NoAction[FK_REFUNDS_PACKAGE_PURCHASES — เพิ่มโดย P13-12 `AddTutorPackages`], AMOUNT numeric(18,2), REASON varchar(24) [LearnerCancelEarly|LearnerCancelLate|TutorCancel|TutorNoShow|NoClassHeld|DisputeResolved|AdminManual|LatePayment|DuplicatePayment|AmountMismatch|PackageExpired],
                 STATUS varchar(16) [Requested|Processing|Completed|Failed|Voided], IDEMPOTENCY_KEY varchar(120), ATTEMPT_NO int default 1, LEDGER_SEQ int default 0 [ลำดับที่ใช้ทำ entry key adj:{REFUND_ID:N}:{seq} ของ ledger],
                 PROVIDER_REFUND_ID? varchar(255), PROVIDER_STATUS? varchar(24), PROVIDER_STATUS_AT_UTC? timestamptz(3) [รั้วเวลาของผู้ให้บริการ: รายงานที่เก่ากว่าถูกทิ้ง], FAILURE_CODE? varchar(64), LAST_ERROR? varchar(120),
                 IS_ASYNC bool default false [PromptPay], REQUIRES_MANUAL_REVIEW bool default false, FIRST_ATTEMPT_AT_UTC? / NEXT_ATTEMPT_AT_UTC? / LEASE_UNTIL_UTC? / LAST_CHECKED_AT_UTC? timestamptz(3),
                 REQUESTED_BY_USER_ID? / DECIDED_BY_USER_ID? uuid [ไม่มี FK], DECISION_NOTE? varchar(500), REQUESTED_AT_UTC timestamptz(3), COMPLETED_AT_UTC? / FAILED_AT_UTC? timestamptz(3), ROW_VERSION bytea [concurrency token])
                 UX_REFUNDS_IDEMPOTENCY_KEY(IDEMPOTENCY_KEY) UNIQUE [คำขอเดียวกัน = แถวเดิม; รีไทรโดยแอดมินเปลี่ยนเป็น ...:a2, :a3] · UX_REFUNDS_PROVIDER_REFUND(PROVIDER_REFUND_ID) UNIQUE WHERE PROVIDER_REFUND_ID IS NOT NULL
                 IX_REFUNDS_DUE(NEXT_ATTEMPT_AT_UTC) WHERE STATUS='Requested' [job tutoring-refund-process] · IX_REFUNDS_PROCESSING(LAST_CHECKED_AT_UTC) WHERE STATUS='Processing' [job tutoring-refund-reconcile]
                 IX_REFUNDS_PAYMENT(PAYMENT_ID) · IX_REFUNDS_BOOKING(BOOKING_ID) WHERE BOOKING_ID IS NOT NULL · IX_REFUNDS_REVIEW(REQUESTED_AT_UTC) WHERE REQUIRES_MANUAL_REVIEW [คิวแอดมิน]
                 CHECK: CK_REFUNDS_AMOUNT_POSITIVE (AMOUNT>0) · CK_REFUNDS_ATTEMPT_POSITIVE (ATTEMPT_NO>=1) · CK_REFUNDS_LEDGER_SEQ (LEDGER_SEQ>=0) · CK_REFUNDS_STATUS (ห้าม STATUS นอก 5 ค่า)
                        CK_REFUNDS_COMPLETED_HAS_PROVIDER_ID (STATUS<>'Completed' OR PROVIDER_REFUND_ID IS NOT NULL) · CK_REFUNDS_REQUESTED_HAS_DUE_TIME (STATUS<>'Requested' OR NEXT_ATTEMPT_AT_UTC IS NOT NULL)
TUTORING.TUTOR_PENALTY_EVENTS(PENALTY_EVENT_ID PK[PK_TUTOR_PENALTY_EVENTS], TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_PENALTY_EVENTS_TUTOR_PROFILES_TUTOR_ID], SESSION_ID FK→TUTOR_SESSIONS NoAction[FK_TUTOR_PENALTY_EVENTS_TUTOR_SESSIONS_SESSION_ID],
                 BOOKING_ID? [ไม่ใช่ FK], KIND varchar(16) [NoShow|LateCancel], POINTS int, REASON_CODE varchar(40), CREATED_AT_UTC timestamptz(3), VOIDED_AT_UTC? timestamptz(3), VOIDED_BY_USER_ID? uuid, VOID_NOTE? varchar(500))
                 UX_PENALTY_SESSION_KIND(SESSION_ID, KIND) UNIQUE [คลาสหนึ่งโดนหักได้อย่างละครั้ง: กลุ่ม 6 คน = 1 โทษ; ยกเลิกซ้ำ/รายงานซ้ำไม่หักซ้ำ] · IX_PENALTY_TUTOR_CREATED(TUTOR_ID, CREATED_AT_UTC DESC)
                 CHECK: CK_PENALTY_POINTS_POSITIVE (POINTS>=1) · CK_PENALTY_KIND · CK_PENALTY_VOID_STAMP ((VOIDED_AT_UTC IS NULL AND VOIDED_BY_USER_ID IS NULL) OR (ทั้งสอง IS NOT NULL))
TUTORING.TUTOR_BOOKINGS (+) ESCROW_RELEASE_AT_UTC? timestamptz(3) [เวลาที่เงินส่วนของติวเตอร์จ่ายได้ = max(จบคลาส, เวลาตัดสิน)+DisputeWindowHours — decision D-A]
                 IX_TUTOR_BOOKINGS_ESCROW_DUE(ESCROW_RELEASE_AT_UTC) WHERE ESCROW_STATE='Held' AND ESCROW_RELEASE_AT_UTC IS NOT NULL [job tutoring-refund-reconcile ข้อ 3]
                 CK_TUTOR_BOOKINGS_ESCROW_RELEASE (ESCROW_RELEASE_AT_UTC IS NULL OR ESCROW_STATE IN ('Held','Released'))
```
> **หมายเหตุ:** (1) **ค่าจริงของ `TUTOR_BOOKINGS.ESCROW_STATE`** คือ `None|Held|Released|Reversed|Frozen` (บรรทัด `TUTOR_BOOKINGS` ของ P13-05 ด้านบนเขียน `Refunded|Disputed` ไว้ตอนร่าง — ไม่ตรงโค้ดจริงตั้งแต่ P13-07) · `Held` คงอยู่ตลอดช่วงรอ แล้ว job ตั้ง `Released` เมื่อถึง `ESCROW_RELEASE_AT_UTC` (เฉพาะ STATUS ∈ Completed|NoShowLearner|CancelledByLearner — booking ที่ยัง `Disputed` ไม่ถูกแตะจนกว่า P13-14 จะตั้ง status) · (2) **ยอดรวมไม่เคยบวก/ลบทีละก้อน:** `PAYMENTS.REFUND_RESERVED_AMOUNT/REFUNDED_AMOUNT` และ `TUTOR_BOOKINGS.REFUNDED_AMOUNT` คำนวณใหม่จากแถว `REFUNDS` ทุกครั้ง (`Requested+Processing+Completed` นับ; `Failed`/`Voided` ไม่นับ) ภายใต้ lock ของ payment · (3) **Lock order:** `calendar(advisory) → session → booking(id ASC) → package purchase → payment → refund → ledger → tutor profile` — มี integration test ต่อ flow (ถือ lock booking จาก connection ที่สองแล้วพิสูจน์ว่า flow ไม่ถือ payment ระหว่างรอ) · (4) **ไม่เรียกผู้ให้บริการภายใน transaction/lock:** claim (`UPDATE` เดียว หมุน `ROW_VERSION` เอง) → commit → เรียก Stripe → transaction สั้น ๆ บันทึกผล · selector ทั้งสาม (`SelectDueIds`/`SelectProcessingToPoll`/`SelectProcessingTooOld`) และ SQL ปล่อยเงิน (`MarkEscrowReleased`) ใช้ `FOR UPDATE SKIP LOCKED` ไม่รอแถวที่คนอื่นถืออยู่ · (5) `NEXT_ATTEMPT_AT_UTC` ของแถว `Requested` ห้ามเป็น NULL (CHECK) เพราะ job เลือกด้วยค่านี้ · (6) migration เป็น additive ล้วน: ไม่มี `Drop*`/`AlterColumn` ใน `Up`, ไม่มีคอลัมน์ shadow (ตรวจแล้วทุกคอลัมน์ตรงกับ entity), `HasFilter` เขียนแบบ PostgreSQL · (7) ชื่อ identifier ยาวสุด `FK_TUTOR_PENALTY_EVENTS_TUTOR_SESSIONS_SESSION_ID` (≤63 ไบต์ — `DatabaseIdentifierLengthTests` เขียว) · (8) `REFUND` ใน `Siri.Modules.Tutoring.Domain` ชื่อเดียวกับ `Siri.Modules.Commerce.Domain.REFUND` โดยตั้งใจ (คนละ schema/ตาราง) — ห้าม `using` ทั้งสองพร้อมกันโดยไม่ใช้ alias

### สร้างจริงแล้ว — P13-10 · migrations `AddTutoringSessionAttendance` + `AddTutoringSessionContent` (2026-10-15, ต่อจาก `AddLiveAdhocMeetings`) · schema `TUTORING` · วันเรียน: ด่าน join, หลักฐานการเข้าเรียน, การตัดสินผล, สรุปบทเรียน, เอกสารของคลาส
> 4 ตารางใหม่ + 2 คอลัมน์ · **additive ล้วน** (ไม่มี `Drop*`/`AlterColumn`/`Sql` ใน `Up`, ไม่มีคอลัมน์ shadow, ทุก FK `NoAction`, ไม่มี FK ข้าม schema/โมดูล — `USER_ID`/`AUTHOR_USER_ID`/`UPLOADED_BY_USER_ID`/`AUTH_SESSION_ID` เป็นแค่ `uuid`) · `HasFilter` เขียนแบบ PostgreSQL · **ยังไม่ apply DB จริง** · ลำดับ: `AddTutoringSessionAttendance` (2 คอลัมน์ + 2 ตาราง) แล้ว `AddTutoringSessionContent` (2 ตาราง)
```
TUTORING.TUTOR_SESSIONS (+) TUTOR_NUDGE_SENT_AT_UTC? timestamptz(3)   [ระบบเตือนติวเตอร์ 'กดเริ่มคลาส' ไปแล้ว — ตั้งครั้งเดียว]
TUTORING.TUTOR_BOOKINGS (+) TUTOR_PRESENT_ATTESTED_AT_UTC? timestamptz(3)   [ผู้เรียนของ booking นี้ยืนยันว่า 'ติวเตอร์อยู่ในห้อง' — นับเป็นหลักฐานของ booking นี้เท่านั้น]

TUTORING.SESSION_JOIN_LOGS(SESSION_JOIN_LOG_ID PK[PK_TUTORING_SESSION_JOIN_LOGS], SESSION_ID FK→TUTOR_SESSIONS NoAction[FK_TUTORING_JOIN_LOGS_SESSION],
                 BOOKING_ID? FK→TUTOR_BOOKINGS NoAction[FK_TUTORING_JOIN_LOGS_BOOKING], USER_ID uuid, ROLE varchar(16) [Tutor|Learner], AUTH_SESSION_ID? uuid [claim sid ของ access token — forensics],
                 JOINED_AT_UTC timestamptz(3), IP_ADDRESS? varchar(64), USER_AGENT? varchar(300))        -- append-only: ไม่มี audit stamp / soft delete / UPDATE / DELETE ในโค้ด
                 IX_TUTORING_JOIN_LOGS_SESSION_USER(SESSION_ID, USER_ID) · IX_SESSION_JOIN_LOGS_BOOKING_ID(BOOKING_ID) [ชื่อที่ EF ตั้งให้ FK]
                 CK_TUTORING_JOIN_LOGS_ROLE: (ROLE='Learner' AND BOOKING_ID IS NOT NULL) OR (ROLE='Tutor' AND BOOKING_ID IS NULL)
TUTORING.SESSION_ATTENDANCE_DECISIONS(SESSION_ATTENDANCE_DECISION_ID PK[PK_SESSION_ATTENDANCE_DECISIONS], SESSION_ID FK NoAction[FK_ATTENDANCE_DECISIONS_SESSION], BOOKING_ID FK NoAction[FK_ATTENDANCE_DECISIONS_BOOKING],
                 OUTCOME varchar(16) [Completed|NoShowLearner|NoShowTutor|NoShowBoth], DECIDED_AT_UTC timestamptz(3), DECIDED_BY varchar(16) [System|TutorComplete|LearnerConfirm],
                 TUTOR_EVIDENCE varchar(20) [None|PlatformJoin|TutorCompleted|LearnerAttested], TUTOR_EVIDENCE_AT_UTC?, LEARNER_EVIDENCE varchar(16) [None|PlatformJoin|Confirmed], LEARNER_EVIDENCE_AT_UTC?,
                 SESSION_STARTS_AT_UTC, SESSION_ENDS_AT_UTC [snapshot ตอนตัดสิน], RULES_VERSION smallint)        -- append-only: 'ตัดสินหนึ่งครั้งต่อ booking' เป็นข้อเท็จจริงของ DB
                 IX_ATTENDANCE_DECISIONS_BOOKING(BOOKING_ID) UNIQUE · IX_ATTENDANCE_DECISIONS_SESSION(SESSION_ID)
                 CK_ATTENDANCE_DECISIONS_VALUES (OUTCOME/DECIDED_BY/TUTOR_EVIDENCE/LEARNER_EVIDENCE ∈ ค่าข้างบน AND RULES_VERSION >= 1)
                 CK_ATTENDANCE_DECISIONS_EVIDENCE (หลักฐาน 'None' ⇒ เวลา IS NULL; หลักฐานอื่น ⇒ เวลา IS NOT NULL — ทั้งสองฝั่ง)
                 CK_ATTENDANCE_DECISIONS_TIMES (SESSION_ENDS_AT_UTC > SESSION_STARTS_AT_UTC)
TUTORING.SESSION_SUMMARIES(SESSION_SUMMARY_ID PK[PK_SESSION_SUMMARIES], SESSION_ID FK NoAction[FK_SESSION_SUMMARIES_SESSION], BOOKING_ID FK NoAction[FK_SESSION_SUMMARIES_BOOKING],
                 AUTHOR_USER_ID uuid, TOPICS_COVERED varchar(2000), FEEDBACK? varchar(2000), HOMEWORK? varchar(2000), NEXT_STEPS? varchar(2000),
                 NOTIFIED_AT_UTC? [แจ้งผู้เรียนครั้งแรกเท่านั้น], + IAuditable ×4 [CREATED_AT_UTC/CREATED_BY/UPDATED_AT_UTC/UPDATED_BY; property PascalCase ใน C#])        -- 1 แถวต่อ booking (กลุ่ม: FEEDBACK เป็นของใครของมัน)
                 IX_SESSION_SUMMARIES_BOOKING(BOOKING_ID) UNIQUE · IX_SESSION_SUMMARIES_SESSION(SESSION_ID)
                 CK_SESSION_SUMMARIES_TOPICS: char_length(btrim("TOPICS_COVERED")) > 0   [btrim ตัดเฉพาะ space — tab/ขึ้นบรรทัดถูก trim ที่โค้ดก่อนเข้า DB]
TUTORING.SESSION_MATERIALS(SESSION_MATERIAL_ID PK[PK_SESSION_MATERIALS], SESSION_ID FK NoAction[FK_SESSION_MATERIALS_SESSION], UPLOADED_BY_USER_ID uuid, KIND varchar(16) [Link|Homework|File],
                 TITLE varchar(200), URL? varchar(500), BODY_TEXT? varchar(4000), STORAGE_KEY? varchar(500), FILE_NAME? varchar(255), CONTENT_TYPE? varchar(100), SIZE_BYTES? bigint,
                 ADDED_AT_UTC timestamptz(3), REMOVED_AT_UTC? timestamptz(3))        -- ลบ = ตั้ง REMOVED_AT_UTC (แถวอยู่ต่อ); ไฟล์ใน object storage ลบแบบ best-effort
                 IX_SESSION_MATERIALS_SESSION(SESSION_ID, ADDED_AT_UTC) WHERE "REMOVED_AT_UTC" IS NULL
                 CK_SESSION_MATERIALS_KIND: (KIND='File' AND STORAGE_KEY/FILE_NAME/CONTENT_TYPE/SIZE_BYTES IS NOT NULL AND SIZE_BYTES > 0) OR (KIND='Link' AND URL IS NOT NULL AND STORAGE_KEY IS NULL)
                                            OR (KIND='Homework' AND (BODY_TEXT IS NOT NULL OR URL IS NOT NULL) AND STORAGE_KEY IS NULL)
```
> **หมายเหตุ:** (1) **ทุก `CHECK` เขียน `IS [NOT] NULL` ชัดเจน** เพราะ CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL — `TutoringSessionContentIntegrationTests` โจมตีทีละ clause ด้วย raw SQL (ชนิดผิด/หลักฐานไม่มีเวลา/เวลาไม่มีหลักฐาน/ไฟล์ขาดฟิลด์/ลิงก์ที่มี storage key ฯลฯ) และยืนยันว่า FK ทั้ง 7 เส้นเป็น `NoAction` จาก `pg_constraint` · (2) **หลักฐานการเข้าเรียนเป็นข้อมูลที่เงินและโทษพึ่ง** จึงไม่มีที่ไหนใน codebase `UPDATE`/`DELETE` สองตาราง log (`SESSION_JOIN_LOGS`, `SESSION_ATTENDANCE_DECISIONS`) และ session/booking ที่ถูกอ้างอยู่ลบไม่ได้ (FK `NoAction`) · (3) `SESSION_JOIN_LOGS.IP_ADDRESS/USER_AGENT` เป็นข้อมูลส่วนบุคคล — เห็นได้เฉพาะแอดมิน (`GET /admin/sessions/{id}/attendance` ซึ่งบันทึก audit `tutoring.admin.attendance_viewed` ทุกครั้งที่เปิดดู); นโยบายล้างตามอายุ (`JoinLogPiiMonths`) เป็นของ P13-17 · (4) `STORAGE_KEY` ไม่เคยออก API/log/อีเมล — คีย์ที่เซิร์ฟเวอร์สร้างเอง `tutoring-materials/sessions/{sessionId:N}/{guid:N}{ext}` ไม่มีชื่อไฟล์ของผู้ใช้ · (5) ชื่อ identifier ยาวสุด `FK_ATTENDANCE_DECISIONS_BOOKING`/`IX_TUTORING_JOIN_LOGS_SESSION_USER` (≤63 ไบต์ — `DatabaseIdentifierLengthTests` + `SessionSchemaTests` เขียว) · (6) migration อ่านครบแล้วตามกฎ: `Up` ของ `AddTutoringSessionAttendance` = `AddColumn` ×2 + `CreateTable` ×2 + `CreateIndex` ×4; `AddTutoringSessionContent` = `CreateTable` ×2 + `CreateIndex` ×3; `Down` = `DropTable`/`DropColumn` ย้อนกลับตรงข้าม

> schema `TUTORING` (module ใหม่, UPPERCASE) — ตารางทั้งหมดและ state machine อยู่ที่ `docs/TUTORING.md` §2: `TUTOR_PROFILES`, `TUTOR_OFFERINGS`, `SUBJECTS`, `TUTOR_EDUCATIONS`, `TUTOR_CERTIFICATES`, `TUTOR_KYC_CASES`, `TUTOR_DOCUMENTS`, `TUTOR_DOCUMENT_ACCESS_LOGS`, `TUTOR_AVAILABILITY_RULES`, `TUTOR_AVAILABILITY_EXCEPTIONS`, `LEARNER_PROFILES`, `TUTOR_SESSIONS`, `TUTOR_BOOKINGS`, `TUTOR_PACKAGES`, `PACKAGE_PURCHASES`, `SESSION_JOIN_LOGS`, `SESSION_MATERIALS`, `SESSION_SUMMARIES`, `PAYMENTS`, `REFUNDS`, `DISPUTES`, `DISPUTE_MESSAGES`, `TUTOR_REVIEWS`, `TUTOR_PENALTY_EVENTS`, `SEARCH_LOGS`
> **ข้อกำหนดพิเศษที่ต้องระวังตอนทำ migration:**
> - `TUTOR_SESSIONS` มี **exclusion constraint** (`CREATE EXTENSION btree_gist` + `EXCLUDE USING gist (TUTOR_ID WITH =, tstzrange(STARTS_AT_UTC, BLOCK_ENDS_AT_UTC) WITH &&) WHERE STATUS IN ('Held','Scheduled','Completed')`) — EF Core/Npgsql 10.0.3 ไม่มี fluent API ⇒ เขียนเป็น raw SQL ใน migration (เหมือน `pg_trgm`) · สร้างจริงแล้วใน P13-05 (`AddTutorBookingCore`) · role ของแอป (owner ไม่ใช่ superuser) สร้าง extension นี้ได้ — ยืนยันบน PG 18.6 แล้ว (btree_gist เป็น trusted extension บน PG13+), **ยืนยันซ้ำบน instance production (PG17) ตอน apply จริง** · `DatabaseIdentifierLengthTests` ต้องเขียว
> - partial unique: trial ครั้งเดียวต่อ `(TUTOR_ID, LEARNER_PROFILE_ID)` · `PROVIDER_PAYMENT_INTENT_ID` UQ · `REFUNDS.IDEMPOTENCY_KEY` UQ · `TUTOR_REVIEWS.BOOKING_ID` UQ · `BOOKING_NO` UQ
> - index ค้นหา: GIN trigram บน `TUTOR_PROFILES` (ชื่อ/headline) · `TUTOR_OFFERINGS(SUBJECT_ID, LEVEL, CURRICULUM)` · `TUTOR_AVAILABILITY_RULES(TUTOR_ID, DAY_OF_WEEK)` · `TUTOR_BOOKINGS(LEARNER_USER_ID, STATUS)`
> - denormalized (`RATING_*`, `COMPLETED_SESSIONS_COUNT`, `RELIABILITY_SCORE`, `NEXT_AVAILABLE_AT_UTC`, `SEATS_TAKEN`) เขียนผ่าน updater/SQL atomic ตัวเดียวเท่านั้น
> - **ฝั่ง Payout (แก้ตารางเดิม, additive):** `REVENUE_SPLITS` + `SOURCE_TYPE` (backfill `'Course'`), `SOURCE_REF_ID`, `AVAILABLE_AT_UTC` · `PERIOD_KEY` รองรับ `YYYY-Www` · ไม่มี FK ข้าม schema (`INSTRUCTOR_PROFILE_ID`, `USER_ID`, `MEDIA_ASSET_ID` เป็นแค่คอลัมน์ ตามเหตุผลเดียวกับ `Course.TrailerMediaAssetId`)
> - **ฝั่ง Live (ตารางใหม่, additive) — สร้างจริงแล้วใน P13-09 (`AddLiveAdhocMeetings`, ยังไม่ apply; แบบเต็มอยู่ในส่วน P11–P12 ด้านบน):** `LIVE.ADHOC_MEETINGS` + `LIVE.ADHOC_MEETING_PARTICIPANTS`
> - ห้าม cascade/hard delete บน `TUTOR_BOOKINGS`/`PAYMENTS`/`REFUNDS`/ledger · KYC `TUTOR_DOCUMENTS` ไม่ลบแถว (เก็บ `PURGED_AT_UTC` แล้วลบเฉพาะไฟล์)

### สร้างจริงแล้ว — P13-11 · migration `AddTutoringReminderColumns` (2026-10-15, ต่อจาก `AddTutoringSessionContent`) · schema `TUTORING` · เตือนก่อนเริ่มคลาส (ผู้เรียน + ติวเตอร์)
> **2 คอลัมน์ + 2 partial index เท่านั้น** · **additive ล้วน** (`Up` มีแค่ `AddColumn` ×2 + `CreateIndex` ×2 — ไม่มี `Drop*`/`AlterColumn`/`Sql`, ไม่มีคอลัมน์ shadow, ไม่แตะคอลัมน์/ดัชนีเดิมของ P13-05/10; `Down` ลบสี่อย่างนี้อย่างเดียว) · คอลัมน์เป็น `NULL` ไม่มี default ⇒ ไม่ rewrite ตาราง · **ยังไม่ apply DB จริง**
```
TUTORING.TUTOR_SESSIONS (+) TUTOR_REMINDER_24H_SENT_AT_UTC? timestamptz(3)   [เตือนช่อง 'ยาว' (Tutoring:Reminders:LeadHours, ค่าเริ่มต้น 24 ชม.) ถึง ติวเตอร์ แล้ว — ครั้งเดียวต่อคลาส]
TUTORING.TUTOR_SESSIONS (+) TUTOR_REMINDER_15M_SENT_AT_UTC? timestamptz(3)   [เตือนช่อง 'สั้น' (LeadMinutes, ค่าเริ่มต้น 15 นาที) ถึงติวเตอร์แล้ว]
       IX_TUTOR_SESSIONS_TUTOR_REMINDER_DUE(STARTS_AT_UTC) WHERE "STATUS" = 'Scheduled' AND ("TUTOR_REMINDER_24H_SENT_AT_UTC" IS NULL OR "TUTOR_REMINDER_15M_SENT_AT_UTC" IS NULL)
TUTORING.TUTOR_BOOKINGS (ไม่เพิ่มคอลัมน์ — REMINDER_24H_SENT_AT_UTC / REMINDER_15M_SENT_AT_UTC / CONFIRMED_AT_UTC เป็นของ P13-05 อยู่แล้ว)
       IX_TUTOR_BOOKINGS_REMINDER_DUE(SESSION_ID) WHERE "STATUS" = 'Confirmed' AND ("REMINDER_24H_SENT_AT_UTC" IS NULL OR "REMINDER_15M_SENT_AT_UTC" IS NULL)
```
> **หมายเหตุ:** (1) **ชื่อคอลัมน์ที่มีเลขตามด้วยตัวพิมพ์ใหญ่:** `ApplyUppercaseNamingConventions` แยก `24H` เป็น `24_H` ⇒ กำหนด `HasColumnName("tutor_reminder_24h_sent_at_utc")` ตัวพิมพ์เล็กให้ convention ยก uppercase เอง (เหมือน `REMINDER_24H_SENT_AT_UTC` ของ booking) — `ReminderSchemaTests` (unit) และ `TutoringReminderQueryIntegrationTests.TheTwoNewColumns_ExistUnderTheirRealNames_…` (อ่าน `information_schema` จริง) ตรึงชื่อไว้ · (2) **ดัชนีใหม่ต้องประกาศแบบมีชื่อ** `HasIndex(x => x.COL, "IX_…")` ไม่ใช่ `HasIndex(x => x.COL).HasDatabaseName("IX_…")`: ดัชนีสองตัวบนคอลัมน์คีย์เดียวกัน (`STARTS_AT_UTC` / `SESSION_ID`) ที่ไม่มีชื่อถูก EF รวมเป็นตัวเดียว — migration รอบแรกที่ generate จึง `DropIndex IX_TUTOR_SESSIONS_ACTIVE_STARTS` + `DropIndex IX_TUTOR_BOOKINGS_SESSION` ทิ้งเงียบ ๆ (จับได้เพราะอ่าน migration ทั้งไฟล์ก่อนใช้; `ReminderSchemaTests` มีเทสต์กันซ้ำ) · (3) **predicate ของ partial index ตรงกับ WHERE ของ query:** `TutoringReminderRepository` ใส่ conjunct `(…24H… IS NULL OR …15M… IS NULL)` ซ้ำในทุก query เพื่อให้ PostgreSQL พิสูจน์ได้ว่าใช้ index ได้ไม่ว่า config จะปิดช่องไหน — `TutoringReminderQueryIntegrationTests` เอา SQL จริงที่ EF ส่ง (จับจาก interceptor) ไป `EXPLAIN` โดยปิด seq scan และ drop ดัชนีอื่นของตารางนั้นใน transaction ที่ rollback เพื่อพิสูจน์ว่า partial index **ใช้ได้** (ไม่ใช่แค่ planner บังเอิญเลือก) · (4) **สถานะ flag:** ตั้งใน `SaveChanges` เดียวกับ outbox (`EMAIL_OUTBOX` + `NOTIFICATIONS`) ⇒ stamp ⇔ ข้อความ · ตั้งครั้งเดียว (`??=`) ผ่าน `TUTOR_BOOKING.MarkReminderSent` / `TUTOR_SESSION.MarkTutorReminderSent` เท่านั้น · `ResetReminders()` (ว่างไว้ให้ reschedule ในอนาคต — v1 ไม่มี) ล้างทั้งสองช่อง · `ROW_VERSION` หมุนตามปกติ (ผู้ซื้อ/ผู้ร่วม job สองตัวชนกันที่ token นี้) · (5) booking ที่จองใกล้กว่าหน้าต่างเตือน **ไม่ถูกประทับ flag** (ไม่อ้างว่าส่งทั้งที่ไม่ได้ส่ง) ⇒ แถวคงอยู่ใน partial index จนคลาสเริ่ม/booking ออกจาก `Confirmed` — จำนวนแถวที่ค้างจำกัดด้วยหน้าต่าง `STARTS_AT_UTC` ของ query ไม่ใช่ขนาด index · (6) identifier ยาวสุด `IX_TUTOR_SESSIONS_TUTOR_REMINDER_DUE` (36 ไบต์ — `DatabaseIdentifierLengthTests` เขียว)

### สร้างจริงแล้ว — P13-14 · migration `AddTutoringDisputes` (2026-10-15, ต่อจาก `AddTutoringReminderColumns`) · schema `TUTORING` · ข้อพิพาทของคลาสติวเตอร์
> **3 ตารางใหม่ ไม่แตะตารางเดิมเลย** (ไม่มี `AddColumn`/`AlterColumn`/`Drop*` ใน `Up`; `Up` = `CreateTable`×3 + `CreateIndex`×16; ไม่มีคอลัมน์ shadow) · **FK `NoAction` ทั้ง 7 เส้น ไม่มี cascade** · **ไม่มี DELETE ในโค้ด** (เคสปิดด้วย `STATUS`; erasure ของ P13-17 ใช้ `REDACTED_AT_UTC`) · `Down` **ปฏิเสธ (`RAISE EXCEPTION`) ถ้ามีแถวใน `DISPUTES`** (บันทึกคำตัดสินเรื่องเงินของบุคคลที่สามไม่ถูกลบจากการ rollback — กฎเดียวกับ `REFUNDS`) · **ยังไม่ apply DB จริง**
```
TUTORING.DISPUTES(DISPUTE_ID PK[PK_DISPUTES], DISPUTE_NO varchar(24) [DS-{yyMMdd}-{6 hex} — เลขที่ผู้ใช้/แอดมินอ้างถึง] UQ[UQ_DISPUTES_NO],
                 BOOKING_ID FK→TUTOR_BOOKINGS NoAction[FK_DISPUTES_TUTOR_BOOKINGS_BOOKING_ID], SESSION_ID FK→TUTOR_SESSIONS NoAction[FK_DISPUTES_TUTOR_SESSIONS_SESSION_ID], TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_DISPUTES_TUTOR_PROFILES_TUTOR_ID],
                 LEARNER_USER_ID uuid [ไม่มี FK — identity อยู่ schema อื่น], OPENED_BY_USER_ID uuid, OPENED_BY_ROLE varchar(8) [Learner|Tutor],
                 CATEGORY varchar(16) [NoClass|TutorConnection|Behavior|NotAsDescribed|Other], FLOW varchar(16) [Escrow|AttendanceAppeal],
                 BOOKING_STATUS_AT_OPEN varchar(16) [Completed|NoShowLearner|NoShowTutor|NoShowBoth — สถานะที่ booking กลับไปเมื่อเคสจบ], DESCRIPTION varchar(2000),
                 STATUS varchar(12) [Open|UnderReview|Resolved|Rejected|Withdrawn], PRIORITY varchar(8) [Normal|High — 'High' เรียงก่อนแบบ ASC], ESCROW_FREEZE varchar(16) [Frozen|TooLate|NotApplicable],
                 AMOUNT_AT_STAKE numeric(18,2), REPEAT_COMPLAINT_FLAG bool default false, REPEAT_COMPLAINT_COUNT int default 0, SLA_DUE_AT_UTC / LAST_ACTIVITY_AT_UTC timestamptz(3), LAST_MESSAGE_ROLE? varchar(8),
                 AGING_ALERT_LEVEL smallint default 0 [0-4 — ระดับที่ job tutoring-dispute-aging รายงานแล้ว], ASSIGNED_TO_USER_ID? / ASSIGNED_AT_UTC? [แอดมินที่รับเคส],
                 RESOLUTION? varchar(14) [FullRefund|PartialRefund|NoRefund], REFUND_AMOUNT? numeric(18,2), REFUND_ID? FK→REFUNDS NoAction[FK_DISPUTES_REFUNDS_REFUND_ID],
                 ATTENDANCE_OVERTURNED / PENALTY_VOIDED / COMPENSATION_REQUIRED bool default false, COMPENSATION_SETTLED_AT_UTC? [ปิด follow-up],
                 DECIDED_BY_USER_ID? / DECIDED_AT_UTC? / DECISION_NOTE? varchar(1000), WITHDRAWN_AT_UTC?, CLIENT_REQUEST_ID uuid [กดซ้ำ = เคสเดิม], OPENED_AT_UTC timestamptz(3), REDACTED_AT_UTC? [P13-17], ROW_VERSION bytea [concurrency token])
                 UQ_DISPUTES_BOOKING_ACTIVE(BOOKING_ID) UNIQUE WHERE STATUS <> 'Withdrawn' [เคสที่นับได้ต่อ booking = 1 · เคสที่ถอนแล้วกี่เคสก็ได้ (เพดานอยู่ที่ MaxWithdrawnPerBooking ในแอป)]
                 UQ_DISPUTES_CLIENT_REQUEST(OPENED_BY_USER_ID, CLIENT_REQUEST_ID) UNIQUE · UQ_DISPUTES_NO(DISPUTE_NO) UNIQUE
                 IX_DISPUTES_QUEUE(PRIORITY, SLA_DUE_AT_UTC, DISPUTE_ID) WHERE STATUS IN ('Open','UnderReview') [คิวแอดมิน: High ก่อน แล้วเป้า SLA ใกล้สุด — เรียง ASC โดยตั้งใจ (contract เขียน DESC แต่ 'High' < 'Normal' ในลำดับตัวอักษร)]
                 IX_DISPUTES_AGING(OPENED_AT_UTC) WHERE STATUS IN ('Open','UnderReview') [job tutoring-dispute-aging] · IX_DISPUTES_FOLLOWUP(DECIDED_AT_UTC) WHERE COMPENSATION_REQUIRED = true AND COMPENSATION_SETTLED_AT_UTC IS NULL
                 IX_DISPUTES_BOOKING(BOOKING_ID) · IX_DISPUTES_TUTOR(TUTOR_ID, OPENED_AT_UTC DESC) · IX_DISPUTES_LEARNER(LEARNER_USER_ID, OPENED_AT_UTC DESC) · IX_DISPUTES_OPENED_BY(OPENED_BY_USER_ID, STATUS) [เพดานเปิดพร้อมกัน] · IX_DISPUTES_SESSION_ID · IX_DISPUTES_REFUND_ID [index ของ FK]
                 CHECK: CK_DISPUTES_ENUMS (ค่าของ 7 คอลัมน์ enum) · CK_DISPUTES_FLOW_ROLE (AttendanceAppeal เปิดโดย Tutor เท่านั้น) · CK_DISPUTES_DECIDED (Resolved/Rejected ต้องมี DECIDED_AT/BY, RESOLUTION, DECISION_NOTE) · CK_DISPUTES_WITHDRAWN (Withdrawn ต้องมี WITHDRAWN_AT_UTC)
                        CK_DISPUTES_REFUND_SHAPE (Full/Partial ต้องมี REFUND_AMOUNT>0, อย่างอื่นห้ามมี) · CK_DISPUTES_RESOLUTION · CK_DISPUTES_APPEAL_NO_MONEY (AttendanceAppeal ไม่มี refund/REFUND_ID) · CK_DISPUTES_AMOUNTS (AMOUNT_AT_STAKE>=0, REPEAT_COMPLAINT_COUNT>=0) · CK_DISPUTES_AGING (0..4)
TUTORING.DISPUTE_MESSAGES(MESSAGE_ID PK[PK_DISPUTE_MESSAGES], DISPUTE_ID FK→DISPUTES NoAction[FK_DISPUTE_MESSAGES_DISPUTES_DISPUTE_ID], AUTHOR_USER_ID? [NULL = บรรทัดของระบบ], AUTHOR_ROLE varchar(8) [Learner|Tutor|Admin|System],
                 KIND varchar(8) [Message|System], VISIBILITY varchar(8) [Parties|Internal], BODY varchar(2000) [System = โค้ดสั้น opened|claimed|decided|withdrawn|escrow_too_late], CLIENT_MESSAGE_ID? uuid, CREATED_AT_UTC timestamptz(3), REDACTED_AT_UTC?)
                 UQ_DISPUTE_MESSAGES_CLIENT(DISPUTE_ID, CLIENT_MESSAGE_ID) UNIQUE WHERE CLIENT_MESSAGE_ID IS NOT NULL · IX_DISPUTE_MESSAGES_DISPUTE(DISPUTE_ID, CREATED_AT_UTC, MESSAGE_ID)
                 CHECK: CK_DISPUTE_MESSAGES_ROLE (ค่า enum) · CK_DISPUTE_MESSAGES_SYSTEM ((AUTHOR_ROLE='System') = (AUTHOR_USER_ID IS NULL) = (KIND='System')) · CK_DISPUTE_MESSAGES_INTERNAL (บันทึกภายใน = AUTHOR_ROLE 'Admin' เท่านั้น — **แม้เขียนตรงลงตาราง**)
TUTORING.DISPUTE_EVIDENCE_LINKS(EVIDENCE_ID PK[PK_DISPUTE_EVIDENCE_LINKS], DISPUTE_ID FK→DISPUTES NoAction, MESSAGE_ID? FK→DISPUTE_MESSAGES NoAction [NULL = ลิงก์ของเคส ไม่ใช่ของข้อความ], ADDED_BY_USER_ID, ADDED_BY_ROLE varchar(8) [Learner|Tutor|Admin],
                 URL? varchar(500) [https เท่านั้น; NULL หลัง redact], LABEL? varchar(120), ADDED_AT_UTC timestamptz(3), REDACTED_AT_UTC?) · IX_DISPUTE_EVIDENCE_DISPUTE(DISPUTE_ID, ADDED_AT_UTC) · IX_DISPUTE_EVIDENCE_LINKS_MESSAGE_ID
                 CHECK: CK_DISPUTE_EVIDENCE_URL (REDACTED_AT_UTC IS NOT NULL หรือ URL LIKE 'https://%') · CK_DISPUTE_EVIDENCE_ROLE
```
> **หมายเหตุ:** (1) **ลำดับ lock (รวมกับ P13-README §7.2):** `ปฏิทินติวเตอร์(advisory) → TUTOR_SESSIONS → TUTOR_BOOKINGS → DISPUTES → (TUTOR_REVIEWS) → PACKAGE_PURCHASES → PAYMENTS → REFUNDS → ledger(PAYOUT.REVENUE_SPLITS) → TUTOR_PROFILES` — เปิด/ตัดสิน/ถอนเรียกครบ; การโพสต์ข้อความและ claim ล็อกเฉพาะแถว `DISPUTES` (ไม่แตะเงิน) · มี integration test ต่อ flow (connection ที่สองถือ session/booking แล้วพิสูจน์ว่า flow ไม่ถือแถวที่อยู่หลังมันระหว่างรอ) · (2) **สถานะที่ booking ถูกตั้งโดยเคส:** เปิด ⇒ `TUTOR_BOOKINGS.STATUS='Disputed'` (+ `ESCROW_STATE='Frozen'` ถ้า escrow flow และ freeze สำเร็จ); จบ/ถอน ⇒ `TUTOR_BOOKING.ResolveDispute(BOOKING_STATUS_AT_OPEN)` กลับเป็นข้อเท็จจริงเดิม · (3) **ไม่มี FK ไป identity** (`LEARNER_USER_ID`/`OPENED_BY_USER_ID`/`ASSIGNED_TO_USER_ID`/`DECIDED_BY_USER_ID`/`AUTHOR_USER_ID`/`ADDED_BY_USER_ID`) — ตามเหตุผลเดิมของโมดูล (แยก schema) · (4) CHECK ที่ "ต้องมีค่า" เขียน `IS [NOT] NULL` ชัด เพราะ CHECK ของ PostgreSQL ผ่านเมื่อนิพจน์เป็น NULL — `TutoringDisputeSchemaIntegrationTests` ยิง raw SQL ปฏิเสธครบทุกกิ่ง · (5) ชื่อ identifier ยาวสุด `FK_DISPUTE_EVIDENCE_LINKS_DISPUTE_MESSAGES_MESSAGE_ID` (≤63 ไบต์ — `DatabaseIdentifierLengthTests` เขียว) · (6) `IX_DISPUTES_QUEUE` เรียง `PRIORITY` แบบ ASC (ต่างจากสเก็ตช์ใน contract §2 ที่เขียน DESC): ค่าเก็บเป็นข้อความ `High`/`Normal` ซึ่ง `'High' < 'Normal'` — เรียง ASC จึงได้ High ก่อนตรงตามความต้องการ และ query ใน `DisputeRepository.ListAdminAsync` เรียงตามนี้ · (7) job `tutoring-dispute-aging` เขียน `AGING_ALERT_LEVEL` ด้วย `UPDATE` เดียวที่ไม่หมุน `ROW_VERSION` (แอดมินบันทึกไม่ชนกับ job) และเป็นผู้เขียนคอลัมน์นี้คนเดียว

### สร้างจริงแล้ว — P13-12 · migration `AddTutorPackages` (2026-10-15, ต่อจาก `AddTutoringDisputes`) · schema `TUTORING` · แพ็กเกจติวเตอร์ (เครดิตล่วงหน้า)
> **3 ตารางใหม่ + FK 2 เส้น/index 2 ตัวบนตารางเดิม** (`TUTOR_BOOKINGS.PACKAGE_PURCHASE_ID`, `REFUNDS.PACKAGE_PURCHASE_ID` — คอลัมน์มีอยู่แล้ว เพิ่มแค่ FK) · `Up` = `CreateTable`×3 + `CreateIndex`×14 + `AddForeignKey`×2 — **ไม่มี `Drop*`/`AlterColumn`/`AddColumn`/`Cascade`/`SetNull`** · **FK `NoAction` ทุกเส้น (11)** · **ไม่มี DELETE ในโค้ด** (แพ็กเกจปิดด้วย `IS_ACTIVE`, purchase ปิดด้วย `STATUS`, เครดิตไม่ลบ) · migration ที่ generate อ่านครบทั้งไฟล์ + diff snapshot = additive ล้วน ไม่มีคอลัมน์ shadow · **ยังไม่ apply DB จริง**
```
TUTORING.TUTOR_PACKAGES(PACKAGE_ID PK[PK_TUTOR_PACKAGES], TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_TUTOR_PACKAGES_TUTOR], OFFERING_ID FK→TUTOR_OFFERINGS NoAction[FK_TUTOR_PACKAGES_OFFERING],
                 SESSION_COUNT int, DURATION_MINUTES int, DISCOUNT_PERCENT numeric(5,2), VALID_DAYS int, IS_ACTIVE bool, ROW_VERSION bytea [ConcurrencyTokenInterceptor], + audit 4 คอลัมน์)
                 [แพ็กเกจ **ไม่มีราคาเก็บ** — ราคาคิดสดจากอัตรา offering ที่ server ทุกครั้ง; ซื้อแล้ว snapshot ที่ PACKAGE_PURCHASES]
                 CHECK CK_TUTOR_PACKAGES_RANGES (SESSION_COUNT>=2, DISCOUNT 0..90, VALID_DAYS>=1, DURATION>0 — ขอบแข็ง; ขอบจริง 2–30/≤50%/7–365 อยู่ใน options+validator)
                 UQ_TUTOR_PACKAGES_ACTIVE_SHAPE(OFFERING_ID, SESSION_COUNT, DURATION_MINUTES) UNIQUE WHERE IS_ACTIVE = true [รูปเดียวกันขายซ้อนไม่ได้ — ปิดขายแล้วซ้ำกี่แถวก็ได้]
                 IX_TUTOR_PACKAGES_TUTOR_ACTIVE(TUTOR_ID, IS_ACTIVE) · IX_TUTOR_PACKAGES_OFFERING(OFFERING_ID)
TUTORING.PACKAGE_PURCHASES(PACKAGE_PURCHASE_ID PK[PK_PACKAGE_PURCHASES], LEARNER_USER_ID uuid [ไม่มี FK — ข้าม schema], LEARNER_PROFILE_ID FK→LEARNER_PROFILES NoAction[FK_PACKAGE_PURCHASES_LEARNER],
                 PACKAGE_ID FK→TUTOR_PACKAGES NoAction[FK_PACKAGE_PURCHASES_PACKAGE], TUTOR_ID FK→TUTOR_PROFILES NoAction[FK_PACKAGE_PURCHASES_TUTOR], OFFERING_ID FK→TUTOR_OFFERINGS NoAction[FK_PACKAGE_PURCHASES_OFFERING],
                 DURATION_MINUTES int, SESSIONS_TOTAL int, VALID_DAYS int, DISCOUNT_PERCENT_SNAPSHOT numeric(5,2), PRICE_SNAPSHOT numeric(18,2) [ยอดที่ส่งให้ Stripe — ตายตัวตั้งแต่ตอนกดซื้อ],
                 TUTOR_SHARE_PERCENT? numeric(5,2) [100 − commission ณ วัน activate — ใช้กับทุกครั้งของแพ็กเกจนี้], SESSIONS_USED int [= จำนวนเครดิตที่ไม่ใช่ Available เสมอ],
                 STATUS varchar(16) [PendingPayment|Active|Exhausted|Expired|Cancelled], PAYMENT_ID? FK→PAYMENTS NoAction[FK_PACKAGE_PURCHASES_PAYMENT], PENDING_EXPIRES_AT_UTC?, ACTIVATED_AT_UTC?, EXPIRES_AT_UTC?,
                 EXPIRY_REMINDER_SENT_AT_UTC? [ส่งเตือนครั้งเดียว], EXPIRY_BLOCKED_AT_UTC? [job พบว่าหมดอายุแต่ติวเตอร์ไม่ Verified — เงินรอแอดมิน], ROW_VERSION bytea, + audit 4 คอลัมน์)
                 CHECK CK_PACKAGE_PURCHASES_USAGE (0<=SESSIONS_USED<=SESSIONS_TOTAL) · _ACTIVE (Active/Exhausted/Expired ต้อง EXPIRES_AT/PAYMENT_ID/TUTOR_SHARE IS NOT NULL) · _PENDING (PendingPayment ต้องมี PENDING_EXPIRES_AT)
                 CK_PACKAGE_PURCHASES_SHARE (NULL หรือ 0<x<=100 — เขียนกิ่ง NULL ชัด) · _AMOUNTS (PRICE>0, SESSIONS_TOTAL>=2, VALID_DAYS>=1, DURATION>0, DISCOUNT 0..90)
                 CK_PACKAGE_PURCHASES_EXHAUSTED (Exhausted ⇒ USED=TOTAL) · _ACTIVE_FREE (Active ⇒ USED<TOTAL)
                 UQ_PACKAGE_PURCHASES_PAYMENT(PAYMENT_ID) UNIQUE WHERE PAYMENT_ID IS NOT NULL [หนึ่งการจ่ายซื้อได้หนึ่ง purchase]
                 IX_PACKAGE_PURCHASES_PENDING_EXPIRY(PENDING_EXPIRES_AT_UTC) WHERE STATUS = 'PendingPayment' · IX_PACKAGE_PURCHASES_ACTIVE_EXPIRY(EXPIRES_AT_UTC) WHERE STATUS = 'Active' [job tutoring-package-expiry]
                 IX_PACKAGE_PURCHASES_LEARNER_STATUS(LEARNER_USER_ID, STATUS) · _TUTOR(TUTOR_ID) · _PROFILE(LEARNER_PROFILE_ID) · _PACKAGE(PACKAGE_ID) · _OFFERING(OFFERING_ID) [index ของ FK]
TUTORING.TUTOR_PACKAGE_CREDITS(CREDIT_ID PK[PK_TUTOR_PACKAGE_CREDITS], PACKAGE_PURCHASE_ID FK→PACKAGE_PURCHASES NoAction[FK_PACKAGE_CREDITS_PURCHASE], SEQ_NO int [1..N], GROSS_AMOUNT numeric(18,2) [slice ของราคา — Σ = PRICE_SNAPSHOT ถึงสตางค์ เศษอยู่ที่เครดิตแรก ๆ],
                 STATUS varchar(12) [Available|Reserved|Consumed|Expired|Refunded], BOOKING_ID? FK→TUTOR_BOOKINGS NoAction[FK_PACKAGE_CREDITS_BOOKING], RESERVED_AT_UTC?, CONSUMED_AT_UTC?, SETTLED_AT_UTC? [Expired|Refunded โดยไม่มีคลาส], ROW_VERSION bytea)
                 [ไม่มี audit 4 คอลัมน์ — ชีวิตของแถวอยู่ในคอลัมน์เวลาของตัวเอง; ไม่มีแถว REVENUE_SPLITS จนกว่าเครดิตจะถูกใช้ (ledger ของการจอง) หรือหมดอายุ (ledger ของ CREDIT_ID)]
                 CHECK CK_PACKAGE_CREDITS_BOOKING_STATE (Available/Expired ⇒ BOOKING_ID IS NULL; Reserved/Consumed ⇒ IS NOT NULL) · _EXPIRED_SETTLED (Expired ⇒ SETTLED_AT IS NOT NULL) · _GROSS (>=0) · _SEQ (>=1)
                 UQ_PACKAGE_CREDITS_PURCHASE_SEQ(PACKAGE_PURCHASE_ID, SEQ_NO) UNIQUE · UQ_PACKAGE_CREDITS_BOOKING(BOOKING_ID) UNIQUE WHERE BOOKING_ID IS NOT NULL [เครดิตเดียวต่อคลาส] · IX_PACKAGE_CREDITS_PURCHASE_STATUS(PACKAGE_PURCHASE_ID, STATUS, SEQ_NO)
FK ใหม่บนตารางเดิม: FK_TUTOR_BOOKINGS_PACKAGE_PURCHASES(TUTOR_BOOKINGS.PACKAGE_PURCHASE_ID → PACKAGE_PURCHASES NoAction) + IX_TUTOR_BOOKINGS_PACKAGE_PURCHASE · FK_REFUNDS_PACKAGE_PURCHASES(REFUNDS.PACKAGE_PURCHASE_ID → PACKAGE_PURCHASES NoAction) + IX_REFUNDS_PACKAGE_PURCHASE
```
> **หมายเหตุ:** (1) **`SESSIONS_USED == จำนวนเครดิตที่ไม่ใช่ Available`** เป็น invariant ที่ CHECK ตารางเดียวเขียนไม่ได้ (ต้องดูอีกตาราง) — ครอบด้วย CHECK ย่อย (USAGE/EXHAUSTED/ACTIVE_FREE) + โค้ดที่เขียนตัวนับได้ที่เดียว (`PACKAGE_PURCHASE` และ SQL ใน `PackageCreditRepository` — มี source-scan test บังคับ) + integration test ทุกเคสเรียก `AssertPackageInvariantsAsync` (นับเครดิต, Σ slice = ราคา, เงินที่จ่าย = refund ที่นับ + ledger ที่เก็บ + เครดิตที่ยังไม่ใช้ ถึงสตางค์) · (2) **ลำดับ lock:** `ปฏิทินติวเตอร์(advisory) → TUTOR_SESSIONS → TUTOR_BOOKINGS → PACKAGE_PURCHASES → TUTOR_PACKAGE_CREDITS(SEQ_NO ASC) → PAYMENTS → REFUNDS → ledger → TUTOR_PROFILES` — ทุกเส้น (webhook ยืนยันจ่าย, ยกเลิก, จองด้วยเครดิต, expiry job, fee reviser, admin refund-unused/settle-expired, สร้าง payment, ยกเลิกคลาสที่ใช้เครดิต) มี integration test ถือ purchase จาก connection ที่สองแล้วพิสูจน์ว่า flow ไม่ถือ payment ระหว่างรอ · (3) SQL ดิบ 4 ชุด (gate จอง/เลือกเครดิต/ผูกเครดิต/restore) ตัวนับและ `ROW_VERSION` หมุนเอง เพราะข้าม interceptor — ทดสอบบน PostgreSQL จริง · (4) ชื่อ identifier ยาวสุด `IX_TUTOR_BOOKINGS_PACKAGE_PURCHASE`/`FK_TUTOR_BOOKINGS_PACKAGE_PURCHASES` (≤63 ไบต์ — `DatabaseIdentifierLengthTests` เขียว) · (5) `Down` **ปฏิเสธ (`RAISE EXCEPTION`) ถ้ามีแถวใน `PACKAGE_PURCHASES`** (สิทธิ์ที่จ่ายแล้วและเครดิตที่ยังไม่ได้ใช้ไม่ถูกลบจากการ rollback — กฎเดียวกับ `REFUNDS`/`DISPUTES`) · ถ้าว่าง: ดรอป FK 2 เส้นบนตารางเดิม → `DropTable` ×3 (credits → purchases → packages) → ดรอป index 2 ตัวบนตารางเดิม

### สร้างจริงแล้ว — P13-17 · migration `AddTutoringPdpa` (2026-10-19, ต่อจาก `AddTutorPackages`) · schema `TUTORING` · PDPA: export / erasure / ถอนความยินยอม / retention
> **ไม่มีตารางใหม่** — 3 คอลัมน์ (nullable ทั้งหมด ไม่มี default) + 6 partial index บนตารางเดิม · **ไม่มี FK ใหม่ ไม่มี CHECK ใหม่** · ชื่อ identifier ยาวสุด `IX_TUTOR_DOCUMENTS_HASH_SCRUB` (29 ไบต์) · migration: `AddColumn` ×3 + `CreateIndex` ×6 (อ่านทั้งไฟล์ + Designer + snapshot diff แล้ว: ไม่มี `Drop*`/`Alter*`/`Rename*`/`Sql` ใน `Up`, ไม่มี shadow column) · `Down` **ปฏิเสธ (`RAISE EXCEPTION 'Cannot roll back AddTutoringPdpa…'`) ถ้ามีแถวที่ถูก anonymise หรือถอน consent แล้ว** (คอลัมน์เหล่านี้คือหลักฐานเดียวว่าคนถูกลบแล้ว — ถ้าดรอป ติวเตอร์ที่ลบแล้วจะกลับมา Reinstate ได้) · **ยังไม่ apply DB จริง**
```
TUTORING.TUTOR_PROFILES   + ANONYMIZED_AT_UTC? timestamptz(3)      [ตั้งครั้งเดียวโดย TUTOR_PROFILE.AnonymizeForErasure — ตอนลบบัญชี]
                          + IX_TUTOR_PROFILES_ANONYMIZED(ANONYMIZED_AT_UTC) WHERE ANONYMIZED_AT_UTC IS NOT NULL   [ขั้น kyc_hash ของ retention: เอกสารของติวเตอร์ที่ลบแล้ว]
TUTORING.LEARNER_PROFILES + ANONYMIZED_AT_UTC? timestamptz(3)      [ลบบัญชี หรือผู้ปกครองถอน consent]
                          + GUARDIAN_CONSENT_WITHDRAWN_AT_UTC? timestamptz(3)   [เฉพาะถอน consent — GUARDIAN_CONSENT_AT_UTC/VERSION เดิม **คงไว้เป็นหลักฐานฐานทางกฎหมาย** CK_LEARNER_PROFILES_CONSENT ยังจริง]
TUTORING.SESSION_JOIN_LOGS          + IX_SESSION_JOIN_LOGS_PII(JOINED_AT_UTC) WHERE IP_ADDRESS IS NOT NULL OR USER_AGENT IS NOT NULL      [ขั้น join_log_pii]
TUTORING.TUTOR_DOCUMENT_ACCESS_LOGS + IX_TUTOR_DOC_ACCESS_LOGS_PII(ACCESSED_AT_UTC) WHERE IP_ADDRESS IS NOT NULL                          [ขั้น kyc_access_ip]
TUTORING.DISPUTES         + IX_DISPUTES_REDACT_DECIDED(DECIDED_AT_UTC)   WHERE REDACTED_AT_UTC IS NULL AND STATUS IN ('Resolved','Rejected')   [ขั้น dispute_text]
                          + IX_DISPUTES_REDACT_WITHDRAWN(WITHDRAWN_AT_UTC) WHERE REDACTED_AT_UTC IS NULL AND STATUS = 'Withdrawn'
TUTORING.TUTOR_DOCUMENTS  + IX_TUTOR_DOCUMENTS_HASH_SCRUB(PURGED_AT_UTC) WHERE PURGED_AT_UTC IS NOT NULL AND CONTENT_SHA256 <> '0000…0' (64 ตัว)   [ขั้น kyc_hash]
```
> **หมายเหตุ:** (1) **ดัชนีสองตัวบนคอลัมน์เดียวกัน (`DECIDED_AT_UTC`)** — EF ใช้ "รายการคอลัมน์" เป็นกุญแจของ index: ถ้าตั้งแค่ `.HasDatabaseName()` ตัวใหม่จะ **ยึดชื่อ/filter ของตัวเก่า** (migration รอบแรกที่ generate ออกมา `DropIndex IX_DISPUTES_FOLLOWUP` เงียบ ๆ — จับได้จากการอ่าน migration) จึงต้องตั้งชื่อใน model ด้วย (`HasIndex(d => d.DECIDED_AT_UTC, "IX_DISPUTES_REDACT_DECIDED")`) — มี unit test + integration test ตรวจว่า `IX_DISPUTES_FOLLOWUP` ยังอยู่และ `indexdef` ไม่เปลี่ยน · (2) **ไม่มีการ DELETE แถวเงิน/การจอง/refund/ledger/dispute/audit ที่ไหนในงานนี้** (source-scan test บังคับ) — สิ่งเดียวที่ลบจริงคือ 4 ตารางข้อมูลโปรไฟล์ของติวเตอร์ที่ลบบัญชี (`TUTOR_EDUCATIONS`/`TUTOR_CERTIFICATES`/`TUTOR_AVAILABILITY_RULES`/`TUTOR_AVAILABILITY_EXCEPTIONS` — ไม่มีตารางอื่นอ้างถึง); ที่เหลือเขียนทับข้อความเป็น `[ลบตามคำขอ PDPA]` / `NULL` / sentinel · (3) `DISPUTES.REDACTED_AT_UTC` หมายถึง **"ทั้งเคสถูกล้างแล้ว"** และเป็น filter ของ retention — การลบบัญชี/ถอน consent จึง **ไม่ประทับ** ที่ `DISPUTES` (ประทับเฉพาะ `DISPUTE_MESSAGES`/`DISPUTE_EVIDENCE_LINKS` ซึ่งเป็นของผู้เขียนคนเดียว) ไม่งั้นข้อความของฝ่ายอื่น/แอดมินในเคสเดียวกันจะไม่มีวันถูก retention ล้าง (ต่างจาก contract §5.3 ข้อ 2 ที่เขียนให้ประทับ — โค้ดชนะ) · (4) `CONTENT_SHA256` ที่ถูกล้างเป็น 64 ศูนย์ (`KycDocumentHash.ErasedSentinel`) — query "ไฟล์เดียวกันจากติวเตอร์อื่น" (`CountSameFileOnOtherTutorsAsync`, P13-02) ตัด sentinel ทิ้งทั้งจากคำถามและคำตอบ · (5) ขั้น retention ทั้ง 4 ใช้ sub-select + `ExecuteUpdate` ชุดละ ≤ `BatchSize` แถว เรียงจากเก่าสุด บน partial index ข้างบน — แถวที่ล้างแล้วหลุดจาก predicate จึงไม่ถูกแก้ซ้ำ · (6) `LEARNER_PROFILE.Anonymize` ปัด stamp ลงมิลลิวินาที (precision ของคอลัมน์) เพื่อให้เวลาที่ตอบครั้งแรกกับครั้งที่ขอซ้ำตรงกันเป๊ะ (เจอจริงจาก integration test) · เอกสารที่ลบแล้ว (`TUTOR_DOCUMENTS.PURGED_AT_UTC`) ยังเป็นแถวเดิม: คอลัมน์ `PURGE_AFTER_UTC` ตอนลบบัญชีถูก **ดึงให้เร็วขึ้นเท่านั้น** (ไม่ทับวันที่ที่เร็วกว่าอยู่แล้ว)

### สร้างจริงแล้ว — P13-15 · migration `AddTutoringAnalyticsIndexes` (2026-10-19, ต่อจาก `AddTutoringPdpa`) · Admin analytics ของ Tutor marketplace
> **ไม่มีตารางใหม่ ไม่มีคอลัมน์ใหม่ ไม่มี FK/CHECK ใหม่** — `Up` = `CreateIndex` ×8 ล้วน `Down` = `DropIndex` ×8 (rollback ปลอดภัย ไม่มีข้อมูลหาย) · ไม่มี unique index (index ของรายงานต้องไม่กลายเป็นกฎที่ปฏิเสธแถว) · ชื่อยาวสุด `IX_TUTOR_BOOKINGS_COMPLETED_LEARNER` (35 ไบต์ < 63) · อ่าน migration + Designer + diff snapshot แล้ว: 8 `CreateIndex` / 8 `DropIndex` เท่านั้น ไม่มี shadow column · ตรวจ apply/rollback/apply ซ้ำบนฐานที่ migration ก่อนหน้าทิ้งไว้ด้วย integration test (`TutoringAnalyticsMigrationIntegrationTests`) · **ยังไม่ apply ขึ้น DB จริง**
```
TUTORING.TUTOR_BOOKINGS   + IX_TUTOR_BOOKINGS_CREATED(CREATED_AT_UTC)                                    [funnel: การจองที่สร้างในช่วง — ไม่ใช่ partial]
                          + IX_TUTOR_BOOKINGS_COMPLETED_AT(COMPLETED_AT_UTC)
                                WHERE STATUS = 'Completed' AND COMPLETED_AT_UTC IS NOT NULL                [top tutors: การจองที่เรียนจบในช่วง; retention: เซ็ต Completed ของ first_completed]
                          + IX_TUTOR_BOOKINGS_COMPLETED_LEARNER(LEARNER_USER_ID, COMPLETED_AT_UTC)
                                WHERE STATUS = 'Completed' AND COMPLETED_AT_UTC IS NOT NULL                [retention: ตามสัญญาให้ป้อน DISTINCT ON ผู้เรียน — ดูหมายเหตุ (2)]
                          + IX_TUTOR_BOOKINGS_LEARNER_CONFIRMED(LEARNER_USER_ID, CONFIRMED_AT_UTC)
                                WHERE STATUS IN ('Confirmed','Completed') AND CONFIRMED_AT_UTC IS NOT NULL [retention: EXISTS "จองอีกครั้งภายใน 30/60 วัน" ต่อสมาชิก cohort]
TUTORING.PAYMENTS         + IX_PAYMENTS_SUCCEEDED_AT(SUCCEEDED_AT_UTC) WHERE SUCCEEDED_AT_UTC IS NOT NULL    [revenue: เงินเข้า]
TUTORING.REFUNDS          + IX_REFUNDS_COMPLETED_AT(COMPLETED_AT_UTC) WHERE STATUS = 'Completed' AND COMPLETED_AT_UTC IS NOT NULL   [revenue: เงินออก]
TUTORING.TUTOR_KYC_CASES  + IX_TUTOR_KYC_CASES_DECIDED(DECIDED_AT_UTC) WHERE DECIDED_AT_UTC IS NOT NULL      [kyc-aging: ตัดสินใน 30 วัน]
PAYOUT.REVENUE_SPLITS     + IX_REVENUE_SPLITS_TUTORING_CREATED(CREATED_AT_UTC) WHERE SOURCE_TYPE = 'Tutoring' AND STATUS <> 'Reversed'   [revenue: ledger ผ่าน ITutoringRevenueSeriesReader]
```
> **หมายเหตุ:** (1) **predicate ของ partial index ต้องถูกบอกเป็น literal ใน WHERE ของรายงาน** (`'Completed'`, `'Tutoring'`, `<> 'Reversed'`) ไม่ใช่ parameter — PostgreSQL ใช้ partial index ได้ก็ต่อเมื่อพิสูจน์ได้ว่า WHERE ของ query implies predicate ของ index ตอน plan; ทุก statement ใน `TutoringAnalyticsRepository` / `TutoringRevenueSeriesReader` เขียนแบบนั้นและมีเทสต์โครงสร้างบังคับ · ดัชนีสองตัวบนคอลัมน์เดียวกัน (`COMPLETED_AT_UTC` ทั้ง `_COMPLETED_AT` และ `_COMPLETED_LEARNER` นำด้วยคอลัมน์ต่างกัน) ประกาศด้วยชื่อ (`HasIndex(expr, name)`) กัน EF พับรวมเป็นตัวเดียว · ช่วงเวลาเขียนเป็น `interval '720 hours'` (ไม่ใช่ `'30 days'`) เพื่อไม่ขึ้นกับ time zone ของ session
> (2) **EXPLAIN ที่ 50,000 แถว (ฐานชั่วคราว, `TutoringAnalyticsExplainIntegrationTests`, statement จริงที่จับจาก repository):** revenue-payments → `IX_PAYMENTS_SUCCEEDED_AT` · revenue-refunds → `IX_REFUNDS_COMPLETED_AT` · revenue-ledger → `IX_REVENUE_SPLITS_TUTORING_CREATED` · funnel → `IX_TUTOR_BOOKINGS_CREATED` (EXISTS บน DISPUTES เป็น index-only scan `UQ_DISPUTES_BOOKING_ACTIVE`) · top-tutors ทั้ง 3 แบบ → `IX_TUTOR_BOOKINGS_COMPLETED_AT` · kyc-aging → `IX_TUTOR_KYC_CASES_DECIDED` · search ทั้ง 3 → `IX_SEARCH_LOGS_CREATED` (เดิมจาก P13-04) · ไม่มี Seq Scan บนตารางหลักหมื่นแถวในแผนที่ planner เลือกเองเลยสักรายงาน · **ข้อค้นพบ: `IX_TUTOR_BOOKINGS_COMPLETED_LEARNER` planner ไม่เลือก** — `first_completed` ของ retention มี `ORDER BY learner, completed_at, booking_id` (tie-break `BOOKING_ID` เพื่อให้ "การจองแรก" คงที่เมื่อเวลาเท่ากัน) ซึ่งดัชนีสองคอลัมน์ตามสัญญาให้ลำดับนี้ไม่ได้ planner จึงอ่านเซ็ต Completed ผ่าน `IX_TUTOR_BOOKINGS_COMPLETED_AT` แล้ว Sort (cost ≈ 3,060 ที่ 18k แถว Completed, ไม่ seq scan) · วัดแล้วว่าถ้าดัชนีนี้เป็น `(LEARNER_USER_ID, COMPLETED_AT_UTC, BOOKING_ID)` planner เลือก **index-only scan ไม่ต้อง Sort** (cost ≈ 910, ถูกลง ~3.4 เท่า) — **ไม่ได้ทำ** เพราะ contract ล็อกนิยามดัชนีไว้สองคอลัมน์; เป็น follow-up ที่เสนอให้ system-architect (หรือถ้าไม่ต้องการก็ drop ตัวนี้เพราะไม่ได้ถูกใช้) · รายงาน retention ถูก cache 900 วินาทีและอยู่หลัง concurrency gate จึงไม่เร่งด่วน

### สร้างจริงแล้ว — P13-13 · migration `AddTutorReviews` (2026-10-20, ต่อจาก `AddTutoringAnalyticsIndexes`) · schema `TUTORING` · รีวิวติวเตอร์
> **1 ตารางใหม่ ไม่แตะตารางเดิมเลย** (`Up` = `CreateTable`×1 + `CreateIndex`×4; ไม่มี `AddColumn`/`AlterColumn`/`Drop*`/`Rename*`/`Sql`; ไม่มีคอลัมน์ shadow — อ่านทั้งไฟล์ + Designer + diff snapshot แล้ว) · **FK `NoAction` ทั้ง 2 เส้น ไม่มี cascade** · **ไม่มี DELETE ในโค้ด** (ซ่อนด้วย `STATUS='Hidden'`, PDPA ล้างด้วย `REDACTED_AT_UTC`) · `Down` **ปฏิเสธ (`RAISE EXCEPTION 'Cannot roll back AddTutorReviews: review rows exist'`) ถ้ามีแถวใน `TUTOR_REVIEWS`** (คำพูดของคนและหลักฐานที่คะแนนติวเตอร์ยืนอยู่ ไม่ถูกลบจากการ rollback — กฎเดียวกับ `REFUNDS`/`DISPUTES`/`PACKAGE_PURCHASES`) · ชื่อ identifier ยาวสุด `FK_TUTOR_REVIEWS_TUTOR_BOOKINGS_BOOKING_ID` (42 ไบต์ < 63) · **ยังไม่ apply DB จริง**
```
TUTORING.TUTOR_REVIEWS(REVIEW_ID PK[PK_TUTOR_REVIEWS] uuid UUIDv7, TUTOR_ID FK→TUTOR_PROFILES NoAction, BOOKING_ID FK→TUTOR_BOOKINGS NoAction [UQ_TUTOR_REVIEWS_BOOKING — 1 รีวิวต่อ booking],
                 REVIEWER_USER_ID uuid [ไม่มี FK ข้ามโมดูล; เจ้าของ booking เสมอ], RATING smallint, COMMENT? varchar(1000) [plain text; ไม่ HTML-encode ที่ DB; NULL หลัง PDPA redact],
                 REVIEWER_KIND varchar(12) [Nickname|Guardian|Anonymous — snapshot ป้ายผู้รีวิวตอนเขียน], REVIEWER_NICKNAME? varchar(40) [เฉพาะ Nickname = ผู้ใหญ่], REVIEWER_GRADE_BAND? varchar(16) [เฉพาะ Guardian = Primary|Secondary|Vocational|Other],
                 STATUS varchar(10) DEFAULT 'Published' [Published|Hidden], HIDDEN_BY_USER_ID?, HIDDEN_AT_UTC? timestamptz(3), HIDE_REASON? varchar(500) [ภายในเท่านั้น — ไม่ออก API ฝั่งผู้รีวิว/สาธารณะ ไม่อยู่ใน audit/notice],
                 EDITED_AT_UTC?, REDACTED_AT_UTC? [เขียนโดย P13-17 เท่านั้น], ROW_VERSION bytea [concurrency token; หมุนโดย ConcurrencyTokenInterceptor], + audit 4 คอลัมน์ [PascalCase ใน C#])
  CHECK (ทุกตัวเขียน IS NOT NULL ชัดเจน): CK_TUTOR_REVIEWS_RATING(1..5) · CK_TUTOR_REVIEWS_STATUS(Published|Hidden) · CK_TUTOR_REVIEWS_KIND(Nickname|Guardian|Anonymous)
                 · CK_TUTOR_REVIEWS_HIDDEN(STATUS<>'Hidden' OR (HIDDEN_AT_UTC IS NOT NULL AND HIDE_REASON IS NOT NULL))
                 · CK_TUTOR_REVIEWS_REVIEWER_SHAPE((KIND='Nickname')=(NICKNAME IS NOT NULL) AND (KIND='Guardian')=(GRADE_BAND IS NOT NULL))
  INDEX: UQ_TUTOR_REVIEWS_BOOKING(BOOKING_ID) · IX_TUTOR_REVIEWS_TUTOR_PUBLISHED(TUTOR_ID, CREATED_AT_UTC DESC, REVIEW_ID DESC) WHERE STATUS='Published' [รายการสาธารณะ + aggregate + reconcile]
         · IX_TUTOR_REVIEWS_CREATED(CREATED_AT_UTC DESC, REVIEW_ID DESC) [รายการแอดมิน] · IX_TUTOR_REVIEWS_REVIEWER(REVIEWER_USER_ID) [PDPA export/erasure]
```
> **หมายเหตุ:** (1) **`TUTOR_PROFILES.RATING_AVERAGE/RATING_COUNT` มีผู้เขียนคนเดียว** = `TutorRatingService.RecomputeAsync` → `ITutorStatsWriter.SetRatingAsync` (source-scan test บังคับว่าไม่มีไฟล์อื่นเรียก) — ล็อกแถว profile `FOR UPDATE` → `COUNT(*)`/`SUM(RATING)` เป็นจำนวนเต็มใน SQL (statement ใหม่หลังได้ lock จึงเห็น commit ของคนที่ถือ lock ก่อน — ปิดช่อง X-20 ที่รีวิวคอร์สพลาด) → เฉลี่ยเป็น `decimal` (`Round(sum/count, 2, AwayFromZero)`) → เขียนเฉพาะเมื่อค่าต่างจากที่เก็บ · (2) **กติกานับเดียวกันทุกที่** (aggregate, รายการสาธารณะ, distribution, reconcile, flag `countsTowardRating` ของแอดมิน): `STATUS='Published' AND (b.PRICE_AMOUNT = 0 OR b.REFUNDED_AMOUNT < b.PRICE_AMOUNT)` อ่านจาก booking ตอน query — การคืนเงินเต็มจากเส้นทางใดก็ตาม (dispute, แอดมิน refund มือ) ทำให้รีวิวหายจากหน้าสาธารณะทันทีโดยไม่ต้องมีใครเรียก P13-13; ค่าที่เก็บบน profile ถูกแก้โดย dispute (ในธุรกรรมเดียวกัน) หรือ job `tutoring-review-reconcile` (รายวัน 04:30, ≤ `ReconcileBatchSize`/รอบ, หนึ่ง scope + หนึ่ง transaction ต่อติวเตอร์) · (3) **ลำดับ lock (รวมกับ P13-README §7.2):** `… → TUTOR_BOOKINGS → DISPUTES → TUTOR_REVIEWS → PACKAGE_PURCHASES → PAYMENTS → REFUNDS → ledger → TUTOR_PROFILES (สุดท้าย)` · **ข้อค้นพบจากการรันจริง (deadlock 40P01):** `INSERT` รีวิวมี FK ไป `TUTOR_PROFILES` ⇒ PostgreSQL ใส่ `FOR KEY SHARE` บนแถว profile ให้เอง ⇒ ถ้าเขียนรีวิวพร้อมกัน N คนแล้วค่อย `FOR UPDATE` ใน `RecomputeAsync` ทุกคนถือ KEY SHARE รอกันเอง (ทดสอบ 8 คนพร้อมกัน: 7 ใน 8 ได้ 409 หลัง retry ครบ) — แก้โดยเรียก `TutorRatingService.LockTutorAsync` (ขอ `FOR UPDATE` ก่อน) **ก่อน** `INSERT` ในเส้นทางสร้างรีวิว; การ UPDATE รีวิว (ซ่อน/เลิกซ่อน/แก้ไข/PDPA) ไม่แตะคอลัมน์ FK จึงไม่เกิด KEY SHARE · (4) **PostgreSQL 18 เก็บ `NOT NULL` เป็นแถวใน `pg_constraint` (`contype='n'`) แต่ 17 ไม่เก็บ** — เทสต์ migration เทียบ constraint ก่อน/หลังจึงตัด `contype<>'n'` ออก · (5) `IX_TUTOR_REVIEWS_CREATED` ที่ EF generate ออกมาเป็น `descending: new bool[0]` (อาร์เรย์ว่าง = ทุกคอลัมน์ DESC ใน Npgsql) — ตรวจจาก `pg_indexes.indexdef` แล้วได้ `("CREATED_AT_UTC" DESC, "REVIEW_ID" DESC)` ตามสัญญา · (6) `REVIEWER_USER_ID` ไม่มี FK (ตามเหตุผลเดิมของโมดูล) แต่ทุกการอ่านที่รับ id จากผู้ใช้ resolve booking พร้อม `LEARNER_USER_ID = caller` ใน WHERE เดียวกัน (ไม่ใช่ใช้ `REVIEWER_USER_ID` ตัดสินสิทธิ์) · (7) `PublicReviewerNames=AnonymousOnly` เป็น override ตอนอ่าน (ไม่ migrate แถว) และ builder ก็ใช้ค่านี้ตอนเขียนด้วย ⇒ แถวที่เขียนระหว่างสวิตช์เปิดเก็บเป็น `Anonymous` · (8) PDPA (P13-17): `RedactReviewsAsync`/`RedactReviewsForProfileAsync` ตั้ง `COMMENT=NULL` (ยกเว้น `ReviewCommentOnErasure=Keep` ตอนลบบัญชี), `REVIEWER_KIND='Anonymous'`, ล้าง nickname/band, `REDACTED_AT_UTC` — **ไม่แตะ `RATING`/`STATUS`/`BOOKING_ID`** (คะแนนไม่ drift); `ExecuteUpdate` เดียว ไม่หมุน `ROW_VERSION` ของผู้อื่น · ทดสอบ: `TutoringReviewSchemaIntegrationTests` (ยิง raw SQL ปฏิเสธทุกกิ่ง CHECK/UQ/FK) + `TutoringReviewMigrationIntegrationTests` (apply/rollback/apply ซ้ำ, Down ปฏิเสธเมื่อมีแถว, CHECK ยังกันเมื่อถอด NOT NULL ออก)

## Index ที่ต้องมีตั้งแต่วันแรก (จาก query pattern จริง)
```sql
IX_Courses_Browse         (Status, CategoryId, PublishedAtUtc DESC) INCLUDE (Title, Slug, Price, RatingAverage, ThumbnailUrl)
IX_Enrollments_MyCourses  (UserId, Status) INCLUDE (CourseId, ProgressPercent, LastAccessedAtUtc)
IX_EpisodeProgress_Resume (EnrollmentId) INCLUDE (EpisodeId, LastPositionSeconds, IsCompleted)
IX_Orders_UserHistory     (UserId, CreatedAtUtc DESC)
IX_RevenueSplits_Payout   (InstructorId, PeriodKey, Status)
IX_UserSessions_Active    (UserId) WHERE RevokedAtUtc IS NULL      -- filtered index
IX_Discussions_Episode    (EpisodeId, Status, CreatedAtUtc DESC)
```

## Denormalization ที่ตั้งใจทำ (ต้อง sync ผ่าน domain event เท่านั้น)
`Courses.EpisodeCount`, `TotalDurationSeconds`, `RatingAverage`, `RatingCount`, `EnrollmentCount`
→ ห้าม UPDATE ตรงจาก handler อื่น ให้ผ่าน `CourseStatsUpdater` ที่เดียว + มี job reconcile รายคืน
