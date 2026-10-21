# Contract: P13-17 PDPA hooks ของ Tutoring — export ข้อมูลของผู้ใช้, erasure แบบ anonymise (ไม่ลบแถวเงิน/การจอง), ถอนความยินยอมของผู้ปกครอง, retention jobs, และ hook กลาง `IPersonalDataParticipant` ที่ต่อเข้า `AnonymizeAccount`/`DataExport` ของ Identity โดย Identity ไม่ reference Tutoring

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE, schema `TUTORING`) + **`Siri.SharedKernel` (additive: `Contracts/IPersonalDataParticipant.cs`)** + **`Siri.Modules.Identity` (แก้เล็กน้อยแบบ additive 3 ไฟล์ — ⚠ cross-module ต้องให้เจ้าของโปรเจ็ครับทราบ §3.3)** · `Siri.Api` (controller 1 action) · `Siri.Workers` (job 1 ตัว) · migration `AddTutoringPdpa`

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..F)** (TASKS.md ตั้งเป็น CC อยู่แล้ว) — เหตุผล: ข้อมูลส่วนบุคคลของผู้เยาว์/เอกสาร KYC, แตะ `Contracts/` ข้ามโมดูลและโค้ดลบบัญชีของ Identity, การตัดสินว่าอะไร "ห้ามลบ" (เงิน/สิทธิ์) · **ไม่ต้องผ่าน DESIGN_DATABASE** (migration เล็ก: 3 คอลัมน์ + index) · ไม่มีบล็อก Antigravity

> **อ่านคู่กับ:** `docs/SECURITY.md` §4 (anonymize ไม่ใช่ hard delete; เอกสารการเงิน 5 ปี, audit 3 ปี, log 90 วัน) และ §6.1 · `docs/TUTORING.md` §7 · `DECISIONS.md` **Q14.3** (PDPA/ที่ปรึกษากฎหมาย) · **P13-02** (`KycPurgeService`, `TUTOR_DOCUMENTS.PURGE_AFTER_UTC`, access log) · **P13-04** (`SEARCH_LOGS` purge 90 วัน — อ้างอิง ไม่ทำซ้ำ) · **P13-05** (`LEARNER_PROFILES`, `ILearnerProfileUsageReader`) · **P13-07** (`IPayoutWalletReader`) · **P13-10** (`SESSION_JOIN_LOGS`, `Tutoring:Retention:JoinLogPiiMonths` — key นี้นิยามที่นี่) · **P13-13/14** (`REDACTED_AT_UTC`) · **P13-12** (`PACKAGE_PURCHASES`)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body 2026-10-14 — กลไกที่ Identity ใช้อยู่จริง)

| # | ข้อเท็จจริง | หลักฐาน | ผลต่อ contract |
|---|---|---|---|
| F1 | `AnonymizeAccountHandler` (vertical slice ของ Identity): ตรวจรหัสผ่าน → `user.Anonymize("anonymized_{id:N}@deleted.siriupskill.com", "Deleted USER", randomHash)` → revoke ทุก session/refresh token → ลบ `UserExternalLogins` → เพิ่ม `SECURITY_AUDIT` → **`SaveChangesAsync` ครั้งเดียว** (ไม่มี transaction ชัดเจน) → ลบ Redis session → ลบจาก search index · **ไม่มี hook ให้โมดูลอื่นเข้ามาร่วม** และไม่เช็คเงื่อนไขค้าง (ออเดอร์/คลาส/เงิน) เลย · id ผู้ใช้คงเดิม (แค่ PII ถูกแทนที่) | `Siri.Modules.Identity/Features/AnonymizeAccount/AnonymizeAccountHandler.cs:28-117` | ต้องมีจุดต่อกลาง (F5); ข้อมูลของ Tutoring อ้าง user ด้วย Guid ล้วน ๆ จึง **ไม่ถูกแตะ** โดย Identity — ต้องมี participant ของ Tutoring |
| F2 | `DataExportHandler` คืน `DataExportResponse(ExportedAtUtc, Profile, Sessions, SecurityAudits, ExternalLogins?)` — **ไม่มีส่วนของโมดูลอื่น** | `Features/DataExport/DataExportHandler.cs`, `DataExportResponse.cs` | เพิ่ม `Modules` ท้าย record (additive; ฟิลด์ JSON ใหม่ ไม่ทำ client เดิมพัง) |
| F3 | ทั้งสอง handler ถูกเรียกจาก `AuthController.DataExport/Anonymize` ผ่าน DI (D-19) และ integration test resolve ผ่าน DI (`GoogleLoginTests`) — **ไม่มีเทสต์ที่ `new` handler เอง** | `Siri.Api/Controllers/Identity/AuthController.cs:266-312`; `tests/Siri.IntegrationTests/GoogleLoginTests.cs:282` | เพิ่ม ctor parameter ท้ายแบบ optional ได้โดยไม่พังเทสต์ |
| F4 | `DataRetentionCleanupJob` (Identity) ครอบเฉพาะข้อมูล Identity (token / pending user / revoked session); `RecurringJobIds.PdpaDataRetentionCleanup` = 04:00 | `Siri.Modules.Identity/Infrastructure/DataRetentionCleanupJob.cs`; `Siri.Workers/RecurringJobIds.cs:14` | Tutoring มี retention job ของตัวเอง (`tutoring-retention` 05:00) — ไม่แก้ job ของ Identity |
| F5 | `Siri.SharedKernel/Contracts` มีแค่ `IMediaAssetContract`/`IMediaIngestContract`; ArchitectureTests ห้าม module อ้าง `*.Domain/*.Infrastructure` ของ module อื่น (อ้าง SharedKernel ได้) | `Siri.SharedKernel/Contracts/`; P13-01 F3 | hook ประกาศใน `SharedKernel.Contracts`; Tutoring ลงทะเบียน impl; Identity รับ `IEnumerable<>` ผ่าน DI — **Identity ไม่ reference Tutoring** |
| F6 | `AppDbContext` เดียวทั้งระบบ, ไม่มี `EnableRetryOnFailure` ⇒ เปิด transaction เองด้วย `Database.BeginTransactionAsync` ได้ตรง ๆ; `ExecuteUpdateAsync/ExecuteDeleteAsync` join transaction ที่เปิดอยู่ | P13-08 F8; `OrderRepository.ExecuteInTransactionAsync` | erasure ทั้งหมด atomic เดียวกับการ anonymise ผู้ใช้ |
| F7 | `TutorProfileStatsUpdater` ไม่หมุน `ROW_VERSION`; entity ที่ต้องหมุน token ต้องแก้ผ่าน tracking (`SaveChanges`) ไม่ใช่ `ExecuteUpdate` | `Infrastructure/TutorProfileStatsUpdater.cs` | `TUTOR_PROFILE.AnonymizeForErasure` ใช้ tracked entity; ตารางลูกใช้ `ExecuteUpdate/Delete` |
| F8 | ผู้ใช้ที่ถูก anonymise เปลี่ยนอีเมลเป็น `…@deleted.siriupskill.com` — **ค่าคงที่ฝังใน handler** ไม่มีสถานะให้ `IUserContactReader` ตอบ | `AnonymizeAccountHandler.cs:~65`; `Identity.Contracts/IUserContactReader.cs` | ประกาศค่าคงที่กลาง `AnonymizedAccount.EmailDomain` (§3.1) ให้ Tutoring ใช้ข้ามอีเมล (P13-14 §7.5) |

---

## 1. Scope & task IDs

**ใน:** `IPersonalDataParticipant` (+ records, `AnonymizedAccount`) ใน SharedKernel · การแก้ Identity 3 ไฟล์ (additive) · `TutoringPersonalDataParticipant` (check/export/erase/after-commit) · domain `TUTOR_PROFILE.AnonymizeForErasure` / `LEARNER_PROFILE.Anonymize` · endpoint ถอนความยินยอมของผู้ปกครอง (`POST learner-profiles/{id}/withdraw-consent`) · job `tutoring-retention` · config `Tutoring:Pdpa` + `Tutoring:Retention` · migration `AddTutoringPdpa` · เทสต์

**นอก (รายงานเป็นช่องว่าง ไม่แก้):** (1) Notification — แถว `EMAIL_OUTBOX_MESSAGES`/`NOTIFICATIONS` ที่มีอีเมล/ข้อความถึงผู้ใช้ (2) `LIVE.ADHOC_MEETING_PARTICIPANTS.DISPLAY_NAME` (ชื่อเล่นที่ใช้ใน ICS) และเหตุการณ์ในปฏิทิน Google ของติวเตอร์ (3) `CATALOG.INSTRUCTOR_PROFILES` (headline/bio/รูปของผู้สอน) และ `PAYOUT.INSTRUCTOR_PAYOUT_ACCOUNTS` (บัญชีธนาคารเข้ารหัส) (4) `MEDIA.MEDIA_ASSETS` ของวิดีโอแนะนำตัว (5) โมดูลเดิม (Commerce/Learning/Community) ที่ปัจจุบันไม่มีส่วนใน export/erasure เลย — **ทั้งหมดนี้ทำได้ทีละโมดูลโดยให้โมดูลนั้น implement `IPersonalDataParticipant` ของงานนี้** (ติดตามเป็น follow-up ใน TASKS.md; ไม่ทำใน P13-17)

