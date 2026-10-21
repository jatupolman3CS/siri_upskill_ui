# Contract: P13-15 Admin analytics ของ Tutoring (`/api/tutoring/admin/analytics/*`) — รายรับ/คอมมิชชัน (อ่านเงินผ่าน Payout), วิชาที่ค้นหามาก (`SEARCH_LOGS`), retention รายเดือน cohort, funnel การจอง, ติวเตอร์ยอดเยี่ยม, อายุคิว KYC

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, schema `TUTORING` — **ไม่มีตารางใหม่**) + **`Siri.Modules.Payout` (additive: `Contracts/ITutoringRevenueSeriesReader` + impl + 1 index)** · `Siri.Api` (controller 1 ตัว) · migration `AddTutoringAnalyticsIndexes` (index ล้วน)

ผู้ลงมือที่แนะนำ: **Claude — `backend-developer`** (TASKS.md ตั้ง P13-15 เป็น `AG` — **ขอเปลี่ยนเป็น CC**: งานนี้เพิ่ม `Contracts/` ข้ามโมดูลของ Payout และ SQL รวมเงิน/ข้อมูลส่วนบุคคลของผู้เรียก ซึ่งเป็นคลาสที่ห้ามส่ง Antigravity) · `DATABASE` เฉพาะ WP-A (migration index) · ไม่ต้อง DESIGN_DATABASE · FE (P13-27) ขนานได้จาก DTO appendix

> **อ่านคู่กับ:** `docs/TUTORING.md` §3.8 · `REQUIREMENTS.md` TM-17 · **P13-07** (`IPayoutWalletReader.GetTutoringRevenueTotalsAsync`, ledger `REVENUE_SPLITS`, `IsoWeekKey`) · **P13-06** (`PAYMENTS`) · **P13-08** (`REFUNDS`) · **P13-05** (`TUTOR_BOOKINGS`) · **P13-04** (`SEARCH_LOGS`, retention 90 วัน) · **P13-02** (`TUTOR_KYC_CASES`) · **P13-14** (`DISPUTES`, สรุปคิว) · **P13-17** (ไม่มีข้อมูลส่วนบุคคลในรายงาน)

---

## 0. ข้อเท็จจริงจาก contract/โค้ดจริง

| # | ข้อเท็จจริง | หลักฐาน | ผล |
|---|---|---|---|
| F1 | `IPayoutWalletReader.GetTutoringRevenueTotalsAsync(from, to)` คืน **ยอดรวมเดียว** (`BookingCount, Gross, PaymentFee, Platform, Tutor`) = Σ แถว `REVENUE_SPLITS` `SOURCE_TYPE=Tutoring` ที่ไม่ `Reversed` ตาม `CreatedAtUtc ∈ [from,to)` — **ไม่มีอนุกรมเวลา** | P13-07 §3 (`TutoringRevenueTotals`) | รายรับรายวัน/สัปดาห์/เดือน ต้องเรียกวนต่อ bucket (สูงสุด ~92 query = N+1 ผิด database.md) ⇒ **เพิ่ม contract อ่านอย่างเดียวใหม่ใน Payout.Contracts** (additive; ไม่แตะ `IPayoutWalletReader` ที่ FROZEN) — §3 |
| F2 | ledger แถว `Reversed` (คืนเต็มก่อนเข้า batch, P13-07 §5.5 ข้อ 3) **หายจากผลรวม** ทั้งยอดขายและยอดคืน ⇒ ledger บอกได้แค่ "รายรับที่เหลือหลังคืนเงิน" ไม่ใช่ยอดเรียกเก็บ/ยอดคืนแยก · ledger ของแพ็กเกจบันทึก ณ เวลาจองคลาส (ไม่ใช่เวลาจ่ายแพ็กเกจ) ส่วน `PAYMENTS` บันทึก ณ เวลาจ่าย | P13-07 §5.5; P13-12 (`RecordTutoringSplit` ตอนจอง) | รายงานแยก **สองมุม** ชัดเจน: (ก) **เงินเข้า/ออกจริง** จากตารางเงินของ Tutoring (`PAYMENTS`/`REFUNDS`) (ข) **รายรับที่รับรู้ (ledger)** จาก Payout — ไม่รวมสองมุมเป็นตัวเลข "net" ตัวเดียวที่ทำให้เข้าใจผิด (§4.1) |
| F3 | `REVENUE_SPLITS` มีคอลัมน์ `GROSS_AMOUNT`, `PAYMENT_FEE_AMOUNT`, `PLATFORM_FEE_AMOUNT`, `INSTRUCTOR_AMOUNT`, `STATUS`, `CREATED_AT_UTC`, `SOURCE_TYPE` · index เดิมไม่มี index ตามเวลาสำหรับ Tutoring | `Siri.Modules.Payout/Infrastructure/RevenueSplitConfiguration.cs`; P13-07 §2.1 | เพิ่ม `IX_REVENUE_SPLITS_TUTORING_CREATED` (partial) ใน migration นี้ (ไฟล์ config ของ Payout — additive) |
| F4 | `SEARCH_LOGS`: ไม่มี user/IP/UA; `SUBJECT_ID` อาจเป็นกลุ่มวิชา; `QUERY_TEXT` ผ่านการ sanitize (ตัดอีเมล/เบอร์) ≤100; retention 90 วัน; index `IX_SEARCH_LOGS_CREATED`, `IX_SEARCH_LOGS_SUBJECT_CREATED` | P13-04 §2.1, §4.4 | ช่วงรายงาน ≤ `SearchLogRetentionDays`; กลุ่มที่ยอด < `MinGroupCount` ไม่แสดง (k-anonymity) |
| F5 | `RecurringJobIds`/ชั่วโมงแล้ว: 02:00 analytics rollup เดิม (คอร์ส) ฯลฯ — **งานนี้ไม่มี job** (คำนวณตอนเรียก + cache) | `Siri.Workers/RecurringJobIds.cs` | ไม่เพิ่ม job |
| F6 | `PagedResult<T>` ใช้กับ list ที่โตได้; รายงานนี้เป็น **ออบเจ็กต์เดียวที่ถูกจำกัดขนาดแน่นอน** (≤120 bucket, ≤50 แถว) | `Siri.SharedKernel/PagedResult.cs`; README §6 | **ข้อยกเว้นที่ตั้งใจ** ของกฎ "ทุก list คืน PagedResult" — เพดานแข็งอยู่ใน validator (§6) |
| F7 | ประเทศไทย UTC+7 คงที่ ไม่มี DST; `IsoWeekKey` ใช้ `ThaiOffset` คงที่ ไม่พึ่ง tz database ของ OS | P13-07 §4 | bucket ทั้งหมดคิดด้วย `(ts AT TIME ZONE 'UTC') + interval '7 hours'` (ไม่ใช้ `AT TIME ZONE 'Asia/Bangkok'` — ไม่พึ่ง tzdata ของ image Postgres) |
| F8 | ASP.NET Core bind `DateOnly` จาก query ได้ (7+) · `IMemoryCache` มีใน ASP.NET Core โดยไม่ต้องเพิ่ม package | .NET 10 | ใช้ทั้งคู่ ไม่เพิ่ม NuGet |

---

## 1. Scope & task IDs

**ใน:** 7 endpoint `AdminOnly` อ่านอย่างเดียว (revenue, search-demand, retention, funnel, top-tutors, kyc-aging, overview) · `TutoringAnalyticsService` + `ITutoringAnalyticsRepository` (SQL ดิบ quote identifier) · contract ใหม่ `Payout.Contracts.ITutoringRevenueSeriesReader` + impl · cache + single-flight + จำกัดความขนาน + command timeout · migration `AddTutoringAnalyticsIndexes` · เพดานช่วงเวลา/ขนาด · เกณฑ์ความเป็นส่วนตัว (min count/cohort)
**นอก:** job/ตาราง rollup (คำนวณตอนเรียก; เพิ่มทีหลังได้ถ้าข้อมูลโต) · ส่งออก CSV · กราฟใน BE (FE ใช้ CSS bars — ห้ามเพิ่ม chart lib) · รายงานระดับผู้เรียก/ผู้ใช้รายบุคคล · รายได้ต่อติวเตอร์จาก ledger (ไม่มี contract อ่าน — `top-tutors` ใช้ตัวเลขฝั่ง Tutoring) · VAT/ภาษี · FE (DTO appendix เป็นสัญญา)

---

