# Contract: P13-03 เวลาว่างติวเตอร์ + `SlotCalculator` (pure) + `TutorPriceCalculator` + `GET tutors/{slug}/slots` + job `tutoring-next-available`

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE) + `Siri.Api` (controller, rate limit, output-cache policy) + `Siri.Workers` (1 job)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A, 2 ตารางเล็ก) → `backend-developer` (WP-B..E)** · ไม่ต้อง `DESIGN_DATABASE` · เหตุผลที่ไม่ส่ง Antigravity: `SlotCalculator` คือแกนของ "ห้ามจองซ้อน/เวลาผิดเขต" และ `TutorPriceCalculator` คือจุดคิดเงินของ booking (ต้องคิดที่ server ที่เดียว) — เมื่อ FROZEN แล้ว **UI ปฏิทินเป็นงานที่ Antigravity ทำได้** (P13-21)

Dependency: **P13-01** (`TUTOR_PROFILE`, `TutorOnly`, `TUTOR_OFFERING`, `ITutorPublicCacheInvalidator`, `TutorProfileStatsUpdater`, rate-limit constants) · **ใช้โดย P13-04** (ตัวกรองวัน-เวลา อ่าน `TUTOR_AVAILABILITY_RULES`), **P13-05** (ตรวจ slot + คิดราคา + แทนที่ `NullTutorBusyIntervalReader`) · ดัชนีกลาง `P13-README.md`

---

## 0. ข้อเท็จจริงจากโค้ดจริง + ผลต่อดีไซน์

| # | ข้อเท็จจริง | ผล |
|---|---|---|
| F1 | ไทยไม่มี DST (UTC+7 ตลอด) และ `TimeZoneInfo.FindSystemTimeZoneById("Asia/Bangkok")` ต่างกันระหว่าง Windows (dev) / Linux (prod) | `SlotCalculator` ใช้ **offset คงที่ `+07:00`** (`TimeSpan.FromHours(7)`) ไม่เรียก `TimeZoneInfo` — deterministic ทุกแพลตฟอร์ม |
| F2 | Npgsql โยน exception ถ้า `DateTime.Kind != Utc`; System.Text.Json แปลง `…+07:00` เป็น `Kind=Local` | request ที่รับเวลาใช้ `DateTimeOffset` แล้ว `.UtcDateTime` เสมอ; ภายใน `SlotCalculator` ทุก `DateTime` เป็น UTC (`Kind=Utc`) |
| F3 | Middleware order ใน `Program.cs`: `UseOutputCache()` **ก่อน** `UseRateLimiter()` ⇒ response ที่ถูก cache ไม่ผ่านตัวจำกัดอัตรา; default policy ของ output cache **ไม่ cache request ที่มี `Authorization` header** และ vary ตาม query string ทุก key | slots สำหรับผู้เข้าชมทั่วไปได้ cache; ผู้ที่ login แล้ว (กำลังจะจอง) ข้าม cache เสมอ ⇒ อ่านสดจาก DB — ตั้งใจและยอมรับ |
| F4 | `TUTOR_SESSIONS` (ตารางที่กันจองซ้อน) ถูกสร้างใน **P13-05** ที่หลัง P13-03 | P13-03 ประกาศ seam `ITutorBusyIntervalReader` + `NullTutorBusyIntervalReader` (TryAdd) — P13-05 ลงทะเบียนตัวจริงทับ (`AddScoped`) ⇒ slots ใช้งานได้ตั้งแต่ P13-03 โดยยังไม่เห็นการจอง |
| F5 | `TutorProfileStatsUpdater` (P13-01) เป็นผู้เขียนเดียวของ `NEXT_AVAILABLE_AT_UTC` ผ่าน `ITutorStatsWriter` (P13-01 §4.3 ประกาศ `SetNextAvailableAsync` ไว้แล้ว) | P13-03 **เรียก `ITutorStatsWriter.SetNextAvailableAsync`** (ไม่สร้าง writer ที่สอง ไม่แก้ไฟล์ updater) |

---

## 1. Scope & task IDs
**ใน:** ตาราง `TUTOR_AVAILABILITY_RULES`/`TUTOR_AVAILABILITY_EXCEPTIONS` + migration `AddTutorAvailability` · endpoint ตั้งค่าเวลาว่าง (ติวเตอร์ `TutorOnly`) · `SlotCalculator` + `TutorPriceCalculator` (pure, `Domain/`) · `GET /api/tutoring/tutors/{slug}/slots` (สาธารณะ) · seam `ITutorBusyIntervalReader` · job + `ITutorNextAvailableRefresher` · output-cache policy `TutoringSlots` · Options `TutoringSlotsOptions`
**นอก:** การจอง/ล็อกเวลา/exclusion constraint (P13-05) · ค้นหาด้วยวัน-เวลา (P13-04 — แต่ใช้ตารางจากที่นี่) · sync Google free/busy (ไม่ทำใน v1) · FE

---

## 2. Schema delta — migration `AddTutorAvailability` (additive; กฎเดียวกับ P13-01 §2)

### 2.1 `TUTORING.TUTOR_AVAILABILITY_RULES` (entity `TUTOR_AVAILABILITY_RULE : IAuditable`)
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `RULE_ID` | uuid PK | no | |
| `TUTOR_ID` | uuid | no | FK → `TUTOR_PROFILES` NoAction (`FK_TUTOR_AVAIL_RULES_TUTOR`) |
| `DAY_OF_WEEK` | integer | no | **0 = อาทิตย์ … 6 = เสาร์** (เท่ากับ `System.DayOfWeek` และ JS `Date.getDay()`; FE แสดงเริ่มจันทร์ได้) · CHECK 0–6 |
| `START_LOCAL` | time without time zone | no | เวลา wall-clock ของ **Asia/Bangkok** (`TimeOnly`) |
| `END_LOCAL` | time without time zone | no | `END_LOCAL <= START_LOCAL` = **ข้ามเที่ยงคืน** (สิ้นสุดวันถัดไป; `END = 00:00` = เที่ยงคืนพอดี) |
| `IS_ACTIVE` | boolean | no | default true |
| audit | | | |
Index/constraint: `PK_TUTOR_AVAILABILITY_RULES` · `IX_TUTOR_AVAIL_RULES_TUTOR_DOW` (`TUTOR_ID`,`DAY_OF_WEEK`) · CHECK `CK_TUTOR_AVAIL_RULES_DOW` (`DAY_OF_WEEK` BETWEEN 0 AND 6) · CHECK `CK_TUTOR_AVAIL_RULES_RANGE` (`START_LOCAL` <> `END_LOCAL`) · **hard delete ได้** (ไม่ใช่ข้อมูลเงิน/สิทธิ์ — การแทนที่ทั้งชุดเป็น delete+insert; session ที่จองไปแล้วไม่ผูกกับ rule)