---

## 2. หลักการ (ตัดสินใจแล้ว)

1. **ห้ามลบแถว** `PAYMENTS`, `REFUNDS`, `REVENUE_SPLITS`, `TUTOR_BOOKINGS`, `TUTOR_SESSIONS`, `PACKAGE_*`, `TUTOR_PENALTY_EVENTS`, `SESSION_ATTENDANCE_DECISIONS`, `DISPUTES` (ผลลัพธ์/ยอดเงิน), `SECURITY_AUDIT` — เก็บตามกฎหมายบัญชี/หลักฐาน (SECURITY.md §4: การเงิน 5 ปี, audit 3 ปี) ; anonymise **เฉพาะคอลัมน์ข้อความส่วนบุคคล** ในแถวเหล่านั้น
2. **ลบ (hard delete) ได้เฉพาะ** ข้อมูลที่ไม่ใช่เงิน/สิทธิ์/หลักฐาน และไม่มีตารางอื่นอ้างถึง: `TUTOR_EDUCATIONS`, `TUTOR_CERTIFICATES`, `TUTOR_AVAILABILITY_RULES`, `TUTOR_AVAILABILITY_EXCEPTIONS` ของติวเตอร์ที่ลบบัญชี
3. **ไฟล์ KYC และรูปโปรไฟล์ลบทันที** (ไฟล์ใน R2) ; แถวเมทาดาทา KYC คงอยู่เป็นหลักฐานผลตรวจ/ความยินยอม
4. **erasure ต้อง atomic กับการ anonymise ผู้ใช้** (transaction เดียว) — ล้มตรงไหน ผู้ใช้ยังไม่ถูก anonymise และลองใหม่ได้ ; ขั้น I/O ภายนอก (ลบ object R2) ทำหลัง commit แบบ best-effort + มี job สำรอง
5. **บล็อกการลบเมื่อมีภาระค้าง** (คลาสที่จะเกิด, เงินที่ยังไม่จ่าย, ข้อพิพาท, คืนเงินที่กำลังทำ) — default ปลอดภัย; ปิดได้ด้วย config (§7)
6. export ให้เฉพาะ **ข้อมูลของผู้ขอ** — ไม่รวมข้อมูลบุคคลอื่น (ผู้ปกครองของผู้เรียนคนอื่นในกลุ่ม, อีเมลคู่กรณี, id ภายในของผู้อื่น, ข้อความ Internal ของ admin)

---

## 3. กลไกต่อเข้า Identity โดยไม่ให้ Identity อ้าง Tutoring

### 3.1 `Siri.SharedKernel/Contracts/IPersonalDataParticipant.cs` (ไฟล์ใหม่ — ไม่มีการพึ่งพา EF/ASP.NET)
```csharp
namespace Siri.SharedKernel.Contracts;

/// ค่าคงที่กลางของบัญชีที่ถูก anonymise (Identity ใช้ตอนตั้งอีเมลใหม่; โมดูลอื่นใช้ข้ามอีเมลถึงบัญชีที่ลบแล้ว) — ค่าต้องตรงกับที่ AnonymizeAccountHandler ใช้อยู่ ("deleted.siriupskill.com")
public static class AnonymizedAccount
{
    public const string EmailDomain = "deleted.siriupskill.com";
    public static bool IsAnonymizedEmail(string? email) =>
        !string.IsNullOrWhiteSpace(email) && email.EndsWith("@" + EmailDomain, StringComparison.OrdinalIgnoreCase);
}

/// ส่วนหนึ่งของไฟล์ export ของผู้ใช้ — Data ต้อง serialize ด้วย System.Text.Json ได้ (record/คอลเลกชัน; ไม่มี entity EF)
public sealed record PersonalDataExportSection(string Module, object Data);

/// เหตุที่ยังลบบัญชีไม่ได้ — Code เสถียร (ใช้เป็น reason ของ ProblemDetails), Details = รหัสสั้นของภาระ (ไม่มีตัวเลขเงิน/ข้อมูลบุคคลอื่น)
public sealed record PersonalDataErasureBlock(string Code, string Message, IReadOnlyList<string> Details);

public interface IPersonalDataParticipant
{
    /// ชื่อโมดูล (ตัวพิมพ์เล็ก) เช่น "tutoring" — ใช้เป็น key ใน export และใน log
    string ModuleName { get; }

    /// อ่านอย่างเดียว ไม่แก้อะไร. คืน null เมื่อลบได้. เรียกก่อนเริ่ม transaction ของ Identity.
    Task<PersonalDataErasureBlock?> CheckErasureAsync(Guid userId, CancellationToken cancellationToken);

    /// อ่านอย่างเดียว (AsNoTracking) ไม่มีผลข้างเคียง; null = ผู้ใช้นี้ไม่มีข้อมูลในโมดูล. exception ⇒ export ทั้งก้อนล้ม (ไม่ส่ง export ที่ไม่ครบ).
    Task<PersonalDataExportSection?> ExportAsync(Guid userId, CancellationToken cancellationToken);

    /// ทำงานภายใน DB transaction ที่ผู้เรียกเปิดไว้บน AppDbContext เดียวกัน: stage/ExecuteUpdate ได้ แต่ **ห้าม** SaveChanges ของ entity ที่ track ไว้เอง/ห้ามเปิดหรือ commit transaction
    /// (ผู้เรียก commit ทั้งก้อนพร้อมการ anonymise ผู้ใช้). ต้อง idempotent (เรียกซ้ำบนผู้ใช้ที่ลบแล้ว = ไม่ทำอะไร) และห้ามเรียก HTTP/IO ภายนอก.
    Task EraseAsync(Guid userId, CancellationToken cancellationToken);

    /// หลัง commit สำเร็จ: งาน I/O ภายนอก (ลบไฟล์ใน object storage ฯลฯ) แบบ best-effort — ผู้เรียกจับ exception แล้ว log Warning ไม่ทำให้การลบบัญชีล้ม
    Task AfterErasureCommittedAsync(Guid userId, CancellationToken cancellationToken) => Task.CompletedTask;
}
```

### 3.2 การลงทะเบียน
`AddTutoringModule`: `services.TryAddEnumerable(ServiceDescriptor.Scoped<IPersonalDataParticipant, TutoringPersonalDataParticipant>());` (ทั้ง Api และ Workers — Workers ไม่เรียกใช้ แต่ไม่เสียหาย) · โมดูลอื่นเข้าร่วมภายหลังด้วยบรรทัดเดียวกัน ไม่ต้องแก้ Identity อีก

### 3.3 ⚠ การเปลี่ยนแปลงใน Identity (cross-module — ต้องให้เจ้าของโปรเจ็คทราบก่อน merge; ทุกจุด additive, พฤติกรรมเดิมเมื่อไม่มี participant คงเดิม)

| ไฟล์ | การเปลี่ยน |
|---|---|
| `Features/AnonymizeAccount/AnonymizeAccountHandler.cs` | (ก) ctor เพิ่มพารามิเตอร์ **ท้ายสุด** `IEnumerable<IPersonalDataParticipant>? participants = null` (ข) หลังตรวจรหัสผ่าน ก่อน `user.Anonymize(...)`: วนทุก participant → `CheckErasureAsync`; พบ block ⇒ `Result.Failure<AnonymizeAccountResponse>(DomainError.Conflict(block.Message).WithReason(block.Code, new Dictionary<string, object?> { ["blockers"] = block.Details }))` (HTTP 409) (ค) ครอบขั้นแก้ข้อมูลด้วย transaction: `var owns = dbContext.Database.CurrentTransaction is null; await using var tx = owns ? await dbContext.Database.BeginTransactionAsync(ct) : null;` → ขั้นเดิมทั้งหมด → **วน `EraseAsync` ก่อน `SaveChangesAsync`** → `SaveChangesAsync` → `tx?.CommitAsync` (ง) หลัง commit ขั้นเดิม (`sessionRegistry`, `searchSync`) แล้ววน `AfterErasureCommittedAsync` ใน `try/catch` (log Warning ชื่อโมดูล ไม่ใส่ข้อมูลผู้ใช้) (จ) แทน string อีเมลด้วย `$"anonymized_{user.Id:N}@{AnonymizedAccount.EmailDomain}"` (ค่าเดิมเป๊ะ) |
| `Features/DataExport/DataExportHandler.cs` | ctor เพิ่ม `IEnumerable<IPersonalDataParticipant>? participants = null` ท้ายสุด ; หลังสร้าง response: วน `ExportAsync` ตามลำดับ (ไม่ขนาน) เก็บส่วนที่ไม่ null → `Modules` ; participant โยน exception ⇒ ปล่อยออก (500 + log) |
| `Features/DataExport/DataExportResponse.cs` | เพิ่ม `IReadOnlyList<PersonalDataExportSection>? Modules = null` **ท้าย** record (JSON `modules`) |
- DI ของ handler ไม่ต้องแก้ (`IEnumerable<>` ถูก resolve อัตโนมัติ; ว่างได้) · เทสต์เดิมไม่พัง (F3) · เพิ่มเทสต์: ไม่มี participant ⇒ พฤติกรรมเท่าเดิม ; participant ปลอมที่ block ⇒ 409 reason ตรง และ **ผู้ใช้ไม่ถูก anonymise** ; participant ที่โยนใน `EraseAsync` ⇒ rollback (ผู้ใช้ยัง Active, session ยังไม่ถูก revoke, Redis ยังไม่ถูกลบ) ; ลำดับ: `Erase` ก่อน `SaveChanges`, `AfterCommitted` หลัง commit
- **เหตุผลที่ไม่ใช้ MediatR/event/outbox:** ต้อง atomic กับการ anonymise และต้อง "ห้ามลบ" ได้ (block) ซึ่ง event หลัง commit ทำไม่ได้ ; ไม่มี package ใหม่

