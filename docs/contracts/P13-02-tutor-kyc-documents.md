# Contract: P13-02 เอกสาร KYC ติวเตอร์ (ข้อมูลอ่อนไหวสูง) — bucket แยก, เข้ารหัสไฟล์ชั้นแอป, admin stream-only, access log, purge, consent PDPA

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE) + `Siri.Integrations.Storage` (additive) + `Siri.SharedKernel` (`ISensitiveDataProtector` overload ไบต์) + `Siri.Api` (controller, rate limit, prod guard) + `Siri.Workers` (2 jobs)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..E)** · ไม่ต้อง `DESIGN_DATABASE` (§2 ระดับคอลัมน์แล้ว) · **ห้ามส่ง Antigravity**: เป็นข้อมูลส่วนบุคคลระดับสูงสุด (บัตรประชาชน + ประวัติอาชญากรรม), crypto, ด่านสิทธิ์ admin, ไฟล์ลับ — ตรงเกณฑ์ที่ประวัติโปรเจ็คชี้ว่าพลาดแล้วเสียหายหนัก

Dependency: **P13-01** (`TUTOR_PROFILE` + state machine + `TutorOnly`/`InstructorOnly` + `tutoring-upload`/`tutoring-kyc-view` rate-limit constants + `ITutorPublicCacheInvalidator` + `TutorReadinessCalculator`) · อ่านคู่กับ `docs/SECURITY.md` §6.1 และ `docs/TUTORING.md` §3.1/§7 · ดัชนีกลาง `P13-README.md`

---

## 0. กฎเหล็กของ contract นี้ (ตรวจด้วยเทสต์ ไม่ใช่แค่เอกสาร)

1. **ไฟล์ KYC อยู่ใน bucket R2 แยก (`Storage:R2Kyc`) ที่ไม่มี public domain/custom domain/public access** และ **ไม่มี presigned URL ในทุกกรณี** — `IKycFileStorage` **ไม่มีเมธอด `GetSignedUrlAsync` โดยออกแบบ** (ไม่สืบทอด `IFileStorage` — ดู Deviation D2)
2. **ไฟล์ถูกเข้ารหัส AES-256-GCM ชั้นแอปก่อนออกจากเครื่อง API** — object ใน R2 เป็น ciphertext เสมอ (เทสต์: byte ที่ส่งเข้า storage ไม่มี magic ของ PDF/JPEG/PNG และไม่มี plaintext ตัวอย่าง)
3. **ติวเตอร์อัปโหลดได้แต่ไม่มีทางอ่านไฟล์ของตัวเองกลับ** (ไม่มี route ฝั่งติวเตอร์ที่คืนเนื้อหา/URL/ชื่อไฟล์/key — เทสต์ reflection บน controller)
4. **admin เปิดดูได้ผ่าน endpoint เดียว (stream ถอดรหัส) และ "เขียน access log สำเร็จก่อน" จึงส่งไบต์แรก** (fail-closed: log ล้ม = ไม่ส่งไฟล์)
5. **ห้าม log ชื่อไฟล์ดิบ เนื้อหา เลขบัตร** — ระบบไม่เก็บชื่อไฟล์เดิมเลย (แค่ type + content-type ที่ server ตรวจจาก magic bytes)
6. **ไฟล์ถูกลบ (purge) ตามกำหนด** หลังตัดสิน — แถวในฐานข้อมูลยังอยู่ (เก็บผลตรวจ/วันที่/ผู้ตัดสิน/hash) ตามหลัก data minimization; ห้าม hard-delete แถว
7. **การตัดสินทุกครั้งเขียน `SECURITY_AUDIT`** (ไม่มีเนื้อหาเอกสารใน detail) และแจ้งติวเตอร์ทางอีเมล+ในแอป
8. **ปิดไว้เป็นค่าเริ่มต้น** (`Tutoring:Kyc:Enabled=false`) และใน Production จะเปิดได้ก็ต่อเมื่อยืนยันว่า Admin 2FA ถูกบังคับแล้ว (`AdminTwoFactorEnforced=true` — X-39: ตอนนี้ `TwoFactorEnabled` ยังไม่ถูก enforce และ JWT ไม่มี claim 2FA จึงตรวจในโค้ดไม่ได้ ต้องเป็นคำยืนยันของเจ้าของ) — บันทึกใน "Open decisions"

---