### 2.2 `TUTORING.TUTOR_AVAILABILITY_EXCEPTIONS` (entity `TUTOR_AVAILABILITY_EXCEPTION : IAuditable`)
| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `EXCEPTION_ID` | uuid PK | no | |
| `TUTOR_ID` | uuid | no | FK NoAction (`FK_TUTOR_AVAIL_EXC_TUTOR`) |
| `DATE_LOCAL` | date | no | วันที่ตามเวลาไทย (`DateOnly`) |
| `KIND` | varchar(12) | no | `AvailabilityExceptionKind`: `Closed\|ExtraOpen` |
| `START_LOCAL` / `END_LOCAL` | time | yes | `Closed`: ทั้งคู่ null = ปิดทั้งวัน, หรือทั้งคู่มี = ปิดช่วง · `ExtraOpen`: ต้องมีทั้งคู่ · **ต้อง `END > START` (ไม่ข้ามเที่ยงคืน; ต้องการข้ามให้สร้างสองรายการ)** |
| `NOTE` | varchar(200) | yes | |
| audit | | | |
Index/constraint: `PK_TUTOR_AVAILABILITY_EXCEPTIONS` · `IX_TUTOR_AVAIL_EXC_TUTOR_DATE` (`TUTOR_ID`,`DATE_LOCAL`) · CHECK `CK_TUTOR_AVAIL_EXC_SHAPE` ((`START_LOCAL` IS NULL AND `END_LOCAL` IS NULL AND `KIND`='Closed') OR (`START_LOCAL` IS NOT NULL AND `END_LOCAL` IS NOT NULL AND `END_LOCAL` > `START_LOCAL`)) · hard delete ได้

migration `AddTutorAvailability` · สร้างหลัง `AddTutorKyc` · ค่า `MIN_NOTICE_HOURS`/`BUFFER_MINUTES`/`MAX_ADVANCE_DAYS` อยู่ใน `TUTOR_PROFILES` แล้ว (P13-01)

---

## 3. `SlotCalculator` — pure function (`Siri.Modules.Tutoring.Domain.Scheduling`; ไม่มี I/O, ไม่อ่านนาฬิกา, ไม่รู้จัก EF/ASP.NET)

### 3.1 ชนิด (ลายเซ็นตายตัว — เทสต์ของ P13-04/05 อ้างตรง ๆ)
```csharp
public readonly record struct AvailabilityWindowRule(int DayOfWeek, TimeOnly StartLocal, TimeOnly EndLocal, bool IsActive);
public readonly record struct AvailabilityExceptionItem(DateOnly DateLocal, AvailabilityExceptionKind Kind, TimeOnly? StartLocal, TimeOnly? EndLocal);
/// <summary>บล็อกเวลาที่ถูกจองอยู่ (Held/Scheduled/Completed): [StartsAtUtc, BlockEndsAtUtc) — BlockEndsAtUtc รวม buffer ที่ snapshot ตอนจองแล้ว.</summary>
public readonly record struct BusyBlock(DateTime StartsAtUtc, DateTime BlockEndsAtUtc);
/// <summary>session กลุ่มที่เปิดอยู่ (Held/Scheduled) ที่ยังรับเพิ่มได้ — ใช้เมื่อ Format=Group.</summary>
public readonly record struct OpenGroupSession(Guid SessionId, Guid OfferingId, DateTime StartsAtUtc, DateTime EndsAtUtc, int Capacity, int SeatsTaken);

public sealed record SlotCalculationInput(
    DateTime NowUtc, DateTime FromUtc, DateTime ToUtc,            // [FromUtc, ToUtc) ของ "เวลาเริ่ม"
    Guid OfferingId, SessionFormat Format, int DurationMinutes, int? GroupMaxSeats,
    int MinNoticeHours, int BufferMinutes, int MaxAdvanceDays, int GridMinutes,
    IReadOnlyList<AvailabilityWindowRule> Rules, IReadOnlyList<AvailabilityExceptionItem> Exceptions,
    IReadOnlyList<BusyBlock> Busy, IReadOnlyList<OpenGroupSession> OpenGroups);

public readonly record struct SlotCandidate(DateTime StartsAtUtc, DateTime EndsAtUtc, int SeatsLeft, bool JoinsExistingGroup);

public static class SlotCalculator
{
    public static readonly TimeSpan BangkokOffset = TimeSpan.FromHours(7);        // ไม่มี DST
    public static IReadOnlyList<SlotCandidate> Calculate(SlotCalculationInput input);
    /// <summary>true เมื่อมี slot เริ่ม ณ startUtc พอดีภายใต้ input (ใช้ตรวจ booking: ส่ง Busy = [] เพื่อตรวจแค่ availability/notice/advance — ส่วนชนกับคลาสอื่นให้ DB constraint ตัดสิน).</summary>
    public static bool IsStartAvailable(SlotCalculationInput input, DateTime startUtc);
}
```
`input` ผิดรูป (`DurationMinutes<=0`, `GridMinutes<=0`, `FromUtc>=ToUtc`, `BufferMinutes<0`, `DateTime.Kind != Utc`) ⇒ `ArgumentException` (service ตรวจและตอบ 400 ก่อนเรียก) · ผลลัพธ์เรียง `StartsAtUtc` ASC, ไม่ซ้ำเวลาเริ่ม, `Kind=Utc`