---

## 4. Schema delta — migration `AddTutoringPdpa` (additive; ข้อมูลเดิมไม่ถูกแตะ)

> UPPERCASE · `timestamptz(3)` UTC · ชื่อ ≤63 ไบต์ · FK n/a (ไม่มี FK ใหม่) · **ทุก CHECK ใหม่ต้องมี `IS NOT NULL` ชัดเจน** · อ่าน migration ทั้งไฟล์: `AddColumn` + `CreateIndex` ล้วน · **ห้าม apply DB จริงเอง**

| ตาราง | คอลัมน์ใหม่ | ความหมาย |
|---|---|---|
| `TUTOR_PROFILES` | `ANONYMIZED_AT_UTC timestamptz(3) NULL` | ตั้งโดย `AnonymizeForErasure` (ครั้งเดียว) |
| `LEARNER_PROFILES` | `ANONYMIZED_AT_UTC timestamptz(3) NULL` · `GUARDIAN_CONSENT_WITHDRAWN_AT_UTC timestamptz(3) NULL` | erasure/ถอนความยินยอม ; consent เดิม (`GUARDIAN_CONSENT_AT_UTC/VERSION`) **คงไว้เป็นหลักฐานฐานทางกฎหมาย** (CHECK ของ P13-05 ไม่กระทบ) |
(คอลัมน์ `REDACTED_AT_UTC` ของ `TUTOR_REVIEWS`/`DISPUTES`/`DISPUTE_MESSAGES`/`DISPUTE_EVIDENCE_LINKS` สร้างแล้วที่ P13-13/14 — ที่นี่เป็นผู้เขียนเท่านั้น)

Index (partial — สำหรับ job retention):
- `IX_SESSION_JOIN_LOGS_PII` (`JOINED_AT_UTC`) `HasFilter("\"IP_ADDRESS\" IS NOT NULL OR \"USER_AGENT\" IS NOT NULL")`
- `IX_TUTOR_DOC_ACCESS_LOGS_PII` (`ACCESSED_AT_UTC`) `HasFilter("\"IP_ADDRESS\" IS NOT NULL")`
- `IX_DISPUTES_REDACT_DECIDED` (`DECIDED_AT_UTC`) `HasFilter("\"REDACTED_AT_UTC\" IS NULL AND \"STATUS\" IN ('Resolved','Rejected')")`
- `IX_DISPUTES_REDACT_WITHDRAWN` (`WITHDRAWN_AT_UTC`) `HasFilter("\"REDACTED_AT_UTC\" IS NULL AND \"STATUS\" = 'Withdrawn'")`
- `IX_TUTOR_DOCUMENTS_HASH_SCRUB` (`PURGED_AT_UTC`) `HasFilter("\"PURGED_AT_UTC\" IS NOT NULL AND \"CONTENT_SHA256\" <> '0000000000000000000000000000000000000000000000000000000000000000'")`
- `IX_TUTOR_PROFILES_ANONYMIZED` (`ANONYMIZED_AT_UTC`) `HasFilter("\"ANONYMIZED_AT_UTC\" IS NOT NULL")`

Domain (additive บน entity ของ P13-01/05; `private set`, เปลี่ยนผ่านเมธอด + unit test):
- `TUTOR_PROFILE.AnonymizeForErasure(IClock)` — **ข้อยกเว้นจากตาราง state machine ของ P13-01 §5.1** (ทำได้ทุกสถานะ ครั้งเดียว): `DISPLAY_NAME = "ผู้สอนที่ลบบัญชีแล้ว / Deleted tutor"`, `SLUG = "deleted-{TUTOR_ID:N}"` (UQ ยังไม่ชน, ≤100), `HEADLINE = null`, `BIO = ""`, `GENDER = Undisclosed`, `PHOTO_STORAGE_KEY = null` (คืน key เดิมให้ผู้เรียกผ่าน `ErasureState` §5.3), `INTRO_VIDEO_ASSET_ID = null`, `IS_LISTED = false`, `STATUS = Suspended`, `STATUS_REASON = "auto:account_erased"`, `STATUS_CHANGED_AT_UTC = now`, `ANONYMIZED_AT_UTC ??= now` ⇒ `TutorOnly` 403 และหายจากค้นหา/การจองทันที (ตรวจ DB ทุก request — P13-01 §5.2) · ไม่แตะ `RATING_*`/`RELIABILITY_SCORE`/`COMMISSION_PERCENT_OVERRIDE`/`VERIFIED_AT_UTC`
- `LEARNER_PROFILE.Anonymize(IClock, bool consentWithdrawn)` — `NICKNAME = "[removed]"`, `IS_ACTIVE = false`, `ANONYMIZED_AT_UTC ??= now`, `consentWithdrawn ⇒ GUARDIAN_CONSENT_WITHDRAWN_AT_UTC ??= now` · `Update`/`Reactivate` บนโปรไฟล์ที่ `ANONYMIZED_AT_UTC != null` ⇒ `LearnerProfileService` ตอบ 409 `tutoring.learner_profile_anonymised` (guard เพิ่มใน service ของ P13-05 — additive)
- ค่าคงที่: `PersonalDataPlaceholders.Text = "[ลบตามคำขอ PDPA]"`, `KycDocumentHash.ErasedSentinel = new string('0', 64)`

---

## 5. `TutoringPersonalDataParticipant`

### 5.1 `CheckErasureAsync(userId)` — บล็อกเมื่อมีภาระค้าง (`Tutoring:Pdpa:BlockErasureWithOpenObligations`, default **true**; false ⇒ คืน null เสมอ)
ตรวจเป็น `EXISTS` query แยกทีละรายการ (ไม่โหลดแถว) — คืนบล็อก `Code="tutoring.erasure_blocked"`, `Message` ไทยคงที่ ("ยังมีรายการที่ค้างอยู่ในระบบติวเตอร์ ไม่สามารถลบบัญชีได้จนกว่าจะเสร็จสิ้น"), `Details` = รหัสของภาระทั้งหมดที่พบ:

| รหัส | เงื่อนไข (ฝั่งผู้เรียก/ผู้จ่าย: `LEARNER_USER_ID`/`OWNER_USER_ID`/`LEARNER_USER_ID` = user) |
|---|---|
| `learner_bookings` | `TUTOR_BOOKINGS` ที่ `STATUS IN ('PendingPayment','Confirmed','Disputed')` |
| `learner_refunds` | `REFUNDS` ที่ `STATUS IN ('Requested','Processing')` ของ `PAYMENTS.OWNER_USER_ID = user` |
| `learner_packages` | `PACKAGE_PURCHASES` ที่ `STATUS IN ('PendingPayment','Active')` |
| `learner_disputes` | `DISPUTES` ที่ `LEARNER_USER_ID = user AND STATUS IN ('Open','UnderReview')` |
| รหัส (ฝั่งติวเตอร์ `TUTOR_PROFILES.USER_ID = user`) | เงื่อนไข |
| `tutor_sessions` | `TUTOR_SESSIONS` ของ `TUTOR_ID` ที่ `STATUS IN ('Held','Scheduled')` |
| `tutor_bookings` | `TUTOR_BOOKINGS` ของ `TUTOR_ID` ที่ `STATUS IN ('PendingPayment','Confirmed','Disputed')` |
| `tutor_disputes` | `DISPUTES` ของ `TUTOR_ID` ที่ `STATUS IN ('Open','UnderReview')` |
| `tutor_packages` | `PACKAGE_PURCHASES` ของ `TUTOR_ID` ที่ `STATUS = 'Active'` และเครดิตเหลือ (`SESSIONS_USED < SESSIONS_TOTAL`) |
| `tutor_payout_balance` | `IPayoutWalletReader.GetTutoringWalletAsync(INSTRUCTOR_PROFILE_ID, now)` → `HeldAmount > 0 OR FrozenAmount > 0 OR ProcessingAmount > 0 OR AvailableAmount <> 0` (รวมยอดติดลบ) — **ไม่เปิดเผยตัวเลข** ใน block (ดูได้ที่หน้า wallet) |
- ฝั่งแอดมิน (ผู้ใช้เป็น admin ที่ตัดสิน dispute/ดู KYC) **ไม่มีภาระ** — ลบได้
- ผู้ขอลบเป็นทั้งผู้เรียกและติวเตอร์: รวมทั้งสองชุด
- การอ่านเวลา: `IClock` ; wallet reader รันภายนอก transaction (เรียกก่อนเริ่ม txn ของ Identity) ✓ สอดคล้อง "ห้าม HTTP/IO ใน txn" (reader เป็น DB อยู่แล้ว)