## 1. Scope & task IDs
**ใน:** `TUTOR_KYC_CASES`/`TUTOR_DOCUMENTS`/`TUTOR_DOCUMENT_ACCESS_LOGS` + migration `AddTutorKyc` · `IKycFileStorage` + `R2KycFileStorage` + `R2KycStorageOptions` + `AddKycFileStorage` · `ISensitiveDataProtector.EncryptBytes/DecryptBytes` · `KycFileValidator` · `TutorKycCaseService`/`TutorDocumentService` · endpoint ติวเตอร์ 5 + admin 6 · jobs `tutoring-kyc-purge`, `tutoring-kyc-expiry` · `TutoringKycProductionRequirements` · ต่อยอด `TutorReadinessCalculator` (รหัส `kyc_*`) · อีเมล/แจ้งเตือนในแอป
**นอก:** FE · virus-scan engine (Q9 ยังไม่มี — ดู Open decisions #1) · การตรวจ OCR/เทียบหน้า · API ภายนอกตรวจประวัติอาชญากรรม · การนำส่งหน่วยงานรัฐ

---

## 2. Schema delta — migration `AddTutorKyc` (additive)
> กฎเดียวกับ P13-01 §2 (UPPERCASE, `IAuditable` PascalCase, `timestamptz(3)`, FK `NoAction`, ชื่อ constraint ตั้งเอง ≤63, ไม่มี cascade, ไม่มี DELETE แถว)

### 2.1 `TUTORING.TUTOR_KYC_CASES` (entity `TUTOR_KYC_CASE : IAuditable`)
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `CASE_ID` | uuid PK | no | |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` NoAction (`FK_TUTOR_KYC_CASES_TUTOR`) |
| `ATTEMPT_NO` | int | no | เริ่ม 1 · เพิ่มทีละ 1 ต่อติวเตอร์ |
| `STATUS` | varchar(16) | no | `KycCaseStatus`: `Draft\|Submitted\|InReview\|NeedsInfo\|Approved\|Rejected` (**`Draft` เพิ่มจาก TUTORING.md** — D1) |
| `SUBMITTED_AT_UTC` | timestamptz(3) | yes | null ขณะ Draft |
| `CONSENT_VERSION` | varchar(32) | no | เวอร์ชันข้อความ PDPA ที่ผู้ใช้กดยอมรับ |
| `CONSENT_AT_UTC` | timestamptz(3) | no | |
| `DECIDED_BY_USER_ID` | uuid | yes | admin ที่ตัดสินล่าสุด (รวม NeedsInfo) |
| `DECIDED_AT_UTC` | timestamptz(3) | yes | |
| `DECISION_NOTE` | varchar(1000) | yes | **ผู้สมัครเห็นข้อความนี้** (UI แอดมินต้องเตือน) |
| `ROW_VERSION` | bytea | no | **เพิ่ม** (D8) — กัน admin สองคนตัดสินพร้อมกัน |
| audit | | | |
Index/constraint: `PK_TUTOR_KYC_CASES` · `UQ_TUTOR_KYC_CASES_ATTEMPT` (`TUTOR_ID`,`ATTEMPT_NO`) · **partial UQ `UQ_TUTOR_KYC_CASES_OPEN`** (`TUTOR_ID`) `HasFilter("\"STATUS\" IN ('Draft','Submitted','InReview','NeedsInfo')")` (หนึ่ง case เปิดต่อติวเตอร์) · `IX_TUTOR_KYC_CASES_QUEUE` (`STATUS`,`SUBMITTED_AT_UTC`) · CHECK `CK_TUTOR_KYC_CASES_ATTEMPT` (`ATTEMPT_NO` >= 1) · CHECK `CK_TUTOR_KYC_CASES_DECIDED` (`STATUS` NOT IN ('Approved','Rejected') OR (`DECIDED_AT_UTC` IS NOT NULL AND `DECIDED_BY_USER_ID` IS NOT NULL))

### 2.2 `TUTORING.TUTOR_DOCUMENTS` (entity `TUTOR_DOCUMENT : IAuditable`)
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `DOCUMENT_ID` | uuid PK | no | UUIDv7 — ใช้เป็น AAD และ HKDF purpose ของการเข้ารหัส |
| `CASE_ID` | uuid | no | FK → `TUTOR_KYC_CASES` NoAction (`FK_TUTOR_DOCUMENTS_CASE`) |
| `TYPE` | varchar(16) | no | `KycDocumentType`: `IdCard\|Diploma\|CriminalRecord\|Certificate\|Other` |
| `STORAGE_KEY` | varchar(300) | no | `kyc/{tutorId:N}/{caseId:N}/{documentId:N}.bin` (server สร้าง) — **ไม่ออกนอก API ใดทั้งสิ้น** |
| `CONTENT_TYPE` | varchar(40) | no | **เพิ่ม** (D5) · `application/pdf\|image/jpeg\|image/png` ตัดสินจาก magic bytes ไม่ใช่ที่ client อ้าง |
| `SIZE_BYTES` | bigint | no | **เพิ่ม** · ขนาด plaintext · CHECK 1–20971520 |
| `CONTENT_SHA256` | varchar(64) | no | hex ของ plaintext · ใช้ตรวจ integrity หลังถอดรหัส + สัญญาณไฟล์ซ้ำข้ามติวเตอร์ (§6.7) |
| `STATUS` | varchar(12) | no | `KycDocumentStatus`: `Pending\|Approved\|Rejected` |
| `EXPIRES_AT_UTC` | timestamptz(3) | yes | วันหมดอายุของเอกสาร (ผู้ใช้กรอกเป็นวันที่ → สิ้นวันตามเวลาไทยแปลงเป็น UTC) |
| `EXPIRY_REMINDER_SENT_AT_UTC` | timestamptz(3) | yes | **เพิ่ม** — idempotency ของ job เตือน |
| `PURGE_AFTER_UTC` | timestamptz(3) | yes | ตั้งตอนตัดสิน Approve/Reject |
| `PURGED_AT_UTC` | timestamptz(3) | yes | ไฟล์ถูกลบแล้ว (แถวยังอยู่) |
| audit | | | |
Index: `PK_TUTOR_DOCUMENTS` · `IX_TUTOR_DOCUMENTS_CASE` (`CASE_ID`) · partial `IX_TUTOR_DOCUMENTS_PURGE_DUE` (`PURGE_AFTER_UTC`) `HasFilter("\"PURGED_AT_UTC\" IS NULL AND \"PURGE_AFTER_UTC\" IS NOT NULL")` · partial `IX_TUTOR_DOCUMENTS_EXPIRY` (`EXPIRES_AT_UTC`) `HasFilter("\"EXPIRES_AT_UTC\" IS NOT NULL AND \"EXPIRY_REMINDER_SENT_AT_UTC\" IS NULL")` · `IX_TUTOR_DOCUMENTS_SHA256` (`CONTENT_SHA256`) · CHECK `CK_TUTOR_DOCUMENTS_SIZE`
Domain: `static Create(caseId, type, storageKey, contentType, sizeBytes, sha256, expiresAtUtc)` · `Approve()`/`Reject()` (จาก `Pending` เท่านั้น — admin ตัดสินซ้ำภายใน case เดียวกันก่อนตัดสินสุดท้ายได้ตาม §5.5) · `SchedulePurge(afterUtc)` · `MarkPurged(IClock)` (ไม่ทำซ้ำ) · `bool IsPurged`

### 2.3 `TUTORING.TUTOR_DOCUMENT_ACCESS_LOGS` (entity `TUTOR_DOCUMENT_ACCESS_LOG` — **append-only**, ไม่ implement IAuditable/ISoftDelete; มีแค่ `static Record(...)`)
| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `ACCESS_LOG_ID` | uuid PK | no | |
| `DOCUMENT_ID` | uuid | no | FK → `TUTOR_DOCUMENTS` NoAction (`FK_TUTOR_DOC_ACCESS_LOGS_DOC`) |
| `ACCESSED_BY_USER_ID` | uuid | **yes** | null = ระบบ (job purge) — D3 |
| `ACCESSED_AT_UTC` | timestamptz(3) | no | |
| `ACTION` | varchar(12) | no | `View\|Download\|Purge` |
| `IP_ADDRESS` | varchar(64) | yes | `RemoteIpAddress` (อาจเป็น IP proxy — ช่องว่างเดิมของระบบ) · D4 (TUTORING.md เรียก `IP`) |
Index: `PK_TUTOR_DOCUMENT_ACCESS_LOGS` · `IX_TUTOR_DOC_ACCESS_LOGS_DOC` (`DOCUMENT_ID`,`ACCESSED_AT_UTC`) · **ห้าม UPDATE/DELETE** · เทสต์: entity ไม่มี mutator

ชื่อ migration: `AddTutorKyc` · ลำดับ: สร้างหลัง `AddTutoringCore` ผ่านแล้วเท่านั้น

---

## 3. ชิ้นส่วนใหม่ที่ใช้ร่วม (additive — ระบุตำแหน่ง/ลายเซ็นตรง ๆ)

### 3.1 `ISensitiveDataProtector` — overload ไบต์ (`Siri.SharedKernel/SensitiveDataProtector.cs`)
```csharp
public interface ISensitiveDataProtector
{
    // ... ของเดิม (Encrypt/Decrypt/MaskAccountNumber) ไม่เปลี่ยน ...

    /// <summary>เข้ารหัสไบต์ด้วย AES-256-GCM. subkey = HKDF-SHA256(master, info = "siri:" + purpose) (master = DataProtection:EncryptionKeyBase64).
    /// ผลลัพธ์ = [0x01 version][12B nonce สุ่ม][16B tag][ciphertext]. associatedData ถูก authenticate แต่ไม่ถูกเก็บ — ผู้เรียกต้องส่งค่าเดิมตอนถอดรหัส.</summary>
    byte[] EncryptBytes(ReadOnlySpan<byte> plain, string purpose, ReadOnlySpan<byte> associatedData)
        => throw new NotSupportedException("This ISensitiveDataProtector does not support byte encryption.");

    /// <summary>ถอดรหัสผลลัพธ์ของ EncryptBytes. blob สั้นเกิน/version ผิด/tag ไม่ตรง (ถูกแก้ไข, purpose หรือ AAD ผิด) ⇒ throw CryptographicException.</summary>
    byte[] DecryptBytes(ReadOnlySpan<byte> blob, string purpose, ReadOnlySpan<byte> associatedData)
        => throw new NotSupportedException("This ISensitiveDataProtector does not support byte encryption.");
}
```
- **default interface method** เพื่อให้ `ThrowingProtector` ใน `InstructorGoogleAccountServiceTests` (implementer เดียวในเทสต์) ยัง compile · `SensitiveDataProtector` override ทั้งสอง · ใช้ BCL ล้วน (`AesGcm`, `HKDF.DeriveKey`) — **ไม่เพิ่ม package** (D-25 อนุมัติ "AES-GCM ไม่เพิ่ม package") · `purpose` ว่าง ⇒ `ArgumentException`
- KYC ใช้ `purpose = $"tutoring-kyc|{documentId:N}"` (subkey ต่อเอกสาร) และ `associatedData = documentId.ToByteArray()` (ผูก ciphertext กับเอกสารนั้น — สลับ blob ข้ามแถวไม่ได้)
- ข้อจำกัดที่รับไว้: master key เดียวกับเลขบัญชีธนาคาร (`DataProtection:EncryptionKeyBase64`) — หมุนคีย์ = ต้อง re-encrypt ทั้งหมด (version byte เผื่อไว้) → บันทึกใน Open decisions #6
- unit test: round-trip (0 ไบต์, 1 ไบต์, 10 MiB) · nonce ต่างกันทุกครั้ง (เข้ารหัสซ้ำ 100 ครั้ง ไม่ซ้ำ) · แก้ 1 ไบต์ที่ header/nonce/tag/ciphertext ⇒ throw · AAD ต่าง ⇒ throw · purpose ต่าง ⇒ throw · ciphertext ไม่มีข้อความตัวอย่าง · เทียบ known-answer ของ HKDF (RFC 5869 test vector 1 ผ่าน wrapper ภายใน)

### 3.2 `Siri.Integrations.Storage` — `IKycFileStorage` (ไฟล์ใหม่ ไม่แตะ `IFileStorage`/`R2FileStorage`)
```csharp
namespace Siri.Integrations.Storage;

/// <summary>Storage ของเอกสาร KYC เท่านั้น. ไม่มี signed URL โดยตั้งใจ — ผู้เรียกต้องดึงไบต์มาถอดรหัสเอง.</summary>
public interface IKycFileStorage
{
    /// <summary>เก็บ ciphertext ที่เข้ารหัสแล้ว (Content-Type: application/octet-stream, ไม่มี Content-Disposition) — ทับ key เดิมได้.</summary>
    Task<Result> UploadAsync(string key, ReadOnlyMemory<byte> encryptedContent, CancellationToken cancellationToken);
    /// <summary>อ่าน object ทั้งก้อน (จำกัด MaxObjectBytes = 25 MiB; เกิน ⇒ Failure). ไม่พบ ⇒ Failure code storage.object_not_found.</summary>
    Task<Result<byte[]>> DownloadAsync(string key, CancellationToken cancellationToken);
    /// <summary>ลบ object — idempotent (ไม่พบ = สำเร็จ).</summary>
    Task<Result> DeleteAsync(string key, CancellationToken cancellationToken);
}
```
- `R2KycStorageOptions` (section **`Storage:R2Kyc`**): `AccountId`, `AccessKeyId`, `SecretAccessKey`, `BucketName`, `Endpoint` (โครงเดียวกับ `R2StorageOptions` รวม `IsPlaceholder`/`GetMissingSettings`/`IsConfigured`/`ResolveServiceUrl`) — **ใช้ R2 API token แยก scoped Object Read & Write เฉพาะ bucket นี้**
- `R2KycFileStorage : IKycFileStorage, IDisposable` — `AmazonS3Client` แบบ lazy (config เหมือน `R2FileStorage.CreateClient`: path-style, region `auto`, `WHEN_REQUIRED` checksums, `DisablePayloadSigning`), ใช้ `R2FileStorage.IsValidKey` (internal static, assembly เดียวกัน) **และบังคับ prefix `kyc/`**; error จาก provider log แต่ไม่คืน (`StorageErrors.OperationFailed()`); ตัวสร้าง `internal` สำหรับ test seam `HttpClientFactory` เหมือนเดิม; ไม่มี EF
- `StorageServiceCollectionExtensions.AddKycFileStorage(IConfiguration)`: `AddOptions<R2KycStorageOptions>().Bind(…).ValidateOnStart()` (ไม่ `[Required]` — host ที่ไม่มี bucket ต้อง boot ได้ เหมือน `R2StorageOptions`) + `TryAddSingleton<IKycFileStorage, R2KycFileStorage>()` · `AddTutoringModule` เรียกเมธอดนี้
- unit test (แพทเทิร์น `R2FileStorageTests`): upload/download/delete ผ่าน HTTP stub, key นอก `kyc/` ⇒ `InvalidKey`, ไม่ตั้งค่า ⇒ `storage.provider_not_configured`, download เกินเพดาน ⇒ Failure, **ไม่มี method signed URL** (reflection)
- ข้อกำหนด infra (runbook / P13-32): bucket KYC **ไม่เปิด public access / custom domain / r2.dev**, ใช้ token คนละตัวกับ `Storage:R2`, เปิด object lock/versioning **ไม่** (ต้องลบจริงได้)

### 3.3 `KycFileValidator` (pure, `Tutoring.Application`; ไม่ใช้ `AttachmentFileValidator` ของ Catalog — อ้างข้ามโมดูลไม่ได้)
`Validate(string extension, string clientContentType, ReadOnlySpan<byte> bytes, long maxBytes) → Result<KycFileInfo(contentType, extension)>`:
1. ขนาด 1..`MaxFileBytes` (10 MiB)
2. นามสกุล ∈ {`.pdf`,`.jpg`,`.jpeg`,`.png`} (case-insens; ชื่อไฟล์ไม่ถูกเก็บ — ใช้แค่หานามสกุล)
3. **magic bytes ต้องตรงชนิด:** PDF `25 50 44 46 2D` (`%PDF-`) · JPEG `FF D8 FF` · PNG `89 50 4E 47 0D 0A 1A 0A` — และ **ต้องตรงกับนามสกุล + content-type ที่ client อ้าง** (ไม่ตรง ⇒ ปฏิเสธ; ไม่ "แก้ให้")
4. ปฏิเสธ signature ของ executable (MZ, ELF, Mach-O, Java class) แม้นามสกุลจะถูก
5. PDF: ถ้า `RejectActivePdfContent=true` (default) ปฏิเสธเมื่อพบโทเค็นไบต์ `/JavaScript` `/JS` `/Launch` `/EmbeddedFile` `/OpenAction` `/AA` ในไฟล์ (ป้องกัน admin ที่เปิดดูในเบราว์เซอร์ — เป็น heuristic, ไม่ใช่ virus scan)
- ผลคืน `contentType` ที่ **server กำหนดเอง** จากชนิดที่ตรวจพบ · error → 400 `tutoring.kyc.file_rejected` พร้อม ext `detail` ∈ {`size`,`type`,`signature`,`active_content`} (ไม่ใช้ `detail` — ชื่อสงวนของ ProblemDetails ถูกทิ้งเงียบ) (ไม่บอก offset/ข้อความละเอียด)
- unit test: ตารางเมทริกซ์ (ext × signature × content-type), `.png` ที่เป็น HTML/SVG, `.pdf` ที่ขึ้นต้นด้วย `MZ`, polyglot (`%PDF-` + `<script>`), 0 ไบต์, 10 MiB พอดี/+1, PDF มี `/JavaScript`

---

## 4. Flow (สถานะ case ↔ สถานะโปรไฟล์)

```
ติวเตอร์ (profile = Draft|NeedsInfo|Rejected, ไม่มี case เปิด)
  POST kyc/cases {consentVersion}           → case Draft  (ATTEMPT_NO = max+1)
  POST kyc/cases/{id}/documents ×N           → documents Pending
  POST kyc/cases/{id}/submit                 → case Submitted, SUBMITTED_AT=now ; profile.SubmitForVerification(...) → PendingVerification
admin
  POST admin/kyc/cases/{id}/start-review     → case InReview (ไม่บังคับ)
  GET  admin/kyc/documents/{id}/content      → stream + access log
  POST admin/kyc/cases/{id}/decision
        Approve   → case Approved ; profile.Verify ; docs: PURGE_AFTER = now + retention(type)
        Reject    → case Rejected ; profile.Reject ; docs: PURGE_AFTER = now + retention(type)
        NeedsInfo → case NeedsInfo; profile.RequestMoreInfo ; (ไม่ตั้ง purge — ติวเตอร์ต้องส่งเอกสารเพิ่มใน case เดิม)
ติวเตอร์ (NeedsInfo): อัปโหลดเอกสารเพิ่ม/ลบ Pending → POST …/submit อีกครั้ง → case Submitted, profile PendingVerification
```
- Case ใหม่เริ่มได้เมื่อ **ไม่มี case เปิด** (`Draft|Submitted|InReview|NeedsInfo`) และ `profile.STATUS ∈ {Draft, NeedsInfo, Rejected}` (NeedsInfo ที่ไม่มี case เปิดเกิดจาก `RequireReverification`) ⇒ ไม่ตรง 409 `tutoring.kyc.not_required` · `ATTEMPT_NO` เกิน `MaxAttempts` (5) ⇒ 409 `tutoring.kyc.attempts_exceeded`
- เอกสารต้องมีตามชุด `RequiredDocumentTypes` (default `IdCard`, `Diploma`, `CriminalRecord`) อย่างน้อยชนิดละ 1 ก่อน submit · `Certificate`/`Other` ไม่บังคับ · สูงสุด `MaxDocumentsPerCase` (10) และ `MaxDocumentsPerType` (3)
- **แก้/ลบเอกสารได้เฉพาะ case `Draft`/`NeedsInfo`** และเฉพาะเอกสารที่ `Pending` หรือ `Rejected` (เอกสารที่ `Approved` แล้วใน NeedsInfo ห้ามลบ/ทับ)
- ติวเตอร์ลบเอกสารเอง = ลบ object + `MarkPurged` + access log (`Purge`, user = ติวเตอร์) — แถวยังอยู่
- Approve ต้อง: ไม่มีเอกสารที่ยังไม่ purge ค้าง `Pending` และแต่ละชนิดใน `RequiredDocumentTypes` มี `Approved` ≥1 (admin ส่ง `documents[]` กำกับสถานะรายเอกสารมากับ decision)

---

## 5. Services & ลำดับ transaction (พฤติกรรมที่ต้องตรง)

`TutorKycCaseService` (aggregate case) · `TutorDocumentService` (aggregate document) · `KycPurgeService` · `KycExpiryService` · ทุกอันหา tutor จาก `USER_ID` (`IUserContext`) — ไม่มี `tutorId` ใน route ติวเตอร์

### 5.1 อัปโหลดเอกสาร (`UploadAsync(userId, caseId, type, expiresOn?, file)`)
```
0. Enabled? ไม่ → 503 tutoring.kyc.disabled
1. tutor = โปรไฟล์ของ userId (ไม่มี → 404 tutoring.tutor_profile_not_found)
2. case = SELECT … WHERE CASE_ID=@caseId AND TUTOR_ID=@tutor.Id   (query เดียว)   ไม่พบ/ไม่ใช่ของฉัน → 404 tutoring.not_found (ข้อความเดียวกัน)
3. case.STATUS ∈ {Draft, NeedsInfo} มิฉะนั้น 409 tutoring.kyc.case_not_editable ; นับเอกสาร (ไม่นับที่ purged) < MaxDocumentsPerCase/Type มิฉะนั้น 409 tutoring.kyc.document_limit
4. อ่านไฟล์เป็นไบต์ (≤ MaxFileBytes ผ่าน RequestSizeLimit + ตรวจซ้ำ) → KycFileValidator → 400 file_rejected
   expiresOn: ถ้ามี ต้อง > วันนี้ (Bangkok) และ ≤ +30 ปี มิฉะนั้น 400 tutoring.kyc.expiry_invalid ; แปลงเป็นสิ้นวัน Bangkok → UTC
5. [Enabled: RequireVirusScan=true] IAttachmentVirusScanner.ScanBytesAsync — default false (Open decision #1)
6. documentId = UuidV7 ; sha = SHA-256(plain) ; blob = protector.EncryptBytes(plain, $"tutoring-kyc|{documentId:N}", documentId.ToByteArray())
7. IKycFileStorage.UploadAsync($"kyc/{tutorId:N}/{caseId:N}/{documentId:N}.bin", blob)     ล้ม → 503 (ไม่สร้างแถว)
8. TUTOR_DOCUMENT.Create(...) ; SaveChanges     ล้ม → IKycFileStorage.DeleteAsync(key) แบบ best-effort + log Error(documentId, caseId) → 500/503
9. 201 KycDocumentResponse   (ไม่มี key/hash/ชื่อไฟล์)   — ไม่เขียน audit (ไม่ใช่การเข้าถึงเนื้อหา)
```
ลำดับ upload→insert (ไม่ใช่กลับกัน) เพื่อไม่ให้มีแถวชี้ไปยัง object ที่ไม่มี · object กำพร้า (ล้มระหว่าง 7-8 แล้ว delete ล้มซ้ำ) ยอมรับเป็นความเสี่ยงต่ำ — ปิดด้วยงาน reconcile ใน P13-17 (retention) ไม่ใช่ที่นี่
### 5.2 submit
```
case(ของฉัน) STATUS ∈ {Draft, NeedsInfo} ; ชนิดเอกสารที่ขาด (RequiredDocumentTypes − ชนิดที่มีเอกสาร non-purged) ≠ ∅ → 409 tutoring.kyc.documents_missing ext {missingTypes}
readiness = TutorReadinessCalculator(profile, activeOfferingCount) มี blocker → 409 tutoring.kyc.profile_incomplete ext {blockers}
profile.SubmitForVerification(activeOfferingCount, clock) ; case.Submit(clock) ; SaveChanges   (ROW_VERSION ชน → 409 tutoring.concurrent_update)
(ถ้ามี Tutoring:Kyc:OpsNotificationEmail) stage อีเมลแจ้ง ops "มีเคส KYC รอตรวจ" (ไม่มีข้อมูลส่วนตัว — แค่จำนวน/ลิงก์ไปคิว)
```
### 5.3 ดูเนื้อหา (`GetContentAsync(adminUserId, documentId, download, ip)`) — ลำดับ **บังคับ**
```
1. Enabled && (ไม่ใช่ Production || AdminTwoFactorEnforced) มิฉะนั้น 503 tutoring.kyc.disabled
2. doc = SELECT document (+case,tutor) WHERE DOCUMENT_ID=@id        ไม่พบ → 404 tutoring.not_found
3. doc.IsPurged → 410 tutoring.kyc.document_purged  (ไม่เขียน log)
4. TUTOR_DOCUMENT_ACCESS_LOG.Record(documentId, adminUserId, now, download ? Download : View, ip) ; SaveChanges     ล้ม → 503 tutoring.kyc.log_unavailable (**ไม่ส่งเนื้อหา**)
5. cipher = IKycFileStorage.DownloadAsync(doc.STORAGE_KEY)             ล้ม → 503 tutoring.kyc.document_unreadable (log Error documentId เท่านั้น)
6. plain = protector.DecryptBytes(cipher, purpose, aad)                CryptographicException → 503 document_unreadable (log Error documentId)
7. SHA-256(plain) ต้องเท่ากับ CONTENT_SHA256 มิฉะนั้น 503 document_unreadable (log Error "integrity")
8. headers (ด้านล่าง) ; return Results.Bytes(plain, doc.CONTENT_TYPE)
```
Headers บังคับ (override middleware): `Cache-Control: no-store, no-cache, max-age=0` · `Pragma: no-cache` · `X-Content-Type-Options: nosniff` · `Content-Security-Policy: default-src 'none'; sandbox` · `Referrer-Policy: no-referrer` · `Content-Disposition: inline; filename="kyc-{documentId:N}.{pdf|jpg|png}"` (หรือ `attachment` เมื่อ `download=true`) — ชื่อไฟล์สร้างจาก id ไม่ใช่ชื่อเดิม · ไม่ตอบ `Content-Length` ที่เกินจริง (ใช้ของ Results.Bytes) · **ไม่เขียนเนื้อหา/ชื่อ/hash ลง log ทุกระดับ**
### 5.4 start-review
`Submitted → InReview` (idempotent สำหรับ `InReview`; สถานะอื่น 409 `tutoring.kyc.case_not_decidable`) · ไม่เขียน audit (ไม่ใช่การตัดสิน)
### 5.5 decision (`DecideAsync(adminUserId, caseId, DecideKycCaseRequest, ip)`) — transaction เดียว (`ExecuteInTransactionAsync` แพทเทิร์น `OrderRepository`; commit ผ่าน audit เป็นขั้นสุดท้าย — P13-01 F6)
```
1. case(+documents) tracked ; ไม่พบ → 404 ; STATUS Approved|Rejected → 409 tutoring.kyc.case_already_decided ; STATUS ∉ {Submitted, InReview} → 409 case_not_decidable
2. entry.Property(ROW_VERSION).OriginalValue = decode(request.RowVersion)    (admin อื่นตัดสินไปก่อน → DbUpdateConcurrencyException → 409 case_already_decided)
3. apply request.Documents[] (documentId ต้องเป็นของ case นี้ มิฉะนั้น 400 validation ; ตั้ง Approve()/Reject() เฉพาะ Pending→…)
4. ตรวจกฎตามชนิด decision:
     Approve  : เอกสาร non-purged ไม่มี Pending เหลือ ; ชนิดใน RequiredDocumentTypes มี Approved ≥1  → ไม่ผ่าน 400 tutoring.kyc.documents_undecided ext {types}
     Reject   : note ไม่ว่าง (≤1000)  → 400 tutoring.kyc.note_required
     NeedsInfo: note ไม่ว่าง          → 400 tutoring.kyc.note_required
5. case.Decide(decision, adminUserId, note, clock)
6. profile (ต้องอยู่ PendingVerification) : Approve→Verify ; Reject→Reject(note) ; NeedsInfo→RequestMoreInfo(note)   ไม่อยู่ PendingVerification → 409 tutoring.kyc.profile_state_conflict
7. Approve|Reject : ทุกเอกสาร non-purged → SchedulePurge(now + (type ∈ {IdCard,CriminalRecord} ? IdentityDocumentRetentionDays : OtherDocumentRetentionDays))
8. stage อีเมล (IEmailOutbox + EmailTemplateRenderer.RenderLayout, HtmlEncode note) + IUserNotificationOutbox.Stage ให้เจ้าของโปรไฟล์ : templateKey tutoring-kyc-approved|tutoring-kyc-rejected|tutoring-kyc-needs-info ; link = {PublicBaseUrl}/instructor/tutoring/onboarding
9. ISecurityAuditContract.RecordAuditAsync("tutoring.kyc.approved|rejected|needs_info", adminUserId, json{caseId, tutorId, attemptNo, documents:[{type,status}]}, ip)   ← SaveChanges รวมทุกอย่างข้างบน
10. (หลัง commit) ITutorPublicCacheInvalidator.InvalidateProfilesAsync() เมื่อ Approve
```
### 5.6 Jobs (ลงทะเบียนใน `RecurringJobIds` + `RecurringJobsRegistration`; `[DisableConcurrentExecution]`; ใช้ `IClock`)
| id | คลาส | cron | งาน |
|---|---|---|---|
| `tutoring-kyc-purge` | `TutoringKycPurgeJob` → `KycPurgeService.PurgeDueAsync` | `Cron.Hourly(10)` | `WHERE PURGED_AT_UTC IS NULL AND PURGE_AFTER_UTC <= now ORDER BY PURGE_AFTER_UTC TAKE 100` (วนสูงสุด 5 รอบ/run): `IKycFileStorage.DeleteAsync` (idempotent) สำเร็จ ⇒ `MarkPurged` + access log (`Purge`, user=null) + `SaveChanges` **ต่อเอกสาร** (ล้มตัวเดียวไม่ rollback ตัวอื่น; ล้มที่ storage ⇒ ข้าม log warn รอบหน้าลองใหม่) · timeout 1500 วิ |
| `tutoring-kyc-expiry` | `TutoringKycExpiryJob` → `KycExpiryService.RunAsync` | `Cron.Daily(2, 30)` | เอกสาร `Approved` ที่ `EXPIRES_AT_UTC <= now + ExpiryReminderDays(30)` และ `EXPIRY_REMINDER_SENT_AT_UTC IS NULL` ของติวเตอร์ที่ `Verified` ⇒ stage อีเมล+แจ้งเตือน `tutoring-kyc-expiring` + ตั้ง flag ใน `SaveChanges` เดียว (idempotent) · ถ้า `EXPIRES_AT_UTC <= now` และ `ExpiryAction=RequireReverification` ⇒ `profile.RequireReverification("kyc_document_expired")` + แจ้งเตือน + audit `tutoring.kyc.reverification_required` (ค่าเริ่มต้น `ReminderOnly` — ไม่หยุดรับงานเอง) |
```csharp
// RecurringJobIds.cs (ต่อท้ายค่าคงที่เดิมและใน All):
public const string TutoringKycPurge  = "tutoring-kyc-purge";
public const string TutoringKycExpiry = "tutoring-kyc-expiry";
// RecurringJobsRegistration.cs (ต่อจากข้อ 14, ใส่ using Siri.Modules.Tutoring.Infrastructure;):
recurringJobManager.AddOrUpdate<TutoringKycPurgeJob>(RecurringJobIds.TutoringKycPurge, job => job.RunAsync(CancellationToken.None), Cron.Hourly(10));
recurringJobManager.AddOrUpdate<TutoringKycExpiryJob>(RecurringJobIds.TutoringKycExpiry, job => job.RunAsync(CancellationToken.None), Cron.Daily(2, 30));
```
ลงทะเบียน job class เป็น `AddScoped` ใน `AddTutoringModule` (Hangfire activator ต้องหา DI เจอ — ทั้ง Api และ Workers เรียก `AddTutoringModule`) · อัปเดตเทสต์ `RecurringJobIds.All` ที่มีอยู่ (ถ้ามี test ตรวจจำนวน)

---

## 6. Endpoint ที่ FROZEN
ทุก endpoint: error = RFC 9457 + `traceId` + `errorCode` + `reason` · ทุก response ของ endpoint KYC: `Cache-Control: no-store` · `tutoring.kyc.disabled` (503) เมื่อ `Enabled=false` · enum เป็น string · เวลา UTC `…Z`

### 6.1 ติวเตอร์ — `[Authorize(Policy = InstructorOnly)]` base `/api/tutoring/tutor/kyc`
| # | Method + path | Request | Rate | สำเร็จ | Error |
|---|---|---|---|---|---|
| 1 | `GET /tutor/kyc` | — | `tutoring-user` | 200 `TutorKycStatusResponse` | 404 `tutoring.tutor_profile_not_found` |
| 2 | `POST /tutor/kyc/cases` | `{ "consentVersion": "2026-10-v1" }` | `tutoring-user` | 201 `KycCaseResponse` | 409 `tutoring.kyc.consent_outdated` (ext `currentVersion`) · `tutoring.kyc.case_open` (ext `caseId`) · `tutoring.kyc.not_required` · `tutoring.kyc.attempts_exceeded` |
| 3 | `POST /tutor/kyc/cases/{caseId}/documents` | multipart: `type`, `expiresOn?` (yyyy-MM-dd), `file` · `[RequestSizeLimit]`/`[RequestFormLimits]` = ค่าคงที่ compile-time `TutoringKycOptions.MaxUploadRequestBodyBytes` (20 MiB + 64 KiB = เพดานสูงสุดที่ CHECK/config อนุญาต) ; `MaxFileBytes` จริงตรวจที่ `KycFileValidator` | `tutoring-upload` | 201 `KycDocumentResponse` | 400 `tutoring.kyc.file_rejected` / `tutoring.kyc.expiry_invalid` · 404 `tutoring.not_found` · 409 `tutoring.kyc.case_not_editable` / `tutoring.kyc.document_limit` · 503 `storage.provider_not_configured` |
| 4 | `DELETE /tutor/kyc/cases/{caseId}/documents/{documentId}` | — | `tutoring-user` | 204 | 404 `tutoring.not_found` · 409 `tutoring.kyc.case_not_editable` / `tutoring.kyc.document_locked` (Approved แล้ว) |
| 5 | `POST /tutor/kyc/cases/{caseId}/submit` | — | `tutoring-user` | 200 `KycCaseResponse` | 404 · 409 `tutoring.kyc.documents_missing` (ext `missingTypes`) / `tutoring.kyc.profile_incomplete` (ext `blockers`) / `tutoring.kyc.case_not_editable` / `tutoring.concurrent_update` |
**ไม่มี route ฝั่งติวเตอร์ที่คืนเนื้อหา/URL ของเอกสาร** (เทสต์ reflection: ไม่มี action ใน `TutorKycController` ที่คืน `FileResult`/`Results.File`/`Results.Bytes`/`Stream`)

### 6.2 แอดมิน — `[Authorize(Policy = AdminOnly)]` base `/api/tutoring/admin/kyc`
| # | Method + path | Request | Rate | สำเร็จ | Error |
|---|---|---|---|---|---|
| 6 | `GET /admin/kyc/cases?status=Submitted,InReview&page=1&pageSize=20` | — | `tutoring-user` | 200 `PagedResult<AdminKycCaseListItem>` (เรียง `SUBMITTED_AT_UTC` เก่าสุดก่อน; default status = `Submitted,InReview`; pageSize ≤100) | |
| 7 | `GET /admin/kyc/cases/{caseId}` | — | `tutoring-user` | 200 `AdminKycCaseDetail` (+`rowVersion`) | 404 `tutoring.not_found` |
| 8 | `POST /admin/kyc/cases/{caseId}/start-review` | — | `tutoring-user` | 200 `AdminKycCaseDetail` | 404 · 409 `tutoring.kyc.case_not_decidable` |
| 9 | `GET /admin/kyc/documents/{documentId}/content?download=false` | — | **`tutoring-kyc-view`** | 200 ไบต์ (headers §5.3) | 404 · **410 `tutoring.kyc.document_purged`** · 503 `tutoring.kyc.log_unavailable` / `tutoring.kyc.document_unreadable` / `tutoring.kyc.disabled` |
| 10 | `GET /admin/kyc/documents/{documentId}/access-logs?page&pageSize` | — | `tutoring-user` | 200 `PagedResult<KycAccessLogItem>` (เรียงล่าสุดก่อน) | 404 |
| 11 | `POST /admin/kyc/cases/{caseId}/decision` | `DecideKycCaseRequest` | `tutoring-user` | 200 `AdminKycCaseDetail` | 404 · 409 `tutoring.kyc.case_already_decided` / `tutoring.kyc.case_not_decidable` / `tutoring.kyc.profile_state_conflict` · 400 `tutoring.kyc.documents_undecided` (ext `types`) / `tutoring.kyc.note_required` |
กฎร่วม: ownership ฝั่งติวเตอร์ตัดสินด้วย `USER_ID` จาก `IUserContext` ใน query เดียวกับการดึง (ห้าม query แล้วเช็คทีหลัง) · "ไม่ใช่ของฉัน/ไม่มี" = 404 `tutoring.not_found` ข้อความเดียวกัน · Admin ไม่มี ownership แต่ทุกการดูเนื้อหาถูกบันทึก · `userId` ไม่เคยมาจาก body/query

### 6.3 DTO (C#)
```csharp
public sealed record KycDocumentResponse(Guid DocumentId, KycDocumentType Type, KycDocumentStatus Status, DateTime UploadedAtUtc, DateTime? ExpiresAtUtc, bool Purged);   // ไม่มี key/hash/size/ชื่อไฟล์ (ฝั่งติวเตอร์)
public sealed record KycCaseResponse(Guid CaseId, int AttemptNo, KycCaseStatus Status, DateTime? SubmittedAtUtc, DateTime? DecidedAtUtc, string? DecisionNote,
    string ConsentVersion, IReadOnlyList<KycDocumentResponse> Documents);
public sealed record TutorKycStatusResponse(bool Enabled, string ConsentVersion, IReadOnlyList<KycDocumentType> RequiredDocumentTypes,
    KycCaseResponse? CurrentCase, IReadOnlyList<KycCaseResponse> History, bool CanStartNewCase, int MaxFileBytes, IReadOnlyList<string> AllowedExtensions);
public sealed record CreateKycCaseRequest(string ConsentVersion);

public sealed record AdminKycCaseListItem(Guid CaseId, Guid TutorId, string TutorDisplayName, int AttemptNo, KycCaseStatus Status, DateTime? SubmittedAtUtc, int DocumentCount, int WaitingHours);
public sealed record AdminKycDocumentItem(Guid DocumentId, KycDocumentType Type, KycDocumentStatus Status, string ContentType, long SizeBytes,
    DateTime UploadedAtUtc, DateTime? ExpiresAtUtc, DateTime? PurgeAfterUtc, bool Purged, int SameFileSeenFromOtherTutors);
public sealed record AdminKycCaseDetail(Guid CaseId, Guid TutorId, string TutorDisplayName, TutorGender Gender, string? Headline, int AttemptNo, KycCaseStatus Status,
    DateTime? SubmittedAtUtc, DateTime? DecidedAtUtc, Guid? DecidedByUserId, string? DecisionNote, string ConsentVersion, DateTime ConsentAtUtc,
    TutorStatus TutorStatus, IReadOnlyList<KycDocumentType> RequiredDocumentTypes, IReadOnlyList<AdminKycDocumentItem> Documents, string RowVersion);
public sealed record KycDocumentDecision(Guid DocumentId, KycDocumentStatus Status);          // Approved|Rejected
public sealed record DecideKycCaseRequest(KycDecision Decision, string? Note, IReadOnlyList<KycDocumentDecision>? Documents, string RowVersion);   // KycDecision: Approve|Reject|NeedsInfo
public sealed record KycAccessLogItem(DateTime AccessedAtUtc, Guid? AccessedByUserId, string Action, string? IpAddress);
```
- `SameFileSeenFromOtherTutors` = จำนวนเอกสารของ **ติวเตอร์อื่น** ที่ `CONTENT_SHA256` เท่ากัน (สัญญาณฉ้อโกง — ไฟล์เดียวกันถูกใช้หลายบัญชี; hash ไม่ย้อนกลับเป็นภาพได้) — เฉพาะ admin เห็น
- `TutorKycStatusResponse.AllowedExtensions` = `[".pdf",".jpg",".jpeg",".png"]` (FE ใช้ตั้ง `accept` และข้อความ)

---

## 7. Config keys (`Tutoring:Kyc:*` — `TutoringKycOptions`; `Storage:R2Kyc:*` — `R2KycStorageOptions`)
| Key | Default | หมายเหตุ |
|---|---|---|
| `Tutoring:Kyc:Enabled` | `false` | ปิด = ทุก endpoint KYC ตอบ 503 `tutoring.kyc.disabled`; dev ตั้ง true ใน `appsettings.Development.json` |
| `Tutoring:Kyc:AdminTwoFactorEnforced` | `false` | **Production + Enabled ⇒ ต้องเป็น true** (คำยืนยันของเจ้าของว่า X-39 ถูก enforce แล้ว) |
| `Tutoring:Kyc:ConsentVersion` | `2026-10-v1` | ข้อความจริงอยู่ที่ FE i18n; ทนายยืนยันก่อน launch (Q14.3) |
| `Tutoring:Kyc:RequiredDocumentTypes` | `["IdCard","Diploma","CriminalRecord"]` | |
| `Tutoring:Kyc:MaxFileBytes` | `10485760` | ≤ 20971520 (CHECK ในตาราง) |
| `Tutoring:Kyc:MaxDocumentsPerCase` / `MaxDocumentsPerType` / `MaxAttempts` | `10` / `3` / `5` | |
| `Tutoring:Kyc:IdentityDocumentRetentionDays` | `30` | IdCard + CriminalRecord หลังตัดสิน (D-25) · 1–3650 |
| `Tutoring:Kyc:OtherDocumentRetentionDays` | `90` | Diploma/Certificate/Other · **ค่านี้ผมตั้งเอง** (Open decision #3) |
| `Tutoring:Kyc:ExpiryReminderDays` | `30` | |
| `Tutoring:Kyc:ExpiryAction` | `ReminderOnly` | หรือ `RequireReverification` |
| `Tutoring:Kyc:RejectActivePdfContent` | `true` | |
| `Tutoring:Kyc:RequireVirusScan` | `false` | true ⇒ เรียก `Catalog.Contracts.IAttachmentVirusScanner` (ตอนนี้ไม่มี engine จริง — Q9) |
| `Tutoring:Kyc:OpsNotificationEmail` | `""` | ว่าง = ไม่ส่ง |
| `Storage:R2Kyc:AccountId/AccessKeyId/SecretAccessKey/BucketName/Endpoint` | `""` | **SECRET — user-secrets/env** (`Storage__R2Kyc__…`) ทั้ง Api และ Workers (Workers ลบไฟล์ใน purge job) |
`TutoringKycProductionRequirements.GetProblems(IConfiguration)` (เรียกจากทั้ง `ProductionConfigurationGuard` และ `WorkersProductionRequirements`; ไม่ echo secret): Production ∧ `Enabled` ⇒ `Storage:R2Kyc` ครบ (ไม่ placeholder) · `BucketName` ≠ `Storage:R2:BucketName` (ไม่สนตัวพิมพ์) · `AdminTwoFactorEnforced=true` · retention ทั้งสอง 1–3650 · `ConsentVersion` ไม่ว่าง · `DataProtection` ผ่านเกณฑ์เดิม (`DataProtectionProductionRequirements`)

## 8. Test checklist
**Unit:** §3.1 crypto (ทั้งหมด) · `R2KycFileStorage` · `KycFileValidator` เมทริกซ์ · state machine case (Draft→Submitted→InReview→Approved/Rejected/NeedsInfo→Submitted…, ทุกคู่ที่ผิดโยน) · `TutorKycCaseService`: ข้อกำหนด Approve/Reject/NeedsInfo, retention แยกตามชนิด, profile transition ตรงกับ decision, audit เป็นขั้นสุดท้าย, `DbUpdateConcurrencyException` → `case_already_decided` · `GetContentAsync`: **access log ล้ม ⇒ ไม่เรียก storage/ไม่ส่งไบต์**, hash ไม่ตรง ⇒ 503, purged ⇒ 410 (ไม่เขียน log), headers ครบ, `download` เปลี่ยน action เป็น `Download` · `KycPurgeService` (idempotent: เรียกซ้ำไม่ error, storage ล้ม ⇒ ไม่ mark, ล้มตัวเดียวไม่ rollback ตัวอื่น, เขียน log `Purge` user=null) · `KycExpiryService` (flag ครั้งเดียว, ReminderOnly ไม่เปลี่ยนสถานะ, RequireReverification เปลี่ยน + unlist) · **log capture test:** ชื่อไฟล์ตัวอย่าง/ไบต์/เลขบัตรปลอมไม่ปรากฏใน log ทุกระดับของ flow upload/view/decide/purge · `TutoringKycProductionRequirements` · reflection: `TutorKycController` ไม่มี action คืนไฟล์; `IKycFileStorage` ไม่มีเมธอด signed URL; `TUTOR_DOCUMENT_ACCESS_LOG` ไม่มี mutator
**Integration (`SiriApiFactory`, Testcontainers PostgreSQL 17 + Redis; fake `IKycFileStorage` แบบ in-memory ที่เก็บไบต์ให้เทสต์ตรวจ):** ครบ flow สมัคร→consent→อัปโหลด→submit→admin ดู→Approve ⇒ profile `Verified` + `TutorOnly` ผ่าน + แถว `SECURITY_AUDIT` + อีเมล outbox · **ciphertext ใน storage ไม่มี plaintext/magic** · IDOR: ติวเตอร์ B อัป/ลบ/submit/อ่านเคสของ A ⇒ 404 `tutoring.not_found` เท่ากับ id ที่ไม่มีจริง (diff body หลังตัด traceId) · ติวเตอร์เรียก `/admin/kyc/*` ⇒ 403 · Admin A และ B ตัดสินพร้อมกัน ⇒ หนึ่ง 200 อีกอัน 409 · case เปิดซ้ำ ⇒ 409 (UQ partial ทำงานจริง — ยิงสองคำขอพร้อมกันจาก DB) · consent เวอร์ชันเก่า ⇒ 409 · ไฟล์ปลอม (`.png` เป็น HTML) ⇒ 400 · purge: ตั้งเวลา `PURGE_AFTER` ย้อนหลัง ⇒ job ลบ object จริง + แถวยังอยู่ + `PURGED_AT_UTC` + log `Purge`; ดู content ภายหลัง ⇒ 410 · ปิด `Enabled` ⇒ 503 ทุก route · rate limit `tutoring-kyc-view` (ครั้งที่ 31 ใน 60 วิ ⇒ 429) · migration บน PG17 (partial UQ ทำงาน, CHECK, FK NoAction) · ทุก action มี `[Authorize]`
**Security review (P13-32 ใช้ซ้ำ):** bucket ไม่ public, token แยก, ไม่มี presigned, ไม่มี log เนื้อหา, 2FA ack, purge พิสูจน์, ผู้เยาว์ไม่เกี่ยว (KYC เฉพาะติวเตอร์ผู้ใหญ่)

## 9. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | entity/enum/configuration 3 ตาราง + migration `AddTutorKyc` (+ partial UQ/index) + `docs/DATABASE.md` | architecture เขียว (identifier ≤63) · ไม่ apply DB จริง · ไม่มี shadow column |
| **B** | `backend-developer` | §3.1 protector overload + §3.2 `Siri.Integrations.Storage` (+unit) | unit เขียว · `Siri.Integrations.Storage` ไม่อ้าง EF · ไม่เพิ่ม NuGet (`git diff Directory.Packages.props` ว่าง) |
| **C** | `backend-developer` | `KycFileValidator`, services, repositories, validators, templates, ต่อยอด `TutorReadinessCalculator`, `TutoringKycOptions` | unit §8 |
| **D** | `backend-developer` | `TutorKycController` + `AdminKycController`, jobs + registration, prod requirements, appsettings placeholder (Api+Workers) | ไม่มี action ไร้ attribute auth · reflection tests ผ่าน |
| **E** | `backend-developer` | integration tests §8 | เขียนครบ (รายงานว่ายังไม่เคยรันถ้าไม่มี Docker) |
ลำดับ: A ∥ B → C → D → E · `DONE` ตั้งโดย integrator-qa · **ห้าม commit เอง**

## 10. FE notes
- ติวเตอร์ `/instructor/tutoring/onboarding` (เข้าได้ตั้งแต่ Draft): ขั้นตอน (1) อ่าน+ยอมรับ consent (checkbox + เวอร์ชัน = `consentVersion` จาก `GET tutor/kyc`; ข้อความอยู่ i18n key `tutoring.kyc.consent.<version>`) (2) อัปโหลดทีละชนิดตาม `requiredDocumentTypes` (`<input type=file accept=".pdf,.jpg,.jpeg,.png">`, ตรวจขนาดฝั่ง client เพื่อ UX เท่านั้น — server ตัดสิน), แสดงสถานะรายเอกสาร (Pending/Approved/Rejected) **ไม่มีปุ่มดู/ดาวน์โหลดไฟล์ของตัวเอง** และไม่แสดงชื่อไฟล์เดิม (3) submit · แสดง `decisionNote` เมื่อ `NeedsInfo`/`Rejected` · ปุ่ม "เริ่มยื่นใหม่" ตาม `canStartNewCase`
- Admin `/admin/tutoring/kyc`: คิว (เก่าสุดก่อน, `waitingHours`) → รายละเอียด → ตัวดูเอกสาร: **ดึงด้วย `HttpClient` `responseType: 'blob'` + bearer แล้ว `URL.createObjectURL`** (ห้ามใส่ token ใน URL / ห้ามใช้ `<img src="/api/…">` ตรง ๆ), `revokeObjectURL` เมื่อปิด · แสดงเตือน "ทุกการเปิดดูถูกบันทึก" · ข้อความ decision note มีคำเตือน "ผู้สมัครจะเห็นข้อความนี้" · แสดง `sameFileSeenFromOtherTutors > 0` เป็นธงเตือน · decision ส่ง `rowVersion` ล่าสุด
- 503 `tutoring.kyc.disabled` ⇒ แสดง "ระบบยืนยันตัวตนยังไม่เปิดใช้งาน" ไม่ใช่ error ทั่วไป · i18n `tutoring.kyc.*` + `tutoring.errors.*` · ห้าม `console.log` เนื้อหา/blob URL · loading/error/empty ครบ

## Deviations from TUTORING.md (สำหรับ architect คนอื่น/orchestrator)
| # | ใน TUTORING.md | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | `TUTOR_KYC_CASES.STATUS` = `Submitted\|InReview\|NeedsInfo\|Approved\|Rejected` | **เพิ่ม `Draft`** | case ต้องมีก่อนอัปโหลดเอกสาร (`CASE_ID` เป็น FK) แต่ "Submitted" หมายถึงส่งแล้ว |
| D2 | `IKycFileStorage : IFileStorage` | **ไม่สืบทอด** — interface แยก `Upload/Download/Delete` | `IFileStorage` มี `GetSignedUrlAsync` (ขัดกฎ "ไม่มี presigned URL") และไม่มี download; interface แยกทำให้ใช้ผิดไม่ได้ในระดับ type |
| D3 | `TUTOR_DOCUMENT_ACCESS_LOGS.ACCESSED_BY_USER_ID` | **nullable** (null = job ระบบ) | action `Purge` โดยระบบไม่มีผู้ใช้ |
| D4 | คอลัมน์ `IP` | **`IP_ADDRESS`** | ตรงกับ `LIVE.SESSION_JOIN_LOGS` (แนะนำ P13-10 ใช้ชื่อเดียวกัน) |
| D5 | `TUTOR_DOCUMENTS` ไม่มี content-type/size/flag เตือน | เพิ่ม `CONTENT_TYPE`, `SIZE_BYTES`, `EXPIRY_REMINDER_SENT_AT_UTC` | stream ต้องรู้ content-type; job เตือนต้อง idempotent |
| D6 | "`ISensitiveDataProtector` overload ไบต์" | ลายเซ็นมี `purpose` + `associatedData` (HKDF subkey ต่อเอกสาร + AAD) | ผูก ciphertext กับเอกสาร กัน blob swap; ยังไม่เพิ่ม package |
| D7 | purge เฉพาะ IdCard/CriminalRecord | purge **ทุกชนิด** แต่ Diploma/Certificate/Other ช้ากว่า (90 วัน) | data minimization — ค่าเป็น config รอ Q14.3 |
| D8 | `TUTOR_KYC_CASES` ไม่มี `ROW_VERSION` | เพิ่ม | กัน admin สองคนตัดสินพร้อมกัน |
| D9 | — | เพิ่ม endpoint `start-review` | ให้คิวแสดง "กำลังตรวจ" (ไม่บังคับ) |

## Open decisions (defaulted — ปรับด้วย config/revision ได้)
1. **ไม่ virus-scan KYC** (`RequireVirusScan=false`): engine ยังไม่มี (Q9); ลดความเสี่ยงด้วย allow-list 3 ชนิด + magic bytes + ปฏิเสธ PDF active content + ไฟล์เข้ารหัสแล้ว + เปิดดูเฉพาะ admin ใน sandbox (`CSP: sandbox`) · 2. `ExpiryAction=ReminderOnly` — ไม่ระงับติวเตอร์อัตโนมัติเพราะอาจกระทบคลาสที่จองไว้; admin ตัดสินเอง · 3. retention ของ Diploma/Certificate/Other = 90 วัน (ผมตั้ง; D-25 ระบุเฉพาะ IdCard/CriminalRecord 30 วัน) · 4. ข้อความ consent/เวอร์ชัน/ระยะเก็บ รอที่ปรึกษากฎหมาย (Q14.3) — โค้ดเก็บเวอร์ชัน+เวลาเท่านั้น · 5. `AdminTwoFactorEnforced` เป็นคำยืนยันของเจ้าของ ไม่ใช่การตรวจในโค้ด (JWT ไม่มี claim 2FA) — **ก่อนเปิดจริงต้องปิด X-39** · 6. ใช้ master key เดียวกับเลขบัญชีธนาคาร (HKDF แยก subkey) — หมุนคีย์ต้อง re-encrypt ทุกเอกสาร · 7. `MaxAttempts=5` ไม่มี cooldown · 8. object กำพร้าใน bucket (ล้มระหว่างอัปโหลด→insert→delete) ไม่มี reconcile ใน P13-02

## Frontend DTO appendix (TypeScript)
```ts
type Guid = string; type IsoUtc = string;
type KycCaseStatus = 'Draft'|'Submitted'|'InReview'|'NeedsInfo'|'Approved'|'Rejected';
type KycDocumentType = 'IdCard'|'Diploma'|'CriminalRecord'|'Certificate'|'Other';
type KycDocumentStatus = 'Pending'|'Approved'|'Rejected';
type KycDecision = 'Approve'|'Reject'|'NeedsInfo';

interface KycDocument { documentId: Guid; type: KycDocumentType; status: KycDocumentStatus; uploadedAtUtc: IsoUtc; expiresAtUtc: IsoUtc|null; purged: boolean; }
interface KycCase { caseId: Guid; attemptNo: number; status: KycCaseStatus; submittedAtUtc: IsoUtc|null; decidedAtUtc: IsoUtc|null; decisionNote: string|null; consentVersion: string; documents: KycDocument[]; }
interface TutorKycStatus { enabled: boolean; consentVersion: string; requiredDocumentTypes: KycDocumentType[]; currentCase: KycCase|null; history: KycCase[]; canStartNewCase: boolean; maxFileBytes: number; allowedExtensions: string[]; }
interface CreateKycCaseRequest { consentVersion: string; }
// upload: FormData { type: KycDocumentType; expiresOn?: 'yyyy-MM-dd'; file: File }

interface AdminKycCaseListItem { caseId: Guid; tutorId: Guid; tutorDisplayName: string; attemptNo: number; status: KycCaseStatus; submittedAtUtc: IsoUtc|null; documentCount: number; waitingHours: number; }
interface AdminKycDocument { documentId: Guid; type: KycDocumentType; status: KycDocumentStatus; contentType: string; sizeBytes: number; uploadedAtUtc: IsoUtc; expiresAtUtc: IsoUtc|null; purgeAfterUtc: IsoUtc|null; purged: boolean; sameFileSeenFromOtherTutors: number; }
interface AdminKycCaseDetail { caseId: Guid; tutorId: Guid; tutorDisplayName: string; gender: 'Male'|'Female'|'Other'|'Undisclosed'; headline: string|null; attemptNo: number; status: KycCaseStatus; submittedAtUtc: IsoUtc|null; decidedAtUtc: IsoUtc|null; decidedByUserId: Guid|null; decisionNote: string|null; consentVersion: string; consentAtUtc: IsoUtc; tutorStatus: string; requiredDocumentTypes: KycDocumentType[]; documents: AdminKycDocument[]; rowVersion: string; }
interface DecideKycCaseRequest { decision: KycDecision; note?: string|null; documents?: { documentId: Guid; status: 'Approved'|'Rejected' }[]; rowVersion: string; }
interface KycAccessLogItem { accessedAtUtc: IsoUtc; accessedByUserId: Guid|null; action: 'View'|'Download'|'Purge'; ipAddress: string|null; }
```
`reason` → i18n: `tutoring.kyc.disabled`, `.consent_outdated`, `.case_open`, `.not_required`, `.attempts_exceeded`, `.file_rejected` (หมวดการปฏิเสธไฟล์ size|type|signature|active_content อยู่ใน field มาตรฐาน `detail` ของ ProblemDetails — controller ใส่เอง), `.expiry_invalid`, `.case_not_editable`, `.document_limit`, `.document_locked`, `.documents_missing` (+`missingTypes`), `.profile_incomplete` (+`blockers`), `.case_already_decided`, `.case_not_decidable`, `.profile_state_conflict`, `.documents_undecided`, `.note_required`, `.document_purged`, `.log_unavailable`, `.document_unreadable`; readiness blockers ใหม่ใน `TutorReadiness.blockers`: `kyc_case_missing`, `kyc_documents_missing`

## Changelog
- **2026-10-14 รอบ 2 (cross-contract review):** ไม่มีการเปลี่ยน schema/endpoint · อัปเดตเชิงอ้างอิง: enum `KycCaseStatus`/`KycDocumentType`/`KycDocumentStatus` ประกาศที่ P13-02 (README §3) ; i18n ใช้ `tutoring.kyc.*` + `tutoring.errors.*` ตาม README §6 ; `TutoringKycOptions.MaxUploadRequestBodyBytes` เป็นค่าคงที่ compile-time สำหรับ attribute (ระบุไว้แล้วใน §6.1)
- **2026-10-15 รอบ 3:** ext key ของ `tutoring.kyc.file_rejected` เปลี่ยนจาก `detail` เป็น `detail` (`detail` เป็นชื่อสงวนของ ProblemDetails ใน `DomainErrorHttpResults` — ถูกทิ้งเงียบ; กฎกลาง README §6) — ค่า ∈ {`size`,`type`,`signature`,`active_content`} เหมือนเดิม
- **2026-10-15 รอบ 4 (โค้ดจริงชนะ):** BE P13-02 ส่งหมวดการปฏิเสธไฟล์ (size|type|signature|active_content) ใน **field มาตรฐาน `detail` ของ ProblemDetails** (UploadController ใส่เอง เพราะ `detail` เป็นชื่อ ext ที่สงวน) — ไม่ใช่ ext key `rejectDetail` · FE ต้องอ่าน `problem.detail`

- **Changelog 2026-10-15 hardening (P13-33):** (M2) job `tutoring-kyc-purge` ทำ 3 อย่างต่อชั่วโมง: ① ตั้ง `PURGE_AFTER_UTC = now` ให้เอกสารของเคสที่ยัง **เปิดอยู่** (Draft/Submitted/InReview/NeedsInfo) และ **ไม่มีกิจกรรม** เกิน `Tutoring:Kyc:Retention:StaleCaseDays` (default 60; 7-3650) — กิจกรรม = CreatedAt/UpdatedAt/SUBMITTED_AT/DECIDED_AT ของเคส หรือมีเอกสารใหม่เพิ่ม; เอกสารที่มี `PURGE_AFTER_UTC` อยู่แล้ว (เคสที่ตัดสินแล้ว) **ไม่ถูกแตะ** ② ลบไฟล์ที่ถึงกำหนดเหมือนเดิม ③ **orphan sweep**: ลบ object ใต้ `kyc/` ที่เก่ากว่า `Tutoring:Kyc:Retention:OrphanGraceHours` (default 24; 1-720) และ **ไม่มีแถวเอกสาร** (หา document id จาก key `kyc/{tutor}/{case}/{doc}.bin` แล้วดูด้วย PK; key รูปแบบอื่น/มีแถว (purged หรือไม่ก็ตาม) ไม่ถูกลบ; จำกัด 200 ลบ/รอบ, 50 หน้า × 1000 key) · เพิ่ม `IKycFileStorage.ListKeysAsync(prefix, olderThanUtc, startAfterKey, maxKeys)` คืนเฉพาะ key + KycKeyPage (ไม่มี URL, ไม่มี content) — R2 ใช้ ListObjectsV2 · (L4) `TUTOR_DOCUMENTS.CONTENT_SHA256` เปลี่ยนจาก SHA-256 เปล่าของ plaintext เป็น **HMAC-SHA256 hex 64 ตัว** ด้วย key = HKDF-SHA256(master, info = `siri:tutoring-kyc-content-hash`) (`ISensitiveDataProtector.ComputeKeyedHash`); ชื่อและความยาวคอลัมน์เท่าเดิม, plaintext เดียวกัน ⇒ ค่าเดียวกัน (สัญญาณไฟล์ซ้ำและ integrity check หลังถอดรหัสยังใช้ได้); แถวเก่าที่เป็น SHA-256 เปล่าจะอ่านไม่ผ่าน integrity (fail-closed) — ไม่มีแถวแบบนั้นใน DB จริง (migration ยังไม่เคย apply) จึงไม่มี data migration; ห้าม log ค่านี้ · (L1) `DecideAsync` ปฏิเสธ **403 `tutoring.admin_self_action`** เมื่อ admin คือเจ้าของโปรไฟล์ของเคส · (L7) production guard: `Storage:R2Kyc:AccessKeyId/SecretAccessKey` ต้องไม่เท่ากับ `Storage:R2:*`, และ `Retention:*` ต้องอยู่ในช่วง; นอก Production ถ้า `Enabled=true` แต่ `AdminTwoFactorEnforced=false` ให้ log warning ตอนสตาร์ท (กฎใน Production ไม่เปลี่ยน)
