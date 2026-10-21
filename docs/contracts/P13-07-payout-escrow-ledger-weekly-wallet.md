# Contract: P13-07 Payout — escrow ledger (`REVENUE_SPLITS` ขยาย) + รอบโอนรายสัปดาห์ + กระเป๋าเงินติวเตอร์

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Payout` (Repository+Service, UPPERCASE entity/DB) — **additive ล้วน; พฤติกรรมของคอร์สต้องไม่เปลี่ยน** · ผู้บริโภค: `Siri.Modules.Tutoring` ผ่าน `Siri.Modules.Payout.Contracts` เท่านั้น · `Siri.Api` (ขยาย `AdminPayoutController` แบบ additive)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..F)** — นี่คือ **โค้ดเงินที่กระทบการจ่ายผู้สอนคอร์สเดิมจริง** (query เลือกยอดจ่าย, ภาษีหัก ณ ที่จ่าย, ตารางที่มีข้อมูลจริง) + `Contracts/` ข้ามโมดูลใหม่ ⇒ ห้ามส่ง Antigravity · **ไม่ต้องผ่าน DESIGN_DATABASE** (migration เดียว §2 ระดับคอลัมน์/index/CHECK/คำสั่ง SQL ครบ) · ไม่มีบล็อกคำสั่ง Antigravity · FE (หน้ากระเป๋าเงิน P13-25 + แท็บ batch ฝั่ง admin) เริ่มขนานได้จาก DTO appendix

> **อ่านคู่กับ:** `docs/TUTORING.md` §3.7/§3.8 · `DECISIONS.md` D-25, **Q4** (สูตร split/ภาษี/รอบจ่าย), Q14 · `TASKS.md` **X-38** (ช่องว่างเดิมของ Payout — P13-07 แก้เฉพาะส่วนที่ Tutoring ต้องใช้) · คู่กัน: **P13-06** (ผู้เรียก `RecordTutoringSplit`) · **P13-08** (ผู้เรียก `ReverseBySource`/`ScheduleRelease`/`Freeze`/`Unfreeze`) · **P13-12** (แพ็กเกจ — แบ่งยอดเป็นรายครั้งก่อนเรียก) · P13-14/15 (dispute / admin analytics)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body 2026-10-14)

| # | ข้อเท็จจริง | หลักฐาน (`src/Siri.Modules.Payout` ถ้าไม่ระบุ) | ผลต่อ contract |
|---|---|---|---|
| F1 | `REVENUE_SPLITS.ORDER_ITEM_ID` เป็น `Guid` **NOT NULL**; factory `Create/CreateAdjustment` ปฏิเสธ `Guid.Empty`; เทสต์ double ของ `IRevenueSplitRepository` 5 ตัวเทียบ `s.ORDER_ITEM_ID == orderItemId` / `idSet.Contains(s.ORDER_ITEM_ID)` (`HashSet<Guid>`) | `Domain/REVENUE_SPLIT.cs:25,88-89`; `Infrastructure/RevenueSplitConfiguration.cs:20`; `tests/Siri.UnitTests/Payout/{InstructorEarningsService,InstructorRevenueReader,PayoutBatchService,RevenueSplitContract,RevenueSplitService}Tests.cs` | **ห้ามเปลี่ยนเป็น nullable** (`Guid?` ทำให้ `HashSet<Guid>.Contains` คอมไพล์ล้มในเทสต์เดิม) ⇒ แถว Tutoring เก็บ `ORDER_ITEM_ID = SOURCE_REF_ID` (booking id) — UUIDv7 ไม่ชนกับ order item จริง และ lookup ของ Tutoring ใช้ `(SOURCE_TYPE, SOURCE_REF_ID)`/`ENTRY_KEY` เสมอ |
| F2 | eligibility ของ batch: `(Pending\|Payable) ∧ CreatedAtUtc ≤ holdCutOff ∧ PAYOUT_BATCH_ITEM_ID == null` — **ไม่มีเงื่อนไขชนิดที่มา** | `Infrastructure/RevenueSplitRepository.cs:30-38`; ใช้ที่ `Application/PayoutBatchService.cs:69` | แถว Tutoring (Pending, อายุเกิน 14 วัน) จะ **หลุดเข้า batch รายเดือนของคอร์สทันที** แม้ยัง Frozen/ยังไม่จบคลาส ⇒ ต้องเพิ่ม conjunct `SOURCE_TYPE == Course` (§6) — การเปลี่ยนเดียวในกฎของคอร์ส และไม่มีผลกับแถวเดิม (backfill `Course`) |
| F3 | `ExecuteBatchAsync` เรียก `split.MarkPaid(itemId)` กับ **ทุกแถวที่ผูกกับ item โดยไม่เช็คสถานะ**; `MarkPaid` ไม่มี guard | `Application/PayoutBatchService.cs:192-198`; `Domain/REVENUE_SPLIT.cs:163-168` | แถวที่ถูก `Reverse()` หลังเข้า batch Draft จะถูกจ่ายอยู่ดี — **ช่องโหว่เดิมของคอร์ส (ดู D1 §14)** ⇒ Tutoring ห้าม Reverse/แก้ตัวเลขแถวที่ "อยู่ใน batch" (in-flight) เด็ดขาด ใช้แถว adjustment ลบแทน (§5) |
| F4 | `ReverseRevenueSplitsForOrderAsync`: `Pending\|Payable` ⇒ `Reverse()` (รวม `Payable` ที่ผูก item ใน batch Draft แล้ว); `Paid` ⇒ แถวลบ `CreateAdjustment` ใน `currentPeriodKey` | `Infrastructure/Contracts/RevenueSplitContract.cs:109-129` | ยืนยัน F3 เป็นช่องโหว่จริง (D1); แบบแผน "Paid ⇒ แถวลบรอบถัดไป" เป็น precedent ที่ Tutoring ขยาย |
| F5 | `PERIOD_KEY` = `char(7)` ทั้ง `REVENUE_SPLITS` และ `PAYOUT_BATCHES`; validator สองตัวบังคับ `^\d{4}-(0[1-9]\|1[0-2])$`; `GetByPeriodKeyAsync` คืน batch แรก **ทุกสถานะ** ⇒ 409 | `Infrastructure/RevenueSplitConfiguration.cs:33`; `PayoutBatchConfiguration.cs:20`; `Application/PayoutBatchModels.cs:45`; `RevenueSplitModels.cs:35`; `Infrastructure/PayoutBatchRepository.cs:17-20`; `PayoutBatchService.cs:58-62` | `YYYY-Www` = 8 ตัวอักษร ⇒ ขยายคอลัมน์เป็น `varchar(8)`; คีย์สัปดาห์/เดือนไม่ชนกันโดยรูปแบบ แต่เพิ่ม `SOURCE_TYPE` ให้ชัด |
| F6 | `CreateAsync` ทำ `SaveChanges` **สองครั้งไม่อยู่ใน transaction** (สร้าง batch ก่อน แล้วค่อยผูก split) และสร้าง batch ว่างได้ | `PayoutBatchService.cs:113-135` | Tutoring เขียน service ใหม่ที่ atomic + `FOR UPDATE` (§7) — ไม่แก้ของคอร์ส |
| F7 | เทสต์ double ของ interface ใช้ **default interface members** เป็นกลไกไม่ให้เทสต์เดิมพัง (`GetSplitsByBatchItemIdsAsync`, `GetNetInstructorAmountForPeriodAsync`) | `Application/IRevenueSplitRepository.cs:27-57` | สมาชิกใหม่ของ `IRevenueSplitRepository`/`IPayoutBatchRepository` ต้องเป็น default member หรืออยู่ใน **interface พี่น้องใหม่** — ห้ามเพิ่มสมาชิก abstract |
| F8 | รายได้รวม/ประมาณการรอบถัดไปของผู้สอนอ่านจาก `GetTotalEarningsAsync` (Paid) / `GetPendingEarningsAsync` (Pending\|Payable) **ทุกแถวของผู้สอน**; ประวัติ payout อ่านจาก `PAYOUT_BATCH_ITEMS` ทุก batch | `Infrastructure/RevenueSplitRepository.cs:63-75`; `PayoutBatchRepository.cs:23-47` | หลังมีแถว Tutoring หน้า `/instructor/earnings` ของคอร์สจะปนยอด escrow เข้า "ประมาณการรอบถัดไป" ⇒ เพิ่ม conjunct `SOURCE_TYPE == Course` ในสองเมธอดนี้ + ประวัติ (§6.2) |
| F9 | รายได้รายเดือนของ dashboard (P11-10) อ่านด้วย `PERIOD_KEY` เดือน (`yyyy-MM`) | `Infrastructure/Contracts/InstructorRevenueReader.cs`; `Application/RevenueSplitQueries.cs:15-18` | คีย์รายสัปดาห์ไม่ชนคีย์รายเดือน ⇒ ยอดติวเตอร์ **ไม่เข้า** dashboard คอร์สโดยธรรมชาติ (ตั้งใจ; แสดงใน wallet) — ไม่แก้ query |
| F10 | `InstructorPayoutAccount`/batch item/batch key ด้วย `INSTRUCTOR_PROFILE.Id`; ผู้เรียกจาก HTTP ใช้ `IInstructorProfileReader.GetProfileIdByUserIdAsync(userId)` | `Application/InstructorEarningsService.cs:20-24` | wallet ใช้แบบเดียวกัน — ไม่รับ id จาก client |
| F11 | `POST /api/payout/admin/batches` bind `CreatePayoutBatchCommand(string PeriodKey)` (record ตำแหน่งเดียว) | `Application/PayoutBatchModels.cs:7`; `Siri.Api/Controllers/Payout/AdminPayoutController.cs` (`CreateBatch`) | เพิ่ม `string? SourceType = null` ท้ายสุด ⇒ ผู้เรียกเดิมคอมไพล์/ทำงานเหมือนเดิม |
| F12 | `Payout:*` options: `EstimatedPaymentFeePercent` (default **0.00**), `WithholdingTaxPercent` 3, `MinimumPayoutAmount` 500, `HoldDays` 14 + `[Required]` ข้อมูลผู้จ่ายภาษี | `PayoutOptions.cs` | ใช้ `MinimumPayoutAmount` ร่วม; ภาษีของ Tutoring override ได้ (Q14.2a); เตือน: ค่า estimate=0 ⇒ ต้องตั้งก่อน launch |

---

## 1. Scope

**ใน:** migration `AddTutoringEscrowToPayout` (ตาราง `REVENUE_SPLITS` + `PAYOUT_BATCHES`) · `ITutoringEscrowContract` + `IPayoutWalletReader` + records · `TutoringSplitMath` (pure) · `IsoWeekKey` (pure) · `TutoringPayoutBatchService` (batch รายสัปดาห์) · การขยาย admin batch endpoint แบบ additive · endpoint กระเป๋าเงินฝั่ง Tutoring (`/api/tutoring/tutor/wallet*`) · เทสต์พิสูจน์คอร์สไม่ regress

**นอก (ห้ามทำ):** แก้ `RevenueSplitContract`/`IRevenueSplitContract`/`OrderItemSplitInfo`/สูตร Q4 ของคอร์ส · endpoint ที่ insert split ตามใจ (X-38 ข้อ 2 — **ไม่เพิ่ม ไม่ขยาย**; `POST admin/revenue-splits` เดิมสร้างได้เฉพาะ `Course` เสมอ) · แก้ defect D1–D4 ของคอร์ส (รายงานอย่างเดียว) · ระบบจ่าย "วันที่ 25" (X-38 ข้อ 3) · ใบรับรอง 50 ทวิ (ใช้ `GetTaxCertificateAsync` เดิม — ทำงานกับ item ทุกชนิดอยู่แล้ว) · FE

---

## 2. Schema delta — migration `AddTutoringEscrowToPayout` (additive; ข้อมูลเดิมไม่ถูกแตะ)

> UPPERCASE/ตัวพิมพ์ตาม convention เดิม · เวลา `timestamptz(3)` UTC · ชื่อ index/constraint ≤63 ไบต์ ตั้งเองทุกตัว · อ่านไฟล์ที่ generate ทั้งไฟล์ — ต้องเป็น `AlterColumn` + `AddColumn` + `CreateIndex` + `Sql` เท่านั้น **ไม่มี DropColumn/DropTable/RenameColumn** · **ห้าม apply DB จริงเอง** · ทดสอบ migration บนฐานที่มีแถวคอร์สอยู่แล้ว (§12.D)

### 2.1 `PAYOUT.REVENUE_SPLITS` — คอลัมน์ใหม่ (entity `REVENUE_SPLIT`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `SOURCE_TYPE` | varchar(16), enum string `PayoutSourceType` {`Course`,`Tutoring`} | no | **default `'Course'`** (`HasDefaultValue(PayoutSourceType.Course)`; backfill แถวเดิมอัตโนมัติ — PG11+ เติมค่า default คงที่แบบ metadata-only) |
| `SOURCE_REF_ID` | uuid | yes | Tutoring = `BOOKING_ID`; Course = `NULL` (ไม่แตะแถวคอร์ส) |
| `ENTRY_KEY` | varchar(80) | yes | คีย์ idempotency ของ "รายการบัญชี": `rec:{sourceRef:N}` (แถวหลัก), `adj:{refundId:N}:{seq}` (ปรับยอดเพราะคืนเงิน/ปล่อยคืน; `seq` = ลำดับเหตุการณ์ ledger ของ refund นั้น: คืน=1, ปล่อยเพราะ Failed/Voided=2, retry=3, … — ผู้เรียก P13-08 เป็นผู้นับ), `fee:{sourceRef:N}:{satang}` (แก้ค่าธรรมเนียม) · Course = `NULL` |
| `ESCROW_STATE` | varchar(16), enum `TutoringEscrowState` {`Held`,`Frozen`,`Releasable`} | yes | Tutoring เท่านั้น · `Held` = จ่ายแล้วรอจบคลาส · `Frozen` = ข้อพิพาทเปิดอยู่ · `Releasable` = ตั้ง `AVAILABLE_AT_UTC` แล้ว (รอถึงเวลา — สูตร D-A คำนวณโดยผู้เรียกฝั่ง Tutoring — หรือพร้อมเข้า batch) |
| `AVAILABLE_AT_UTC` | timestamptz(3) | yes | เวลาแรกสุดที่แถวนี้เข้า batch ได้ · `NULL` ⇔ ติด escrow (`Held`/`Frozen`) · ไม่ใช่ `PERIOD_KEY` |

**Constraint / index (ชื่อตายตัว):**
- CHECK `CK_REVENUE_SPLITS_SOURCE_SHAPE`:
```sql
("SOURCE_TYPE" = 'Course'
   AND "SOURCE_REF_ID" IS NULL AND "ENTRY_KEY" IS NULL AND "ESCROW_STATE" IS NULL AND "AVAILABLE_AT_UTC" IS NULL)