### 5.2 `ExportAsync(userId)` — รูปแบบ section `{ module: "tutoring", data: TutoringPersonalDataExport }` (`AsNoTracking`, ไม่มีผลข้างเคียง)
เพดาน `Tutoring:Pdpa:ExportMaxRowsPerSection` (5000) ต่อรายการ — เกิน ⇒ ตัดตาม `CreatedAt DESC` และตั้ง `truncated.<section> = true` (ไม่ใช่ error) · **เวลา UTC ISO-8601** · enum เป็น string · ไม่มี id ภายในของบุคคลอื่น/อีเมล/ชื่อบัญชีของผู้อื่น

| section | เนื้อหา (ของผู้ขอเท่านั้น) | ที่ **ไม่** ใส่ |
|---|---|---|
| `learnerProfiles[]` | `learnerProfileId, nickname, gradeLevel, isMinor, guardianConsentAtUtc, guardianConsentVersion, guardianConsentWithdrawnAtUtc, isActive, anonymizedAtUtc, createdAtUtc` | — |
| `bookings[]` (ในฐานะผู้เรียก) | `bookingId, bookingNo, status, isTrial, format, priceAmount, refundedAmount, startsAtUtc, endsAtUtc, learnerProfileId, tutorDisplayName (สาธารณะ), subjectNameTh/En, cancelReason, createdAtUtc, confirmedAtUtc, completedAtUtc, learnerJoinedAtUtc, learnerConfirmedAtUtc` | อีเมล/ตัวตนติวเตอร์เกินโปรไฟล์สาธารณะ, `LEARNER_USER_ID` |
| `payments[]` | `paymentId, kind, refId, amount, currency, method, status, refundReservedAmount, refundedCompletedAmount, succeededAtUtc, createdAtUtc` | `PROVIDER_PAYMENT_INTENT_ID`, ข้อความ error ของ provider, ค่าธรรมเนียม Stripe |
| `refunds[]` | `refundId, paymentId, bookingId, amount, reason, status, requestedAtUtc, completedAtUtc` | provider refund id, `DECISION_NOTE` ของ admin, สถานะภายใน (lease/attempt) |
| `packagePurchases[]` | `packagePurchaseId, tutorDisplayName, learnerProfileId, durationMinutes, sessionsTotal, sessionsUsed, priceSnapshot, status, activatedAtUtc, expiresAtUtc` | — |
| `reviews[]` | `reviewId, bookingId, tutorDisplayName, rating, comment, reviewerKind, status, createdAtUtc, editedAtUtc` | `HIDE_REASON`, `HIDDEN_BY_USER_ID` |
| `disputes[]` | `disputeId, disputeNo, bookingNo, category, flow, status, openedByRole, description, openedAtUtc, resolution, refundAmount, decisionNote, decidedAtUtc, attendanceOverturned, evidenceLinks[{url,label,addedByRole}], messages[{authorRole,isMine,body,createdAtUtc}]` — เฉพาะข้อความ `Visibility=Parties` (ข้อความ Internal ของ admin **ไม่รวม** เว้นแต่ `ExportIncludeInternalDisputeNotes=true`) | `OPENED_BY_USER_ID`/`LEARNER_USER_ID`/id admin, `ASSIGNED_TO_USER_ID` |
| `joinLogs[]` | `sessionId, role, joinedAtUtc, ipAddress, userAgent` (ของผู้ขอเอง) | ของผู้อื่นในกลุ่ม |
| `sessionSummaries[]` (ที่ผู้เรียกได้รับ) | `bookingId, topicsCovered, feedback, homework, nextSteps, createdAtUtc` | — |
| `tutorProfile` (ถ้าเป็นติวเตอร์) | โปรไฟล์ทั้งหมดที่ผู้ขอกรอกเอง (`displayName, slug, headline, bio, gender, yearsExperience, status, statusReason, minNoticeHours, bufferMinutes, maxAdvanceDays`) + `offerings[]` + `educations[]` + `certificates[]` + `availabilityRules[]` + `availabilityExceptions[]` + `commissionPercentOverride` + `ratingAverage/ratingCount/completedSessionsCount/reliabilityScore` | — |
| `tutorKyc` | `cases[{attemptNo,status,submittedAtUtc,decidedAtUtc,decisionNote,consentVersion,consentAtUtc, documents[{type,status,uploadedAtUtc,expiresAtUtc,purged}]}]` | **ไบต์ไฟล์, storage key, sha256, ขนาด, ชื่อไฟล์, ผู้ตัดสิน (admin id)** |
| `tutorClasses[]` | `sessionId, startsAtUtc, endsAtUtc, format, status, subjectNameTh/En, seatsTaken` | ตัวตนผู้เรียก/ผู้ปกครอง (ข้อมูลบุคคลที่สาม) |
| `tutorPenalties[]` | `sessionId, kind, points, reasonCode, createdAtUtc, voided` | — |
| `tutorEarnings` | `walletSummary` (จาก `IPayoutWalletReader.GetTutoringWalletAsync`) + `ledger[]` (จาก `GetTutoringLedgerAsync` ตามเพดาน) | — |
| `adminActivity[]` (ถ้าเป็น admin) | `kycDocumentAccess[{action,accessedAtUtc,ipAddress}]` (แถว `ACCESSED_BY_USER_ID = user`) + `disputesDecidedCount` | ตัวตนผู้ถูกตรวจ |
- ไม่เขียน audit การ export (Identity ไม่เขียนอยู่แล้ว) · ข้อความทั้งหมดเป็นข้อความล้วน (ไม่ HTML) · ขนาดรวม ≤ ตามเพดานแถว ; ไม่ stream ไฟล์ (เป็น JSON ใน response ของ Identity)

### 5.3 `EraseAsync(userId)` — ภายใน transaction ของ Identity (F6); ลำดับคำสั่งตามลำดับ lock D-B เท่าที่เป็นไปได้ (`bookings → disputes → reviews → … → TUTOR_PROFILES` ท้ายสุด) ; set-based ล้วน ยกเว้นโปรไฟล์ติวเตอร์ (tracked)
ทุกขั้น `WHERE … IS DISTINCT FROM` เพื่อ idempotent (รันซ้ำไม่เขียนซ้ำ) ; `now = IClock.UtcNow`