### 3.2 อัลกอริทึม (ตรงตามนี้เป๊ะ — ลำดับมีความหมาย)
```
นิยาม:  toLocal(u) = u + 7h ;  toUtc(l) = l − 7h ;  [a,b) = ช่วงเปิดด้านซ้าย-ปิดด้านขวา ;  overlap([a,b),[c,d)) ⇔ a < d ∧ c < b
        grid anchor = เที่ยงคืนท้องถิ่น (นาทีนับจาก 00:00 ท้องถิ่น mod GridMinutes = 0)

S1  ช่วงเวลาเริ่มที่อนุญาต
      earliest   = max(FromUtc, NowUtc + MinNoticeHours·1h)        ← "พอดี" ที่ขอบ = ผ่าน (inclusive)
      advanceMax = NowUtc + MaxAdvanceDays·24h                      ← "พอดี" ที่ขอบ = ผ่าน (inclusive)
      startOk(s) ⇔ s ≥ earliest ∧ s < ToUtc ∧ s ≤ advanceMax
      ถ้า earliest ≥ ToUtc ∨ earliest > advanceMax → คืน []

S2  สร้างช่วง "เปิด" (UTC) — วนวันที่ท้องถิ่น d ตั้งแต่ localDate(earliest) − 1 วัน ถึง localDate(min(ToUtc, advanceMax)) (รวม)   ← −1 วันเพื่อจับ "หางของ rule ข้ามเที่ยงคืนจากเมื่อวาน"
      สำหรับ rule r (IsActive ∧ r.DayOfWeek = dow(d)):
            s = d + r.StartLocal ;  e = (r.EndLocal > r.StartLocal) ? d + r.EndLocal : (d + 1 วัน) + r.EndLocal      ← END ≤ START = ข้ามเที่ยงคืน
            เพิ่ม [toUtc(s), toUtc(e))
      สำหรับ exception x (Kind = ExtraOpen ∧ x.DateLocal = d):  เพิ่ม [toUtc(d + x.StartLocal), toUtc(d + x.EndLocal))
      รวมช่วงที่ทับกันหรือ "ชนกันพอดี" (e₁ ≥ s₂) เป็นช่วงเดียว (union)  → Windows

S3  หัก "ปิด" — สำหรับ exception x (Kind = Closed):
      ช่วงปิด = (x.StartLocal, x.EndLocal เป็น null) ? [toUtc(d 00:00), toUtc(d+1 00:00)) : [toUtc(d + Start), toUtc(d + End))
      Windows ← Windows − ช่วงปิด        (interval subtraction; อาจแตกเป็นสองช่วง; ปิดทั้งวันตัด "หางข้ามเที่ยงคืน" ของ rule เมื่อวานที่ตกในวัน d ด้วย)
      (ทำหลัง S2 เสมอ ⇒ Closed ชนะ ExtraOpen ถ้าขัดกัน)

S4  สร้างผู้สมัครเวลาเริ่ม (สำหรับ Format = OneOnOne และ "เริ่มกลุ่มใหม่" ของ Format = Group):
      dur = DurationMinutes ;  block = dur + BufferMinutes
      ต่อ window [ws, we):
        s₀ = CeilToGrid(max(ws, earliest))            ← ปัดขึ้นเข้า grid (วินาที/มิลลิวินาทีปัดขึ้นเป็นนาทีถัดไปก่อน)
        for s = s₀; s + dur ≤ we; s += GridMinutes:   ← ชั้นเรียนต้องจบ ≤ ปลาย window (buffer ที่ต่อท้าย "ไม่ต้อง" อยู่ใน window)
            ถ้า ¬startOk(s) → (s ≥ ToUtc ∨ s > advanceMax ⇒ หยุดวน window นี้) ; ข้าม
            e = s + dur ;  blockEnd = s + block
            ถ้ามี b ∈ Busy ที่ overlap([s, blockEnd), [b.StartsAtUtc, b.BlockEndsAtUtc)) → ข้าม     ← ใช้ buffer ปัจจุบันของ "ผู้สมัคร" กับบล็อกเดิมที่ฝัง buffer ตอนจองแล้ว
            ปล่อย (s, e, SeatsLeft = (Format = Group ? GroupMaxSeats : 1), JoinsExistingGroup = false)

S5  เข้าร่วมกลุ่มที่เปิดอยู่ (เฉพาะ Format = Group):
      สำหรับ g ∈ OpenGroups ที่ g.OfferingId = OfferingId ∧ (g.EndsAtUtc − g.StartsAtUtc) = dur ∧ g.SeatsTaken < g.Capacity ∧ startOk(g.StartsAtUtc):
          ปล่อย (g.StartsAtUtc, g.EndsAtUtc, SeatsLeft = g.Capacity − g.SeatsTaken, JoinsExistingGroup = true)
      ⚠ ไม่ตรวจกับ Windows (ข้อกำหนดผลิตภัณฑ์: ติวเตอร์ผูกพันกับกลุ่มที่เปิดไว้แล้ว แม้เปลี่ยน availability ทีหลัง) แต่ **ใช้ min-notice/max-advance เดียวกัน**

S6  เรียง StartsAtUtc ASC ; ถ้าเวลาเริ่มซ้ำ ให้ JoinsExistingGroup = true ชนะ (ในทางปฏิบัติไม่ซ้ำ เพราะ Busy ของ S4 มีกลุ่มนั้นอยู่) ; คืนผล
```
**ข้อกำหนดย่อย:** (ก) `Busy` ที่ส่งเข้ามาต้องครอบคลุมทุกบล็อกที่ overlap ช่วง `[earliest, ToUtc + 6h)` (reader รับผิดชอบ — duration สูงสุด 120 + buffer สูงสุด 60 = 3 ชม. < 6 ชม.) (ข) สำหรับ Format = Group `Busy` ต้องรวม session กลุ่มที่เปิดอยู่ด้วย (กันเริ่มกลุ่มใหม่ทับ) — ส่วน S5 ปล่อยแยกต่างหาก (ค) buffer มีความหมายเป็น "พักหลังคลาส" เท่านั้น ⇒ ระยะห่างระหว่างคลาส ≥ buffer ของคลาสก่อนหน้า และ ≥ buffer ของ candidate ก่อนคลาสถัดไป (เพราะ exclusion constraint ของ P13-05 ใช้ `[STARTS, BLOCK_END)`) (ง) ผู้สมัครไม่ขึ้นกับ "ราคา/offering" ใด ๆ (จึงเป็น pure และแคชได้)

### 3.3 `IsStartAvailable` สำหรับ P13-05
`IsStartAvailable(input, startUtc)` = เรียก `Calculate` ด้วย `FromUtc = startUtc`, `ToUtc = startUtc + 1 นาที` แล้วเช็คว่ามีผลที่ `StartsAtUtc == startUtc` · P13-05 ส่ง `Busy = []`, `OpenGroups = []`

### 3.4 รายการเทสต์หน่วย (ต้องมีครบ — ตั้งชื่อ `Calculate_<Scenario>_<Expected>`; ใช้ `Rules`/`Exceptions` ตามโจทย์ และ `NowUtc` ที่ปักไว้; "จ." = วันจันทร์ท้องถิ่น)
**พื้นฐาน**
1. จ. 09:00–12:00, 60 นาที, grid 30 ⇒ เริ่ม 09:00, 09:30, 10:00, 10:30, 11:00 (5 ตัว; 11:30 จบ 12:30 > 12:00 ไม่ได้)
2. เหมือนข้อ 1 แต่ 30 นาที ⇒ 09:00…11:30 (6 ตัว)
3. ความยาวคลาส = ความยาว window พอดี ⇒ 1 ตัว · 4. คลาสยาวกว่า window ⇒ ว่าง
5. rule `IsActive=false` ถูกละเว้น · 6. rule วันอื่นไม่ถูกคืน; range คลุมสองวันจันทร์ ⇒ ได้ทั้งสองสัปดาห์
7. หลาย rule ในวันเดียว (09–12, 13–17) ⇒ ไม่มี slot ที่คร่อมช่องว่าง 12–13
8. rule ชนกันพอดี (09–12 + 12–15) ⇒ รวมเป็น 09–15 ⇒ คลาส 90 นาทีเริ่ม 11:30 ได้ · 9. rule ทับกัน (09–12 + 11–14) ⇒ union ไม่ซ้ำ slot
**เขตเวลา/ช่วงค้นหา**
10. จ. 09:00 ท้องถิ่น = 02:00Z วันเดียวกัน (ตรวจค่า UTC ที่ออก) · 11. rule 00:00–03:00 จ. ⇒ UTC อาทิตย์ 17:00–20:00Z ปรากฏเมื่อ range เป็นวันอาทิตย์ UTC
12. range ตัดกลาง window: slot ที่ `s < FromUtc` ไม่ออก, `s ≥ ToUtc` ไม่ออก (ขอบ `ToUtc` พอดี = ไม่ออก)
**ข้ามเที่ยงคืน**
13. rule ศ. 22:00–02:00 (60 นาที) ⇒ ศ. 22:00, 22:30, 23:00, 23:30, ส. 00:00, 00:30, 01:00 (7 ตัว; 01:30 จบ 02:30 ไม่ได้)
14. range เริ่ม ส. 00:00 ท้องถิ่น ยังเห็นหางของ rule ศ. (วน d−1)
15. exception `Closed` ทั้งวัน ส. ⇒ ตัด 00:00–02:00 ส. ออก แต่ยังเหลือ ศ. 22:00–24:00
16. rule 22:00–00:00 ⇒ จบเที่ยงคืนพอดี; 60 นาทีเริ่ม 23:00 ได้ · 17. rule 00:00–06:00 (ไม่ข้ามวัน) ⇒ ไม่ถูกตีความเป็น wrap
**Exception**
18. `Closed` ทั้งวัน ⇒ วันนั้นว่าง · 19. `Closed` 10:00–11:00 ⇒ 60 นาทีเริ่ม 09:00 ได้, 09:30 ไม่ได้ (ทับ), 11:00 ได้
20. `ExtraOpen` ในวันที่ไม่มี rule ⇒ มี slot · 21. `ExtraOpen` ทับ rule ⇒ union ไม่ซ้ำ
22. `Closed` ทั้งวัน + `ExtraOpen` วันเดียวกัน ⇒ Closed ชนะ (ว่าง) · 23. exception วันอื่นไม่กระทบ
**Busy / buffer**
24. buffer 10, มีคลาส 10:00–11:00 (block ถึง 11:10), ขอ 60 นาที ⇒ เริ่ม 08:30 ได้, 09:00 **ไม่ได้** (block 09:00–10:10 ทับ 10:00), 11:00 ไม่ได้ (ทับ block เดิมถึง 11:10), 11:30 ได้
25. ขอบพอดี: candidate `s + dur + buffer == busy.Start` ⇒ ผ่าน (half-open) · 26. buffer 0 ⇒ ติดกันพอดีผ่าน
27. busy นอก window ทั้งหมด ⇒ ไม่กระทบ · 28. buffer ของคลาสสุดท้ายล้ำออกนอก window ⇒ ยังผ่าน (buffer ไม่ต้องอยู่ใน window)
29. busy หลายก้อนต่อเนื่อง ⇒ ช่องว่างเล็กกว่า (dur+buffer) ไม่มี slot
**แจ้งล่วงหน้า / จองล่วงหน้าไกลสุด**
30. now = จ. 08:00, minNotice 24 ⇒ slot แรก ≥ อ. 08:00 · 31. เริ่ม `== now + minNotice` พอดี ⇒ ผ่าน; ถัดไปก่อนหน้า 1 tick ⇒ ไม่ผ่าน
32. now = 08:07, minNotice 24 ⇒ slot แรก 08:30 วันถัดไป (ปัดเข้า grid) · 33. maxAdvance 7 วัน: เริ่ม `== now + 7d` ผ่าน, +1 tick ไม่ผ่าน
34. range เกิน maxAdvance ⇒ ถูกตัด · 35. range ทั้งหมดอยู่ในอดีต/ในช่วง notice ⇒ ว่าง
**กลุ่ม**
36. Format=Group ไม่มี session ⇒ slot ใหม่ `SeatsLeft = GroupMaxSeats`, `JoinsExistingGroup=false`
37. มีกลุ่ม offering เดียวกัน/ความยาวเท่ากัน ที่นั่ง 2/4 (Scheduled) ⇒ ออก slot นั้น `JoinsExistingGroup=true`, `SeatsLeft=2` และเวลาทับกันไม่ออกเป็น slot ใหม่
38. กลุ่มเต็ม (4/4) ⇒ ไม่ออกเลย (ทั้ง join และ slot ใหม่ในเวลานั้น)
39. กลุ่มของ offering อื่น/ความยาวต่างกัน ⇒ กันเวลานั้นจาก slot ใหม่ แต่ไม่ join
40. กลุ่มสถานะ Held (ผู้จองคนแรกยังไม่จ่าย) ที่ยังมีที่นั่ง ⇒ join ได้ (reader ส่งมาใน `OpenGroups`)
41. Format=OneOnOne และมีกลุ่มทับเวลา ⇒ ถูกกันเป็น Busy
42. กลุ่มที่เปิดอยู่ภายใน minNotice ⇒ ไม่ออก · 43. กลุ่มที่เวลาอยู่นอก availability ปัจจุบัน แต่ใน notice/advance ⇒ ยังออก
**ความยาว/grid/ผลลัพธ์**
44. trial 15 นาที ⇒ เริ่มบน grid 30, จบที่ :15, block 15+buffer · 45. เวลาเริ่มท้องถิ่นทุกตัว mod 30 = 0 · 46. rule เริ่ม 09:15 (ข้อมูลเก่า) ⇒ slot แรก 09:30 (calculator ไม่ล้ม)
47. ผลเรียงและไม่ซ้ำ, `Kind=Utc` · 48. ผลเท่าเดิมเมื่อเรียกซ้ำ (ไม่อ่านนาฬิกา/สุ่ม) · 49. `ArgumentException` เมื่อ `Kind` ไม่ใช่ Utc / From ≥ To / Duration ≤ 0
50. `IsStartAvailable` จริง/เท็จตรงขอบ ทุกเงื่อนไข (นอก window, ไม่อยู่บน grid, ก่อน notice, เกิน advance)