OR
("SOURCE_TYPE" = 'Tutoring'
   AND "SOURCE_REF_ID" IS NOT NULL AND "ENTRY_KEY" IS NOT NULL AND "ESCROW_STATE" IS NOT NULL
   AND (("ESCROW_STATE" = 'Releasable') = ("AVAILABLE_AT_UTC" IS NOT NULL))
   AND "PERIOD_KEY" ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')
```
  (แถวคอร์สเดิมทั้งหมดผ่านเพราะ backfill; ใช้ `[0-9]` ไม่ใช้ `\d` เพื่อไม่ติด escaping)
- **UQ** `UX_REVENUE_SPLITS_ENTRY_KEY` (`ENTRY_KEY`) `HasFilter("\"ENTRY_KEY\" IS NOT NULL")` — ความ idempotent ระดับ DB ของ Tutoring (แก้ปัญหา X-38 ข้อ 5 เฉพาะแถว Tutoring; ของคอร์สไม่แตะ)
- `IX_REVENUE_SPLITS_SOURCE_REF` (`SOURCE_REF_ID`) `HasFilter("\"SOURCE_REF_ID\" IS NOT NULL")`
- `IX_REVENUE_SPLITS_TUTORING_OPEN` (`AVAILABLE_AT_UTC`,`INSTRUCTOR_ID`) `HasFilter("\"SOURCE_TYPE\" = 'Tutoring' AND \"ESCROW_STATE\" = 'Releasable' AND \"PAYOUT_BATCH_ITEM_ID\" IS NULL AND \"STATUS\" IN ('Pending','Payable')")` — รองรับ query เลือกเข้า batch (§6.1)
- index เดิม (`IX_REVENUE_SPLITS_ORDER_ITEM_ID`, `…_PAYOUT`, `…_PAYOUT_BATCH_ITEM_ID`) ไม่แตะ

### 2.2 `PAYOUT.REVENUE_SPLITS.PERIOD_KEY` และ `PAYOUT.PAYOUT_BATCHES.PERIOD_KEY`
`char(7)` ⇒ `character varying(8)` (`HasColumnType("character varying(8)")`/`HasMaxLength(8)`) ทั้งสองตาราง — คำสั่งที่ EF สร้าง: `ALTER TABLE … ALTER COLUMN "PERIOD_KEY" TYPE character varying(8)` (cast `bpchar→varchar` ตัดช่องว่างท้าย; ค่าเดิมยาว 7 พอดีไม่มีช่องว่าง) — ตรวจว่า generated SQL ไม่ใช้ `USING` ที่ผิด และ index `IX_REVENUE_SPLITS_PAYOUT`/`IX_PAYOUT_BATCHES_PERIOD_KEY` ถูกสร้างคืนโดย PG อัตโนมัติ

### 2.3 `PAYOUT.PAYOUT_BATCHES` — คอลัมน์ใหม่
`SOURCE_TYPE` varchar(16) NOT NULL default `'Course'` (ใช้ enum เดียวกัน `PayoutSourceType`) · CHECK `CK_PAYOUT_BATCHES_TUTORING_PERIOD`: `("SOURCE_TYPE" <> 'Tutoring') OR ("PERIOD_KEY" ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')` · **UQ** `UX_PAYOUT_BATCHES_TUTORING_PERIOD` (`PERIOD_KEY`) `HasFilter("\"SOURCE_TYPE\" = 'Tutoring' AND \"STATUS\" <> 'Failed'")` — กัน admin สองคนสร้างรอบสัปดาห์เดียวกันพร้อมกัน; **ไม่มี unique บน Course** (พฤติกรรมเดิม) · `IX_PAYOUT_BATCHES_SOURCE_TYPE` (`SOURCE_TYPE`,`CREATED_AT_UTC` DESC)

### 2.4 ตัวอย่างการ์ด migration (ผู้ลงมือ generate แล้วเทียบ — ต้องเทียบเท่า)
```csharp
// Up()
migrationBuilder.AlterColumn<string>("PERIOD_KEY", "PAYOUT", "REVENUE_SPLITS", type: "character varying(8)", maxLength: 8, nullable: false, oldClrType: typeof(string), oldType: "char(7)");
migrationBuilder.AlterColumn<string>("PERIOD_KEY", "PAYOUT", "PAYOUT_BATCHES", type: "character varying(8)", maxLength: 8, nullable: false, oldClrType: typeof(string), oldType: "char(7)");
migrationBuilder.AddColumn<string>("SOURCE_TYPE", "PAYOUT", "REVENUE_SPLITS", type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "Course");
migrationBuilder.AddColumn<Guid>("SOURCE_REF_ID", "PAYOUT", "REVENUE_SPLITS", type: "uuid", nullable: true);
migrationBuilder.AddColumn<string>("ENTRY_KEY", "PAYOUT", "REVENUE_SPLITS", type: "character varying(80)", maxLength: 80, nullable: true);
migrationBuilder.AddColumn<string>("ESCROW_STATE", "PAYOUT", "REVENUE_SPLITS", type: "character varying(16)", maxLength: 16, nullable: true);
migrationBuilder.AddColumn<DateTime>("AVAILABLE_AT_UTC", "PAYOUT", "REVENUE_SPLITS", type: "timestamp(3) with time zone", precision: 3, nullable: true);
migrationBuilder.AddColumn<string>("SOURCE_TYPE", "PAYOUT", "PAYOUT_BATCHES", type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "Course");
// + CreateIndex ×5 (ตาม §2.1/§2.3 พร้อม filter) และ AddCheckConstraint ×2
// Down(): ก่อน Drop ให้ตรวจ — ถ้ามีแถว SOURCE_TYPE <> 'Course' ให้ RAISE EXCEPTION (fix-forward: ห้ามทำข้อมูลเงินหาย)
migrationBuilder.Sql(@"DO $$ BEGIN IF EXISTS (SELECT 1 FROM ""PAYOUT"".""REVENUE_SPLITS"" WHERE ""SOURCE_TYPE"" <> 'Course') OR
                      EXISTS (SELECT 1 FROM ""PAYOUT"".""PAYOUT_BATCHES"" WHERE ""SOURCE_TYPE"" <> 'Course')
                      THEN RAISE EXCEPTION 'Cannot roll back AddTutoringEscrowToPayout: Tutoring money rows exist'; END IF; END $$;");
```
ใน configuration: `builder.ToTable("REVENUE_SPLITS", "PAYOUT", t => t.HasCheckConstraint("CK_REVENUE_SPLITS_SOURCE_SHAPE", "…"))` (เปลี่ยนจาก overload เดิมที่ไม่มี lambda) · `HasFilter` ใช้ identifier แบบ quote (database.md)

### 2.5 Domain (`Siri.Modules.Payout.Domain`)
- enum ใหม่ `PayoutSourceType { Course = 0, Tutoring = 1 }` · `TutoringEscrowState { Held, Frozen, Releasable }` (type/member PascalCase; property ที่ถือ enum เป็น UPPERCASE: `SOURCE_TYPE`, `ESCROW_STATE`)
- `REVENUE_SPLIT`: property `SOURCE_TYPE` (default `Course` — ค่า CLR default = 0), `SOURCE_REF_ID?`, `ENTRY_KEY?`, `ESCROW_STATE?`, `AVAILABLE_AT_UTC?` ทั้งหมด `private set` · **`Create`/`CreateAdjustment` เดิมไม่แตะลายเซ็นและไม่แตะค่าใหม่ (Course เสมอ)** · factory ใหม่ (internal/ใช้โดย contract impl เท่านั้น): `CreateTutoring(sourceRefId, instructorId, gross, fee, platform, tutor, sharePercent, periodKey, entryKey, escrow: Held)` (`ORDER_ITEM_ID = sourceRefId`), `CreateTutoringAdjustment(..., escrow, availableAt)` · mutator ที่ **ปฏิเสธ (throw) ถ้า `SOURCE_TYPE ≠ Tutoring` หรือแถวอยู่ in-flight/Paid/Reversed**: `ScheduleRelease(at)` (Held→Releasable; Releasable→ขยับ *เร็วขึ้นเท่านั้น*), `Freeze()` (Held|Releasable→Frozen, `AVAILABLE_AT=null`), `Unfreeze(at?)` (Frozen→Held หรือ Releasable), `ReverseTutoring()` (Pending|Payable-ที่ไม่มี item → Reversed) · `Reverse()` เดิมไม่แก้พฤติกรรม
- `PAYOUT_BATCH`: `SOURCE_TYPE` (`private set`), `Create(periodKey)` เดิมคง = Course, overload `Create(periodKey, sourceType)`

---

## 3. Contract ข้ามโมดูล — `Siri.Modules.Payout.Contracts` (ไฟล์ใหม่ 2 ไฟล์; `IRevenueSplitContract` ไม่ถูกแตะ)

> *Deviation จาก `TUTORING.md` §4:* เมธอด `RecordTutoringSplit/Release/Freeze/ReverseBySource` อยู่ใน **interface พี่น้องใหม่** `ITutoringEscrowContract` แทนการเพิ่มใน `IRevenueSplitContract` — เหตุผล: `IRevenueSplitContract` ถูก fake/ใช้ในเทสต์และโค้ดคอร์ส (F7) และสัญญาของมันคือ "ต่อ order item" ⇒ แยกเพื่อให้ไฟล์/เทสต์ของคอร์สไม่เปลี่ยนแม้แต่บรรทัดเดียว

```csharp
namespace Siri.Modules.Payout.Contracts;

public enum TutoringEscrowStatus { Held, Frozen, Releasable }

/// <summary>GrossAmount/PaymentFeeAmount เป็น THB 2 ตำแหน่ง (ปฏิเสธเศษเกิน 2 ตำแหน่ง). PaymentFeeAmount null ⇒ Payout ประมาณด้วย
/// Payout:EstimatedPaymentFeePercent (กฎ Q4) และคืนค่าที่ใช้จริงใน snapshot. TutorSharePercent = snapshot ของ (100 − commission) ณ วันจ่ายสำเร็จ.</summary>
public sealed record RecordTutoringSplitRequest(
    Guid SourceRefId,                  // BOOKING_ID (ต่อ 1 booking = 1 ชุดแถว)
    Guid InstructorProfileId,          // CATALOG.INSTRUCTOR_PROFILES.Id — คีย์ของเงินใน Payout
    decimal GrossAmount,               // > 0
    decimal? PaymentFeeAmount,         // >= 0
    decimal TutorSharePercent,         // (0, 100]
    DateTime PaymentSucceededAtUtc);   // Kind=Utc — ใช้ทำ PERIOD_KEY (ป้ายสัปดาห์ที่เงินเข้า) เท่านั้น

/// <summary>มุมมองรวมของ "ทุกแถวที่ไม่ Reversed" ของ source นั้น.</summary>
public sealed record TutoringSplitSnapshot(
    Guid SourceRefId, Guid InstructorProfileId,
    decimal GrossAmount, decimal PaymentFeeAmount, decimal PlatformAmount, decimal TutorAmount,
    decimal TutorSharePercent, string PeriodKey,
    TutoringEscrowStatus Escrow, DateTime? AvailableAtUtc,
    bool InFlight,        // มีแถวผูกกับ batch item (Draft) — ห้าม Freeze/Reverse ตรง ๆ
    bool Paid,            // มีแถว Paid
    bool Reversed,        // ทุกแถว Reversed
    bool AlreadyExisted); // เฉพาะผลของ Record

public enum EscrowChangeOutcome
{
    Changed,    // มีการเปลี่ยนแปลงจริง
    NoChange,   // idempotent: ทำไว้แล้ว / ไม่มีอะไรต้องเปลี่ยน
    NotFound,   // ไม่มี split ของ source นี้ (เช่น booking ฟรี) — ผู้เรียกตัดสินเอง
    Frozen,     // ถูก Freeze อยู่ — ScheduleRelease ไม่ทำ (ต้อง Unfreeze ก่อน)
    TooLate,    // in-flight หรือ Paid — Freeze/Reverse ตรง ๆ ไม่ได้ (Reverse ใช้ adjustment แทนและคืน Changed)
    Reversed,   // ถูก Reverse เต็มจำนวนแล้ว (terminal)
}
public sealed record EscrowChangeResult(EscrowChangeOutcome Outcome, TutoringSplitSnapshot? Snapshot);

public sealed record ScheduleTutoringReleaseRequest(Guid SourceRefId, DateTime AvailableAtUtc);
public sealed record FreezeTutoringSplitRequest(Guid SourceRefId);
public sealed record UnfreezeTutoringSplitRequest(Guid SourceRefId, DateTime? AvailableAtUtc);   // null ⇒ กลับ Held
/// <summary>EntryKey ต้องไม่ซ้ำต่อเหตุการณ์ ("adj:{refundId:N}:{seq}" — `seq` ต่างกันต่อเหตุการณ์ของ refund เดียวกัน เพื่อให้ "คืน → ล้ม/void → retry" แต่ละครั้งเป็นรายการบัญชีใหม่ ไม่ชน idempotency) — ซ้ำ ⇒ NoChange. CumulativeRefundedGross = ผลรวมเงิน *ที่ตัดสินใจคืน* (Requested|Processing|Completed) ของ booking นี้ ณ ตอนนี้.</summary>
public sealed record ReverseTutoringSplitRequest(Guid SourceRefId, string EntryKey, decimal CumulativeRefundedGross);
/// <summary>EntryKey = "fee:{sourceRef:N}:{satang}".</summary>
public sealed record ReviseTutoringFeeRequest(Guid SourceRefId, string EntryKey, decimal NewPaymentFeeAmount);

public interface ITutoringEscrowContract
{
    /// <summary>idempotent ตาม ENTRY_KEY = rec:{SourceRefId:N}: มีแล้ว ⇒ คืน snapshot เดิม (AlreadyExisted=true) ไม่เขียน; มีแล้วแต่ gross/instructor ต่าง ⇒ InvalidOperationException (บั๊กผู้เรียก — ดัง ไม่กลืน).</summary>
    Task<TutoringSplitSnapshot> RecordTutoringSplitAsync(RecordTutoringSplitRequest request, CancellationToken cancellationToken);

    /// <summary>Held → Releasable(AvailableAtUtc). Releasable ⇒ ขยับ "เร็วขึ้น" ได้ (ผู้เรียนกดยืนยันจบคลาส), ช้าลง ⇒ NoChange. ทุกแถว unbatched ของ source เปลี่ยนพร้อมกัน.</summary>
    Task<EscrowChangeResult> ScheduleReleaseAsync(ScheduleTutoringReleaseRequest request, CancellationToken cancellationToken);

    /// <summary>Held|Releasable(ยังไม่เข้า batch) → Frozen (AVAILABLE_AT=null). in-flight/Paid ⇒ TooLate (ไม่เปลี่ยนอะไร).</summary>
    Task<EscrowChangeResult> FreezeAsync(FreezeTutoringSplitRequest request, CancellationToken cancellationToken);

    /// <summary>Frozen → Held (AvailableAtUtc null) หรือ Releasable(AvailableAtUtc). ไม่ Frozen ⇒ NoChange.</summary>
    Task<EscrowChangeResult> UnfreezeAsync(UnfreezeTutoringSplitRequest request, CancellationToken cancellationToken);

    /// <summary>คำนวณ "สถานะเป้าหมาย" จาก K = G − CumulativeRefundedGross แล้ววางส่วนต่างเป็นแถว adjustment (หรือพลิกเป็น Reversed เมื่อคืนเต็ม+ยังไม่เข้า batch) — §5.5.</summary>
    Task<EscrowChangeResult> ReverseBySourceAsync(ReverseTutoringSplitRequest request, CancellationToken cancellationToken);

    /// <summary>แก้ค่าธรรมเนียม (ประมาณ → จริง) ด้วยกลไกเดียวกับ ReverseBySource. ทำได้ทุกสถานะ (ส่วนต่างของแถวที่เข้า batch/Paid ไปรอบถัดไป).</summary>
    Task<EscrowChangeResult> ReviseFeeAsync(ReviseTutoringFeeRequest request, CancellationToken cancellationToken);

    Task<TutoringSplitSnapshot?> GetSplitAsync(Guid sourceRefId, CancellationToken cancellationToken);
}
```

**กฎร่วมของทุกเมธอด:** (1) ค่า argument ผิด (Guid ว่าง, เงิน ≤0 หรือเศษเกิน 2 ตำแหน่ง, percent นอกช่วง, เวลา `Kind≠Utc`) ⇒ `ArgumentException` (บั๊กผู้เรียก ไม่ใช่ `Result`) · (2) **ต้องรันใต้ transaction ของผู้เรียน**: ถ้า `Database.CurrentTransaction == null` contract เปิด transaction สั้นของตัวเอง (กัน read-modify-write ไม่ atomic) แต่ไม่ commit transaction ของผู้เรียน · (3) ล็อกแถวด้วย `SELECT * FROM "PAYOUT"."REVENUE_SPLITS" WHERE "SOURCE_TYPE" = 'Tutoring' AND "SOURCE_REF_ID" = {ref} ORDER BY "CREATED_AT_UTC", "REVENUE_SPLIT_ID" FOR UPDATE` — **ชื่อคอลัมน์ต้องตรง `RevenueSplitConfiguration.cs` จริง** (`IAuditable.CreatedAtUtc` map เป็น `CREATED_AT_UTC`, PK `REVENUE_SPLIT_ID`; identifier ทุกตัวอยู่ใน double quote; ตรวจแล้วกับไฟล์ ณ 2026-10-14) · ตำแหน่งใน lock chain (มติ D-B) = หลัง Session→Booking→[Purchase→Credits]→Payment→Refund และก่อน TutorProfile · **SQL ล็อกสำหรับ batch:** `SELECT * FROM "PAYOUT"."REVENUE_SPLITS" WHERE "SOURCE_TYPE" = 'Tutoring' AND "STATUS" IN ('Pending','Payable') AND "PAYOUT_BATCH_ITEM_ID" IS NULL AND "ESCROW_STATE" = 'Releasable' AND "AVAILABLE_AT_UTC" IS NOT NULL AND "AVAILABLE_AT_UTC" <= {cutoffUtc} ORDER BY "CREATED_AT_UTC", "REVENUE_SPLIT_ID" FOR UPDATE` (ตรงกับ `EligibleTutoringSplits`) · ทุกคำสั่งล็อกเรียงตาม `("CREATED_AT_UTC","REVENUE_SPLIT_ID")` เดียวกัน ⇒ เส้นที่ล็อกหลาย source (batch) กับเส้นล็อก source เดียวไม่ deadlock · **integration test บังคับ (§12.D) รัน SQL ทั้งสองบน PostgreSQL จริง** กันชื่อคอลัมน์/alias ผิด · (4) flush `SaveChangesAsync` ภายใน (เหมือน `RevenueSplitContract`) · (5) ไม่เขียน audit (ผู้เรียก Tutoring เขียน `SECURITY_AUDIT`) · (6) ไม่ log จำนวนเงินระดับ Debug ขึ้นไปพร้อม instructor id เกินจำเป็น (log เฉพาะ sourceRef + outcome)

```csharp
// IPayoutWalletReader.cs
public enum TutoringLedgerEntryKind { Earning, Adjustment }
public enum TutoringLedgerState { Held, InDisputeWindow, Frozen, Available, Processing, Paid, Reversed }

public sealed record TutoringWalletSummary(
    decimal HeldAmount,            // Held + Releasable ที่ AvailableAt > now (ไม่รวม Frozen)
    decimal FrozenAmount,          // Frozen
    decimal AvailableAmount,       // Releasable, AvailableAt <= now, ยังไม่เข้า batch (รวม adjustment ลบ → อาจติดลบ)
    decimal ProcessingAmount,      // อยู่ใน batch Draft (เข้ารอบแล้ว รอ admin execute)
    decimal PaidAmount,            // Paid สะสมทั้งหมด (ก่อนหักภาษี)
    decimal WithholdingTaxPercent,
    decimal EstimatedNetAvailable, // max(Available,0) − Round(max(Available,0) × WHT/100, 2, AwayFromZero)
    decimal MinimumPayoutAmount,
    bool MeetsMinimum,             // AvailableAmount >= MinimumPayoutAmount
    bool HasVerifiedPayoutAccount,
    DateTime NextPayoutAtUtc,      // ประมาณการเวลาที่ระบบ "สร้างรอบ" ถัดไป (ยังต้องรอ admin execute)
    string Currency);              // "THB"

public sealed record TutoringLedgerEntry(
    Guid EntryId, Guid SourceRefId, TutoringLedgerEntryKind Kind,
    decimal GrossAmount, decimal PaymentFeeAmount, decimal PlatformAmount, decimal TutorAmount,
    TutoringLedgerState State, DateTime? AvailableAtUtc, DateTime CreatedAtUtc, string PeriodKey, Guid? PayoutBatchItemId);

public sealed record TutoringPayoutHistoryItem(
    Guid BatchItemId, string PeriodKey, decimal GrossAmount, decimal WithholdingTaxPercent,
    decimal WithholdingTaxAmount, decimal NetAmount, string Status, DateTime? PaidAtUtc);

public sealed record TutoringRevenueTotals(int BookingCount, decimal GrossAmount, decimal PaymentFeeAmount, decimal PlatformAmount, decimal TutorAmount);

public interface IPayoutWalletReader
{
    Task<TutoringWalletSummary> GetTutoringWalletAsync(Guid instructorProfileId, DateTime nowUtc, CancellationToken cancellationToken);
    Task<PagedResult<TutoringLedgerEntry>> GetTutoringLedgerAsync(Guid instructorProfileId, int page, int pageSize, CancellationToken cancellationToken);
    Task<PagedResult<TutoringPayoutHistoryItem>> GetTutoringPayoutHistoryAsync(Guid instructorProfileId, int page, int pageSize, CancellationToken cancellationToken);
    /// <summary>สำหรับ admin analytics (P13-15): Σ แถวที่ไม่ Reversed ที่ CreatedAtUtc ∈ [fromUtc, toUtc) — Platform = ค่าคอมมิชชัน (หลังหักค่าธรรมเนียม).</summary>
    Task<TutoringRevenueTotals> GetTutoringRevenueTotalsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken);
}
```
`PagedResult<T>` = `Siri.SharedKernel.PagedResult<T>` (page/pageSize clamp เหมือนเดิม: `pageSize ∈ (0,100]` ไม่งั้น 20) · ทุกเมธอดอ่านรับ `instructorProfileId` ที่ผู้เรียกได้จาก `IInstructorProfileReader` ของ token ตัวเอง — **ห้ามรับจาก client** (F10)

---

## 4. คณิตศาสตร์ (pure — `Siri.Modules.Payout.Application.TutoringSplitMath`, unit test ทุกเวกเตอร์)

ตัวแปร: `G` = gross ที่เก็บจริงของ booking · `F` = ค่าธรรมเนียม Stripe ที่ถูกจัดสรรให้ booking · `t` = tutor share % (snapshot) · `K` = G − R (R = เงินที่ตัดสินใจคืนสะสม) — ทศนิยม `decimal` 2 ตำแหน่ง, `MidpointRounding.AwayFromZero` ทุกจุด

```
Compute(K, F, t):
    net      = max(K − F, 0)
    tutor    = Round(net × t / 100, 2, AwayFromZero)
    platform = net − tutor                       // เศษสตางค์ตกเป็นของแพลตฟอร์ม — เหมือน Q4 (platformAmount = remainder)
    return (gross: K, fee: F, platform, tutor)
```
- กรณีไม่คืนเงิน `K = G` ⇒ **เท่ากับสูตร Q4 ของคอร์สทุกประการ** (`net = gross − fee`, `instructor = Round(net×share/100)`, `platform = net − instructor`) · ต่างจากคอร์สเพียงกรณี `net < 0`: คอร์ส floor `net` เป็น 0 (แล้วตัวเลขแถวไม่ balance), Tutoring **clamp `F` ไม่ให้เกิน `G` ตอนบันทึก** (`F_eff = min(F, G)`) จึง balance เสมอ (`gross − fee = platform + tutor`)
- ค่าธรรมเนียมไม่ถูกคืนเมื่อคืนเงินบางส่วน (TUTORING §3.7): `F` คงเดิม คิดกับส่วนที่ "ไม่คืน" `K` (`net = K − F`) ⇒ ติวเตอร์/แพลตฟอร์มรับร่วมกัน 80/20 ของ `K − F` · คืนเต็ม (`K=0`) ⇒ `net=0` ⇒ tutor=platform=0; ค่าธรรมเนียมที่ Stripe ไม่คืนเป็นต้นทุนของแพลตฟอร์มซึ่ง **ไม่ปรากฏเป็นตัวเลขลบใน ledger** (ปรากฏใน `PAYMENTS.STRIPE_FEE_AMOUNT` + `REFUNDED_AMOUNT` ฝั่ง Tutoring) — *จุดที่นักบัญชีต้องยืนยัน (Q14.2ค)*

**เวกเตอร์ทดสอบ (ต้องผ่านตรงตัว):**

| # | G | F | t | เหตุการณ์ | ผลที่ต้องได้ |
|---|---|---|---|---|---|
| V1 | 1000.00 | 27.00 | 80 | บันทึกแรก | net 973.00 · tutor **778.40** · platform **194.60** |
| V2 | 1000.00 | 27.00 | 80 | คืน 50% (R=500.00) | K=500 · net 473.00 · tutor **378.40** · platform **94.60** · delta (gross −500.00, fee 0.00, platform −100.00, tutor −400.00) |
| V3 | 333.33 | 9.17 | 80 | บันทึก → คืน R=166.67 | บันทึก: net 324.16 · tutor **259.33** · platform **64.83** · หลังคืน: K=166.66 · net 157.49 · tutor **125.99** · platform **31.50** · delta (gross −166.67, platform −33.33, tutor −133.34) |
| V4 | 1000.00 | 27.00 | 80 | คืนเต็ม, ยังไม่เข้า batch | ทุกแถวของ source เป็น `Reversed` (ไม่มีแถว adjustment) |
| V5 | 1000.00 | 27.00 | 80 | คืนเต็ม, primary อยู่ใน batch Draft | แถว adjustment ใหม่: gross −1000.00, fee 0.00, platform −194.60, tutor −778.40, `Releasable`, `AVAILABLE_AT=now` · Σ INSTRUCTOR ของ source = 0.00 |
| V6 | 1000.00 | 0.00→27.00 | 80 | `ReviseFee` ประมาณ→จริง | ก่อน: tutor 800.00/platform 200.00 · delta (gross 0.00, fee +27.00, platform −5.40, tutor −21.60) · หลัง = V1 |
| V7 | 100.00 | 3.30 | 70.00 | override รายคน | net 96.70 · tutor **67.69** · platform **29.01** |
| V8 | 10.00 | 12.00 | 80 | fee > gross | `F_eff=10.00` · net 0.00 · tutor 0.00 · platform 0.00 (identity balance) |
| V9 | 10.01 | 0.00 | 80 | rounding | tutor Round(8.008)=**8.01** · platform **2.00** |
| V10 | 1000.00 | 27.00 | 80 | คืนเต็ม-ยังไม่เข้า batch (ทุกแถว `Reversed`) → **void/refund ล้ม** (cumulative กลับเป็น 0.00) | **reinstate:** INSERT แถว adjustment ใหม่ (`ENTRY_KEY=adj:{refundId:N}:2`) ค่า = `Compute(1000.00, 27.00, 80)` = gross +1000.00, fee +27.00, platform +194.60, tutor +778.40; `ESCROW_STATE/AVAILABLE_AT` คัดจาก primary ที่ Reversed · Σ แถวไม่ Reversed = V1 · แถว `Reversed` เดิมไม่ถูกแก้ |
| V11 | 1000.00 | 27.00 | 80 | คืนเต็ม-primary อยู่ใน batch Draft (V5) → void | adjustment บวก: gross +1000.00, fee 0.00, platform +194.60, tutor +778.40 (`Releasable`, `AVAILABLE_AT=now`) · Σ INSTRUCTOR ของ source = 778.40 อีกครั้ง |

**ISO week (`IsoWeekKey`, pure, `Siri.Modules.Payout.Application`)** — เขตเวลา: ไทยคงที่ UTC+7 ไม่มี DST ⇒ ใช้ `ThaiOffset = TimeSpan.FromHours(7)` (ไม่พึ่ง tz database ของ OS):
- `FromUtc(utc) = $"{ISOWeek.GetYear(local):D4}-W{ISOWeek.GetWeekOfYear(local):D2}"` โดย `local = utc + ThaiOffset`
- `TryParse(key, out year, out week)`: regex `^(\d{4})-W(\d{2})$` · `1 ≤ week ≤ ISOWeek.GetWeeksInYear(year)` (W53 ถูกต้องเฉพาะปีที่มี 53 สัปดาห์)
- `StartUtc(key) = ISOWeek.ToDateTime(year, week, DayOfWeek.Monday) − ThaiOffset` (kind Utc) · `EndExclusiveUtc = StartUtc + 7 วัน`

| input (UTC) | → key | เหตุผล |
|---|---|---|
| 2026-10-11T16:59:59.999Z | `2026-W41` | อาทิตย์ 23:59:59.999 เวลาไทย |
| 2026-10-11T17:00:00.000Z | `2026-W42` | จันทร์ 00:00 เวลาไทย |
| 2026-12-27T16:59:59.999Z | `2026-W52` | |
| 2026-12-27T17:00:00Z (จันทร์ 28 ธ.ค. ไทย) … 2027-01-03T16:59:59.999Z | `2026-W53` | ปี 2026 มี 53 สัปดาห์ (1 ม.ค. เป็นวันพฤหัส) — ข้ามปีปฏิทินแต่ยังเป็น W53 ของ 2026 |
| 2027-01-03T17:00:00Z | `2027-W01` | |
| 2024-12-29T17:00:00Z (จันทร์ 30 ธ.ค. 2024 ไทย) | `2025-W01` | week-year ≠ calendar year |
| 2020-12-31T17:00:00Z (ศุกร์ 1 ม.ค. 2021 ไทย) | `2020-W53` | |
| `2026-W53`, `2025-W53`? | ถูก / **ไม่ถูก** (2025 มี 52 สัปดาห์) | `GetWeeksInYear` |
| `2026-W00`, `2026-W54`, `2026-w41`, `26-W41`, `2026-W4` | ไม่ถูก | |

---

## 5. ความหมายของแต่ละการดำเนินการ (ใน `TutoringEscrowContract`; ทุกอย่างอยู่ในแถว `REVENUE_SPLITS` — ไม่มีตารางใหม่)

### 5.1 รูปแบบแถวของ 1 booking
| แถว | `ENTRY_KEY` | เมื่อไหร่ | ค่า |
|---|---|---|---|
| หลัก (primary) | `rec:{ref:N}` | `RecordTutoringSplit` | gross=G, fee=F_eff, platform, tutor จาก `Compute(G,F_eff,t)`; `REVENUE_SHARE_PERCENT=t`; `PERIOD_KEY=IsoWeekKey.FromUtc(PaymentSucceededAtUtc)`; `STATUS=Pending`; `ESCROW_STATE=Held`; `AVAILABLE_AT=null`; `ORDER_ITEM_ID=SOURCE_REF_ID=ref`; `SOURCE_TYPE=Tutoring` |
| ปรับยอด | `adj:{refundId:N}:{seq}` / `fee:{ref:N}:{satang}` | `ReverseBySource` / `ReviseFee` ที่ผลต่าง ≠ 0 | ค่าคือ **ส่วนต่าง** (อาจลบ); `REVENUE_SHARE_PERCENT=t` เดิม; `PERIOD_KEY`=สัปดาห์ปัจจุบัน; สถานะตามกฎ §5.5 |

### 5.2 `ScheduleRelease(at)`
ล็อกแถว source → ถ้า primary `Reversed` ⇒ `Reversed` · primary in-flight/Paid ⇒ `NoChange` (ปล่อยไปแล้ว) · `Frozen` ⇒ `Frozen` (ไม่ทำ) · ทุกแถว unbatched ไม่ Reversed: `Held` ⇒ `Releasable`, `AVAILABLE_AT=at` · `Releasable` และ `at <` เดิม ⇒ ขยับเร็วขึ้น · `at ≥` เดิม ⇒ `NoChange` (idempotent) · ไม่มีแถว ⇒ `NotFound` · **เวลา `at` คำนวณโดยผู้เรียก (Tutoring) ตามมติ D-A: `max(session.ENDS_AT_UTC, decidedAt) + Tutoring:DisputeWindowHours` (ปล่อยทันที = `now` เฉพาะ learner confirm-completed/admin) — Payout ไม่รู้สูตรและไม่อ่าน `DisputeWindowHours`**

### 5.3 `Freeze` / `Unfreeze`
`Freeze`: primary in-flight/Paid ⇒ **`TooLate`** (ไม่เปลี่ยนอะไร — ผู้เรียก (dispute) ต้องจัดการเอง: คืนเงินผ่าน refund + adjustment ลบรอบถัดไป) · primary Reversed ⇒ `Reversed` · ที่เหลือ: ทุกแถว unbatched ⇒ `Frozen`, `AVAILABLE_AT=null` (รวม adjustment ที่ตามมา) · ซ้ำ ⇒ `NoChange` · `Unfreeze(at?)`: `Frozen` ⇒ `Held` (at=null) หรือ `Releasable` (at) · อย่างอื่น ⇒ `NoChange` (**ห้ามปล่อย Frozen โดยบังเอิญผ่าน ScheduleRelease** — ต้อง Unfreeze ชัดเจน)

### 5.4 `RecordTutoringSplit`
ตรวจ argument → `existing = rec:{ref}`: มี ⇒ ตรวจ `GrossAmount` และ `InstructorProfileId` ตรงเดิม (ไม่ตรง ⇒ `InvalidOperationException`) ⇒ snapshot `AlreadyExisted=true` · ไม่มี ⇒ `F_eff = min(PaymentFeeAmount ?? Round(G × Payout:EstimatedPaymentFeePercent/100, 2, AwayFromZero), G)` ⇒ `Compute` ⇒ insert primary ⇒ snapshot (`Escrow=Held`) · ชน UQ `ENTRY_KEY` (race) ⇒ `DbUpdateException` ถึงผู้เรียก (webhook rollback → retry → เห็น existing)

### 5.5 `ReverseBySource` (ยอดคืนบางส่วนและเต็ม) และ `ReviseFee` — "reconcile to target"
```
rows    = ล็อกทุกแถวของ source ที่ STATUS ≠ Reversed
primary = แถว ENTRY_KEY = rec:{ref} (รวมที่ STATUS=Reversed — ใช้อ่าน G, t, F ต้นทาง)   // ไม่พบแถว rec:{ref} เลย ⇒ NotFound
G = primary.GROSS_AMOUNT (คงที่), t = primary.REVENUE_SHARE_PERCENT
cur = Σ ของ (GROSS, FEE, PLATFORM, INSTRUCTOR) ทุกแถวใน rows         // rows ว่าง (ทุกแถวถูก Reversed) ⇒ cur = 0 และ F = primary.PAYMENT_FEE_AMOUNT
ReverseBySource:  R = clamp(CumulativeRefundedGross, 0, G);  K = G − R;  F = cur.FEE
ReviseFee:        K = cur.GROSS;                                F = NewPaymentFeeAmount (clamp ≤ K)
target = Compute(K, F, t)
delta  = target − cur   (ทั้ง 4 คอลัมน์)
1) มีแถวที่ ENTRY_KEY = request.EntryKey แล้ว  ⇒ NoChange            (idempotent ตามเหตุการณ์)
2) delta = 0 ทุกคอลัมน์                          ⇒ NoChange
3) ReverseBySource ∧ K = 0 ∧ ทุกแถวใน rows ไม่มี PAYOUT_BATCH_ITEM_ID และ STATUS ∈ {Pending, Payable} ⇒ พลิกทุกแถวเป็น Reversed ⇒ Changed (snapshot.Reversed=true)
4) อื่น ๆ ⇒ INSERT แถว adjustment (ENTRY_KEY = request.EntryKey, ค่า = delta, STATUS = Pending):
     • ถ้า primary และทุกแถวยัง unbatched ⇒ คัด ESCROW_STATE/AVAILABLE_AT จาก primary (Held/Frozen/Releasable+T) — ปล่อยพร้อมกัน
     • ถ้ามีแถว in-flight หรือ Paid ⇒ ESCROW_STATE=Releasable, AVAILABLE_AT=now (เข้า batch ถัดไปทันที — "แถวติดลบหลังจ่ายแล้ว AVAILABLE_AT=ทันที" ตาม TUTORING §3.8)
   ⇒ Changed
```
- ผลรวมของแถวไม่ Reversed ของ source **เท่ากับ `target` เสมอ** ไม่ว่าลำดับ/จำนวนครั้งของเหตุการณ์ (property test §12.B)
- **Reinstate (ทางกู้ของ "คืนเต็ม → ล้ม/void", ข้อ 12 รอบ 2):** การพลิก `Reversed` (ข้อ 3) เป็น terminal ของ*แถวนั้น* แต่ **ไม่ใช่ของ source** — เมื่อผู้เรียกส่ง `ReverseBySource` ด้วย `CumulativeRefundedGross` ที่ลดลง (refund `Failed`/`Voided` ⇒ `target.K > 0`) และ `rows` ว่าง ⇒ ขั้น 4 INSERT แถว adjustment บวกที่ `ENTRY_KEY = request.EntryKey` (`adj:{refundId:N}:{seq}`) ค่า = `Compute(K, F_primary, t)` ทั้ง 4 คอลัมน์ (= delta เพราะ cur = 0), `STATUS=Pending`, `ESCROW_STATE/AVAILABLE_AT` คัดจาก primary ที่ Reversed (Held/Frozen/Releasable+T) ⇒ `Changed` (ไม่ใช่ `Reversed`) — append-only ไม่แก้แถว `Reversed` เดิม · outcome `Reversed` เหลือเฉพาะ "คืนเต็มซ้ำด้วย key ใหม่ในขณะ rows ว่างและ target ยัง 0" (⇒ `NoChange`/`Reversed` ตาม §5.5 ข้อ 2) · `ReviseFee` ขณะ `rows` ว่าง ⇒ `Reversed` (ไม่มีอะไรให้แก้) · **ผู้เรียก (P13-08 §5.6 void, §6.3/§6.4 Failed→คืน) เรียกทางนี้เพื่อไม่ให้ติวเตอร์เสียเงินขณะผู้เรียนไม่ได้รับเงินคืนจริง** (V10, V11)
- *ไม่เคยแก้ตัวเลขของแถวที่มีอยู่* (ledger append-only ในทางปฏิบัติ) ยกเว้นการพลิกสถานะ `Pending|Payable→Reversed` ของกรณีคืนเต็ม-ยังไม่เข้า batch และการเปลี่ยน `ESCROW_STATE/AVAILABLE_AT/STATUS` ตามวงจรชีวิต
- `Paid` ⇒ แถวลบรอบถัดไปเสมอ (ไม่แก้ batch เก่า) · carry-forward: ยอดลบรวมที่ทำให้ผลรวมต่อผู้สอน `< MinimumPayoutAmount` จะถูกยกไปรอบถัดไปตามเดิม (ไม่มี clawback อัตโนมัติ — Open decision #6)

---

## 6. Eligibility (เลือกแถวเข้า batch)

### 6.1 predicate ใหม่ (`RevenueSplitQueries` — `internal static`, ใช้ร่วมกันทั้ง EF repository และเทสต์เหนือ `IQueryable` ในหน่วยความจำ ตามรูปแบบเดิมของไฟล์)
```csharp
// คอร์ส: 3 เงื่อนไขเดิมเหมือนเดิมทุกตัว (ลำดับเดิม) + 1 conjunct ที่เพิ่ม
internal static IQueryable<REVENUE_SPLIT> EligibleCourseSplits(IQueryable<REVENUE_SPLIT> source, DateTime holdCutOffUtc) =>
    source.Where(r => (r.STATUS == RevenueSplitStatus.Pending || r.STATUS == RevenueSplitStatus.Payable)
                      && r.CreatedAtUtc <= holdCutOffUtc
                      && r.PAYOUT_BATCH_ITEM_ID == null
                      && r.SOURCE_TYPE == PayoutSourceType.Course);          // ← conjunct เดียวที่เพิ่ม

internal static IQueryable<REVENUE_SPLIT> EligibleTutoringSplits(IQueryable<REVENUE_SPLIT> source, DateTime cutoffUtc) =>
    source.Where(r => r.SOURCE_TYPE == PayoutSourceType.Tutoring
                      && (r.STATUS == RevenueSplitStatus.Pending || r.STATUS == RevenueSplitStatus.Payable)
                      && r.PAYOUT_BATCH_ITEM_ID == null
                      && r.ESCROW_STATE == TutoringEscrowState.Releasable
                      && r.AVAILABLE_AT_UTC != null && r.AVAILABLE_AT_UTC <= cutoffUtc);
```
`RevenueSplitRepository.GetEligibleSplitsForPayoutAsync(holdCutOffUtc)` = `EligibleCourseSplits(dbContext.RevenueSplits(), holdCutOffUtc).ToListAsync(...)` (ลายเซ็นและ tracking เหมือนเดิม) · Tutoring ใช้ `ITutoringSplitRepository.LockEligibleForBatchAsync(cutoffUtc)` = `EligibleTutoringSplits` + `FOR UPDATE` (ผ่าน raw SQL ที่ตรงกับ predicate เป๊ะ; PG ตรวจเงื่อนไข WHERE ซ้ำหลังได้ lock ⇒ แถวที่ Freeze/Reverse พอดีจะหลุดเอง)

> *Deviation จาก `TUTORING.md` §3.8:* ไม่ใช้ query เดียวแบบ `OR` สองกฎ — batch ต่อแหล่ง (`SOURCE_TYPE`) ดังนั้นสอง query แยกที่ **ไม่มีทางปนกัน** ถูกต้องกว่า (OR จะดึงแถวคอร์สเข้ารอบสัปดาห์และกลับกัน)

### 6.2 ข้อห้ามที่ต้องพิสูจน์ด้วยเทสต์ ("คอร์สไม่ regress")
1. เทสต์เดิมทั้ง 5 ไฟล์ของ Payout + `PayoutBatchServiceTests` + `RevenueSplitContractTests` **ผ่านโดยไม่แก้**
2. **golden test:** เก็บ lambda เดิมของ `GetEligibleSplitsForPayoutAsync` ไว้ในไฟล์เทสต์แบบคัดลอกตัวอักษร; สร้างแถว `Course` ครบทุกผสม (STATUS ∈ 4 ค่า × `CreatedAtUtc` ที่ cutoff−1ms/พอดี/+1ms × `PAYOUT_BATCH_ITEM_ID` null/มีค่า) ⇒ `EligibleCourseSplits` คืนชุดเดียวกับ lambda เดิมทุกกรณี
3. แถว `Tutoring` ที่ผ่านเงื่อนไขเดิมครบ 3 ข้อ (Pending, เก่ากว่า 14 วัน, ไม่มี item) **ไม่อยู่** ใน `EligibleCourseSplits`
4. `GetTotalEarningsAsync`/`GetPendingEarningsAsync`/`GetPayoutHistoryForInstructorAsync`/`CountPayoutHistoryForInstructorAsync` เพิ่ม conjunct `SOURCE_TYPE == Course` (history: `batch.SOURCE_TYPE == Course`) ⇒ ยอดหน้า `/instructor/earnings` ของคอร์สไม่ปนยอด Tutoring; เทสต์: ผู้สอนมีทั้งสองชนิด ⇒ ผลของ service เดิม = ผลก่อนมีแถว Tutoring
5. `NetForInstructorPeriod`/`InstructorRevenueReader` ไม่แก้ (คีย์รายเดือน ≠ รายสัปดาห์ — F9) แต่มีเทสต์กำกับว่าแถว Tutoring ไม่ถูกนับ
6. `POST /api/payout/admin/revenue-splits` (เดิม) สร้างได้เฉพาะ `Course` (`SOURCE_REF_ID/ENTRY_KEY/ESCROW_STATE` เป็น null) — เทสต์ยืนยัน และ **ไม่เพิ่มช่องทางสร้างแถว Tutoring นอก `ITutoringEscrowContract`**

---

## 7. Batch รายสัปดาห์ — `TutoringPayoutBatchService` (ไฟล์ใหม่; `PayoutBatchService.CreateAsync` ของคอร์สไม่แตะ)

`Task<Result<PayoutBatchResponse>> CreateWeeklyAsync(string periodKey, CancellationToken)`:
1. `IsoWeekKey.TryParse` ไม่ผ่าน ⇒ `Validation.WithReason("payout.invalid_period_key")`
2. `now = IClock`; `now < StartUtc(key)` ⇒ `Conflict.WithReason("payout.period_not_started")` (ห้ามสร้างรอบอนาคต)
3. มี batch `SOURCE_TYPE=Tutoring ∧ PERIOD_KEY=key` ทุกสถานะ ⇒ `Conflict.WithReason("payout.batch_exists")` (UQ partial กันซ้ำระดับ DB: ชน ⇒ จับ `DbUpdateException` ⇒ 409 เหมือนกัน)
4. `cutoff = min(now, EndExclusiveUtc − 1ms)` (สร้างช้า ⇒ ไม่ดึงแถวที่พร้อมหลังสิ้นสัปดาห์ — ไปรอบถัดไป)
5. **transaction เดียว:** `rows = LockEligibleForBatchAsync(cutoff)` → group ตาม `INSTRUCTOR_ID` → `verifiedAccounts = GetVerifiedAccountsAsync(ids)` → ต่อผู้สอน: ไม่มีบัญชียืนยัน ⇒ ข้าม · `total = Σ INSTRUCTOR_AMOUNT` (รวม adjustment ลบ) < `MinimumPayoutAmount` ⇒ ข้าม (ยกไปรอบถัดไป ทบยอด) · ไม่งั้น `pct = Payout:Tutoring:WithholdingTaxPercent ?? Payout:WithholdingTaxPercent`; `wht = Round(total × pct/100, 2, AwayFromZero)`; `net = total − wht`; `item = batch.AddItem(instructorId, total, pct, wht, net)`; ทุกแถว: `MarkPayable()` + `AssignToBatchItem(item.PAYOUT_BATCH_ITEM_ID)` (id เป็น UUIDv7 ที่สร้างฝั่ง client ตั้งแต่ `Create` ⇒ ผูกได้ใน pass เดียว ต่างจากคอร์สที่ต้องบันทึกสองรอบ)
6. ไม่มี item เลย ⇒ **ไม่บันทึกอะไร** ⇒ `Conflict.WithReason("payout.nothing_to_pay")` (*ต่างจากคอร์สที่บันทึก batch ว่าง* — ตั้งใจ: batch ว่างจะล็อกสัปดาห์นั้นไว้ผ่าน UQ โดยไม่มีทางลบ)
7. `SaveChangesAsync` ครั้งเดียว ⇒ `PayoutBatchResponse` (`SourceType=Tutoring`)

`ExecuteBatchAsync` / `ExportBatchTransferFileAsync` / `GetTaxCertificateAsync` เดิม **ใช้ร่วมได้เลย** (ทำงานกับ item ทุกชนิด) — ข้อควรรู้: execute เรียก `MarkPaid` ทุกแถวของ item โดยไม่ตรวจ ⇒ ความปลอดภัยของ Tutoring อยู่ที่ "ไม่เคย Reverse/Freeze แถว in-flight" (§5.3/5.5 บังคับแล้ว) · ชื่อไฟล์ export มี `PERIOD_KEY` อยู่แล้ว (`payout-batch-2026-W41-….csv`)

**API (additive — ผู้เรียกเดิมไม่กระทบ):**
- `POST /api/payout/admin/batches` (`AdminOnly` เดิม): body `CreatePayoutBatchCommand(string PeriodKey, string? SourceType = null)`; `null`/`"Course"` ⇒ `PayoutBatchService.CreateAsync` เดิม (validator เดิม `YYYY-MM`); `"Tutoring"` ⇒ `TutoringPayoutBatchService.CreateWeeklyAsync` (validator: week regex `^\d{4}-W\d{2}$` + `IsoWeekKey`); ชนิดอื่น ⇒ 400. เลือก service ที่ **controller** (ternary เดียว) เพื่อไม่แตะตัว `PayoutBatchService`
- `GET /api/payout/admin/batches?page&pageSize&sourceType=` — กรองเพิ่มได้ (ไม่ส่ง = ทุกชนิด เหมือนเดิม) · `PayoutBatchResponse` เพิ่ม `SourceType` (ท้ายสุด, default `Course`)
- `GET /api/payout/admin/revenue-splits?…&sourceType=` — กรองเพิ่ม · `RevenueSplitResponse` เพิ่ม (ท้ายสุด, optional) `SourceType`, `SourceRefId?`, `EscrowState?`, `AvailableAtUtc?`
- ไม่มี endpoint รันอัตโนมัติ: การสร้าง/execute ทุกรอบเป็น action ของ admin (X-38 ข้อ 3 ยังเปิด; รอบ "ทุกจันทร์ 10:00" เป็นเพียงเวลาที่ `nextPayoutAtUtc` ประมาณการ) — Open decision #4

**`TutoringPayoutSchedule.NextBatchAtUtc(nowUtc, options)`** (pure): local = now+7h; หา `BatchDayOfWeek` ถัดไปที่ `BatchHourLocal:00` **เลยหลัง** local ปัจจุบัน (ถ้าวันนี้เป็นวันนั้นแต่เลยเวลาแล้ว ⇒ สัปดาห์หน้า) แล้วลบ 7 ชม. กลับเป็น UTC · เวกเตอร์: จันทร์ 09:59 ไทย → จันทร์ 10:00; จันทร์ 10:00:00.000 ไทย → จันทร์ถัดไป (strictly after); อาทิตย์ 23:59 → จันทร์ 10:00

---

## 8. Wallet ฝั่ง Tutoring (controller `Siri.Api/Controllers/Tutoring/TutorWalletController.cs`)

กฎ: `[Authorize(Policy = AuthorizationPolicyNames.InstructorOnly)]` (**ไม่ใช้ `TutorOnly`** — ติวเตอร์ที่ถูกระงับต้องเห็นเงินที่ค้างได้) · `instructorProfileId` มาจาก `IInstructorProfileReader.GetProfileIdByUserIdAsync(IUserContext.UserId)` เท่านั้น; ไม่มีโปรไฟล์ ⇒ ตอบ summary ศูนย์/ลิสต์ว่าง (พฤติกรรมเดียวกับ `InstructorEarningsService`) · rate limit `tutoring-user` (60 req/60 วิ/ผู้ใช้ — policy ของ P13-01 §7; ไม่สร้างใหม่) · ทุก response `Cache-Control: no-store` (ข้อมูลการเงินส่วนบุคคล) · ไม่คืนอีเมล/ชื่อผู้เรียน/ผู้ปกครองใด ๆ

| Endpoint | Response |
|---|---|
| `GET /api/tutoring/tutor/wallet` | `TutorWalletResponse(TutoringWalletSummary Summary, decimal CommissionPercent, decimal TutorSharePercent, string PayoutCadence)` — commission = `TUTOR_PROFILES.COMMISSION_PERCENT_OVERRIDE ?? Tutoring:DefaultCommissionPercent` (ใช้กับ booking *ใหม่*; booking เดิมใช้ snapshot ในแถว) · `PayoutCadence="Weekly"` |
| `GET /api/tutoring/tutor/wallet/ledger?page&pageSize` | `PagedResult<TutorLedgerRow>` — Tutoring เติม `BookingNo`/`SessionStartsAtUtc` โดย `SELECT … FROM TUTOR_BOOKINGS WHERE BOOKING_ID IN (…) AND <ติวเตอร์เป็นเจ้าของ session>` (batch query เดียว ห้าม N+1) · แถวที่ `SourceRefId` ไม่ใช่ booking แต่เป็น `TUTOR_PACKAGE_CREDITS.CREDIT_ID` (เครดิตแพ็กเกจที่หมดอายุแล้วปล่อยให้ติวเตอร์ — P13-12 §6.3) ⇒ `SourceKind="PackageExpiry"`, `BookingNo`/`SessionStartsAtUtc` = null (lookup เป็น batch query เดียวเช่นกัน) · นอกนั้น `SourceKind="Booking"` |
| `GET /api/tutoring/tutor/wallet/payouts?page&pageSize` | `PagedResult<TutoringPayoutHistoryItem>` (เฉพาะ batch Tutoring) · เอกสาร 50 ทวิ ใช้ `GET /api/payout/instructor/tax-certificates/{batchItemId}` เดิม |
| บัญชีธนาคาร | endpoint `payout-account` เดิม **ไม่แก้** (`PUT/GET /api/payout/instructor/payout-account`) |

`TutorLedgerRow(Guid EntryId, Guid BookingId, string? BookingNo, DateTime? SessionStartsAtUtc, TutoringLedgerEntryKind Kind, decimal GrossAmount, decimal PaymentFeeAmount, decimal PlatformAmount, decimal TutorAmount, TutoringLedgerState State, DateTime? AvailableAtUtc, DateTime CreatedAtUtc, string SourceKind)` (`Booking` | `PackageExpiry`; เพิ่มโดย P13-12) — แสดงค่าธรรมเนียม/คอมมิชชันแยกบรรทัดตาม Q4 ("ต้องบอกผู้สอนให้ชัด")

**ตัดสิน `TutoringLedgerState` (ที่เดียว — `TutoringLedgerStateResolver`, unit test ทุกแถว):** `Reversed` ถ้า STATUS=Reversed · `Paid` ถ้า STATUS=Paid · `Processing` ถ้ามี `PAYOUT_BATCH_ITEM_ID` · ไม่งั้นตาม `ESCROW_STATE`: `Frozen`→`Frozen` · `Held`→`Held` · `Releasable`→(`AVAILABLE_AT ≤ now` ? `Available` : `InDisputeWindow`)

---

## 9. ไฟล์ที่แตะ (ทุกจุด additive)

| ไฟล์ | การเปลี่ยน |
|---|---|
| `Domain/REVENUE_SPLIT.cs` | + property/factory/mutator ใหม่ (§2.5); `Create/CreateAdjustment/Reverse/MarkPaid` เดิม **ไม่แก้พฤติกรรม** |
| `Domain/PAYOUT_BATCH.cs` | + `SOURCE_TYPE`, overload `Create(periodKey, sourceType)` |
| `Domain/PayoutSourceType.cs`, `TutoringEscrowState.cs` | ใหม่ |
| `Infrastructure/RevenueSplitConfiguration.cs`, `PayoutBatchConfiguration.cs` | คอลัมน์/ index/ CHECK / `PERIOD_KEY` varchar(8) |
| `Infrastructure/RevenueSplitRepository.cs` | `GetEligibleSplitsForPayoutAsync` → `EligibleCourseSplits`; + conjunct ใน `GetTotalEarningsAsync`/`GetPendingEarningsAsync` |
| `Infrastructure/PayoutBatchRepository.cs` | + conjunct ใน history/count; + `GetByPeriodKeyAsync(key, sourceType)` (default member ใน interface) |
| `Application/RevenueSplitQueries.cs` | + `EligibleCourseSplits`, `EligibleTutoringSplits` |
| `Application/IRevenueSplitRepository.cs`, `IPayoutBatchRepository.cs` | **ห้ามเพิ่มสมาชิก abstract** (F7) — ถ้าจำเป็นใช้ default member |
| `Application/ITutoringSplitRepository.cs` + `Infrastructure/TutoringSplitRepository.cs` | ใหม่ (sibling): `LockBySourceAsync`, `GetByEntryKeyAsync`, `LockEligibleForBatchAsync`, `Add`, `SaveChangesAsync` |
| `Application/TutoringSplitMath.cs`, `IsoWeekKey.cs`, `TutoringPayoutSchedule.cs`, `TutoringPayoutBatchService.cs` | ใหม่ |
| `Application/PayoutBatchModels.cs` | + `SourceType` ใน command/response; validator แตกตาม `SourceType` |
| `Application/RevenueSplitModels.cs` | response + field optional ท้ายสุด |
| `Contracts/ITutoringEscrowContract.cs`, `IPayoutWalletReader.cs` | ใหม่ (§3) |
| `Infrastructure/Contracts/TutoringEscrowContract.cs`, `PayoutWalletReader.cs` | ใหม่ |
| `PayoutModule.cs` | DI ใหม่ + `TutoringPayoutOptions` (`Payout:Tutoring`) |
| `Siri.Api/Controllers/Payout/AdminPayoutController.cs` | `CreateBatch` เลือก service; `ListBatches`/`ListRevenueSplits` + query `sourceType` |
| `Siri.Api/Controllers/Tutoring/TutorWalletController.cs` + `RateLimiterConfiguration` | ใหม่ — ใช้ policy `tutoring-user` ของ P13-01; อยู่ใน WP ของ Tutoring (**ใช้ `InstructorOnly`** ซึ่งต่างจากที่ P13-01 §5.2 ระบุให้ wallet ใช้ `TutorOnly` — ตั้งใจ: ติวเตอร์ที่ถูกระงับต้องเห็นเงินที่ค้าง) |
| **ห้ามแตะ** | `RevenueSplitContract.cs`, `IRevenueSplitContract.cs`, `PayoutBatchService.cs`, `InstructorPayoutAccount*`, `PayoutPolicyService.cs`, `InstructorEarningsService.cs`, `InstructorRevenueReader.cs`, `CreateRevenueSplitCommand` (`git diff` ต้องว่างเป็น acceptance ของ WP-F) |

`Siri.Modules.Payout.csproj` ไม่เพิ่ม ProjectReference/package (ไม่ reference Tutoring/Commerce/Identity). ArchitectureTests: Payout ไม่ depend `Siri.Modules.Tutoring` (เพิ่ม test), Tutoring ใช้ `Siri.Modules.Payout.Contracts` เท่านั้น. **Wiring:** `Siri.Modules.Tutoring.csproj` ต้องมี `ProjectReference` → `Siri.Modules.Payout` (ใช้เฉพาะ Contracts) — ใครถึงก่อนเพิ่ม (P13-06/07, README §4); `AddPayoutModule` ลงทะเบียน `ITutoringEscrowContract`/`IPayoutWalletReader` เป็น Scoped ทั้งใน Api และ Workers (Workers ใช้จาก job ของ Tutoring).

---

## 10. Config (ใหม่ — ไม่แตะ `PayoutOptions`)

`TutoringPayoutOptions` section `Payout:Tutoring` (`ValidateOnStart`): `Cadence` = `"Weekly"` (ค่าอื่น ⇒ fail ตอนบูต — ยังไม่รองรับ) · `BatchDayOfWeek` = `Monday` · `BatchHourLocal` = 10 (0–23) · `WithholdingTaxPercent` = `null` (inherit `Payout:WithholdingTaxPercent` 3.00; ตั้งค่าเมื่อนักบัญชีตอบ Q14.2ก; `[0,100]`) · ใช้ `Payout:MinimumPayoutAmount` (500) ร่วม · คอมมิชชัน (`Tutoring:DefaultCommissionPercent`) และ `DisputeWindowHours` อยู่ใน `TutoringOptions` ของ P13-01 — Payout **ไม่อ่าน**

**Appsettings:** placeholder ของ `Payout:Tutoring:*` ต้องมีทั้ง `appsettings.json` ของ **Api และ Workers** (ทั้งสอง host ลงทะเบียน `AddPayoutModule` ⇒ `ValidateOnStart` ต้องผ่านทั้งคู่)

**Production guard (ข้อ 15):** ใช้ `Payout:EstimatedPaymentFeePercent` ของ Payout เดิมเป็นตัวประมาณ fee (§5.4) — กฎ "ต้อง `> 0` ใน Production" ถูกเพิ่มที่ `ProductionConfigurationGuard`/`WorkersProductionRequirements` ตาม P13-06 §7 (ผู้เขียนกฎเดียว; P13-07 ไม่ซ้ำ) เพราะ default `0.00` ทำให้ ledger ติวเตอร์ไม่หักค่าธรรมเนียมระหว่างรอ fee จริง

---

## 11. Security

- ไม่มี endpoint ใหม่ใน Payout ที่รับ `instructorId`/`userId` จาก client · contract `ITutoringEscrowContract` ไม่มี HTTP surface (เรียกได้เฉพาะ Tutoring ผ่าน DI) · wallet: ownership = profile id จาก token ใน query เดียวกับข้อมูล (ไม่มี path/query id ให้เดา)
- ตัวเลขการเงินทุกจุด `decimal` 2 ตำแหน่ง; ปฏิเสธ input ที่มีเศษเกิน 2 ตำแหน่งแทนการปัดเงียบ
- แถวเงินไม่มี hard delete / ไม่มี cascade; การเปลี่ยนสถานะทำผ่าน mutator ใน domain เท่านั้น; ทุกเหตุการณ์ที่เปลี่ยนเงินมี `ENTRY_KEY` ที่ UQ ⇒ replay ไม่เบิ้ล · audit ทำที่ผู้เรียก (Tutoring) ใน transaction เดียวกัน
- ไม่ log เลขบัญชี/ภาษี (ไม่ถูกแตะ); ไม่มีข้อมูลผู้เรียน/ผู้เยาว์ใน Payout เลย (มีแค่ booking id)
- migration: ทดสอบกับข้อมูลคอร์สจริงก่อน; `Down()` กันทำข้อมูลเงินหาย

---

## 12. Test checklist

**A. คอร์สไม่ regress:** ข้อ 1–6 ของ §6.2 ครบ (golden predicate, เทสต์เดิมไม่แก้, earnings/history course-only, `POST admin/revenue-splits` ยังเป็น Course)
**B. Unit (pure + in-memory fake `ITutoringSplitRepository`):** `TutoringSplitMath` เวกเตอร์ V1–V9 ตรงตัว + property test (สุ่ม G∈[0.01,5000], F, t∈(0,100], R: Σแถวหลังลำดับ `Record → Reverse(R1) → Reverse(R2) → ReviseFee` สุ่มลำดับ = `Compute(K,F,t)` เสมอ; Σ `gross − fee − platform − tutor = 0` เมื่อ `F ≤ K`) · `IsoWeekKey` ตารางใน §4 ทุกแถว + ทุกสัปดาห์ของปี 2020–2030 round-trip (`FromUtc(StartUtc(key)) == key`, `FromUtc(EndExclusive−1ms) == key`, `FromUtc(EndExclusive) == next(key)`) · `Record`: ครั้งแรก/ซ้ำ idempotent/ซ้ำแต่ gross ต่าง ⇒ throw/fee null ⇒ ประมาณตาม `EstimatedPaymentFeePercent`/fee>gross clamp/argument ผิดทุกแบบ · `ScheduleRelease`: Held→Releasable, เร็วขึ้น, ช้าลง=NoChange, Frozen=Frozen(ไม่ปล่อย), in-flight=NoChange, Reversed, NotFound · `Freeze`: Held/Releasable→Frozen, in-flight/Paid=TooLate, ซ้ำ=NoChange · `Unfreeze` สองทาง · `ReverseBySource`: ตาราง V2–V5 + คืนสองครั้งสะสม + replay ด้วย `EntryKey` เดิม=NoChange + adjustment ตามหลัง primary ที่ Frozen/Releasable คัดสถานะถูก + in-flight ⇒ adjustment immediate · `ReviseFee` V6 + replay · `TutoringLedgerStateResolver` ทุกแถว · `TutoringPayoutSchedule` เวกเตอร์ §7 · `CreateWeeklyAsync`: key ผิด/อนาคต/ซ้ำ/ไม่มีผู้มีสิทธิ์ ⇒ `nothing_to_pay` ไม่บันทึก/ยอดต่ำกว่า 500 ยกไป/ไม่มีบัญชียืนยันข้าม/ติดลบรวมยกไป/ภาษี override vs inherit/cutoff = min(now, สิ้นสัปดาห์) (แถวที่ AVAILABLE_AT หลังสิ้นสัปดาห์ไม่ถูกเลือก) · แถว Frozen/Held/in-flight/Reversed ไม่ถูกเลือก
**C. Wallet:** ผลรวมแต่ละ bucket ถูกกับชุดแถวผสม (Held, InDisputeWindow, Frozen, Available, Processing, Paid, Reversed) · ผู้สอนคนอื่นไม่ปน · `MeetsMinimum` ที่ขอบ 500.00/499.99 · `EstimatedNetAvailable` เมื่อ Available ติดลบ = 0 − 0 · `GetTutoringRevenueTotalsAsync` ช่วงครึ่งเปิด
**D. Integration (PostgreSQL 17 จริง):** **migration test:** สร้าง DB ที่ migration ก่อนหน้า + แทรกแถวคอร์สหลายสถานะ/batch เดือน → apply → ทุกแถว `SOURCE_TYPE='Course'`, `PERIOD_KEY` ไม่เพี้ยน, CHECK ผ่าน, `GetEligibleSplitsForPayoutAsync` ให้ชุดเดียวกับก่อน apply · CHECK/UQ ทำงานจริง (insert แถว Tutoring ที่ไม่มี `ENTRY_KEY` ⇒ ล้ม; `ENTRY_KEY` ซ้ำ ⇒ ล้ม; `PAYOUT_BATCHES` Tutoring คีย์เดือน ⇒ ล้ม; สอง batch Tutoring คีย์เดียวกัน ⇒ ล้ม) · `Down()` ปฏิเสธเมื่อมีแถว Tutoring · lock: Freeze พร้อม `CreateWeekly` (สอง scope) ⇒ ไม่มีแถวที่ทั้ง batched และ Frozen · Record ซ้ำพร้อมกัน ⇒ แถวหลักเดียว · ครบวงจร: Record → ScheduleRelease(now−1) → CreateWeekly → Execute → Paid → Reverse เต็ม ⇒ แถวลบ immediate → รอบถัดไป net = 0 ⇒ ยกไป · export CSV ของ batch Tutoring · **SQL ดิบทุกคำสั่งของ contract รันจริง (ข้อ 11):** `SELECT … FOR UPDATE` แบบ per-source และแบบ batch (§3 ข้อ 3) รันบน PostgreSQL 17 ผ่าน `TutoringSplitRepository` — ยืนยันว่าชื่อคอลัมน์ตรง `RevenueSplitConfiguration` (`CREATED_AT_UTC`, `REVENUE_SPLIT_ID`, `SOURCE_TYPE`, `SOURCE_REF_ID`, `ESCROW_STATE`, `AVAILABLE_AT_UTC`, `PAYOUT_BATCH_ITEM_ID`, `STATUS`) และคืนแถวตาม predicate จริง · **reinstate (ข้อ 12):** Record → Reverse เต็ม (ยังไม่เข้า batch ⇒ Reversed) → Reverse ด้วย cumulative 0 ⇒ แถว adjustment บวก + Σ แถวไม่ Reversed = Compute เดิม (V10); Record → เข้า batch Draft → Reverse เต็ม → void (V11); replay ด้วย `EntryKey` เดิม ⇒ NoChange; **property test** เพิ่มเหตุการณ์ `void` (cumulative ลดลง) ในลำดับสุ่ม ⇒ Σ = `Compute(K,F,t)` เสมอ

---

## 13. Frontend notes + DTO appendix
- หน้า **กระเป๋าเงินติวเตอร์** (`/instructor/tutoring/wallet`, P13-25; CSR, `noindex`): การ์ดสรุป 5 ช่อง (รอปล่อย `heldAmount`, ติดข้อพิพาท `frozenAmount`, พร้อมถอน `availableAmount`, กำลังประมวลผล `processingAmount`, จ่ายแล้ว `paidAmount`) + ข้อความ "ภาษีหัก ณ ที่จ่าย {pct}% / ขั้นต่ำ {min} / ประมาณการสร้างรอบถัดไป {nextPayoutAtUtc}" (ระบุว่าประมาณการ ต้องรอ admin โอน) + ตารางรายการ (ค่าธรรมเนียม Stripe และคอมมิชชันแยกคอลัมน์) + ประวัติการโอนพร้อมลิงก์ใบ 50 ทวิ · ถ้า `hasVerifiedPayoutAccount=false` ⇒ แบนเนอร์ชี้ไปหน้าบัญชีธนาคารเดิม · ไม่มี mock/ตัวเลขตัวอย่าง; loading/error/empty ครบ; ยอดติดลบแสดงเป็น "ยอดหักคืน (รอบหน้า)"
- ฝั่ง admin: หน้ารอบจ่ายเดิมเพิ่มตัวเลือก "ชนิด: คอร์ส/ติวเตอร์" (ส่ง `sourceType`) + ช่องคีย์สัปดาห์ `YYYY-Www` (ตัวเลือกสัปดาห์ล่าสุด) + แสดง `sourceType` ในรายการ
```ts
type PayoutSourceType = 'Course' | 'Tutoring';
type TutoringLedgerEntryKind = 'Earning' | 'Adjustment';
type TutoringLedgerState = 'Held' | 'InDisputeWindow' | 'Frozen' | 'Available' | 'Processing' | 'Paid' | 'Reversed';
interface TutoringWalletSummary {
  heldAmount: number; frozenAmount: number; availableAmount: number; processingAmount: number; paidAmount: number;
  withholdingTaxPercent: number; estimatedNetAvailable: number; minimumPayoutAmount: number; meetsMinimum: boolean;
  hasVerifiedPayoutAccount: boolean; nextPayoutAtUtc: string; currency: 'THB';
}
interface TutorWalletResponse { summary: TutoringWalletSummary; commissionPercent: number; tutorSharePercent: number; payoutCadence: 'Weekly'; }
interface TutorLedgerRow {
  entryId: string; bookingId: string; bookingNo: string | null; sessionStartsAtUtc: string | null; kind: TutoringLedgerEntryKind;
  grossAmount: number; paymentFeeAmount: number; platformAmount: number; tutorAmount: number;
  state: TutoringLedgerState; availableAtUtc: string | null; createdAtUtc: string;
  sourceKind: 'Booking' | 'PackageExpiry';   // PackageExpiry = เครดิตแพ็กเกจหมดอายุ (bookingNo/sessionStartsAtUtc เป็น null)
}
interface TutoringPayoutHistoryItem {
  batchItemId: string; periodKey: string; grossAmount: number; withholdingTaxPercent: number;
  withholdingTaxAmount: number; netAmount: number; status: string; paidAtUtc: string | null;
}
// admin (additive): POST /api/payout/admin/batches  { periodKey: string; sourceType?: PayoutSourceType }  — Tutoring: periodKey = '2026-W41'
interface PayoutBatchResponse { /* เดิมทุกฟิลด์ */ sourceType: PayoutSourceType; }
```
`ApiProblem.reason` (admin): `payout.invalid_period_key` (400), `payout.period_not_started` (409), `payout.batch_exists` (409), `payout.nothing_to_pay` (409) · wallet ไม่มี reason เฉพาะ (401/403/429 มาตรฐาน)

---

## 14. Open decisions (defaulted) · defect ที่พบ (รายงาน ไม่แก้) · Work packages

**Open decisions:**
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | ภาษีหัก ณ ที่จ่ายของค่าสอนพิเศษ (Q14.2ก) | ใช้ 3% เท่าคอร์ส; override ได้ที่ `Payout:Tutoring:WithholdingTaxPercent` — **นักบัญชีต้องยืนยัน** |
| 2 | ค่าธรรมเนียม Stripe เมื่อคืนบางส่วน (Q14.2ค) | คิดเต็มจำนวนกับส่วนที่ไม่คืน; คืนเต็ม = แพลตฟอร์มแบกค่าธรรมเนียม (ไม่ลง ledger) — **ต้องยืนยัน** |
| 3 | ORDER_ITEM_ID ของแถว Tutoring | = booking id (ไม่เปลี่ยนชนิดคอลัมน์) — เลือกเพื่อไม่ทำเทสต์คอร์สพัง; ไม่มี FK อยู่แล้ว |
| 4 | ใครสร้าง batch | admin กดเอง (ไม่มี job อัตโนมัติ); `nextPayoutAtUtc` ประมาณการเท่านั้น |
| 5 | batch ว่าง | Tutoring ไม่บันทึก (`nothing_to_pay`) — ต่างจากคอร์ส |
| 6 | ยอดติดลบ (refund หลังจ่าย) | ยกไปรอบถัดไปโดยไม่ clawback อัตโนมัติ; ผู้สอนที่เลิกทำ = กรณี admin ตามเก็บนอกระบบ |
| 7 | ผู้สอนมีทั้งคอร์สและติวเตอร์ | wallet/earnings แยกกัน ไม่รวมยอด; batch แยกชนิด ⇒ 50 ทวิ ออกต่อ batch item |
| 8 | `PERIOD_KEY` ของแถว Tutoring | = สัปดาห์ที่เงินเข้า (ป้ายรายงาน) ไม่ใช่สัปดาห์ที่จ่าย |

**Defect ของโค้ดเดิมที่พบระหว่างอ่าน (นอกขอบเขต ห้ามแก้ที่นี่ — แนะนำเปิด X-41):** **D1** `ReverseRevenueSplitsForOrderAsync` + `ExecuteBatchAsync` ⇒ split ที่ถูก reverse หลังเข้า batch Draft ยังถูก `MarkPaid` และถูกจ่าย (F3/F4) · **D2** `PayoutBatchService.CreateAsync` ไม่ atomic (สอง SaveChanges) และ lock ไม่ได้ ⇒ race กับ reverse/refund · **D3** `InstructorEarningsService` เดิมไม่แยกที่มาของยอด (แก้เฉพาะ conjunct ที่ §6.2) · **D4** batch คอร์สว่างถูกบันทึกและล็อกงวดไว้ (ไม่มี endpoint mark Failed — X-38 ข้อ 4)

**Work packages**
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | entity/enum/configuration + migration `AddTutoringEscrowToPayout` (§2) + `docs/DATABASE.md` | อ่านทั้งไฟล์: มีเฉพาะ Alter/Add/CreateIndex/Sql; ชื่อ ≤63; เทสต์ migration §12.D; **ไม่ apply DB จริง** |
| B | `backend-developer` | `TutoringSplitMath`, `IsoWeekKey`, `TutoringPayoutSchedule` (pure) + unit §12.B ส่วน pure (ไม่พึ่ง A — เริ่มได้ทันที) | เวกเตอร์ตรงตัว |
| C | `backend-developer` | predicate §6 + conjunct course + เทสต์ §12.A (หลัง A) | เทสต์เดิมผ่านโดยไม่แก้; golden ผ่าน |
| D | `backend-developer` | `ITutoringEscrowContract` + impl + `ITutoringSplitRepository` + unit §12.B | ทุกแถวตารางสถานะ |
| E | `backend-developer` | `TutoringPayoutBatchService` + admin endpoint + `IPayoutWalletReader` + wallet endpoints + options | unit §12.B/C |
| F | `backend-developer` | integration §12.D + ตรวจ `git diff` ของ "ห้ามแตะ" ว่าง | เขียนครบ (ระบุถ้ายังไม่เคยรันเพราะไม่มี Docker) |
ขนาน: B กับ A · C,D หลัง A · E หลัง D · FE ขนานกับ BE ทั้งหมด · `DONE` โดย integrator-qa · **ห้าม commit / apply migration เอง**

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review — มติกลาง D-A/D-B) — additive/ชี้แจง ไม่เปลี่ยนตาราง
- §3 ข้อ 3: แก้ชื่อคอลัมน์ lock SQL เป็น `"CREATED_AT_UTC"` (ตรวจกับ `RevenueSplitConfiguration.cs` — `CreatedAtUtc` เป็น property ไม่ใช่ column) + เพิ่ม SQL ล็อกของ batch + ลำดับล็อกเดียวกันทุกคำสั่ง + integration test บังคับรัน SQL จริง (ข้อ 11)
- §5.5: **reinstate** — `ReverseBySource` ที่ cumulative ลดลงขณะ `rows` ว่าง (ทุกแถว Reversed) แทรกแถว adjustment บวก (append-only) คืนเงินให้ติวเตอร์เมื่อ refund Failed/Voided; เพิ่มเวกเตอร์ V10/V11 + `ENTRY_KEY` ของ refund เป็น `adj:{refundId:N}:{seq}` (ข้อ 12)
- §5.2: ระบุว่าเวลาปล่อย `at` คำนวณโดยผู้เรียกตามมติ D-A; Payout ไม่รู้สูตร (ข้อ 8) · §3 lock chain ตามมติ D-B (ข้อ 3)
- §9/§10: wiring (`ProjectReference` Tutoring→Payout.Contracts; DI ทั้ง Api และ Workers), appsettings placeholder ทั้งสอง host, อ้างกฎ production guard `Payout:EstimatedPaymentFeePercent > 0` ที่ P13-06 §7 (ข้อ 15/21)

- **Changelog 2026-10-15 hardening (P13-33):** (L3) `IPayoutWalletReader.GetTutoringLedgerAsync/GetTutoringPayoutHistoryAsync` และ `PayoutBatchReadService.ListAsync` อ่าน `page` แบบ clamp 1..100000 (เกินเพดาน = อ่านหน้าเพดาน และรายงาน `page` ที่อ่านจริง; ไม่ใช่ 400 เพื่อคงพฤติกรรม normalize เงียบเดิมของ wallet) — ป้องกัน offset int overflow

### rev 2 (2026-10-20) — B-2 (มติเจ้าของ D-25.1: ข้ามติวเตอร์ที่ถูกระงับอัตโนมัติ)
- §7 ข้อ 5: **ขั้น standing มาก่อน lookup บัญชีธนาคาร** — payee ที่ `TUTOR_PROFILE` ไม่ Verified (Suspended/สถานะอื่น/ไม่มีโปรไฟล์) ถูกข้ามทั้งกลุ่ม แถว ledger ที่ข้ามไม่ถูกแตะ (ยังพร้อมจ่าย; carry-over รอบถัดไปเพราะการคัดแถวใช้ `AVAILABLE_AT_UTC ≤ cutoff` ไม่ผูก `PERIOD_KEY`) · อ่านสถานะผ่าน Contract ใหม่ `Payout.Contracts.ITutoringPayeeStandingReader` (+`TutoringPayeeHoldReasons`) ที่ **Tutoring เป็นผู้ implement** (ทิศตรงข้าม `ITutoringEscrowContract`; Payout ลง stand-in `UnavailableTutoringPayeeStandingReader` แบบ TryAdd ที่ throw = fail-closed) · reader ใช้ `SELECT … FOR SHARE` ที่ `TUTOR_PROFILES` ใน transaction หลังล็อก ledger (ตาม lock chain)
- response `POST admin/batches` (เฉพาะรอบ Tutoring) เพิ่ม `heldBack { tutorCount, rowCount, amount, instructorIds }` (additive; `JsonIgnore` เมื่อ null ⇒ JSON รอบคอร์สเหมือนเดิม) · `heldBack` เดียวกันอยู่ใน audit detail `payout.batch_created` (id+ตัวเลข ไม่มี PII) และใน extensions ของ 409 `nothing_to_pay` (ไม่บันทึกรอบ ⇒ สัปดาห์ไม่ถูกล็อก)
- ทางออกของเงินที่ค้าง: ปล่อยในรอบถัดไปหลังแอดมินปลดระงับ **หรือ** `POST tutoring/admin/refunds` ที่มีอยู่ (reverse ledger ของติวเตอร์ที่ถูกระงับได้จริง — มีเทสต์ end-to-end)
- ⚠️ ช่องว่างที่รู้ (ไม่แก้ในรอบนี้): ติวเตอร์ที่ถูกระงับ **หลังสร้างรอบแต่ก่อน execute** ยังถูกจ่ายตอน execute (`ExecuteBatchAsync` ใช้ร่วมกับคอร์สและไม่ตรวจ standing) และยังไม่มี endpoint ยกเลิก/Failed รอบ Draft — แก้ด้วยด่านใน execute จะสร้างรอบค้างล็อกสัปดาห์; ต้องออกแบบ endpoint ยกเลิกก่อน (system-architect)
- audit ของแอดมินทุก action เงินใน Payout (`payout.revenue_split_created/account_verified/batch_created/batch_executed`) ปิดแล้ว — ดู `PayoutAudit.cs`