| # | เป้าหมาย | คำสั่ง (identifier ถูก quote ใน repository) |
|---|---|---|
| 1 | `TUTOR_BOOKINGS.CANCEL_REASON` ของผู้เรียก | `UPDATE … SET "CANCEL_REASON" = NULL WHERE "LEARNER_USER_ID" = @u AND "CANCEL_REASON" IS NOT NULL` (ไม่หมุน ROW_VERSION — ไม่มีผู้เขียนพร้อมกันเพราะผ่านด่าน block แล้ว) |
| 2 | `DISPUTES.DESCRIPTION` ที่ผู้ใช้เปิด | `SET "DESCRIPTION" = PersonalDataPlaceholders.Text, "REDACTED_AT_UTC" = @now WHERE "OPENED_BY_USER_ID" = @u AND "REDACTED_AT_UTC" IS NULL` |
| 3 | `DISPUTE_MESSAGES.BODY` ที่ผู้ใช้เขียน (`KIND='Message'`) | `SET "BODY" = placeholder, "REDACTED_AT_UTC" = @now WHERE "AUTHOR_USER_ID" = @u AND "KIND" = 'Message' AND "REDACTED_AT_UTC" IS NULL` |
| 4 | `DISPUTE_EVIDENCE_LINKS` ที่ผู้ใช้แนบ | `SET "URL" = NULL, "LABEL" = NULL, "REDACTED_AT_UTC" = @now WHERE "ADDED_BY_USER_ID" = @u AND "REDACTED_AT_UTC" IS NULL` |
| 5 | `TUTOR_REVIEWS` ที่ผู้ใช้เขียน | `SET "COMMENT" = NULL, "REVIEWER_KIND" = 'Anonymous', "REVIEWER_NICKNAME" = NULL, "REVIEWER_GRADE_BAND" = NULL, "REDACTED_AT_UTC" = @now WHERE "REVIEWER_USER_ID" = @u AND "REDACTED_AT_UTC" IS NULL` — **คะแนนดาวคงอยู่** (นับเข้า `RATING_*` ต่อ ไม่ระบุตัวตน ⇒ ไม่ต้อง recompute) ; `Tutoring:Pdpa:ReviewCommentOnErasure=Keep` ⇒ ข้ามการล้าง `COMMENT` (ยังล้างตัวตนผู้รีวิว) |
| 6 | `SESSION_SUMMARIES.FEEDBACK` (ติวเตอร์เขียนเกี่ยวกับผู้เรียกคนนี้) | `SET "FEEDBACK" = NULL WHERE "BOOKING_ID" IN (SELECT "BOOKING_ID" FROM "TUTORING"."TUTOR_BOOKINGS" WHERE "LEARNER_USER_ID" = @u) AND "FEEDBACK" IS NOT NULL` |
| 7 | `SESSION_JOIN_LOGS` ของผู้ใช้ | `SET "IP_ADDRESS" = NULL, "USER_AGENT" = NULL WHERE "USER_ID" = @u AND ("IP_ADDRESS" IS NOT NULL OR "USER_AGENT" IS NOT NULL)` (แถวคงอยู่: id/role/เวลา เป็นหลักฐาน no-show) |
| 8 | `LEARNER_PROFILES` ของเจ้าของ | tracked: `profile.Anonymize(clock, consentWithdrawn:false)` ทุกโปรไฟล์ที่ `OWNER_USER_ID = @u` |
| 9 | ฝั่งแอดมิน: `TUTOR_DOCUMENT_ACCESS_LOGS.IP_ADDRESS` ที่ `ACCESSED_BY_USER_ID = @u` | `SET "IP_ADDRESS" = NULL` (แถวคงอยู่เป็นหลักฐานว่าใครเปิดดู) |
| 10 | ติวเตอร์: ลบ `TUTOR_EDUCATIONS`, `TUTOR_CERTIFICATES`, `TUTOR_AVAILABILITY_RULES`, `TUTOR_AVAILABILITY_EXCEPTIONS` ของ `TUTOR_ID` | `ExecuteDeleteAsync` (ไม่มีตารางอื่นอ้างถึง ⇒ ไม่ผิดกฎ "ห้ามลบ") |
| 11 | ติวเตอร์: `TUTOR_OFFERINGS` | `SET "IS_ACTIVE" = false` (แถวถูกอ้างโดย session/booking/package ⇒ ไม่ลบ) |
| 12 | ติวเตอร์: KYC | `TUTOR_DOCUMENTS SET "PURGE_AFTER_UTC" = @now WHERE "CASE_ID" IN (cases ของ TUTOR_ID) AND "PURGED_AT_UTC" IS NULL` (ให้ `KycPurgeService.PurgeDueAsync` ลบไฟล์ทันทีหลัง commit §5.4) · `TUTOR_KYC_CASES SET "DECISION_NOTE" = NULL WHERE "TUTOR_ID" = @t` (ข้อความที่อาจมีรายละเอียดผู้สมัคร ; ผล/วันที่/ผู้ตัดสิน/consent คงไว้) |
| 13 | ติวเตอร์: โปรไฟล์ (ขั้นสุดท้าย = ลำดับท้ายสุดของ chain) | tracked: `profile.AnonymizeForErasure(clock)` ; เก็บ `PHOTO_STORAGE_KEY` เดิมใน `PersonalDataErasureState` (Scoped; รายการ `(userId → photoKey)` สำหรับ §5.4) ; ล้ม concurrency (`ROW_VERSION`) ⇒ exception ⇒ Identity rollback ทั้งก้อน (ผู้ใช้ลองใหม่) |
- **ไม่แตะ:** `PAYMENTS`, `REFUNDS`, `TUTOR_BOOKINGS` (นอกจาก `CANCEL_REASON`), `TUTOR_SESSIONS`, `PACKAGE_*`, `TUTOR_PENALTY_EVENTS`, `SESSION_ATTENDANCE_DECISIONS`, ผลลัพธ์/ยอดของ `DISPUTES`, `SEARCH_LOGS` (ไม่มี user), ledger Payout
- ข้อความ admin (`DISPUTE_MESSAGES` ที่ `AUTHOR_ROLE='Admin'`, `DISPUTES.DECISION_NOTE`) **คงไว้จนกว่า retention §6** (เป็นบันทึกการตัดสินของแพลตฟอร์ม ไม่ใช่ข้อความของผู้ใช้) — Open decision #4 (ต้องให้ที่ปรึกษากฎหมายยืนยัน Q14.3)
- `EraseAsync` เรียกซ้ำบนผู้ใช้ที่ลบแล้ว ⇒ ทุกคำสั่งไม่มีแถวให้แก้ (`IS DISTINCT FROM`/`IS NULL`) ⇒ no-op

### 5.4 `AfterErasureCommittedAsync(userId)` — best-effort, ไม่ทำให้การลบล้ม
1. ลบรูปโปรไฟล์: `IFileStorage.DeleteAsync(oldPhotoKey)` (retry 3 ครั้ง backoff 1/3/9 วิ ; ล้ม ⇒ log **Error** พร้อม key (key เป็นเส้นทางสุ่มไม่ใช่ PII) + counter `tutoring.pdpa.photo_delete_failed` ให้ ops ลบมือ)
2. ลบไฟล์ KYC ทันที: `KycPurgeService.PurgeDueAsync(ct)` (ประมวลผลเอกสาร `PURGE_AFTER_UTC <= now` — เอกสารของผู้ใช้นี้ถูกตั้งแล้วที่ข้อ 12) ; ล้ม ⇒ job `tutoring-kyc-purge` (ทุกชั่วโมง :10) รับช่วง (**ไฟล์ KYC ไม่ค้างเกิน ~1 ชม. แม้ขั้นนี้ล้ม**)
3. `ITutorPublicCacheInvalidator.InvalidateProfilesAsync` + `InvalidateSlotsAsync` + `InvalidateReviewsAsync`
4. (ตามหลัง) ข้อมูลที่ผู้ใช้ลบแล้วแต่ยังค้างใน Meilisearch ฯลฯ — ไม่มีของ Tutoring

---

## 6. Retention job `tutoring-retention` (Daily 05:00, `Cron.Daily(5)`; `RecurringJobIds.TutoringRetention = "tutoring-retention"` (+ใน `All`); `[DisableConcurrentExecution(timeoutInSeconds: 1500)]`; Api(`ServerInApi`)/Workers ได้; `TutoringRetentionJob → TutoringRetentionService.RunAsync`)

แต่ละขั้น: ชุดละ `BatchSize` (5000), สูงสุด `MaxBatchesPerRun` (20) ต่อขั้น, `ExecuteUpdateAsync` ในลูป (หนึ่ง transaction สั้นต่อชุด) ; exception ของขั้นหนึ่ง log แล้วไปขั้นถัดไป ; ผลรวมจำนวนแถวต่อขั้น log Information + counter `tutoring.retention.rows{step}`

| ขั้น | เงื่อนไข | การกระทำ | Config (`Tutoring:Retention`) |
|---|---|---|---|
| 1 `join_log_pii` | `SESSION_JOIN_LOGS.JOINED_AT_UTC < now − JoinLogPiiMonths` ∧ (IP หรือ UA ไม่ว่าง) ∧ **ไม่มี dispute `Open/UnderReview` ของ `SESSION_ID` นั้น** | `IP_ADDRESS = NULL, USER_AGENT = NULL` (แถวคงอยู่) | `JoinLogPiiMonths` = **12** (1–60) *(ชื่อ key ตกลงกับ P13-10 §3.2/§10)* |
| 2 `kyc_access_ip` | `TUTOR_DOCUMENT_ACCESS_LOGS.ACCESSED_AT_UTC < now − KycAccessLogIpMonths` ∧ IP ไม่ว่าง | `IP_ADDRESS = NULL` | `KycAccessLogIpMonths` = **24** (3–60) |
| 3 `dispute_text` | `DISPUTES` ปิดแล้ว (`Resolved/Rejected` ที่ `DECIDED_AT_UTC`, หรือ `Withdrawn` ที่ `WITHDRAWN_AT_UTC`) `< now − DisputeTextMonths` ∧ `REDACTED_AT_UTC IS NULL` | ใน txn เดียวต่อเคส: `DESCRIPTION`, `DECISION_NOTE` = placeholder ; ทุก `DISPUTE_MESSAGES` (`KIND='Message'`, ทุก role/visibility) `BODY` = placeholder + `REDACTED_AT_UTC` ; `DISPUTE_EVIDENCE_LINKS` `URL/LABEL = NULL` + `REDACTED_AT_UTC` ; `DISPUTES.REDACTED_AT_UTC = now` — **คงผลตัดสิน/จำนวนเงิน/สถานะ/วันที่** | `DisputeTextMonths` = **24** (6–120) |
| 4 `kyc_hash` | `TUTOR_DOCUMENTS.PURGED_AT_UTC < now − KycHashRetentionMonths` ∧ `CONTENT_SHA256 <> sentinel` (**หรือ** ติวเตอร์เจ้าของ case `ANONYMIZED_AT_UTC IS NOT NULL` ทันที) | `CONTENT_SHA256 = KycDocumentHash.ErasedSentinel` | `KycHashRetentionMonths` = **12** (0 = เก็บ hash ตลอด ; 1–60) ; `ScrubPurgedDocumentHashes` = true |
| (อ้างอิง — ไม่ทำซ้ำ) | `SEARCH_LOGS` 90 วัน = job `tutoring-search-log-purge` (P13-04) · ไฟล์ KYC = job `tutoring-kyc-purge` (P13-02) · token/session = job Identity (F4) | | |
- **ข้อกำหนดข้ามสัญญาที่ต้องแก้ใน P13-02 (additive, ผู้ลงมือ P13-02 ที่ยังไม่เริ่มต้องรู้):** query นับ "ไฟล์เดียวกันจากติวเตอร์อื่น" (`sameFileSeenFromOtherTutors`, อ้าง `IX_TUTOR_DOCUMENTS_SHA256`) ต้องเพิ่มเงื่อนไข `AND "CONTENT_SHA256" <> {sentinel}` ไม่ให้ sentinel ถูกนับเป็นไฟล์ซ้ำ + unit test 1 ข้อ
- **ไม่มีการลบแถวเงิน/การจอง/audit** ในทุกขั้น · retention ของ `SECURITY_AUDIT` (3 ปี) เป็นเรื่องของ Identity (ไม่อยู่ที่นี่)
- `Enabled=false` ⇒ job ไม่ทำอะไร (log Information) · `ProductionRequirements`: ไม่มี (ค่า default ปลอดภัย)