---

## 4. `TutorPriceCalculator` — จุดคิดราคาเดียว (`Siri.Modules.Tutoring.Domain.Pricing`; pure) — P13-05 ใช้ตัวเดียวกัน ห้ามคำนวณซ้ำที่อื่น
```csharp
public sealed record TutorQuote(decimal Amount, string Currency, int DurationMinutes, decimal? HourlyRate, bool IsFree);
public static class TutorPriceCalculator
{
    public const string Currency = "THB";
    /// <summary>rate × minutes / 60 ปัด 2 ตำแหน่ง แบบ AwayFromZero. คูณก่อนหารเพื่อไม่เสียความแม่นยำ.</summary>
    public static decimal ForDuration(decimal hourlyRate, int durationMinutes)
        => decimal.Round(hourlyRate * durationMinutes / 60m, 2, MidpointRounding.AwayFromZero);
    /// <param name="minChargeAmount">ขั้นต่ำที่เรียกเก็บได้ = `Tutoring:Profile:MinChargeAmount` (P13-01 §8) — ผู้เรียก (service) ส่งเข้ามา เพื่อให้ฟังก์ชันคง pure (ไม่อ่าน Options); ผู้เรียกทั้งหมดต้องส่ง: slots (P13-03), booking (P13-05), **PackagePricing ของ P13-12**.</param>
    public static Result<TutorQuote> Quote(TUTOR_OFFERING offering, SessionFormat format, int durationMinutes, bool isTrial, decimal minChargeAmount);
}
```
- `isTrial`: ต้อง `TRIAL_ENABLED` ∧ `format=OneOnOne` ∧ `durationMinutes == TRIAL_MINUTES` มิฉะนั้น `Conflict.WithReason("tutoring.trial_not_available")` · ราคา = `TRIAL_PRICE` (แบบเหมา ไม่คูณเวลา; `IsFree = (TRIAL_PRICE == 0)`; `HourlyRate=null`)
- `format=Group`: ต้องมี `GROUP_HOURLY_RATE_PER_SEAT` มิฉะนั้น `Conflict.WithReason("tutoring.format_not_offered")` · ราคา = `ForDuration(GROUP_HOURLY_RATE_PER_SEAT, minutes)` **ต่อที่นั่ง**
- `format=OneOnOne`: `ForDuration(HOURLY_RATE_ONE_ON_ONE, minutes)`
- ผลคำนวณที่ `> 0` แต่ `< minChargeAmount` (อาร์กิวเมนต์; ค่าจริงมาจาก `Tutoring:Profile:MinChargeAmount`) ⇒ `Conflict.WithReason("tutoring.price_below_minimum")` (ป้องกันการตั้งอัตราที่ทำให้ Stripe ปฏิเสธ)
- **เวกเตอร์ทดสอบ (ต้องมี):** (450.00, 60)=450.00 · (450.00, 90)=675.00 · (450.00, 30)=225.00 · (333.33, 30)=166.67 (166.665→ปัดขึ้น) · (399.99, 90)=599.99 (599.985→599.99) · (1000.00, 120)=2000.00 · (100.05, 30)=50.03 (50.025→50.03) · trial 0 ⇒ `IsFree` · trial 99.00 ⇒ 99.00 โดยไม่ขึ้นกับ minutes · group 250.00/seat 60 ⇒ 250.00 · decimal ไม่เกิน 2 ตำแหน่งเสมอ · overflow ไม่เกิดที่ 20000×120 · **`minChargeAmount`**: ผลคำนวณ 9.99 กับ min 10.00 ⇒ `price_below_minimum` ; 10.00 ⇒ ผ่าน ; trial 0 ⇒ ผ่านเสมอ (ไม่เทียบ min) ; trial 5.00 ⇒ `price_below_minimum` ; ค่า min = 0 ⇒ ไม่มีขั้นต่ำ

---

## 5. Seam และ service