## 2. Schema delta — migration `AddTutoringAnalyticsIndexes` (index ล้วน; ไม่มีตาราง/คอลัมน์ใหม่)

> ชื่อ ≤63 ไบต์ ตั้งเอง · `HasFilter` เขียนแบบ PostgreSQL (`"COL" = 'X'`) · ทุก index เป็น partial เพื่อเล็กและไม่ลดความเร็วการเขียนของเส้นเงิน · อ่านไฟล์ migration ทั้งไฟล์ — ต้องเป็น `CreateIndex` ล้วน (`Down()` = `DropIndex`) · **ห้าม apply DB จริงเอง**

| Index | ตาราง | คอลัมน์ | `HasFilter` | ใช้โดย |
|---|---|---|---|---|
| `IX_TUTOR_BOOKINGS_CREATED` | `TUTORING.TUTOR_BOOKINGS` | `CREATED_AT_UTC` | — | funnel (กรองตามวันที่สร้าง booking) |
| `IX_TUTOR_BOOKINGS_COMPLETED_AT` | `TUTORING.TUTOR_BOOKINGS` | `COMPLETED_AT_UTC` | `"STATUS" = 'Completed' AND "COMPLETED_AT_UTC" IS NOT NULL` | top-tutors |
| `IX_TUTOR_BOOKINGS_COMPLETED_LEARNER` | `TUTORING.TUTOR_BOOKINGS` | `LEARNER_USER_ID`, `COMPLETED_AT_UTC` | `"STATUS" = 'Completed' AND "COMPLETED_AT_UTC" IS NOT NULL` | retention (การหา "Completed แรก" ต่อผู้เรียกด้วย `DISTINCT ON`) |
| `IX_TUTOR_BOOKINGS_LEARNER_CONFIRMED` | `TUTORING.TUTOR_BOOKINGS` | `LEARNER_USER_ID`, `CONFIRMED_AT_UTC` | `"STATUS" IN ('Confirmed','Completed') AND "CONFIRMED_AT_UTC" IS NOT NULL` | retention (EXISTS การจองถัดไป) |
| `IX_PAYMENTS_SUCCEEDED_AT` | `TUTORING.PAYMENTS` | `SUCCEEDED_AT_UTC` | `"SUCCEEDED_AT_UTC" IS NOT NULL` | revenue (เงินเข้า) |
| `IX_REFUNDS_COMPLETED_AT` | `TUTORING.REFUNDS` | `COMPLETED_AT_UTC` | `"STATUS" = 'Completed' AND "COMPLETED_AT_UTC" IS NOT NULL` | revenue (เงินออก) |
| `IX_TUTOR_KYC_CASES_DECIDED` | `TUTORING.TUTOR_KYC_CASES` | `DECIDED_AT_UTC` | `"DECIDED_AT_UTC" IS NOT NULL` | kyc-aging (เวลาตัดสิน) |
| **`IX_REVENUE_SPLITS_TUTORING_CREATED`** | **`PAYOUT.REVENUE_SPLITS`** | `CREATED_AT_UTC` | `"SOURCE_TYPE" = 'Tutoring' AND "STATUS" <> 'Reversed'` | `ITutoringRevenueSeriesReader` **และ** `GetTutoringRevenueTotalsAsync` ของ P13-07 |
- index ของ `PAYOUT.REVENUE_SPLITS` เพิ่มใน `RevenueSplitConfiguration` (ไฟล์ของ Payout — additive 1 บรรทัด) แล้ว generate รวมใน migration นี้ (ลำดับ migration: ต่อจาก `AddTutoringDisputes`) · `DatabaseIdentifierLengthTests` ต้องเขียว
- ไม่มี index ใหม่ของ `SEARCH_LOGS`/`TUTOR_PENALTY_EVENTS`/`DISPUTES` (ครอบด้วย index เดิมของ P13-04/P13-08/P13-14)

---

## 3. Contract ข้ามโมดูลใหม่ (additive) — `Siri.Modules.Payout.Contracts.ITutoringRevenueSeriesReader`

> เหตุผลที่ต้องมี: F1 (ไม่มีอนุกรมเวลา) · อ่านอย่างเดียว ไม่มีผลข้างเคียง · แยก interface พี่น้องเพื่อไม่แตะ `IPayoutWalletReader` (FROZEN, ถูก fake ในเทสต์)

```csharp
namespace Siri.Modules.Payout.Contracts;

public enum TutoringRevenueGranularity { Day, Week, Month }

/// <summary>หนึ่ง bucket ของ ledger Tutoring. BucketStartLocal = วันแรกของ bucket ตามเวลาไทย UTC+7 (วัน = วันนั้น, สัปดาห์ = วันจันทร์ ISO, เดือน = วันที่ 1).
/// ตัวเลข = Σ แถว REVENUE_SPLITS (SOURCE_TYPE=Tutoring, STATUS &lt;&gt; Reversed) ที่ CREATED_AT_UTC อยู่ใน bucket — รวมแถว adjustment (ติดลบ) ⇒ เป็นยอด "หลังคืนเงิน".</summary>
public sealed record TutoringRevenueBucket(
    DateOnly BucketStartLocal, int EntryCount, decimal GrossAmount, decimal PaymentFeeAmount, decimal PlatformAmount, decimal TutorAmount);

public interface ITutoringRevenueSeriesReader
{
    /// <summary>เรียง BucketStartLocal ASC; bucket ที่ไม่มีแถวไม่ถูกคืน (ผู้เรียกเติม 0 เอง). fromUtc/toUtc Kind=Utc, [from,to), to &gt; from, ช่วงรวม ≤ 800 วัน (เกิน ⇒ ArgumentException).
    /// ตัวเลขรวมของทุก bucket ต้องเท่ากับ IPayoutWalletReader.GetTutoringRevenueTotalsAsync ของช่วงเดียวกัน (Gross/Fee/Platform/Tutor) — มีเทสต์บังคับ.</summary>
    Task<IReadOnlyList<TutoringRevenueBucket>> GetTutoringRevenueSeriesAsync(
        DateTime fromUtc, DateTime toUtc, TutoringRevenueGranularity granularity, CancellationToken cancellationToken);
}
```
- impl `Payout.Infrastructure.Contracts.TutoringRevenueSeriesReader` (Scoped; ลงทะเบียนใน Payout module composition; ผ่าน `AppDbContext.Database.SqlQuery<T>` ดิบ — Payout ไม่มี provider อื่น):
```sql
SELECT (date_trunc({gran}, (r."CREATED_AT_UTC" AT TIME ZONE 'UTC') + interval '7 hours'))::date AS "BucketStartLocal",
       COUNT(*)::int AS "EntryCount",
       COALESCE(SUM(r."GROSS_AMOUNT"), 0) AS "GrossAmount",
       COALESCE(SUM(r."PAYMENT_FEE_AMOUNT"), 0) AS "PaymentFeeAmount",
       COALESCE(SUM(r."PLATFORM_FEE_AMOUNT"), 0) AS "PlatformAmount",
       COALESCE(SUM(r."INSTRUCTOR_AMOUNT"), 0) AS "TutorAmount"
FROM "PAYOUT"."REVENUE_SPLITS" r
WHERE r."SOURCE_TYPE" = 'Tutoring' AND r."STATUS" <> 'Reversed'
  AND r."CREATED_AT_UTC" >= {fromUtc} AND r."CREATED_AT_UTC" < {toUtc}
GROUP BY 1 ORDER BY 1
```
(`{gran}` = ค่าจาก whitelist `'day'|'week'|'month'` เป็น parameter — ห้าม concat; `EntryCount` นับทุกแถวรวม adjustment ไม่ใช่จำนวน booking) · `AsNoTracking`/read-only · ไม่เขียน audit ·ไม่ log ตัวเลขเงินพร้อมตัวตน (ไม่มีตัวตนอยู่แล้ว)
- ไม่ต้องมี `instructorProfileId` — เป็นยอดรวมแพลตฟอร์ม (ไม่ระบุตัวตน)

---

## 4. นิยามรายงานทุกตัว (เป๊ะ) + SQL