---

## 7. ถอนความยินยอมของผู้ปกครอง (ผู้เยาว์) — `POST /api/tutoring/learner-profiles/{learnerProfileId:guid}/withdraw-consent`

- **Auth:** `[Authorize]` (README §5.1 แถว `learner-profiles*`) · rate limit `tutoring-user` · ownership: `LEARNER_PROFILE_ID = @id AND OWNER_USER_ID = @caller` ใน query เดียว (ไม่พบ/ไม่ใช่ของฉัน ⇒ 404 `tutoring.learner_profile_not_found` ไบต์เดียวกับ P13-05 §8) · `Cache-Control: no-store`
- **Request** `WithdrawGuardianConsentRequest(string Confirmation /*ต้องเป็น "WITHDRAW"*/)` · **Response 200** `GuardianConsentWithdrawalResponse(Guid LearnerProfileId, DateTime WithdrawnAtUtc)`
- **เงื่อนไข:** โปรไฟล์ต้อง `IS_MINOR = true` และเคยมี consent ⇒ มิฉะนั้น 409 `tutoring.consent_not_applicable` (ผู้ใหญ่ใช้การลบบัญชี) · ถอนแล้ว (`GUARDIAN_CONSENT_WITHDRAWN_AT_UTC != null`) ⇒ 200 idempotent (ค่าเดิม)
- **บล็อก (409 `tutoring.consent_withdraw_blocked` ext `blockers[]`):** โปรไฟล์นี้ "in use" ตาม seam `ILearnerProfileUsageReader` ของ P13-05 (มี booking `PendingPayment`/`Confirmed` ที่ยังไม่จบ + แพ็กเกจ `Active` ของ P13-12) **หรือ** มี `Disputed` booking / dispute `Open/UnderReview` ของ booking ของโปรไฟล์นี้ — รหัส `bookings`, `packages`, `disputes`
- **ขั้นตอน (transaction เดียว, ล็อกแถวโปรไฟล์ `FOR NO KEY UPDATE` (D2: ชน `FOR SHARE` ของเส้นจอง; ไม่ใช้ `FOR UPDATE` เพราะ deadlock กับ refund จาก provider)):** `profile.Anonymize(clock, consentWithdrawn:true)` → ต่อ booking ทั้งหมดของ `LEARNER_PROFILE_ID`: ล้าง `SESSION_SUMMARIES.FEEDBACK` · redact `TUTOR_REVIEWS` (เหมือนข้อ 5 ของ §5.3 แต่ผูก `BOOKING_ID`) · redact ข้อความ/ลิงก์/คำอธิบายของ dispute ที่ฝั่ง **ผู้เรียก** เขียน (ผู้เรียก = `AUTHOR_ROLE='Learner'`, `OPENED_BY_ROLE='Learner'`) ของ booking เหล่านั้น → `ISecurityAuditContract.RecordAuditAsync("tutoring.learner.consent_withdrawn", callerUserId, json{learnerProfileId}, ip)` (ท้าย = commit) · **ไม่ลบ** booking/payment/refund/ยอดเงิน/โปรไฟล์ (คงเป็น `IS_ACTIVE=false` + nickname placeholder)
- ผลต่อผู้ใช้: โปรไฟล์เด็กใช้จองใหม่ไม่ได้อีก (ต้องสร้างใหม่พร้อม consent ใหม่) ; ประวัติการจอง/ใบเสร็จยังเห็นได้โดยแสดงชื่อเล่นเป็น "[removed]" ; **FE ต้องเสนอ "ดาวน์โหลดข้อมูลก่อน" (ลิงก์ไป export ของ Identity) ก่อนยืนยัน**
- DTO error `reason` ใหม่: `tutoring.consent_not_applicable` (409) · `tutoring.consent_withdraw_blocked` (409, ext `blockers`) · `tutoring.learner_profile_anonymised` (409 — แก้/ใช้โปรไฟล์ที่ถูก anonymise) · ที่ใช้ซ้ำ: `tutoring.learner_profile_not_found`, `tutoring.concurrent_update`, `validation`

---

## 8. Config / DI / jobs

`TutoringPdpaOptions` (`Tutoring:Pdpa`, `IValidateOptions` + `ValidateOnStart`):

| Key | Default | ช่วง / หมายเหตุ |
|---|---|---|
| `BlockErasureWithOpenObligations` | `true` | false ⇒ ลบได้เสมอ (ระบบยัง degrade ได้: ติวเตอร์ที่ลบแล้ว = `Suspended` ⇒ sweep ยกเลิกคลาสอนาคตและคืนเงิน — P13-08 §7.3 ; ผู้เรียกที่ลบแล้วเข้าห้องไม่ได้ ⇒ no-show) — **ไม่แนะนำ** |
| `ExportMaxRowsPerSection` | `5000` | 100–50000 |
| `ExportIncludeInternalDisputeNotes` | `false` | |
| `ReviewCommentOnErasure` | `Remove` | `Remove` \| `Keep` |
`TutoringRetentionOptions` (`Tutoring:Retention`): `Enabled` true · `JoinLogPiiMonths` 12 · `KycAccessLogIpMonths` 24 · `DisputeTextMonths` 24 · `KycHashRetentionMonths` 12 · `ScrubPurgedDocumentHashes` true · `BatchSize` 5000 (100–20000) · `MaxBatchesPerRun` 20 (1–100)
- DI: `TutoringPersonalDataParticipant` (Scoped, ลงทะเบียนแบบ `TryAddEnumerable` §3.2) · `PersonalDataErasureState` (Scoped) · `TutoringRetentionService` · `TutoringRetentionJob` · section ทั้งสองใน appsettings **Api และ Workers** (placeholder = default)
- Jobs: `RecurringJobIds.TutoringRetention` + `AddOrUpdate<TutoringRetentionJob>(RecurringJobIds.TutoringRetention, job => job.RunAsync(CancellationToken.None), Cron.Daily(5));`
- **ไม่มี NuGet/secret/rate-limit policy/production guard ใหม่**
- Telemetry (`TutoringTelemetry`): `tutoring.pdpa.erasure{result}`, `tutoring.pdpa.export_rows{section}`, `tutoring.pdpa.photo_delete_failed`, `tutoring.pdpa.consent_withdrawn`, `tutoring.retention.rows{step}`

---

## 9. Security / privacy

- `userId` มาจาก Identity (`IUserContext` ใน controller) เท่านั้น ; ไม่มี endpoint ของ Tutoring รับ userId สำหรับ export/erase ; `IPersonalDataParticipant` เป็น in-process (ไม่มี HTTP surface)
- export ไม่รั่วข้อมูลบุคคลอื่น (ตาราง §5.2 คอลัมน์ "ไม่ใส่") — เทสต์ JSON-walk: seed ผู้ใช้สองคนที่เคยเรียนกลุ่มเดียวกัน/ร่วม dispute ⇒ export ของ A ไม่มี nickname/userId/อีเมลของ B และไม่มีข้อความ Internal
- erasure ไม่ log ข้อมูลส่วนบุคคล (log เฉพาะ `userId`+จำนวนแถวต่อขั้น) ; audit ของ Identity เดิม (`account.anonymized_pdpa`) คงอยู่
- ไฟล์ KYC/รูป: ลบจริงใน R2 (ไม่ใช่แค่ธง) ; ไม่มีทางกู้คืนผ่านแอป ; access log คงไว้โดยไม่มี IP ของผู้ลบ
- anonymise ไม่ทำให้ข้อมูลเงิน/การจองหาย (CHECK/FK ไม่พัง: ใช้เฉพาะการ UPDATE คอลัมน์ข้อความ/nullable) ; `TUTOR_PROFILES` ที่ถูก anonymise ยังเป็นเจ้าของ FK ของ session/booking/review ตามเดิม
- ผู้ใช้ที่ลบบัญชีแล้วเข้าสู่ระบบไม่ได้ (Identity) ⇒ ไม่มีทางเรียก endpoint ของ Tutoring ; access token เดิมที่เหลือ ≤15 นาที: `TutorOnly` ตรวจ DB ⇒ `Suspended` ⇒ 403 ทันที ; endpoint ผู้เรียกที่ใช้ ownership ผ่าน `IUserContext` ยังเข้าถึงได้แค่ของตัวเองซึ่งถูก anonymise แล้ว
- รายการที่ **ต้องให้ที่ปรึกษากฎหมาย/นักบัญชียืนยัน** (Q14.3): ระยะเก็บ (JoinLog IP 12 เดือน, dispute text 24 เดือน, KYC hash 12 เดือน) · การคงข้อความ admin ใน dispute · การคงหลักฐาน consent ของผู้ปกครองหลังถอน · ภาระที่บล็อกการลบ (โดยเฉพาะยอดเงินค้างของติวเตอร์)

---

## 10. Test checklist