### 5.1 `ITutorBusyIntervalReader` (Application) — P13-05 แทนที่ตัวจริง
```csharp
public sealed record TutorBusyData(IReadOnlyList<BusyBlock> Blocks, IReadOnlyList<OpenGroupSession> OpenGroups);
public interface ITutorBusyIntervalReader
{
    /// <summary>บล็อกของ session ติวเตอร์นี้ที่ STATUS ∈ {Held, Scheduled, Completed} และ overlap [fromUtc, toUtc + 6h);
    /// OpenGroups = เฉพาะ FORMAT=Group, STATUS ∈ {Held, Scheduled}, OFFERING_ID = offeringId, SEATS_TAKEN < CAPACITY. Read-only (AsNoTracking).</summary>
    Task<TutorBusyData> GetAsync(Guid tutorId, Guid offeringId, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken);
}
public sealed class NullTutorBusyIntervalReader : ITutorBusyIntervalReader { … คืนว่าง … }   // services.TryAddScoped — ถูกแทนที่โดย P13-05 (AddScoped)
```
### 5.2 `ITutorNextAvailableRefresher` (Application) — P13-05/08 เรียกหลังจอง/ยกเลิก
```csharp
public interface ITutorNextAvailableRefresher
{
    /// <summary>คำนวณและเขียน NEXT_AVAILABLE_AT_UTC ของติวเตอร์คนเดียว. Best-effort: ห้าม throw (log warning) — ผู้เรียกไม่ต้อง try/catch.</summary>
    Task TryRefreshAsync(Guid tutorId, CancellationToken cancellationToken);
}
```
### 5.3 `TutorAvailabilityService` (aggregate: rules+exceptions ต่อติวเตอร์) — `TutorOnly`
- `GetAsync(userId)`: หา `TUTOR_ID` จาก `USER_ID` ⇒ `TutorAvailabilityResponse` (settings + rules เรียงตามวัน/เวลา)
- `ReplaceRulesAsync(userId, ReplaceRulesRequest)`: validate (§5.4) ⇒ transaction: ลบ rule เดิมของ `TUTOR_ID` + เพิ่มชุดใหม่ ⇒ `SaveChanges` ⇒ หลัง commit: `InvalidateSlotsAsync` + `TryRefreshAsync(tutorId)`
- `ApplySettingsAsync(userId, SettingsRequest)`: `TUTOR_PROFILE.ApplyAvailabilitySettings(...)` + `rowVersion` (ชน ⇒ 409 `tutoring.concurrent_update`; `Suspended` ⇒ 409 `tutoring.tutor_suspended`)
- `ListExceptionsAsync(userId, from?, to?, page, pageSize)` ⇒ `PagedResult` (เรียง `DATE_LOCAL` ASC; default from = วันนี้ Bangkok)
- `AddExceptionAsync` / `DeleteExceptionAsync(userId, exceptionId)` — `DELETE` หา `WHERE EXCEPTION_ID=@id AND TUTOR_ID=@mine` ใน query เดียว; ไม่พบ/ไม่ใช่ของฉัน ⇒ 404 `tutoring.not_found` (ข้อความเดียวกัน)
### 5.4 กฎการตรวจ (FluentValidation + service)
| เรื่อง | กฎ |
|---|---|
| rule | `dayOfWeek` 0–6 · `startLocal`/`endLocal` รูป `HH:mm` · **นาทีของเวลาเริ่ม/จบ mod `GridMinutes` = 0 และวินาที = 0** (เช่น grid 30 ⇒ นาที ∈ {00,30}; grid 15 ⇒ {00,15,30,45}; grid 60 ⇒ {00} — ไม่ฮาร์ดโค้ด {00,30}; ความยาว window ขั้นต่ำ = `GridMinutes`) · `start ≠ end` · ความยาว window ≥ `GridMinutes` และ < 24 ชม. · ไม่ทับกัน **รวมการข้ามเที่ยงคืนและ wrap ข้ามสัปดาห์ (ส.→อา.)** (ช่วงที่ชนกันพอดีอนุญาต) · ≤ `MaxRulesPerDay` (6) ต่อวัน · ≤ `MaxRulesPerTutor` (50) ⇒ ผิด: 400 reason `tutoring.availability_rule_invalid` ext `{ index, detail: "grid"\|"order"\|"overlap"\|"too_long"\|"too_many" }` |
| exception | `dateLocal` ≥ วันนี้ (Bangkok) และ ≤ วันนี้ + 365 · `Closed` ไม่มีเวลา = ทั้งวัน หรือมีทั้งคู่; `ExtraOpen` ต้องมีทั้งคู่ · `end > start`, เวลาบน grid · **ห้าม `Closed` ทั้งวัน + `ExtraOpen` วันเดียวกัน, ห้ามซ้ำช่วงเดียวกัน/ทับกันชนิดเดียวกัน** ⇒ 409 `tutoring.availability_exception_conflict` · เกิน `MaxFutureExceptions` (200) ⇒ 409 `tutoring.availability_exception_limit` |
| settings | `minNoticeHours` 1–168 · `bufferMinutes` ∈ {0,5,10,15,20,30,45,60} · `maxAdvanceDays` 7–180 · ค่าใหม่มีผลกับการจอง **ใหม่** เท่านั้น (booking เก่าถือ buffer ที่ snapshot ไว้) |