พารามิเตอร์ช่วงเวลา: `from`, `to` เป็น `DateOnly` (วันที่ **เวลาไทย** `yyyy-MM-dd`, รวมวัน `to`) → `fromUtc = (from 00:00 ไทย) − 7h`, `toUtc = (to+1 วัน 00:00 ไทย) − 7h` (ช่วง `[fromUtc, toUtc)`) · สำหรับ granularity `Week`/`Month` ระบบ **จัดช่วงให้ตรงขอบ bucket** (`effectiveFrom` = วันแรกของ bucket ที่ครอบ `from`, `effectiveTo` = วันสุดท้ายของ bucket ที่ครอบ `to`) แล้วคืนค่า effective กลับ — ไม่มี bucket ครึ่ง ๆ กลาง ๆ · bucket ที่ไม่มีข้อมูลถูก **เติมศูนย์** ให้ครบ (กราฟต่อเนื่อง)

### 4.1 Revenue — `GET /admin/analytics/revenue?from&to&granularity=day|week|month`
สองกลุ่มตัวเลข (ห้ามบวกรวมกัน):

| กลุ่ม | ฟิลด์ | แหล่งความจริง | เวลาที่ใช้จัด bucket |
|---|---|---|---|
| **`collections`** (เงินเข้า–ออกจริง) | `grossCollectedAmount`, `paymentCount` | `TUTORING.PAYMENTS` ที่ `SUCCEEDED_AT_UTC ∈ ช่วง` (รวม `KIND=Package`; รวมที่ภายหลังถูกคืน) | `SUCCEEDED_AT_UTC` |
| | `refundedAmount`, `refundCount` | `TUTORING.REFUNDS` ที่ `STATUS='Completed'` และ `COMPLETED_AT_UTC ∈ ช่วง` | `COMPLETED_AT_UTC` |
| | `netCollectedAmount` | = `grossCollectedAmount − refundedAmount` (คำนวณใน service จาก 2 แถวบน; ถ้าติดลบในบาง bucket ถือเป็นปกติ — คืนเงินของรายการต่างช่วง) | — |
| **`ledger`** (รายรับที่รับรู้ หลังคืนเงิน) | `recognisedGrossAmount`, `paymentFeeAmount`, `platformCommissionAmount`, `tutorPayableAmount` | **Payout** ผ่าน `ITutoringRevenueSeriesReader` (F1) — `platformCommissionAmount` = คอมมิชชันหลังหักค่าธรรมเนียม (สูตร Q4: `net = K−F`, tutor = Round(net×t/100), platform = ส่วนเหลือ) | `REVENUE_SPLITS.CREATED_AT_UTC` |
- `totals` = ผลรวมทุก bucket (`ledger` ของ totals **ต้องเท่า** `GetTutoringRevenueTotalsAsync(fromUtc,toUtc)` ทุกคอลัมน์ — เทสต์ + เรียกเทียบเมื่อ `Tutoring:Analytics:VerifyLedgerTotals=true` (default **true** เฉพาะ non-production; ผิด ⇒ log Error + ใส่ `ledgerMismatch=true`))
- `notes[]` (รหัสคงที่ FE แปลง): `package_timing` (เงินแพ็กเกจรับก่อน แต่ ledger รับรู้ตอนจองคลาส) · `ledger_excludes_fully_refunded_before_batch` · `fee_may_be_estimate` (ค่าธรรมเนียมในช่วง ≤ `FeeReconcile` อาจเป็นค่าประมาณ — P13-06 §6.8) · `cash_vs_ledger_not_comparable_per_bucket`
- SQL ฝั่ง Tutoring (granularity เป็น whitelist parameter):
```sql
SELECT (date_trunc({gran}, (p."SUCCEEDED_AT_UTC" AT TIME ZONE 'UTC') + interval '7 hours'))::date AS "BucketStartLocal",
       COUNT(*)::int AS "Count", COALESCE(SUM(p."AMOUNT"), 0) AS "Amount"
FROM "TUTORING"."PAYMENTS" p
WHERE p."SUCCEEDED_AT_UTC" >= {fromUtc} AND p."SUCCEEDED_AT_UTC" < {toUtc}
GROUP BY 1 ORDER BY 1;                                   -- ใช้ IX_PAYMENTS_SUCCEEDED_AT

SELECT (date_trunc({gran}, (r."COMPLETED_AT_UTC" AT TIME ZONE 'UTC') + interval '7 hours'))::date AS "BucketStartLocal",
       COUNT(*)::int AS "Count", COALESCE(SUM(r."AMOUNT"), 0) AS "Amount"
FROM "TUTORING"."REFUNDS" r
WHERE r."STATUS" = 'Completed' AND r."COMPLETED_AT_UTC" >= {fromUtc} AND r."COMPLETED_AT_UTC" < {toUtc}
GROUP BY 1 ORDER BY 1;                                   -- ใช้ IX_REFUNDS_COMPLETED_AT
```

### 4.2 Search demand — `GET /admin/analytics/search-demand?from&to&top=20`
- ช่วง: `from ≥ today − SearchLogRetentionDays(90)` (ก่อนหน้านั้นข้อมูลไม่มี — ถูก clamp + คืน `effectiveFrom`); ช่วงสูงสุด `MaxSearchRangeDays` (90) ; `top` 1–50 (default 20)
- `topSubjects[]`: `{ subjectId, slug, nameTh, nameEn, isGroup, searchCount, zeroResultCount, zeroResultRate }` เรียง `searchCount DESC, SUBJECT_ID` — เฉพาะกลุ่มที่ `searchCount ≥ MinGroupCount` (default **5**); กลุ่มที่ต่ำกว่าเกณฑ์ **ไม่แสดง** และรวมเป็น `suppressedSearchCount` (จำนวนครั้งรวม) ตัวเดียว (k-anonymity) · `zeroResultRate` = `zeroResultCount / searchCount` (RESULT_COUNT=0 = ความต้องการที่ไม่มีติวเตอร์รองรับ)
- `topQueries[]` (เปิดด้วย `IncludeQueryTexts` default true): `{ queryText, searchCount }` เฉพาะ `QUERY_TEXT IS NOT NULL` และ `searchCount ≥ MinQueryTextCount` (default **10**) — ข้อความที่ไม่ผ่านเกณฑ์ไม่แสดง ; `QUERY_TEXT` ผ่านการกรองอีเมล/เบอร์ตอนบันทึกแล้ว (P13-04) และ log ไม่มี user/IP จึงไม่ระบุตัวบุคคล ; FE เรนเดอร์เป็นข้อความล้วน
- `totalSearches`, `totalZeroResult` ของช่วง
```sql
SELECT l."SUBJECT_ID" AS "SubjectId", COUNT(*)::int AS "SearchCount",
       COUNT(*) FILTER (WHERE l."RESULT_COUNT" = 0)::int AS "ZeroResultCount"
FROM "TUTORING"."SEARCH_LOGS" l
WHERE l."CREATED_AT_UTC" >= {fromUtc} AND l."CREATED_AT_UTC" < {toUtc} AND l."SUBJECT_ID" IS NOT NULL
GROUP BY l."SUBJECT_ID" ORDER BY 2 DESC, 1 LIMIT {fetchLimit};     -- fetchLimit = top + (คัดกรอง threshold ทำใน service หลัง join ชื่อ SUBJECTS) ; ใช้ IX_SEARCH_LOGS_CREATED
SELECT l."QUERY_TEXT" AS "QueryText", COUNT(*)::int AS "SearchCount"
FROM "TUTORING"."SEARCH_LOGS" l
WHERE l."CREATED_AT_UTC" >= {fromUtc} AND l."CREATED_AT_UTC" < {toUtc} AND l."QUERY_TEXT" IS NOT NULL
GROUP BY l."QUERY_TEXT" HAVING COUNT(*) >= {minQueryCount} ORDER BY 2 DESC, 1 LIMIT {top};
```
(ชื่อวิชา: batch query `SUBJECTS WHERE SUBJECT_ID = ANY({ids})` ครั้งเดียว — ไม่ N+1)