**Unit:** `AnonymizedAccount.IsAnonymizedEmail` (ขอบ: null/ว่าง/ตัวพิมพ์/โดเมนคล้าย `evildeleted.siriupskill.com`) · `TUTOR_PROFILE.AnonymizeForErasure` (ทุกสถานะ → `Suspended`, `IS_LISTED=false`, slug `deleted-{id:N}`, CHECK `CK_TUTOR_PROFILES_LISTED` ไม่พัง, ซ้ำ = no-op, ไม่แตะ stats) · `LEARNER_PROFILE.Anonymize` (+consentWithdrawn) · guard `learner_profile_anonymised` · บล็อก: ตาราง §5.1 ทุกรหัส × สถานะ (ขอบ: booking `Completed` ไม่บล็อก, `PendingPayment` บล็อก, wallet 0.00 ไม่บล็อก/−0.01 บล็อก, config ปิด ⇒ null) · retention cutoff (ขอบเดือน, ข้ามเมื่อมี dispute เปิด, `KycHashRetentionMonths=0`) · export: เพดาน/`truncated`, allow-list ฟิลด์ (reflection: ไม่มี property ชื่อ `*UserId`/`Email`/`StorageKey`/`Sha256`/`Provider*` ใน DTO export) · options validator · source-scan: ไม่มี `DELETE`/`ExecuteDelete` บนตารางเงิน/การจอง/refund/payment/ledger/penalty/decision/dispute ใน `TutoringPersonalDataParticipant` และ `TutoringRetentionService` (allow-list ตาราง §2 ข้อ 2 เท่านั้น) · reflection: `withdraw-consent` มี `[Authorize]`
**Integration (PostgreSQL 17 + `SiriApiFactory`; ห้าม InMemory):**
1. **Identity wiring:** ไม่มี participant ⇒ `AnonymizeAccount`/`DataExport` ทำงานเท่าเดิม ; มี participant ปลอม: block ⇒ 409 + ผู้ใช้ **ไม่** ถูก anonymise ; `Erase` โยน ⇒ rollback ทั้งก้อน (user Active, session ไม่ revoke) ; ลำดับ Erase→SaveChanges→Commit→AfterCommitted ; `AfterCommitted` โยน ⇒ ยังสำเร็จ
2. **erasure ผู้เรียก (end-to-end):** seed ผู้ปกครอง + 2 โปรไฟล์เด็ก + booking Completed/Cancelled + review + summary feedback + dispute (ปิดแล้ว) + join log ⇒ หลัง `POST anonymize`: nickname `[removed]`, `IS_ACTIVE=false`, `CANCEL_REASON` null, review `COMMENT` null/`kind=Anonymous`/ดาวคงเดิม และ `RATING_*` ของติวเตอร์ **ไม่เปลี่ยน**, summary `FEEDBACK` null, dispute text/ข้อความ/ลิงก์ของผู้ใช้ placeholder แต่ผล/ยอดเงินคงเดิม, join log IP/UA null แต่แถวอยู่ ; **จำนวนแถว** `PAYMENTS/REFUNDS/TUTOR_BOOKINGS/REVENUE_SPLITS/SESSION_ATTENDANCE_DECISIONS` เท่าเดิมเป๊ะ ; รันซ้ำ ⇒ ไม่มีอะไรเปลี่ยน
3. **erasure ติวเตอร์:** ติวเตอร์ Verified ไม่มีภาระ ⇒ `STATUS=Suspended`, ไม่ค้นหาเจอ, `GET tutors/{slug}` เดิม + slug ใหม่ ⇒ 404, `TutorOnly` 403 ทันที, ตารางศึกษา/ใบรับรอง/เวลาว่างถูกลบ, offerings `IS_ACTIVE=false`, `TUTOR_DOCUMENTS.PURGE_AFTER_UTC` ตั้งแล้ว และหลัง `AfterCommitted` ไฟล์ (fake `IKycFileStorage`) ถูกลบ + `PURGED_AT_UTC` ตั้ง ; รูปโปรไฟล์ถูกลบ (fake `IFileStorage`) ; `AfterCommitted` ล้ม ⇒ log Error แต่ erasure สำเร็จ + job purge ทำต่อ
4. **block:** ผู้เรียก booking `Confirmed` ⇒ 409 `tutoring.erasure_blocked` ext blockers=`learner_bookings` ; ติวเตอร์มี session อนาคต/ยอด wallet ค้าง/dispute เปิด ⇒ รหัสตรง ; config ปิด ⇒ ผ่านและ sweep ยกเลิกคลาส (P13-08)
5. **export:** ผู้ใช้ที่มีข้อมูลครบทุก section ⇒ ได้ครบและตรง DB ; ไม่มีข้อมูลบุคคลอื่น (JSON-walk) ; ข้อความ Internal ไม่อยู่ (เว้นเปิด config) ; ผู้ใช้ไม่มีข้อมูล Tutoring ⇒ ไม่มี section `tutoring` ; เกินเพดาน ⇒ `truncated`
6. **withdraw-consent:** เจ้าของ ⇒ 200 + โปรไฟล์/รีวิว/ข้อความ dispute ของ booking ของโปรไฟล์นั้นถูก redact, โปรไฟล์อื่นของเจ้าของไม่ถูกแตะ ; ซ้ำ ⇒ 200 ; มี booking ค้าง ⇒ 409 `consent_withdraw_blocked` ; ผู้ใหญ่ ⇒ 409 `consent_not_applicable` ; ผู้อื่น ⇒ 404 เท่ากับ id ไม่มีจริง ; จองด้วยโปรไฟล์ที่ถอนแล้ว ⇒ ปฏิเสธ (P13-05) ; audit 1 แถว
7. **retention:** seed join log/KYC access log/dispute ปิดเก่า-ใหม่ ⇒ เฉพาะที่เลย cutoff ถูกแก้ ; join log ของ session ที่มี dispute เปิดไม่ถูกแตะ ; hash ของเอกสารที่ purge เกิน N เดือนถูกแทนที่ sentinel และ query ไฟล์ซ้ำของ P13-02 ไม่นับ sentinel ; batch ขอบเขต ; รันซ้ำ idempotent ; job อยู่ใน `RecurringJobIds.All`
8. migration บน PG17: `AddColumn`/`CreateIndex` ล้วน ไม่มี shadow column ; `DatabaseIdentifierLengthTests` เขียว ; แถวเดิมทั้งหมดได้ `ANONYMIZED_AT_UTC = NULL`
9. architecture test: Identity ไม่ reference Tutoring ; SharedKernel ไม่ reference EF (ไฟล์ใหม่ไม่มี EF)

---

## 11. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | 3 คอลัมน์ + 6 index ใน configuration + domain `AnonymizeForErasure`/`Anonymize` (+unit) + migration `AddTutoringPdpa` + `docs/DATABASE.md` | อ่านทั้งไฟล์ `AddColumn`/`CreateIndex` ล้วน · ชื่อ ≤63 · **ไม่ apply DB จริง** |
| **B** | `backend-developer` | **SharedKernel `IPersonalDataParticipant` + แก้ Identity 3 ไฟล์ (§3.3) + เทสต์ข้อ 1/9** — ⚠ แจ้งเจ้าของก่อน merge | unit + integration เขียว ; เทสต์ Identity เดิมผ่านโดยไม่แก้ |
| **C** | `backend-developer` | `TutoringPersonalDataParticipant` (check/export/erase/after-commit) + `PersonalDataErasureState` + Options + unit | unit §10 |
| **D** | `backend-developer` | `withdraw-consent` (service + controller action + validator) + guard `learner_profile_anonymised` ใน `LearnerProfileService` | ทุก action มี attribute auth |
| **E** | `backend-developer` | `TutoringRetentionService` + job + `RecurringJobIds`/registration + appsettings (Api+Workers) | unit |
| **F** | `backend-developer`/`integrator-qa` | integration §10 (ข้อ 1–4,6 ต้องรันจริงบน PG ก่อนตั้ง `DONE`) | เขียนครบ (ระบุถ้าไม่เคยรันเพราะไม่มี Docker) |
ลำดับ: A ∥ B → C → D ∥ E → F · P13-17 รอ P13-13/14 (คอลัมน์ `REDACTED_AT_UTC`) และ P13-02 (`KycPurgeService`) · **ห้ามส่ง Antigravity · ห้าม apply migration / commit เอง**

---

## 12. Frontend notes + DTO appendix

- **หน้าบัญชี (Identity เดิม):** หน้า "ส่งออกข้อมูล/ลบบัญชี" ต้องรองรับ 409 `tutoring.erasure_blocked` — แสดงรายการ `blockers[]` ด้วย i18n `tutoring.learner.privacy.blockers.<code>` พร้อมลิงก์ไป `/my-tutoring` / `/instructor/tutoring/classes` / `/instructor/tutoring/wallet` / disputes · ไฟล์ export (`modules[]` ที่ `module === 'tutoring'`) แสดงเป็น JSON ที่ดาวน์โหลดได้ (ไม่ต้องมี UI รายตาราง)
- **หน้าโปรไฟล์ผู้เรียน (`/account/learner-profiles`):** ปุ่ม "ถอนความยินยอมของผู้ปกครอง" เฉพาะโปรไฟล์ `isMinor` ที่ยัง active → dialog: ผลกระทบ ("ใช้จองไม่ได้อีก, ข้อความรีวิว/ข้อพิพาท/ฟีดแบ็กของโปรไฟล์นี้จะถูกลบ, ประวัติการจ่ายเงินยังเก็บ"), ลิงก์ "ดาวน์โหลดข้อมูลก่อน", ช่องพิมพ์ยืนยันคำว่า `WITHDRAW`, ปุ่มกันกดซ้ำ ; 409 `consent_withdraw_blocked` ⇒ แสดงรายการสิ่งที่ค้างตาม `blockers`
- โปรไฟล์ที่ถูก anonymise แสดงชื่อ `[removed]` + ป้าย "ลบข้อมูลแล้ว" (ไม่ให้แก้ไข) ; ติวเตอร์ที่ลบบัญชีแล้วในประวัติการจองแสดง "ผู้สอนที่ลบบัญชีแล้ว"
- i18n (README §6 E7): `tutoring.learner.privacy.*`, `tutoring.learner.profile.consentWithdraw.*`, `tutoring.errors.<reason>` (th+en ครบ) · token/`tone-*` เท่านั้น · loading/error ครบ · **E8:** ไม่มี route ใหม่ (ใช้หน้าเดิม) ⇒ ไม่เพิ่ม `app.routes.server.ts`