### 5.5 `TutorSlotService.GetSlotsAsync(slug, query)` (สาธารณะ — read-only)
```
1. ตรวจ query: offeringId ≠ Empty ; from/to (DateTimeOffset→UTC) ; default from = now, to = from + DefaultRangeDays(7) ; to > from ; (to − from) ≤ MaxRangeDays(31)  → 400 tutoring.slots_range_invalid
   format ∈ {OneOnOne(default), Group} ; trial (bool, default false)
2. tutor = SELECT … WHERE SLUG=@slug AND STATUS='Verified' AND IS_LISTED = true AND EXISTS(active offering)   ไม่พบ/ไม่พร้อม → 404 tutoring.tutor_not_found (ข้อความเดียวกันทุกกรณี — ไม่บอกว่าถูกระงับ/ไม่ listed)
3. offering = WHERE OFFERING_ID=@id AND TUTOR_ID=@tutor AND IS_ACTIVE → ไม่พบ 404 tutoring.offering_not_found
4. durationMinutes: trial ⇒ TRIAL_MINUTES (ถ้า client ส่งมาและไม่เท่า ⇒ 400 tutoring.duration_not_allowed) ; ไม่ trial ⇒ ต้อง ∈ AllowedDurationsMinutes (default [30,60,90,120]) → 400 tutoring.duration_not_allowed
5. quote = TutorPriceCalculator.Quote(offering, format, minutes, isTrial, profileOptions.MinChargeAmount)  (ล้ม → 409 ตาม reason: trial_not_available / format_not_offered / price_below_minimum)
6. rules = ทั้งหมดของ TUTOR_ID (≤50) ; exceptions = DATE_LOCAL ระหว่าง localDate(from)−1 ถึง localDate(to)+1 ; busy = ITutorBusyIntervalReader.GetAsync(...)
7. SlotCalculator.Calculate(input จาก tutor.MIN_NOTICE_HOURS/BUFFER_MINUTES/MAX_ADVANCE_DAYS/GridMinutes, clock.UtcNow)
8. 200 TutorSlotsResponse (ไม่มี session id / ไม่มีข้อมูลผู้เรียน / ไม่มี tutorId)
```
ดัชนีที่ใช้ (database.md "บอกได้ว่าใช้ index ไหน"): `UQ_TUTOR_PROFILES_SLUG` (หา tutor) · `IX_TUTOR_OFFERINGS_*`/PK (offering) · `IX_TUTOR_AVAIL_RULES_TUTOR_DOW` (rules ตาม `TUTOR_ID`) · `IX_TUTOR_AVAIL_EXC_TUTOR_DATE` (exceptions) · busy: `IX_TUTOR_SESSIONS_TUTOR_STARTS` ของ P13-05
### 5.6 `TutorNextAvailableService` + job
- `RefreshOneAsync(tutorId)`: ติวเตอร์ที่ **ไม่** `Verified ∧ listed ∧ มี offering active` ⇒ `NULL` ; มิฉะนั้นคำนวณ `Calculate` ด้วย `OneOnOne`, ความยาว `NextAvailableDurationMinutes` (30), ช่วง `[now, min(now + NextAvailableHorizonDays(21)d, now + MAX_ADVANCE_DAYS)]` (ใช้ offering active ตัวใดก็ได้เพราะ availability ไม่ขึ้นกับ offering), คืน `StartsAtUtc` ตัวแรกหรือ `NULL` ⇒ `ITutorStatsWriter.SetNextAvailableAsync(tutorId, value, ct)` (เขียนเฉพาะเมื่อค่าเปลี่ยน — `WHERE NEXT_AVAILABLE_AT_UTC IS DISTINCT FROM @value`)
- `RefreshAllAsync(ct)`: ดึง `TUTOR_ID` ที่ eligible เป็นชุด ๆ (keyset ตาม `TUTOR_ID`, 100/ชุด), ต่อคน try/catch (log `tutorId`), งบเวลา 45 วิ/run แล้วหยุดอย่างปลอดภัย
- job: id `tutoring-next-available`, คลาส `TutoringNextAvailableJob`, `Cron.MinuteInterval(10)`, `[DisableConcurrentExecution(timeoutInSeconds: 540)]`
```csharp
// RecurringJobIds.cs:   public const string TutoringNextAvailable = "tutoring-next-available";   (+ ใน All)
// RecurringJobsRegistration.cs (ต่อท้าย):
recurringJobManager.AddOrUpdate<TutoringNextAvailableJob>(RecurringJobIds.TutoringNextAvailable, job => job.RunAsync(CancellationToken.None), Cron.MinuteInterval(10));
```
- implementation ใน `TutorProfileStatsUpdater` (P13-01) ใช้ `ExecuteUpdateAsync` (ไม่หมุน `ROW_VERSION` โดยตั้งใจ — ค่า denormalized ไม่ควรทำให้การแก้โปรไฟล์ของติวเตอร์ชนกัน และ EF อัปเดตเฉพาะคอลัมน์ที่เปลี่ยนจึงไม่มี lost update)

---

## 6. Endpoint ที่ FROZEN
error = RFC 9457 + `traceId` + `errorCode` + `reason` · เวลา UTC `…Z` (`startLocal`/`endLocal` เป็น `"HH:mm"` เวลาไทย, `dateLocal` เป็น `"yyyy-MM-dd"`) · enum เป็น string

### 6.1 ติวเตอร์ — `[Authorize(Policy = TutorOnly)]`, rate `tutoring-user` — base `/api/tutoring/tutor/availability`
| # | Method + path | Request | สำเร็จ | Error |
|---|---|---|---|---|
| 1 | `GET /tutor/availability` | — | 200 `TutorAvailabilityResponse` | 403 (ไม่ใช่ Verified) · 404 `tutoring.tutor_profile_not_found` |
| 2 | `PUT /tutor/availability/settings` | `{ minNoticeHours, bufferMinutes, maxAdvanceDays, rowVersion }` | 200 `AvailabilitySettings` (+ `rowVersion` ใหม่) | 400 · 409 `tutoring.concurrent_update` / `tutoring.tutor_suspended` |
| 3 | `PUT /tutor/availability/rules` | `{ rules: [{ dayOfWeek, startLocal, endLocal }] }` (แทนที่ทั้งชุด; `[]` = ล้างทั้งหมด) | 200 `TutorAvailabilityResponse` | 400 `tutoring.availability_rule_invalid` (ext `index`,`violation` — `detail` เป็นชื่อสงวนของ ProblemDetails ห้ามใช้เป็น ext) |
| 4 | `GET /tutor/availability/exceptions?from&to&page=1&pageSize=50` | — | 200 `PagedResult<AvailabilityExceptionResponse>` (pageSize ≤100) | |
| 5 | `POST /tutor/availability/exceptions` | `{ dateLocal, kind, startLocal?, endLocal?, note? }` | 201 `AvailabilityExceptionResponse` | 400 `tutoring.availability_exception_invalid` · 409 `tutoring.availability_exception_conflict` / `_limit` |
| 6 | `DELETE /tutor/availability/exceptions/{exceptionId}` | — | 204 | 404 `tutoring.not_found` |
`PUT rules` เป็น last-writer-wins (ไม่มี `rowVersion` — ตารางลูก; ยอมรับ) · ทุกการเขียนสำเร็จ ⇒ `InvalidateSlotsAsync` + `TryRefreshAsync`

### 6.2 สาธารณะ — `[AllowAnonymous]`, rate `tutoring-slots`, `[OutputCache(PolicyName = TutoringOutputCache.SlotsPolicyName)]`
| # | Method + path | Query | สำเร็จ | Error |
|---|---|---|---|---|
| 7 | `GET /api/tutoring/tutors/{slug}/slots` | `offeringId` (**required**), `from?`, `to?`, `durationMinutes?`, `format?` (`OneOnOne`\|`Group`, default OneOnOne), `trial?` (default false) | 200 `TutorSlotsResponse` | 400 `tutoring.slots_range_invalid` / `tutoring.duration_not_allowed` · 404 `tutoring.tutor_not_found` / `tutoring.offering_not_found` · 409 `tutoring.trial_not_available` / `tutoring.format_not_offered` / `tutoring.price_below_minimum` · 429 |
- ลงทะเบียน output cache policy ใน `AddTutoringModule`: `options.AddPolicy(TutoringOutputCache.SlotsPolicyName, p => p.Expire(TimeSpan.FromSeconds(opts.OutputCacheSeconds)).Tag(TutoringOutputCache.SlotsTag))` (`AddOutputCache` เรียกซ้ำได้จากหลายโมดูลตามที่ Catalog ทำ) · TTL default **10 วิ** (config ช่วง 1–60 — ไม่มีค่า 0 เพราะ `[OutputCache(PolicyName = …)]` ที่หา policy ไม่เจอจะ throw จึงต้องลงทะเบียน policy เสมอ)
- ความสดของข้อมูล: P13-05 เรียก `InvalidateSlotsAsync` หลังสร้าง/หมดอายุ/ยกเลิก booking; หลาย replica ⇒ พึ่ง TTL 10 วิ · **ความถูกต้องไม่พึ่ง cache** — การจองจริงถูกตัดสินที่ DB constraint (slot ที่ค้างเก่าเกิดได้ผลเป็น 409 `tutoring.slot_taken` เท่านั้น)
- ผู้เรียกที่ล็อกอิน (มี `Authorization`) ข้าม output cache โดย default ของ framework (F3) ⇒ ไม่มี risk ปน response ข้ามผู้ใช้ (response ไม่มีข้อมูลเฉพาะผู้ใช้อยู่แล้ว)
- ไม่ log `slug`+IP คู่กันเป็นรายการวิเคราะห์ (ไม่มี search-log ที่ endpoint นี้)