### 4.3 Retention — `GET /admin/analytics/retention?fromMonth=2026-01&toMonth=2026-09`
**นิยาม (กำหนดเป๊ะ):**
- **ผู้เรียน (learner)** = **บัญชีผู้จ่าย** `TUTOR_BOOKINGS.LEARNER_USER_ID` (ไม่ใช่โปรไฟล์เด็ก; ผู้ปกครองที่มีลูกสองคนนับเป็นหนึ่ง)
- **Cohort month** = เดือน (เวลาไทย) ของ `COMPLETED_AT_UTC` ของ booking `Completed` **ใบแรกสุดตลอดกาล** ของผู้เรียก (`first_booking`, `first_at`) — ผูกกับสถานะ `Completed` ปัจจุบัน (booking ที่ dispute แล้วกลับ `Completed` นับ; ที่ยัง `Disputed` ไม่นับ)
- **"จองซ้ำ" ภายใน N วัน** (N ∈ {30, 60}) = มี booking อื่น `b2.BOOKING_ID <> first_booking` ของผู้เรียกเดียวกัน ที่ `b2.STATUS ∈ {Confirmed, Completed}` และ **`b2.CONFIRMED_AT_UTC ∈ (first_at, first_at + N วัน]`** (เวลาที่ **ยืนยันการจอง/จ่ายเงินสำเร็จ** ไม่ใช่เวลาเรียน; ทดลองฟรีที่ยืนยันแล้วก็นับ — จึงมีคู่ "เฉพาะแบบจ่ายเงิน" ด้านล่าง)
- **ความสุก (maturity):** ผู้เรียกนับใน N วันก็ต่อเมื่อ `first_at + N วัน ≤ now` (ไม่งั้นตัวหาร `eligibleN` ไม่รวม — กัน bias จาก cohort ที่ยังไม่ครบเวลา)
- ต่อ cohort month คืน: `cohortSize`, `eligible30`, `retained30`, `rate30 = retained30/eligible30` (null เมื่อ `eligible30 < MinCohortSize`(5)), `eligible60`, `retained60`, `rate60`, และ **ชุดแบบจ่ายเงิน** `retainedPaid30/60`, `ratePaid30/60` (b2 ต้อง `PRICE_AMOUNT > 0`)
- `overall` (รวมทุก cohort ในช่วง): ผลรวมตัวหาร/ตัวตั้งแล้วหาร (ไม่ใช่ค่าเฉลี่ยของอัตรา)
- ช่วง: `fromMonth`/`toMonth` รูป `yyyy-MM` (เวลาไทย) ; ≤ 24 เดือน (default 12 เดือนล่าสุด) ; เดือนอนาคต ⇒ 400
```sql
WITH first_completed AS (
  SELECT DISTINCT ON (b."LEARNER_USER_ID")
         b."LEARNER_USER_ID" AS uid, b."BOOKING_ID" AS first_booking, b."COMPLETED_AT_UTC" AS first_at
  FROM "TUTORING"."TUTOR_BOOKINGS" b
  WHERE b."STATUS" = 'Completed' AND b."COMPLETED_AT_UTC" IS NOT NULL
  ORDER BY b."LEARNER_USER_ID", b."COMPLETED_AT_UTC", b."BOOKING_ID"          -- IX_TUTOR_BOOKINGS_COMPLETED_LEARNER
), cohort AS (
  SELECT f.uid, f.first_booking, f.first_at,
         (date_trunc('month', (f.first_at AT TIME ZONE 'UTC') + interval '7 hours'))::date AS cohort_month
  FROM first_completed f
  WHERE f.first_at >= {fromUtc} AND f.first_at < {toUtc}
)
SELECT c.cohort_month AS "CohortMonth",
       COUNT(*)::int AS "CohortSize",
       COUNT(*) FILTER (WHERE c.first_at + interval '30 days' <= {nowUtc})::int AS "Eligible30",
       COUNT(*) FILTER (WHERE c.first_at + interval '30 days' <= {nowUtc} AND EXISTS (
            SELECT 1 FROM "TUTORING"."TUTOR_BOOKINGS" b2
            WHERE b2."LEARNER_USER_ID" = c.uid AND b2."BOOKING_ID" <> c.first_booking
              AND b2."STATUS" IN ('Confirmed','Completed') AND b2."CONFIRMED_AT_UTC" > c.first_at
              AND b2."CONFIRMED_AT_UTC" <= c.first_at + interval '30 days'))::int AS "Retained30",
       -- ชุด 60 วัน และชุด Paid (เพิ่ม AND b2."PRICE_AMOUNT" > 0) เขียนแบบเดียวกัน
       ...
FROM cohort c GROUP BY c.cohort_month ORDER BY c.cohort_month;                 -- EXISTS ใช้ IX_TUTOR_BOOKINGS_LEARNER_CONFIRMED
```
(ผู้ลงมือเขียนครบ 6 ตัวนับ: 30/60 × any/paid + eligible 30/60; `{nowUtc}` มาจาก `IClock` — เทสต์ใช้ `FakeClock`) · ต้นทุน: `DISTINCT ON` สแกน index ของ Completed ทั้งตาราง ⇒ cache 15 นาที (§5); ขอบเขตข้อมูล v1 ≪ ล้านแถว (D-10)

### 4.4 Booking funnel — `GET /admin/analytics/funnel?from&to&segment=all|trial|paid`
กลุ่มตัวอย่าง = booking ที่ **สร้าง** ในช่วง (`CREATED_AT_UTC ∈ ช่วง`) ; `segment`: `trial` = `IS_TRIAL`, `paid` = `PRICE_AMOUNT > 0`, `all` = ทั้งหมด — **สถานะปัจจุบัน** ของแต่ละ booking (cohort-based):

| ตัวนับ | นิยาม |
|---|---|
| `created` | ทั้งหมดในกลุ่ม |
| `stillPending` | `STATUS='PendingPayment'` (hold ยังไม่หมด) |
| `expired` | `STATUS='Expired'` (hold หมดไม่จ่าย) |
| `abandonedByLearner` | `CancelledByLearner` ∧ `CONFIRMED_AT_UTC IS NULL` (ยกเลิกก่อนจ่าย) |
| `everConfirmed` | `CONFIRMED_AT_UTC IS NOT NULL` (จ่าย/ยืนยันแล้วอย่างน้อยครั้งหนึ่ง) |
| `stillConfirmed` | `STATUS='Confirmed'` (ยังไม่ถึง/ยังไม่ตัดสินผล) |
| `completed`, `noShowLearner`, `noShowTutor`, `noShowBoth` | ตามสถานะ |
| `cancelledByLearnerAfterConfirm`, `cancelledByTutorAfterConfirm` | `CancelledBy*` ∧ `CONFIRMED_AT_UTC IS NOT NULL` |
| `inDispute` | `STATUS='Disputed'` |
| `withDispute` | มี `DISPUTES` ที่ `STATUS <> 'Withdrawn'` (รวมที่ตัดสินแล้ว) |
| `settled` | `everConfirmed − stillConfirmed` (ตัดสินผลแล้ว = ตัวหารของอัตราหลัง confirm) |
อัตรา (null เมื่อตัวหาร 0): `holdConversionRate = everConfirmed / (created − stillPending)` · `completionRate = completed / settled` · `noShowLearnerRate`, `noShowTutorRate`, `noShowBothRate`, `cancelAfterConfirmLearnerRate`, `cancelAfterConfirmTutorRate` = ตัวนับ / `settled` · `disputeRate = withDispute / settled` — เอกสารตัวหารอยู่ใน `rates[].denominator` เพื่อให้ FE แสดงถูก
```sql
SELECT COUNT(*)::int AS "Created",
       COUNT(*) FILTER (WHERE b."STATUS" = 'PendingPayment')::int AS "StillPending",
       COUNT(*) FILTER (WHERE b."STATUS" = 'Expired')::int AS "Expired",
       COUNT(*) FILTER (WHERE b."STATUS" = 'CancelledByLearner' AND b."CONFIRMED_AT_UTC" IS NULL)::int AS "AbandonedByLearner",
       COUNT(*) FILTER (WHERE b."CONFIRMED_AT_UTC" IS NOT NULL)::int AS "EverConfirmed",
       COUNT(*) FILTER (WHERE b."STATUS" = 'Confirmed')::int AS "StillConfirmed",
       /* Completed, NoShowLearner, NoShowTutor, NoShowBoth, CancelledBy* ∧ CONFIRMED_AT_UTC IS NOT NULL, Disputed — FILTER แบบเดียวกัน */
       COUNT(*) FILTER (WHERE d."BOOKING_ID" IS NOT NULL)::int AS "WithDispute"
FROM "TUTORING"."TUTOR_BOOKINGS" b
LEFT JOIN (SELECT DISTINCT "BOOKING_ID" FROM "TUTORING"."DISPUTES" WHERE "STATUS" <> 'Withdrawn') d ON d."BOOKING_ID" = b."BOOKING_ID"
WHERE b."CREATED_AT_UTC" >= {fromUtc} AND b."CREATED_AT_UTC" < {toUtc}
  AND (({segment} = 'all') OR ({segment} = 'trial' AND b."IS_TRIAL") OR ({segment} = 'paid' AND b."PRICE_AMOUNT" > 0));   -- IX_TUTOR_BOOKINGS_CREATED
```
(`segment` เป็น whitelist enum ที่ bind แล้ว ไม่ใช่ข้อความอิสระ)