```ts
type Guid = string; type IsoUtc = string;
interface WithdrawGuardianConsentRequest { confirmation: 'WITHDRAW'; }
interface GuardianConsentWithdrawalResponse { learnerProfileId: Guid; withdrawnAtUtc: IsoUtc; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: string; reason?: string; blockers?: string[]; }
// 409 จาก DELETE/POST anonymize ของ Identity เมื่อ Tutoring บล็อก:
//   reason: 'tutoring.erasure_blocked', blockers: ('learner_bookings'|'learner_refunds'|'learner_packages'|'learner_disputes'|'tutor_sessions'|'tutor_bookings'|'tutor_disputes'|'tutor_packages'|'tutor_payout_balance')[]
// โครง modules[] ในไฟล์ export (Identity DataExportResponse.modules): { module: 'tutoring', data: TutoringPersonalDataExport } — รูปตาม §5.2 (FE ไม่ parse)
```
C#: `WithdrawGuardianConsentRequest(string Confirmation)` · `GuardianConsentWithdrawalResponse(Guid LearnerProfileId, DateTime WithdrawnAtUtc)` · `TutoringPersonalDataExport` และ record ลูกตาม §5.2 (camelCase JSON) · `PersonalDataExportSection`/`PersonalDataErasureBlock` (SharedKernel §3.1)

---

## Deviations จาก TUTORING.md / ข้อกำหนดก่อนหน้า
| # | ที่เดิม | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | TUTORING.md §7: "Identity `AnonymizeAccount`/`DataExport` ไม่ข้ามโมดูล" | เพิ่ม hook กลาง `IPersonalDataParticipant` ใน SharedKernel + แก้ Identity 3 ไฟล์ (additive) | ไม่มีกลไกอื่นใน Identity (F1/F2); ต้อง atomic + ต้อง "block" ได้ |
| D2 | P13-10 §3.2: scrub join log หลัง `Tutoring:Retention:JoinLogPiiMonths` | ยืนยันชื่อ key + default 12 เดือน ; ข้ามเมื่อมี dispute เปิด | ปกป้องหลักฐานข้อพิพาท |
| D3 | TASKS.md: "export ... (booking/โปรไฟล์ผู้เรียน/รีวิว)" | ขยายครอบ payments/refunds/disputes/join logs/โปรไฟล์ติวเตอร์/KYC เมทาดาทา/earnings/admin activity | DSAR ครบข้อมูลส่วนบุคคลจริง |
| D4 | — | `TUTOR_DOCUMENTS.CONTENT_SHA256` ถูกแทนด้วย sentinel หลัง purge เกิน N เดือน/เมื่อลบบัญชี | data minimisation ; P13-02 ต้องกัน sentinel ในตรวจไฟล์ซ้ำ (§6) |
| D5 | — | ถอนความยินยอมผู้ปกครองเป็น endpoint แยก (ไม่ต้องลบบัญชี) | ผู้ปกครองอาจต้องการเลิกให้ประมวลผลข้อมูลของเด็กหนึ่งคน |

## Open decisions (defaulted — เปลี่ยนที่ config/revision ได้; หลายข้อ **ต้องให้ที่ปรึกษากฎหมายยืนยัน Q14.3**)
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | บล็อกการลบเมื่อมีภาระค้าง | บล็อก (เงิน/คลาส/ข้อพิพาท) ; ติวเตอร์ที่มียอดค้างต่ำกว่าเกณฑ์จ่าย (<฿500) ต้องรอจ่ายหรือติดต่อทีมงาน — ไม่ยึดยอดของติวเตอร์ |
| 2 | ความเห็นรีวิวเมื่อลบบัญชี | ลบข้อความ คงดาว (ไม่ระบุตัว) ; `Keep` เลือกได้ |
| 3 | ข้อความ/บันทึกของ admin ใน dispute เมื่อผู้ใช้ลบบัญชี | คงไว้จน retention 24 เดือน |
| 4 | consent ของผู้ปกครองหลังถอน | เก็บหลักฐาน (เวอร์ชัน+เวลา) ตลอด ; เนื้อหาเด็กลบ |
| 5 | IP/UA ของ join log | scrub หลัง 12 เดือน (แถวคงอยู่) |
| 6 | Notification / Live / Catalog / Payout account / Media ของผู้ใช้ | นอก P13-17 — ให้แต่ละโมดูล implement `IPersonalDataParticipant` ภายหลัง |
| 7 | ผู้ใช้ที่เป็นทั้งผู้เรียกและติวเตอร์ | ตรวจและลบทั้งสองฝั่งใน participant เดียว |
| 8 | ไฟล์รูปโปรไฟล์ที่ลบล้มหลัง commit | log Error + counter ให้ ops ลบมือ (ไม่มีตารางติดตามเพิ่ม) |

## Changelog
- **rev 1 (2026-10-19) — จัดให้ตรงโค้ดที่ build แล้ว (โค้ดชนะ; ไม่เปลี่ยนเจตนา):**
  1. ~~route ถอน consent เป็น `withdraw-guardian-consent`~~ — **ผิด (แก้คืน 2026-10-20 หลังตรวจ controller จริง):** route จริงคือ `POST /api/tutoring/learner-profiles/{learnerProfileId:guid}/withdraw-consent` ตรงกับ §7 ตามเดิม (ชื่อ endpoint/action คือ `TutoringWithdrawGuardianConsent`/`WithdrawGuardianConsent`) · body `{ "confirmation": "WITHDRAW" }`
  2. **§5.3 ข้อ 2–4 (`DISPUTES`/`DISPUTE_MESSAGES`/`DISPUTE_EVIDENCE_LINKS`) ทั้ง erasure และ withdraw-consent ไม่ stamp `DISPUTES.REDACTED_AT_UTC`** — คอลัมน์นั้นคือ "ทั้งเคสถูก redact โดย retention แล้ว" ที่ `tutoring-retention` ใช้กรอง ถ้า stamp ก่อน retention จะข้ามเคสและข้อความที่ยังไม่ถูกล้างตลอดไป · erasure ล้างเฉพาะเนื้อหา (placeholder) · `REDACTED_AT_UTC` ของ `DISPUTE_MESSAGES`/`DISPUTE_EVIDENCE_LINKS` (ระดับแถว) ยัง stamp ตามเดิม
  3. **ProblemDetails ext key ที่ใช้ = `blockers` เท่านั้น** (`reason`/`errorCode`/`traceId`/`status`/`detail` reserved) · reasons: `tutoring.erasure_blocked` (409 + `blockers[]`), `tutoring.consent_withdraw_blocked` (409), `tutoring.learner_profile_anonymised` (409 เฉพาะเจ้าของ; คนอื่น 404 เดิม)
  4. เวลาที่ stamp (`ANONYMIZED_AT_UTC`, `GUARDIAN_CONSENT_WITHDRAWN_AT_UTC`) ถูกตัดเป็นมิลลิวินาทีก่อนเก็บ เพื่อให้คำขอซ้ำ (idempotent) ตอบเวลาเดิมทุกไบต์
  5. export DTO เป็นของ Tutoring เอง (enum = string, `TimeOnly` = `"HH:mm"`) มี reflection allow-list test; hash เอกสาร KYC ของติวเตอร์ที่ถูกลบ = sentinel 64 ศูนย์ · `KycHashRetentionMonths = 0` ข้ามกิ่งตามอายุ แต่กิ่ง "ติวเตอร์ถูกลบ" ทำงานเสมอ
  6. **ส่วน "รีวิว" ของ export/erase/retention ยังไม่ทำ** (ตาราง `TUTOR_REVIEWS` ยังไม่มี) — P13-13 ต้องเพิ่ม 3 จุด: `reviews[]` ใน `TutoringPersonalDataReader`, ล้างข้อความรีวิวใน `TutoringErasureRepository`, ตรวจใน retention ถ้ามี

### rev (2026-10-20) — R1/R2 (D-25.1)
- §7: ไม่เปลี่ยน blocker การถอน (PendingPayment ที่ยังไม่จ่ายไม่บล็อกการถอน) — แต่ **จ่ายทีหลังถอนถูกปฏิเสธตอน confirm + คืนเงินเต็มอัตโนมัติ** (`RefundReason.ConsentWithdrawn`) · ถอนกับ confirm ผลัดกันด้วย lock โปรไฟล์: ถอนก่อน ⇒ คืนเงิน, confirm ก่อน ⇒ ถอนได้ 409