### 6.3 DTO (C#)
```csharp
public sealed record AvailabilitySettings(int MinNoticeHours, int BufferMinutes, int MaxAdvanceDays, string RowVersion);
public sealed record AvailabilityRuleDto(int DayOfWeek, string StartLocal, string EndLocal);          // "HH:mm"
public sealed record ReplaceRulesRequest(IReadOnlyList<AvailabilityRuleDto> Rules);
public sealed record TutorAvailabilityResponse(string Timezone, AvailabilitySettings Settings, IReadOnlyList<AvailabilityRuleDto> Rules, int MaxRules);   // Timezone = "Asia/Bangkok"
public sealed record SettingsRequest(int MinNoticeHours, int BufferMinutes, int MaxAdvanceDays, string RowVersion);
public sealed record CreateExceptionRequest(string DateLocal, AvailabilityExceptionKind Kind, string? StartLocal, string? EndLocal, string? Note);
public sealed record AvailabilityExceptionResponse(Guid ExceptionId, string DateLocal, AvailabilityExceptionKind Kind, string? StartLocal, string? EndLocal, string? Note);

public sealed record TutorSlotItem(DateTime StartsAtUtc, DateTime EndsAtUtc, int SeatsLeft, bool JoinsExistingGroup);
public sealed record TutorQuoteDto(decimal Amount, string Currency, int DurationMinutes, decimal? HourlyRate, bool IsFree);
public sealed record TutorSlotsResponse(string TutorSlug, Guid OfferingId, SessionFormat Format, int DurationMinutes, bool IsTrial, TutorQuoteDto Quote,
    string Timezone, DateTime ServerTimeUtc, DateTime FromUtc, DateTime ToUtc, int MinNoticeHours, int MaxAdvanceDays, IReadOnlyList<TutorSlotItem> Slots);
```
`Quote` เป็น **ราคาแสดงผล** (คำนวณจาก `TutorPriceCalculator` เดียวกับ booking; booking คำนวณซ้ำที่ server เสมอ ไม่เชื่อค่าจาก client) · `SeatsLeft` ของ OneOnOne = 1

---

## 7. Config (`TutoringSlotsOptions`, section `Tutoring:Slots`, `IValidateOptions` + `ValidateOnStart`)
| Key | Default | ช่วง/หมายเหตุ |
|---|---|---|
| `GridMinutes` | `30` | ∈ {15,30,60}; **เวลาใน rule/exception ต้องบน grid** |
| `AllowedDurationsMinutes` | `[30,60,90,120]` | 15–240, เรียงและไม่ซ้ำ |
| `DefaultRangeDays` / `MaxRangeDays` | `7` / `31` | |
| `OutputCacheSeconds` | `10` | 1–60 |
| `NextAvailableHorizonDays` / `NextAvailableDurationMinutes` | `21` / `30` | |
| `MaxRulesPerTutor` / `MaxRulesPerDay` / `MaxFutureExceptions` | `50` / `6` / `200` | |
| `AllowedBufferMinutes` | `[0,5,10,15,20,30,45,60]` | |
ใส่ placeholder ใน `appsettings.json` ทั้ง Api และ Workers (Workers ใช้ job) · ไม่มี secret

## 8. Test checklist
**Unit:** §3.4 (50 ข้อ) · §4 เวกเตอร์ราคา (ทุกตัว) + Quote ทุก branch · validators §5.4 (overlap ข้ามสัปดาห์ ส.22:00–อา.02:00 ชนกับ อา.01:00–03:00, ติดกันพอดีผ่าน, นาทีไม่ใช่ 00/30, ยาวเกิน, เกินจำนวน) · `TutorAvailabilityService`: replace-all (ล้ม ⇒ ชุดเดิมยังอยู่ — ทดสอบด้วย repo ที่ throw กลางทาง), IDOR delete exception ของคนอื่น ⇒ 404 เท่าเดิม · `TutorSlotService` ลำดับตรวจ/ข้อความ 404 เดียวกันของ "ไม่มี slug / Draft / Suspended / unlisted / ไม่มี offering active" (เทียบ ProblemDetails หลังตัด traceId) · `TutorNextAvailableService` (ไม่ eligible ⇒ NULL; ไม่ว่างใน horizon ⇒ NULL; ไม่เขียนเมื่อค่าไม่เปลี่ยน; ล้มคนเดียวไม่หยุดทั้งชุด) · `TutorProfileStatsUpdater` ยังเป็นผู้เขียนเดียว (source-scan test ของ P13-01 ต้องผ่าน) · reflection: ทุก action มี attribute auth + `TutorOnly` ในกลุ่ม 1-6
**Integration (`SiriApiFactory`, PostgreSQL 17):** ติวเตอร์ Verified ตั้ง rule/exception/settings ⇒ `GET slots` สะท้อนทันที (ผู้เรียก anonymous ผ่านหลัง TTL หรือหลัง invalidate) · ติวเตอร์ Draft/Suspended เรียก `PUT rules` ⇒ 403 · slug ของ Draft/Suspended/unlisted ⇒ 404 body เดียวกับ slug ที่ไม่มี · ช่วงเวลาข้ามเที่ยงคืน/ข้าม UTC-ท้องถิ่น ตรวจค่า UTC ที่ออกกับ `Asia/Bangkok` อ้างอิง · rate limit (`tutoring-slots`: ครั้งที่ 241 ใน 60 วิ ⇒ 429; `tutoring-user`) · output cache: ผู้ไม่ login เรียกซ้ำ ⇒ ไม่ query ซ้ำภายใน TTL (นับ query ผ่าน interceptor) และผู้ login ข้าม cache · `NEXT_AVAILABLE_AT_UTC` ถูกตั้งโดย job (เรียก `RefreshAllAsync` ตรง ๆ) · migration (CHECK `END_LOCAL > START_LOCAL` ของ exception, `START <> END` ของ rule, FK NoAction) · ทุก action มี `[Authorize]`/`[AllowAnonymous]`

## 9. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | 2 entity/config + migration `AddTutorAvailability` + `docs/DATABASE.md` | architecture เขียว · ไม่ apply DB จริง |
| **B** | `backend-developer` | `SlotCalculator` + `TutorPriceCalculator` + unit §3.4/§4 (ทำก่อน — ไม่พึ่ง DB) | unit เขียวครบ 50 ข้อ |
| **C** | `backend-developer` | repositories, `TutorAvailabilityService`, `TutorSlotService`, `TutorNextAvailableService`, seams, validators, Options | unit §8 |
| **D** | `backend-developer` | 2 controller + output-cache policy + rate-limit constants/policies + job + `RecurringJobIds`/registration + appsettings | ไม่มี action ไร้ attribute auth |
| **E** | `backend-developer` | integration tests §8 | เขียนครบ (รายงานว่ายังไม่เคยรันถ้าไม่มี Docker) |
ขนานได้: A ∥ B · C หลัง A · `DONE` โดย integrator-qa · **ห้าม commit เอง**