### 4.5 Top tutors — `GET /admin/analytics/top-tutors?from&to&sort=completed|booked|rating&top=20`
- ช่วงตาม `COMPLETED_AT_UTC` ของ booking `Completed` (≤ 366 วัน) · `top` 1–50
- ต่อติวเตอร์: `{ tutorId, slug, displayName, status, completedBookings, completedSessions (DISTINCT SESSION_ID), bookedGrossAmount (Σ PRICE_AMOUNT ของ Completed — **ราคาก่อนหักคอมมิชชัน/คืนเงิน ไม่ใช่รายได้ติวเตอร์**), ratingAverage, ratingCount, reliabilityScore, penaltyPoints (Σ POINTS ไม่ void ในช่วง), disputesAgainst (DISPUTES เปิดโดยผู้เรียกในช่วง) }`
- `sort`: `completed` (default: `completedBookings DESC, TUTOR_ID`) · `booked` (`bookedGrossAmount DESC`) · `rating` (`ratingAverage DESC, ratingCount DESC` เฉพาะ `ratingCount ≥ MinRatingCountForTop`(5))
```sql
SELECT b."TUTOR_ID" AS "TutorId", COUNT(*)::int AS "CompletedBookings", COUNT(DISTINCT b."SESSION_ID")::int AS "CompletedSessions",
       COALESCE(SUM(b."PRICE_AMOUNT"), 0) AS "BookedGrossAmount"
FROM "TUTORING"."TUTOR_BOOKINGS" b
WHERE b."STATUS" = 'Completed' AND b."COMPLETED_AT_UTC" >= {fromUtc} AND b."COMPLETED_AT_UTC" < {toUtc}
GROUP BY b."TUTOR_ID";                                  -- IX_TUTOR_BOOKINGS_COMPLETED_AT ; เรียง/ตัด top ใน SQL ด้วย ORDER BY … LIMIT {top}
-- แล้ว batch query เดียวต่อชุด id: TUTOR_PROFILES (slug,displayName,status,rating,reliability) ; TUTOR_PENALTY_EVENTS (Σ POINTS ที่ VOIDED_AT_UTC IS NULL ในช่วง) ; DISPUTES (COUNT ที่ OPENED_BY_ROLE='Learner' ในช่วง) — WHERE "TUTOR_ID" = ANY({ids})
```

### 4.6 KYC aging — `GET /admin/analytics/kyc-aging`
- คิวเปิด (`STATUS ∈ Submitted, InReview, NeedsInfo`, `SUBMITTED_AT_UTC IS NOT NULL`): `byStatus {Submitted, InReview, NeedsInfo}` นับ · `awaitingAdmin = Submitted+InReview` · `awaitingTutor = NeedsInfo` · `ageBuckets` ของ **awaitingAdmin** ตามอายุจาก `SUBMITTED_AT_UTC` : `lt24h`, `h24to48`, `h48to72`, `gt72h` · `oldestAwaitingAdminSubmittedAtUtc` · `oldestAwaitingAdminAgeHours`
- ประสิทธิภาพ 30 วันล่าสุด: `decided30d {Approved, Rejected, NeedsInfo}` นับตาม `DECIDED_AT_UTC ≥ now−30d` · `medianHoursToDecision30d`, `p90HoursToDecision30d` (เฉพาะ Approved/Rejected: `percentile_cont(…) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (DECIDED_AT_UTC − SUBMITTED_AT_UTC))/3600.0)`; null เมื่อไม่มีข้อมูล)
- หมายเหตุ: ใช้ `SUBMITTED_AT_UTC` ตามที่ P13-02 เก็บ (ถ้า P13-02 รีเซ็ตเมื่อส่งใหม่หลัง NeedsInfo ค่านี้คืออายุนับจากการส่งล่าสุด) · ใช้ `IX_TUTOR_KYC_CASES_QUEUE` และ `IX_TUTOR_KYC_CASES_DECIDED` · **ไม่มีข้อมูลผู้สมัคร/เอกสาร** (นับเท่านั้น)

### 4.7 Overview — `GET /admin/analytics/overview` (การ์ด KPI หน้าแรก)
รวมจากรายงานข้างบนแบบ **cache ทั้งหมด** (ไม่รัน SQL ใหม่นอกจากที่ cache พลาด): `last30Days {cashNetAmount, platformCommissionAmount, completedBookings, holdConversionRate, completionRate}` (revenue `day` + funnel `all` ช่วง 30 วันล่าสุด) · `latestMatureRetention {cohortMonth, rate60}` (cohort ล่าสุดที่ `eligible60 ≥ MinCohortSize`) · `kycAwaitingAdmin`, `kycOldestAgeHours` · `disputes {open, overdue, highPriority}` (นับจาก `DISPUTES` ผ่าน repository ของ P13-14 — นับอย่างเดียว) · `topSearchedSubject {nameTh, searchCount}|null` · `generatedAtUtc`

---

## 5. Cache / ความทนทาน / เพดาน

- **`TutoringAnalyticsCache`** (ใน `Tutoring.Application`): `IMemoryCache` + **single-flight ต่อ key** (`ConcurrentDictionary<string, SemaphoreSlim>`; คำนวณครั้งเดียว คำขอซ้ำรอผลเดียวกัน) · key = `analytics:{endpoint}:{ค่าพารามิเตอร์ที่ normalize แล้ว}` (วันที่ → `yyyyMMdd` ที่ align ตาม bucket ; `top`/`sort` ฯลฯ) · TTL: revenue/funnel/search/top = `CacheSeconds` (300), retention = `RetentionCacheSeconds` (900), kyc-aging = `KycCacheSeconds` (60), overview = 60 · ผลที่ล้ม **ไม่ถูก cache** · `CacheSeconds=0` ปิด cache · จำนวน key จำกัด (`SizeLimit` 200) · คืน `generatedAtUtc` ในทุก response · **in-process** (VPS เดียว; หลาย replica ⇒ แต่ละ replica คำนวณเอง — ยอมรับ)
- **จำกัดความขนาน:** `SemaphoreSlim(MaxConcurrentQueries=2)` ครอบการรัน SQL ทั้งหมด ; รอเกิน `QueueWaitSeconds` (5) ⇒ 503 `tutoring.analytics_busy` + `Retry-After: 5`
- **Command timeout:** รันใน DI scope แยกที่ `Database.SetCommandTimeout(QueryTimeoutSeconds=20)` (ไม่รั่วไป context อื่น) ; timeout/`OperationCanceledException` จากการยกเลิกของ host ≠ timeout ของ SQL: SQL timeout ⇒ 503 `tutoring.analytics_timeout` (log Warning ชื่อรายงาน+ช่วง ไม่มี PII) ; ยกเลิกโดยผู้เรียก ⇒ ปล่อยผ่าน
- **เพดานช่วงเวลา (validator → 400 `tutoring.analytics_range_invalid` ext `{maxDays|maxMonths|maxBuckets}`):** `revenue`/`funnel`: day ≤ 92 วัน · week ≤ 53 สัปดาห์ · month ≤ 24 เดือน ; จำนวน bucket ≤ 120 ; `from ≤ to` ; `to ≤ วันนี้ (ไทย)` ; `search-demand` ≤ 90 วัน ; `top-tutors` ≤ 366 วัน ; `retention` ≤ 24 เดือน ; `top` 1–50 ; query string ที่ไม่รู้จัก/ซ้ำ ⇒ ละเว้น (ไม่กระทบ key cache)
- ไม่ถือ lock ธุรกิจ ไม่เปิด transaction เขียน ; ใช้ `AsNoTracking`/`SqlQuery` ล้วน ; ไม่เรียก HTTP ภายนอก

---

## 6. API (controller: `AdminTutoringAnalyticsController` ใต้ `Siri.Api/Controllers/Tutoring/`; base `/api/tutoring/admin/analytics`)

กฎร่วม: `[Authorize(Policy = AuthorizationPolicyNames.AdminOnly)]` ที่ระดับคลาส (ทุก action ชัดเจน) · rate limit `tutoring-user` (60/นาที ต่อผู้ใช้; ไม่มี policy ใหม่) · `Cache-Control: no-store` · response เป็นข้อมูลรวมเท่านั้น ไม่มี PII · error = RFC 9457 + `reason` · เวลา UTC `…Z` ; วันที่ bucket เป็น `yyyy-MM-dd` (เวลาไทย) · enum เป็น string · `[EndpointName]`/`[EndpointSummary]`/`[ProducesResponseType]` ครบ

| # | Method + path | Query | สำเร็จ | Error |
|---|---|---|---|---|
| 1 | `GET /revenue` | `from`,`to` (`DateOnly`), `granularity=Day\|Week\|Month` (default Day) | 200 `RevenueReport` | 400 `analytics_range_invalid` · 503 `analytics_busy`/`analytics_timeout` · 403/401 |
| 2 | `GET /search-demand` | `from`,`to`,`top` | 200 `SearchDemandReport` | เหมือนข้อ 1 |
| 3 | `GET /retention` | `fromMonth`,`toMonth` (`yyyy-MM`) | 200 `RetentionReport` | เหมือนข้อ 1 |
| 4 | `GET /funnel` | `from`,`to`,`segment=All\|Trial\|Paid` | 200 `FunnelReport` | เหมือนข้อ 1 |
| 5 | `GET /top-tutors` | `from`,`to`,`sort=Completed\|Booked\|Rating`,`top` | 200 `TopTutorsReport` | เหมือนข้อ 1 |
| 6 | `GET /kyc-aging` | — | 200 `KycAgingReport` | 503 |
| 7 | `GET /overview` | — | 200 `AnalyticsOverview` | 503 |
- default ของ `from`/`to` เมื่อไม่ส่ง: revenue/funnel = 30 วันล่าสุด (day) ; search-demand = 30 วัน ; top-tutors = 30 วัน ; retention = 12 เดือนล่าสุด
- **ไม่มี `userId`/`tutorId` ของผู้ใช้ใน query** ; ไม่มี endpoint ที่คืนรายบุคคล · ถ้าต้องดูรายติวเตอร์ ใช้หน้า admin tutors ของ P13-01

---

## 7. Config / DI

`TutoringAnalyticsOptions` (`Tutoring:Analytics`, `IValidateOptions` + `ValidateOnStart`):

| Key | Default | ช่วง |
|---|---|---|
| `Enabled` | `true` | ปิด = ทุก endpoint 404 |
| `CacheSeconds` / `RetentionCacheSeconds` / `KycCacheSeconds` | `300` / `900` / `60` | 0–3600 |
| `MaxConcurrentQueries` / `QueueWaitSeconds` / `QueryTimeoutSeconds` | `2` / `5` / `20` | 1–8 / 1–30 / 5–60 |
| `MinGroupCount` (วิชา) / `MinQueryTextCount` / `MinCohortSize` / `MinRatingCountForTop` | `5` / `10` / `5` / `5` | 2–100 |
| `IncludeQueryTexts` | `true` | |
| `MaxSearchRangeDays` | `90` | 7–365 (ถูก clamp ด้วย `SearchLog:RetentionDays` ของ P13-04) |
| `VerifyLedgerTotals` | `true` เมื่อ non-Production, `false` เมื่อ Production (ตั้งผ่าน `PostConfigure` ตาม environment) | |
- DI (`AddTutoringModule`): `TutoringAnalyticsService`, `ITutoringAnalyticsRepository`→`TutoringAnalyticsRepository` (Scoped), `TutoringAnalyticsCache` (Singleton), `AddMemoryCache()` (idempotent) · ฝั่ง Payout: `AddScoped<ITutoringRevenueSeriesReader, TutoringRevenueSeriesReader>` ใน composition ของ Payout · section `Tutoring:Analytics` ใน appsettings **Api** (Workers ไม่ต้อง — ไม่มี job) · ไม่มี NuGet/secret/production guard ใหม่
- Telemetry: `tutoring.analytics.requests{report}`, `tutoring.analytics.cache_hits{report}`, `tutoring.analytics.duration_ms{report}` (histogram), `tutoring.analytics.rejected{reason}`

---

## 8. Security / privacy

- `AdminOnly` เท่านั้น (ผู้ใช้ทั่วไป/ติวเตอร์ 403 ; anonymous 401) · **ไม่มีข้อมูลส่วนบุคคลของผู้เรียก/ผู้ปกครอง/เด็ก** ใน response ใด ๆ (มีเฉพาะจำนวน/ยอดรวม และชื่อ/slug สาธารณะของติวเตอร์ใน `top-tutors`) · เทสต์ JSON-walk ทุก report: ชื่อ property ทุกชั้นต้องอยู่ใน allow-list (§9) ; seed ข้อมูลที่มีอีเมล/ชื่อเล่นเด็ก ⇒ ไม่พบสตริงเหล่านั้นใน response
- k-anonymity: กลุ่มค้นหา < `MinGroupCount` ไม่แสดง (รวมเป็น `suppressedSearchCount`), ข้อความค้นหา < `MinQueryTextCount` ไม่แสดง, อัตรา retention ของ cohort < `MinCohortSize` เป็น null
- SQL: identifier ทุกตัว (รวม alias) อยู่ใน double quote ; ค่าทุกตัวเป็น parameter (`FromSqlInterpolated`/`SqlQuery<T>`) ; `granularity`/`segment`/`sort` เป็น enum whitelist ก่อนถึง SQL ; ไม่ concat string
- ไม่ log ผลรายงาน/ตัวเลขเงินระดับ Debug ขึ้นไป · ไม่เขียน `SECURITY_AUDIT` (อ่านอย่างเดียว ไม่มี PII) · ไม่มี endpoint ส่งออกไฟล์
- ค่าเงินคำนวณฝั่ง server จากตารางเงินเท่านั้น (FE ไม่คำนวณ/ไม่รวมสองมุม `collections` กับ `ledger`)

---

## 9. Test checklist