## 10. FE notes (P13-21 สร้างขนานได้จาก DTO นี้)
- `GET slots` เป็นสาธารณะ (SSR/CSR ได้); ปฏิทินสัปดาห์: จัดกลุ่ม `slots` ตาม **วันที่ท้องถิ่น Asia/Bangkok** ด้วย pipe `bangkokDate` เดียวของระบบ (ห้ามคำนวณ offset เอง) · แสดงเวลา local · ปุ่ม slot เป็น `<button>` (keyboard: ลูกศร/Enter, `aria-label` มีวัน+เวลา) · รีเฟรชทุก 30-60 วิและก่อนกดจอง · ถ้า booking ตอบ 409 `tutoring.slot_taken` ให้รีเฟรช slot + แจ้ง
- slot `joinsExistingGroup=true` แสดงป้าย "เข้าร่วมกลุ่ม (เหลือ N ที่นั่ง)" · ราคา: แสดง `quote.amount` เท่านั้น **ห้ามคูณเอง**
- Tutor Portal availability (`TutorOnly` — guard `status==='Verified'`): week grid (อา-ส, เริ่มจันทร์ได้), ช่วงเวลาบน grid 30 นาที, รองรับ "ข้ามเที่ยงคืน" (end ≤ start) ด้วยข้อความอธิบาย · exception: ปฏิทิน + เลือกปิดทั้งวัน/ช่วง/เปิดเพิ่ม · ฟอร์ม settings (3 ช่อง) ส่ง `rowVersion`
- i18n `tutoring.tutor.availability.*`, `tutoring.slots.*`, `tutoring.errors.*` (th+en) · loading/error/empty (ไม่มี slot ⇒ แนะนำเลื่อนสัปดาห์/ติดต่อไม่ได้ในแพลตฟอร์มนี้) · token/`tone-*` เท่านั้น

## Deviations from TUTORING.md
| # | ใน TUTORING.md | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | "หั่นเป็นจุดเริ่มทุก 30 นาที" | grid ผูกกับ **เที่ยงคืนท้องถิ่น** และบังคับให้เวลาใน rule/exception อยู่บน grid | ทุกติวเตอร์เห็นจุดเริ่มชุดเดียวกัน (:00/:30) |
| D2 | `DAY_OF_WEEK(0-6)` ไม่ระบุฐาน | 0 = อาทิตย์ | ตรง `System.DayOfWeek`/JS |
| D3 | exception ไม่ระบุข้ามเที่ยงคืน | ห้าม (ต้อง `END > START`) | ลดความกำกวม; rule ข้ามเที่ยงคืนได้ |
| D4 | — | กลุ่มที่เปิดอยู่ join ได้แม้ออกนอก availability ปัจจุบัน; ยังใช้ min-notice/max-advance | ติวเตอร์ผูกพันกับกลุ่มที่เปิดไว้แล้ว |
| D5 | `NEXT_AVAILABLE_AT_UTC` อัปเดตโดย job | + `ITutorNextAvailableRefresher` เรียกหลังเปลี่ยน availability/จอง | ลดความล่าช้า 10 นาทีของ sort "nextAvailable" |

## Open decisions (defaulted)
1. Grid 30 นาทีคงที่ (config 15/30/60 แต่ไม่เปลี่ยนระหว่างใช้งานจริง) · 2. buffer มีผล "หลังคลาส" เท่านั้น (ตรงกับ exclusion constraint ของ TUTORING.md) · 3. ความยาวคลาสที่อนุญาต 30/60/90/120 · 4. `PUT rules` last-writer-wins · 5. ไม่ sync Google free/busy (ตามเอกสาร) · 6. slot ที่ผู้ล็อกอินเห็นไม่ผ่าน cache (ตาม default ของ framework)

## Frontend DTO appendix (TypeScript)
```ts
type Guid = string; type IsoUtc = string;
type SessionFormat = 'OneOnOne'|'Group';
type AvailabilityExceptionKind = 'Closed'|'ExtraOpen';
interface AvailabilitySettings { minNoticeHours: number; bufferMinutes: number; maxAdvanceDays: number; rowVersion: string; }
interface AvailabilityRule { dayOfWeek: 0|1|2|3|4|5|6; startLocal: string /*"HH:mm"*/; endLocal: string; }   // 0 = อาทิตย์ ; endLocal <= startLocal = ข้ามเที่ยงคืน
interface TutorAvailability { timezone: 'Asia/Bangkok'; settings: AvailabilitySettings; rules: AvailabilityRule[]; maxRules: number; }
interface ReplaceRulesRequest { rules: AvailabilityRule[]; }
interface SettingsRequest { minNoticeHours: number; bufferMinutes: number; maxAdvanceDays: number; rowVersion: string; }
interface CreateExceptionRequest { dateLocal: string /*"yyyy-MM-dd"*/; kind: AvailabilityExceptionKind; startLocal?: string|null; endLocal?: string|null; note?: string|null; }
interface AvailabilityException { exceptionId: Guid; dateLocal: string; kind: AvailabilityExceptionKind; startLocal: string|null; endLocal: string|null; note: string|null; }

interface TutorSlot { startsAtUtc: IsoUtc; endsAtUtc: IsoUtc; seatsLeft: number; joinsExistingGroup: boolean; }
interface TutorQuote { amount: number; currency: 'THB'; durationMinutes: number; hourlyRate: number|null; isFree: boolean; }
interface TutorSlotsResponse { tutorSlug: string; offeringId: Guid; format: SessionFormat; durationMinutes: number; isTrial: boolean; quote: TutorQuote; timezone: 'Asia/Bangkok'; serverTimeUtc: IsoUtc; fromUtc: IsoUtc; toUtc: IsoUtc; minNoticeHours: number; maxAdvanceDays: number; slots: TutorSlot[]; }
// GET /api/tutoring/tutors/{slug}/slots?offeringId=&from=&to=&durationMinutes=&format=&trial=
```
`reason` → i18n: `tutoring.slots_range_invalid`, `tutoring.duration_not_allowed`, `tutoring.tutor_not_found`, `tutoring.offering_not_found`, `tutoring.trial_not_available`, `tutoring.format_not_offered`, `tutoring.price_below_minimum`, `tutoring.availability_rule_invalid` (ext `index`,`violation`), `tutoring.availability_exception_invalid`/`_conflict`/`_limit`

## Changelog
- **2026-10-14 รอบ 2 (cross-contract review):** (1) `TutorPriceCalculator.Quote` เพิ่มอาร์กิวเมนต์ `decimal minChargeAmount` (ยังเป็น pure; ผู้เรียก slots/booking/P13-12 ส่ง `Tutoring:Profile:MinChargeAmount`) + test vector (2) §5.4 กฎ grid ของ rule/exception เป็นแบบ generic `mod GridMinutes = 0` (ไม่ฮาร์ดโค้ด {00,30}) (3) `SessionFormat` ประกาศที่ P13-01 (`Tutoring.Domain`); `AvailabilityExceptionKind` ประกาศที่ P13-03 (ดู README §3)
- **2026-10-15 รอบ 3:** ext key ของ `tutoring.availability_rule_invalid` เปลี่ยนจาก `detail` เป็น `violation` (ชื่อสงวนของ ProblemDetails — README §6); `index` คงเดิม
- **2026-10-15 รอบ 4 (โค้ดจริงชนะ):** ext key ของ `tutoring.availability_rule_invalid` คือ **`violation`** (+ `index` ของแถวที่ผิด) ตามที่ BE P13-03 build และ FE P13-25 อ่านจริง — ไม่ใช่ `ruleDetail`; ค่า rules: format|order|grid|too_long|overlap|too_many · exceptions: date|date_window|kind|time|order|grid|note

- **Changelog 2026-10-15 hardening (P13-33):** (L3) `from`/`to` ของ `GET tutors/{slug}/slots` ต้องอยู่ในช่วง **2000-01-01 ≤ t < 2100-01-01 (UTC)** (`TutoringDateLimits`) — นอกช่วง = 400 `SlotsRangeInvalid` (เดิม `9999-12-31` + DefaultRangeDays / ±1 วัน ทำให้ ArgumentOutOfRangeException → 500) · output-cache policy `TutoringSlots` ระบุ `SetVaryByQuery("*")` ชัดเจน (query คนละตัวไม่เคยใช้ cache entry เดียวกัน)