**Unit:** ตัวจัด bucket (วัน/ISO สัปดาห์ (จันทร์)/เดือน, ขอบ `16:59:59.999Z` vs `17:00Z` เป็นคนละวันไทย, ปีคร่อม W53, align ช่วงสัปดาห์/เดือน, เติมศูนย์) · validator ช่วง/เพดาน/`to` อนาคต/`from>to`/bucket>120 · k-anonymity (threshold พอดี/ต่ำกว่า, `suppressedSearchCount` ถูก) · คำนวณอัตรา funnel/retention (ตัวหาร 0 ⇒ null, maturity: first_at+30d = now พอดี, รวม overall = Σตัวตั้ง/Σตัวหาร ไม่ใช่เฉลี่ยอัตรา) · `TutoringAnalyticsCache` (single-flight: 20 คำขอพร้อมกัน → factory ถูกเรียก 1 ครั้ง; ล้มไม่ cache; TTL; `CacheSeconds=0`) · ตัวจำกัดความขนาน (เกินคิว ⇒ `analytics_busy`) · options validator ทุก branch · reflection: ทุก action `AdminOnly` · source-scan: SQL ทุกชิ้นใน repository ไม่มี string concat ค่าผู้ใช้ และ identifier ถูก quote
**Integration (PostgreSQL 17 จริง + `SiriApiFactory`; seed ผ่าน service/SQL จริง ไม่ใช้ InMemory):**
1. **revenue:** seed payments (PromptPay/Card/Package) + refunds Completed/Processing/Failed + ledger rows (Held/Releasable/adjustment ลบ/Reversed) ข้ามหลายวันรวมขอบเที่ยงคืนไทย ⇒ `collections` ตรงมือ (refund Processing/Failed ไม่นับ), `ledger` ตรงมือ ; **Σ bucket ของ `ledger` = `GetTutoringRevenueTotalsAsync` ทุกคอลัมน์** (ทั้ง day/week/month) ; แถว `Reversed` ไม่ถูกนับ ; ช่วงว่าง ⇒ bucket ศูนย์ครบ
2. **search-demand:** seed `SEARCH_LOGS` หลายวิชา/กลุ่ม/`RESULT_COUNT=0` ⇒ นับถูก, กลุ่ม < 5 ถูก suppress และรวมใน `suppressedSearchCount`, query text < 10 ไม่โผล่, `QUERY_TEXT IS NULL` ไม่นับ ; ช่วงก่อน retention ถูก clamp
3. **retention:** ชุดผู้เรียก: (ก) Completed แล้วจองซ้ำ Confirmed ภายใน 30 (นับ) (ข) ภายใน 31–60 (นับเฉพาะ 60) (ค) ซ้ำแบบ CancelledByLearner (ไม่นับ) (ง) ซ้ำเป็นทดลองฟรี (นับ any ไม่นับ paid) (จ) ผู้เรียกที่ first Completed ยังไม่ครบ 30 วัน (ไม่เข้า eligible30) (ฉ) booking ใบเดียวกันไม่นับเป็น "ซ้ำ" (ช) first Completed ข้ามเดือน (cohort ตามเวลาไทย) (ซ) cohort < 5 ⇒ rate null ; ผู้เรียก Completed แรกถูก dispute (`Disputed`) ⇒ ไม่เป็น first จนกว่ากลับ Completed
4. **funnel:** ชุด booking ครบทุกสถานะ × trial/paid ⇒ ตัวนับถูก, ตัวหาร/อัตราถูก, `sum(terminal)+stillConfirmed+stillPending+expired+abandoned ≤ created` (ไม่นับซ้ำ), `withDispute` จาก `DISPUTES` ที่ไม่ Withdrawn, segment กรองถูก
5. **top-tutors:** ติวเตอร์หลายคน/หลายคลาส (กลุ่ม: `completedSessions` นับ DISTINCT) ⇒ เรียงทั้ง 3 sort, `Rating` ไม่รวมติวเตอร์ `ratingCount<5`, penalty ที่ void ไม่นับ, batch query ไม่ N+1 (นับ query)
6. **kyc-aging:** cases ครบสถานะ/อายุ ⇒ buckets ถูก, median/p90 ถูก (เวกเตอร์ตัวเลขตายตัว), ไม่มี case ⇒ null
7. **auth/IDOR:** non-admin ⇒ 403 ทุก endpoint ; anonymous ⇒ 401 ; (ไม่มี id ของผู้ใช้ใน route)
8. **leak test:** JSON-walk allow-list ทุก report + seed อีเมล/ชื่อเล่นเด็ก/ชื่อบัญชี ⇒ ไม่พบ ; `top-tutors` มีเฉพาะ id/slug/displayName ติวเตอร์
9. **cache/ขนาน:** ยิง 30 คำขอเดียวกันพร้อมกัน ⇒ SQL รันครั้งเดียว (นับด้วย interceptor/counter) ; เปลี่ยนพารามิเตอร์ ⇒ key ใหม่ ; หลัง TTL คำนวณใหม่ ; query ที่ช้า (`pg_sleep` ผ่าน repository ทดสอบ) ⇒ `analytics_timeout` 503 ไม่ทำให้ context ค้าง
10. **EXPLAIN (ไม่บังคับให้ CI แต่ผู้ implement ต้องรันครั้งเดียวและบันทึก):** revenue/funnel/search ใช้ index ที่ระบุ §2 ไม่ seq scan บนตารางที่มีแถวหลักหมื่น (seed 50k แถว)
11. **migration:** `Up()` = `CreateIndex` 8 ตัวเท่านั้น (ไม่มี DropColumn/AlterColumn) · `DatabaseIdentifierLengthTests` เขียว · ไม่มี shadow column

---

## 10. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | เพิ่ม 7 index ใน configuration ของ Tutoring (bookings/payments/refunds/kyc cases) + 1 index ใน `RevenueSplitConfiguration` (Payout) + migration `AddTutoringAnalyticsIndexes` + `docs/DATABASE.md` | อ่านทั้งไฟล์: `CreateIndex` ล้วน · ชื่อ ≤63 · **ไม่ apply DB จริง** |
| **B** | `backend-developer` | `Payout.Contracts.ITutoringRevenueSeriesReader` + impl + DI + unit/integration (ตรง `GetTutoringRevenueTotalsAsync`) | เทสต์ผูกพัน Σ bucket = totals |
| **C** | `backend-developer` | `ITutoringAnalyticsRepository` (SQL ดิบ quoted) + `TutoringAnalyticsService` (bucketing/อัตรา/k-anonymity) + `TutoringAnalyticsCache` + Options + validators + unit | unit §9 |
| **D** | `backend-developer` | controller + attributes + appsettings (Api) + telemetry | ทุก action `AdminOnly` |
| **E** | `backend-developer`/`integrator-qa` | integration §9 (ข้อ 1,3,4,9 ต้องรันจริงบน PG) | เขียนครบ (ระบุถ้าไม่เคยรันเพราะไม่มี Docker) |
ลำดับ: A ∥ B ∥ C(หลัง A สำหรับ EXPLAIN) → D → E · P13-15 ต้องรอ P13-07 (reader/ledger), P13-14 (`DISPUTES`), P13-13 ไม่จำเป็น · **ห้ามส่ง Antigravity · ห้าม apply migration / commit เอง**

---

## 11. Frontend notes + DTO appendix (P13-27 — CSS bars/KPI tiles เท่านั้น; ห้ามเพิ่ม chart lib)

- หน้า `/admin/tutoring/analytics` (`roleGuard`, CSR, noindex; `RenderMode.Client` เพิ่มใน change เดียวกับ route — E8) : แถบเลือกช่วง (วัน/สัปดาห์/เดือน) + KPI tiles จาก `overview` + แท็บรายงาน · **แยกการ์ด "เงินเข้า–ออกจริง" กับ "รายรับที่รับรู้ (ledger)" ชัดเจน พร้อมคำอธิบายจาก `notes[]` — ห้ามรวม/ลบกันเอง** · กราฟแท่ง CSS (ความสูงเป็น % ของ max, มี `aria-label`/ตารางสำรองสำหรับ screen reader) · อัตราแสดง `—` เมื่อ null พร้อมเหตุผล ("ตัวอย่างน้อยกว่า N") · ปุ่ม refresh (ผลอาจมาจาก cache — แสดง `generatedAtUtc`) · ข้อความ 503 `analytics_busy` ⇒ ลองใหม่อัตโนมัติ 1 ครั้งหลัง `Retry-After`
- i18n (README §6 E7): `tutoring.admin.analytics.*`, `tutoring.enums.*`, `tutoring.errors.<reason>` (th+en ครบ) · `currencyThb` (ต้อง `providers:[CurrencyPipe]`) · `bangkokDate` · token/`tone-*` เท่านั้น · loading/error/empty ครบ

```ts
type Guid = string; type IsoUtc = string; type LocalDate = string;   // yyyy-MM-dd เวลาไทย
type AnalyticsGranularity = 'Day' | 'Week' | 'Month';
type FunnelSegment = 'All' | 'Trial' | 'Paid';
type TopTutorSort = 'Completed' | 'Booked' | 'Rating';
interface AnalyticsMeta { generatedAtUtc: IsoUtc; effectiveFrom: LocalDate; effectiveTo: LocalDate; }

interface RevenueBucket { bucketStart: LocalDate; paymentCount: number; grossCollectedAmount: number; refundCount: number; refundedAmount: number; netCollectedAmount: number;
  ledgerEntryCount: number; recognisedGrossAmount: number; paymentFeeAmount: number; platformCommissionAmount: number; tutorPayableAmount: number; }
interface RevenueReport extends AnalyticsMeta { currency: 'THB'; granularity: AnalyticsGranularity; buckets: RevenueBucket[]; totals: Omit<RevenueBucket, 'bucketStart'>; ledgerMismatch: boolean;
  notes: ('package_timing' | 'ledger_excludes_fully_refunded_before_batch' | 'fee_may_be_estimate' | 'cash_vs_ledger_not_comparable_per_bucket')[]; }

interface SearchSubjectDemand { subjectId: Guid; slug: string; nameTh: string; nameEn: string; isGroup: boolean; searchCount: number; zeroResultCount: number; zeroResultRate: number; }
interface SearchQueryDemand { queryText: string; searchCount: number; }
interface SearchDemandReport extends AnalyticsMeta { totalSearches: number; totalZeroResult: number; suppressedSearchCount: number; minGroupCount: number;
  topSubjects: SearchSubjectDemand[]; topQueries: SearchQueryDemand[]; }

interface RetentionCohort { cohortMonth: string; /* yyyy-MM */ cohortSize: number;
  eligible30: number; retained30: number; rate30: number | null; eligible60: number; retained60: number; rate60: number | null;
  retainedPaid30: number; ratePaid30: number | null; retainedPaid60: number; ratePaid60: number | null; }
interface RetentionReport { generatedAtUtc: IsoUtc; fromMonth: string; toMonth: string; minCohortSize: number; cohorts: RetentionCohort[]; overall: Omit<RetentionCohort, 'cohortMonth'>; }

interface FunnelRate { key: string; numerator: number; denominator: number; value: number | null; }
interface FunnelReport extends AnalyticsMeta { segment: FunnelSegment;
  counts: { created: number; stillPending: number; expired: number; abandonedByLearner: number; everConfirmed: number; stillConfirmed: number; settled: number;
    completed: number; noShowLearner: number; noShowTutor: number; noShowBoth: number; cancelledByLearnerAfterConfirm: number; cancelledByTutorAfterConfirm: number; inDispute: number; withDispute: number; };
  rates: FunnelRate[]; }

interface TopTutorRow { tutorId: Guid; slug: string; displayName: string; status: string; completedBookings: number; completedSessions: number; bookedGrossAmount: number;
  ratingAverage: number; ratingCount: number; reliabilityScore: number; penaltyPoints: number; disputesAgainst: number; }
interface TopTutorsReport extends AnalyticsMeta { sort: TopTutorSort; tutors: TopTutorRow[]; }

interface KycAgingReport { generatedAtUtc: IsoUtc; byStatus: { submitted: number; inReview: number; needsInfo: number }; awaitingAdmin: number; awaitingTutor: number;
  ageBuckets: { lt24h: number; h24to48: number; h48to72: number; gt72h: number }; oldestAwaitingAdminSubmittedAtUtc: IsoUtc | null; oldestAwaitingAdminAgeHours: number | null;
  decided30d: { approved: number; rejected: number; needsInfo: number }; medianHoursToDecision30d: number | null; p90HoursToDecision30d: number | null; }

interface AnalyticsOverview { generatedAtUtc: IsoUtc;
  last30Days: { cashNetAmount: number; platformCommissionAmount: number; completedBookings: number; holdConversionRate: number | null; completionRate: number | null };
  latestMatureRetention: { cohortMonth: string; rate60: number | null } | null; kycAwaitingAdmin: number; kycOldestAgeHours: number | null;
  disputes: { open: number; overdue: number; highPriority: number }; topSearchedSubject: { nameTh: string; searchCount: number } | null; }
interface ApiProblem { status: number; title: string; traceId: string; errorCode: string; reason?: string; maxDays?: number; maxMonths?: number; maxBuckets?: number; }
```
C# (record ตำแหน่งเดียว ชื่อ/ลำดับตรงกับ TS): `RevenueBucket`, `RevenueReport`, `SearchSubjectDemand`, `SearchQueryDemand`, `SearchDemandReport`, `RetentionCohort`, `RetentionReport`, `FunnelRate`, `FunnelReport`, `TopTutorRow`, `TopTutorsReport`, `KycAgingReport`, `AnalyticsOverview` — `DateOnly` ↔ `LocalDate` string (`yyyy-MM-dd`) ผ่าน JSON converter ที่ระบบมี/ตั้งทั้ง API · enum ใน Application (`AnalyticsGranularity` map ↔ `TutoringRevenueGranularity` ของ Payout.Contracts ที่ service)

`ApiProblem.reason` ใหม่ (i18n `tutoring.errors.*`): `tutoring.analytics_range_invalid` (+`maxDays`/`maxMonths`/`maxBuckets`) · `tutoring.analytics_busy` (503 + `Retry-After`) · `tutoring.analytics_timeout` (503) · ที่ใช้ซ้ำ: `tutoring.not_found` (feature ปิด)

---

## Deviations from TUTORING.md / ข้อกำหนดก่อนหน้า
| # | ที่เดิม | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | "รายรับรวม/คอมมิชชัน (อ่านผ่าน Payout contract)" | อ่านผ่าน **contract ใหม่** `ITutoringRevenueSeriesReader` (อนุกรมเวลา) + ตัวเลขเงินเข้า–ออกจากตารางของ Tutoring เอง แยกเป็นสองมุม | `GetTutoringRevenueTotalsAsync` ให้แค่ผลรวม (F1) และ ledger ไม่เห็นยอดขาย/ยอดคืนแยก (F2) |
| D2 | path `admin/tutoring/analytics/*` (TASKS.md) | `/api/tutoring/admin/analytics/*` (README §6) | ตามแบบ admin ทุกโมดูล |
| D3 | list ทุกตัว `PagedResult<T>` | รายงานคืนออบเจ็กต์ที่มีเพดานแข็ง (≤120 bucket/≤50 แถว) | F6 — ไม่ใช่ list ที่โตได้ |
| D4 | retention "จองซ้ำภายใน 30/60 วัน" | นิยามเป๊ะ §4.3 (ผู้จ่าย, cohort จาก Completed แรก, นับตามเวลายืนยันการจอง, เฉพาะ cohort ที่สุกแล้ว, ชุด any/paid) | ผลตีความได้เดียว ทดสอบได้ |
| D5 | (ไม่ระบุ) | เพิ่ม funnel, top-tutors, kyc-aging, overview | ตามคำสั่งเจ้าของ (TM-17 + คิว KYC) |
| D6 | TASKS.md: ผู้ลงมือ AG | เปลี่ยนเป็น CC | เพิ่ม `Contracts/` ข้ามโมดูล + SQL เงิน |

## Open decisions (defaulted — เปลี่ยนที่ config/revision ได้)
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| 1 | "ผู้เรียน" ของ retention | บัญชีผู้จ่าย (ไม่ใช่โปรไฟล์เด็ก) |
| 2 | เกณฑ์ "จองซ้ำ" | `Confirmed`/`Completed` นับ ณ เวลายืนยัน ; รวมทดลองฟรี (มีชุด paid คู่กัน) |
| 3 | "net" ของรายรับ | ไม่มีตัวเลข net เดียว — แยก `netCollectedAmount` (เงินสด) กับ `platformCommissionAmount` (ledger) ; ให้นักบัญชีนิยามรายงานทางการเงินจริง (Q14) |
| 4 | รายได้ต่อติวเตอร์ | ไม่มีใน v1 (ใช้ `bookedGrossAmount` ก่อนคอมมิชชัน/คืนเงิน) |
| 5 | แคช | in-process 5 นาที (retention 15 นาที) ; ไม่มี rollup table/job จนกว่าข้อมูลโต |
| 6 | k-anonymity | วิชา ≥5, ข้อความค้นหา ≥10, cohort ≥5 |
| 7 | เวลาไทย | UTC+7 คงที่ (`+ interval '7 hours'`) ไม่พึ่ง tzdata |
| 8 | ตรวจ ledger totals ตอนรัน | เปิดเฉพาะ non-production |

## Changelog
- **rev 1 (2026-10-19) — จัดให้ตรงโค้ดที่ build แล้ว (โค้ดชนะ):**
  1. §4.3 retention: `interval '30 days'/'60 days'` → ใช้ `interval '720 hours'/'1440 hours'` ในโค้ด (ไม่ขึ้นกับ time zone ของ session; เท่ากันเมื่อเป็น UTC)
  2. §4.2 search demand: กรองข้อความที่เป็นข้อมูลส่วนบุคคลฝั่งอ่านเพิ่มเองทั้งใน SQL (ก่อน LIMIT) และ service — ไม่อาศัยแค่การกรองตอนเขียน
  3. `topSubjects[].subjectSlug` ใน §4.2 ผิด: ชื่อ field จริงคือ **`slug`** (ตาม §11 และ FE `admin-analytics.models.ts`)
  4. `IX_TUTOR_BOOKINGS_COMPLETED_LEARNER` (2 คอลัมน์ตาม §2) — planner ไม่เลือกเพราะ ORDER BY ของ first_completed มี `BOOKING_ID` tie-break (อ่านผ่าน `COMPLETED_AT` แล้ว Sort, ไม่ seq scan); วัดแล้วถ้าเป็น (LEARNER, COMPLETED_AT, BOOKING_ID) ได้ index-only scan ถูกลง ~3.4 เท่า · **ตัดสิน: คงไว้ตาม contract** (รายงานรายเดือน cache แล้ว, 50k แถวไม่เป็นปัญหา) · เพิ่มคอลัมน์ที่ 3 ได้ทันทีถ้าวัดบนข้อมูลจริงแล้วช้า — migration `AddTutoringAnalyticsIndexes` ยังไม่ apply จึง regenerate ได้ฟรีจนกว่าเจ้าของจะ apply
