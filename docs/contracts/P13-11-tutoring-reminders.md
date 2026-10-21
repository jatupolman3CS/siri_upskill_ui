# Contract: P13-11 Tutoring — เตือนก่อนเริ่มคลาส (ล่วงหน้า 1 วัน + 15 นาที) ถึงผู้เรียนและติวเตอร์

Status: FROZEN · วันที่: 2026-10-14 · Module: **`Siri.Modules.Tutoring` (Repository+Service, UPPERCASE, schema `TUTORING`)** · ใช้ `Notification.Contracts` (`IEmailOutbox`, `IUserNotificationOutbox`, `EmailTemplateRenderer`) และ `Identity.Contracts.IUserContactReader` เท่านั้น · **ไม่เรียก Live** (ลิงก์ในข้อความคือ join URL ของแพลตฟอร์ม)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A, 2 คอลัมน์ + 2 partial index ง่าย ๆ → ไม่ต้อง DESIGN_DATABASE) → `backend-developer` (WP-B..C)** — เหตุผล: ส่งอีเมล/แจ้งเตือนถึงผู้ปกครองของผู้เยาว์จริง + ข้อมูลส่วนบุคคล (ชื่อเล่น/ระดับชั้นถึงติวเตอร์) + idempotency ที่ผิดแล้วอีเมลซ้ำถึงผู้ใช้ → ไม่ส่ง Antigravity

> **อ่านคู่กับ:** `docs/TUTORING.md` §1 (ล่วงหน้า 1 วัน + 15 นาที, เปิด join 15 นาที), §3.5 (reminder), §2 (`REMINDER_24H_SENT_AT_UTC`/`REMINDER_15M_SENT_AT_UTC` บน booking) · `P13-10` (join gate — ลิงก์ที่เตือนพาไป; `TutoringSessionMessages`/`TutoringTelemetry`/`TutoringLinks`) · แบบอ้างอิง: `P11-04` §4.5 + `Live/Application/SessionInviteService.Reminders.cs` · `P13-09` (ICS/อีเมล invite มาจาก Live — เตือนชุดนี้ **ไม่แนบ ICS**)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่านแล้ว 2026-10-14)

| # | ข้อเท็จจริง | หลักฐาน | ผล |
|---|---|---|---|
| H1 | เตือนคอร์ส: ช่วง 24h = `(1h, 24h]`, 1h = `(0, 1h]`; **ไม่ส่งถ้าถูกเชิญหลังจุดเริ่มช่วง**; job ล่มจนพ้นช่วง = ข้ามเงียบ; ประทับ flag พร้อม outbox ใน `SaveChanges` เดียวต่อก้อน | `Live/Application/SessionInvitePolicy.cs:DueReminder`; `SessionInviteService.Reminders.cs:94-178` | ใช้กฎเดียวกันที่ `TutoringReminderPolicy` (pure) |
| H2 | job เตือนของ Live ทุก **5 นาที** → ความแม่นยำ ±5 นาที ไม่พอสำหรับ lead 15 นาที | `Siri.Workers/RecurringJobsRegistration.cs:89-93` | `tutoring-reminders` ทุก **1 นาที** |
| H3 | outbox sender ทุก 1 นาที, `BatchSize=100`, `[DisableConcurrentExecution(50)]` | `EmailOutboxSenderJob.cs:35,41`; `RecurringJobsRegistration.cs:26-30` | เวลาถึงกล่องจดหมายจริง ≈ เวลาเตือน + ≤2 นาที → ค่าเริ่มต้น lead สั้น 15 นาทียังทัน (join เปิดที่ −15) แต่ **ไม่ควรตั้ง `LeadMinutes` < 5** (validator บังคับ) |
| H4 | `IEmailOutbox.Enqueue` / `IUserNotificationOutbox.Stage` เป็น stage-only (ไม่ `SaveChanges`); `Stage` throw ถ้า `linkUrl` ไม่ใช่ path ขึ้นต้น `/` ตัวเดียว/ http(s); ตัด title 200 / body 2000 | `Notification/Contracts/IEmailOutbox.cs`, `IUserNotificationOutbox.cs` | ใช้แบบเดียวกับ Live |
| H5 | `EmailTemplateRenderer.RenderLayout` ไม่ encode ให้ | `Notification/Contracts/EmailTemplateRenderer.cs` | ทุก string จาก DB ต้อง `HtmlEncode` เอง |
| H6 | `IUserContactReader.GetUsersContactInfoAsync` (batch) คืน `(Email, DisplayName)` — **ไม่มี locale** | `Identity/Contracts/IUserContactReader.cs` | อีเมลเป็นไทย+อังกฤษซ้อนฉบับเดียว (P13-09 D5) |
| H7 | `TUTORING.md` §2 กำหนดแค่ flag ฝั่ง **booking** (ผู้เรียน); ฝั่งติวเตอร์ไม่มี | `docs/TUTORING.md:85` | เพิ่ม 2 คอลัมน์บน `TUTOR_SESSIONS` (§2) |
| H8 | pattern content class ของระบบ: static pure + `HtmlEncode` + `RenderLayout` + templateKey + คู่ in-app | `Live/Application/LiveEmailTemplates.cs`; `Identity/Features/Login/ConcurrentSessionEvictedEmailContent.cs` | `TutoringReminderMessages` (§5) |

---

## 1. Scope
**ใน:** `TutoringReminderPolicy` (pure) · `TutoringReminderService` · job `tutoring-reminders` · คอลัมน์/index (§2) · ข้อความอีเมล (ไทย+อังกฤษ) + in-app (ไทย) · config `Tutoring:Reminders:*` · telemetry · registration
**นอก:** ICS/อีเมล invite ตอนจอง (Live — P13-09) · อีเมลยืนยันการจอง/ใบเสร็จ (P13-06) · แจ้งเตือนยกเลิก/คืนเงิน (P13-08) · nudge ติวเตอร์ START+5 และผลตัดสิน (P13-10) · reminder ของคลาสที่ถูก reschedule (v1 ไม่มี reschedule — ถ้าเพิ่มภายหลัง `TUTOR_SESSION.Reschedule` ต้องเรียก `ResetReminders()` ล้าง flag ทั้ง session และ booking) · LINE/Web Push (เลื่อน — Q14.6)

---

## 2. Schema delta — migration `AddTutoringReminderColumns` (additive)

| ตาราง | คอลัมน์ | หมายเหตุ |
|---|---|---|
| `TUTOR_SESSIONS` | `TUTOR_REMINDER_24H_SENT_AT_UTC timestamptz(3) NULL` | เตือนช่อง "ล่วงหน้ายาว" ถึง **ติวเตอร์** แล้ว (once ต่อ session) |
| `TUTOR_SESSIONS` | `TUTOR_REMINDER_15M_SENT_AT_UTC timestamptz(3) NULL` | เตือนช่อง "สั้น" ถึงติวเตอร์แล้ว |

**ที่ P13-05 สร้างไว้แล้ว — P13-11 ไม่เพิ่ม ไม่ตรวจ-แล้ว-เพิ่ม (รอบ 2 ข้อ 16; README §2):** `TUTOR_BOOKINGS.REMINDER_24H_SENT_AT_UTC`, `TUTOR_BOOKINGS.REMINDER_15M_SENT_AT_UTC` (P13-05 §3.2) และ `TUTOR_BOOKINGS.CONFIRMED_AT_UTC` (P13-05 D2) — **`TUTOR_BOOKING.Confirm(clock, paymentId?)` และ factory `CreateFromPackage`/เส้นทาง trial ฟรีของ P13-05 ตั้ง `CONFIRMED_AT_UTC ??= now` ให้อยู่แล้ว** (P13-05 §3.2) ⇒ ไม่มีงานฝั่ง P13-06 · P13-11 **อ่านเป็น `COALESCE(CONFIRMED_AT_UTC, CreatedAtUtc)`** เฉพาะเป็น defensive (แถวที่ถูกแก้ด้วยมือ/ข้อมูลก่อนมีคอลัมน์) — migration `AddTutoringReminderColumns` จึงมี **เฉพาะ 2 คอลัมน์บน `TUTOR_SESSIONS` + 2 partial index** ด้านล่าง

ชื่อคอลัมน์ `_24H_`/`_15M_` คงตาม `TUTORING.md` แต่ความหมายคือ **"ช่องยาว/ช่องสั้นที่ตั้งใน config"** (ถ้าเจ้าของเปลี่ยน lead เป็น [48]/[30] flag เดิมยังใช้ได้ ไม่ต้อง migrate) · **ไม่รองรับหลาย lead ต่อช่อง** ใน v1 (validator บังคับ ≤1 ค่าต่อช่อง) — ถ้าต้องการ 3 ช่องขึ้นไปต้องออก revision เป็นตาราง
Index (ชื่อ ≤63 ไบต์ ตั้งเอง): `IX_TUTOR_BOOKINGS_REMINDER_DUE` (`SESSION_ID`) `HasFilter("\"STATUS\" = 'Confirmed' AND (\"REMINDER_24H_SENT_AT_UTC\" IS NULL OR \"REMINDER_15M_SENT_AT_UTC\" IS NULL)")` · `IX_TUTOR_SESSIONS_TUTOR_REMINDER_DUE` (`STARTS_AT_UTC`) `HasFilter("\"STATUS\" = 'Scheduled' AND (\"TUTOR_REMINDER_24H_SENT_AT_UTC\" IS NULL OR \"TUTOR_REMINDER_15M_SENT_AT_UTC\" IS NULL)")`
Entity methods (idempotent — ตั้งเฉพาะเมื่อ null): `TUTOR_BOOKING.MarkReminderSent(slot, clock)` · `TUTOR_SESSION.MarkTutorReminderSent(slot, clock)` · `ResetReminders()` (ไว้ให้ reschedule ในอนาคต)

---

## 3. Config (`Tutoring:Reminders`, class `TutoringReminderOptions`, `ValidateOnStart()`)

| Key | Default | กฎ |
|---|---|---|
| `Tutoring:Reminders:Enabled` | `true` | kill-switch (false = job ไม่ทำอะไร) |
| `Tutoring:Reminders:LeadHours` | `[24]` | 0–1 ค่า, แต่ละค่า 2–168 ชม. (**ว่าง/ไม่ตั้ง = ใช้ `[24]`** — ปิดช่องด้วย `LongEnabled=false`) |
| `Tutoring:Reminders:LeadMinutes` | `[15]` | 0–1 ค่า, แต่ละค่า **5–180** นาที (≥5 เพราะ H3) |
| `Tutoring:Reminders:LongEnabled` / `ShortEnabled` | `true` / `true` | |
| `Tutoring:Reminders:BatchSize` | `50` | หน่วย (booking หรือ session) ต่อ `SaveChanges` |
| `Tutoring:Reminders:MaxPerRun` | `500` | เพดานผู้รับต่อรอบ (เกินรอไปรอบหน้า — ช่วงเตือนกว้างพอ) |
cross-field: `LeadMinutes[0] < LeadHours[0] × 60` เมื่อเปิดทั้งสองช่อง · `Tutoring:PublicBaseUrl` มาจาก `TutoringOptions` (P13-01 §8) และ **`Tutoring:JoinWindowMinutes` ประกาศโดย P13-05 §9** (P13-11 อ่านเท่านั้น ไม่ประกาศ/validate ซ้ำ) — ข้อความบอกผู้เรียนว่า "เปิดห้องก่อนเริ่ม {JoinWindowMinutes} นาที"
**appsettings placeholder (รอบ 2 ข้อ 21):** ใส่ใน `appsettings.json` ของ **ทั้ง `Siri.Api` และ `Siri.Workers`** (options ถูกลงทะเบียน+`ValidateOnStart()` ทั้งสอง host; job รันที่ Workers เท่านั้น; ไม่มี secret) — **ไม่ใส่ array** (กันปัญหา binder ต่อท้าย array ที่มีค่าเริ่มต้น; ใช้ default ใน C# + `GetEffective*`):
```json
"Tutoring": { "Reminders": { "Enabled": true, "LongEnabled": true, "ShortEnabled": true, "BatchSize": 50, "MaxPerRun": 500 } }
```
(array defaults ใน C# เว้นว่างแล้วใช้ `GetEffectiveLeadHours()/GetEffectiveLeadMinutes()` — ตามบทเรียน `LiveOptions` ที่ configuration binder *ต่อท้าย* array ที่มีค่าเริ่มต้นอยู่)

---

## 4. Job `tutoring-reminders` — ตรรกะ

`RecurringJobIds.TutoringReminders = "tutoring-reminders"` (เพิ่มใน `All`) · `Cron.Minutely()` · เฉพาะ `Siri.Workers` · `[DisableConcurrentExecution(timeoutInSeconds: 55)]` · เพดาน 45 วิ/รอบ · `TutoringReminderJob` → `TutoringReminderService.RunAsync`

### 4.1 `TutoringReminderPolicy.Due(...)` — **pure function** (ไม่มี I/O/clock ของตัวเอง; unit test ที่ขอบเวลา)
```
Due(state: {SentLong?, SentShort?}, startsAtUtc, confirmedAtUtc, nowUtc, timings: {Long?, Short?}) → None | Long | Short
  remaining = startsAtUtc − nowUtc ; remaining ≤ 0 → None
  Short: timings.Short ≠ null ∧ SentShort = null ∧ remaining ≤ Short ∧ confirmedAtUtc ≤ startsAtUtc − Short   → Short
  Long : timings.Long  ≠ null ∧ SentLong  = null ∧ remaining ≤ Long ∧ remaining > (Short ?? 0)
                              ∧ confirmedAtUtc ≤ startsAtUtc − Long                                         → Long
  (Short ตรวจก่อน: ถ้าเข้าทั้งสองช่อง ส่งเฉพาะ Short — ช่องยาวหมดความหมายเมื่อเหลือ ≤ Short)
```
- **ข้ามถ้าจองใกล้กว่าหน้าต่าง** (`confirmedAtUtc > startsAt − lead`): อีเมลยืนยันการจอง (P13-06) คือการแจ้งแล้ว — *ไม่ประทับ flag* (ไม่ "โกหก" ว่าส่ง; query ถูกจำกัดด้วย index+ช่วงเวลาอยู่แล้ว)
- **job ล่ม/หยุดทั้งช่วง:** ช่องที่หมดช่วง (`remaining ≤ 0` หรือ Long เมื่อ `remaining ≤ Short`) ถูกข้ามเงียบ ไม่ส่งช้าเกินไป (พฤติกรรมเดียวกับ Live H1) · ช่วงที่ job กลับมาทัน (เช่นล่ม 20 นาทีตอน lead 24h) จะส่งทีเดียวในรอบแรกที่กลับมา · มี metric `tutoring.reminders.skipped{reason="window_missed"}` (§6)
- `confirmedAtUtc` ผู้เรียน = `COALESCE(b.CONFIRMED_AT_UTC, b.CreatedAtUtc)`; ติวเตอร์ = **เวลายืนยันของ booking `Confirmed` แรกสุดของ session** (`MIN` ใน query)

### 4.2 ขั้นต่อรอบ
1. **ผู้เรียน:** เลือก booking `Confirmed` ที่ session `Scheduled`, `STARTS_AT_UTC ∈ (now, now + max(Long, Short)]` และ flag ช่องใดช่องหนึ่งยัง null (หา session ในช่วงด้วย `IX_TUTOR_SESSIONS_ACTIVE_STARTS` ของ P13-05 แล้ว join booking ด้วย `IX_TUTOR_BOOKINGS_REMINDER_DUE`; เรียง `STARTS_AT_UTC` ใกล้สุดก่อน; `MaxPerRun`) → `Due(...)` ในหน่วยความจำ → เฉพาะที่ได้ `Long|Short`
2. **ติวเตอร์:** เลือก session `Scheduled` ช่วงเดียวกันที่ `TUTOR_REMINDER_*` ช่องใดช่องหนึ่ง null และมี booking `Confirmed` ≥1 **และ `tp.STATUS = Verified`** (ติวเตอร์ที่ถูกระงับเข้าห้องไม่ได้ตาม P13-10 §4.2 ข้อ 1 — ไม่ส่งอีเมล "กดเริ่มคลาส" ที่ทำตามไม่ได้; ผู้เรียนยังได้เตือนจนกว่า sweep ของ P13-08 ยกเลิกคลาส; ไม่ประทับ flag) → `Due(...)` ด้วย flag ของ session (`IX_TUTOR_SESSIONS_TUTOR_REMINDER_DUE` ครอบการเลือกชุดนี้)
3. **ผู้รับ/ข้อมูลประกอบ (batch ครั้งเดียวต่อ chunk — ห้าม N+1):** `IUserContactReader.GetUsersContactInfoAsync(userIds)` · ชื่อติวเตอร์สาธารณะ + ชื่อวิชา/ระดับ จาก query เดียวกัน (projection) · `LEARNER_PROFILES.NICKNAME`/`GRADE_LEVEL` ผ่าน join ใน query
4. **ต่อหน่วย (booking หรือ session):** สร้างข้อความ (§5) → `IEmailOutbox.Enqueue(to, subject, body, templateKey)` (ถ้ามีอีเมลที่ใช้ได้) + `IUserNotificationOutbox.Stage(...)` (เสมอ) → `MarkReminderSent(slot)` **ทั้งหมดอยู่ใน `SaveChanges` เดียวต่อ chunk `BatchSize`** — outbox + แจ้งเตือน + flag อะตอมมิก ⇒ รันซ้ำ/ซ้อนกันไม่ส่งซ้ำ
   - ไม่มีอีเมลที่ใช้ได้ (หรือ `IsDeliverableEmail` ไม่ผ่าน): ส่ง **in-app อย่างเดียว** + ประทับ flag + นับ `skipped{reason="no_email"}` (ไม่ log ที่อยู่)
   - ผู้รับ id ไม่พบใน Identity (ลบบัญชี): ประทับ flag + นับ `skipped{reason="no_contact"}` ไม่ throw
5. **ความล้มเหลว:** exception ใน chunk → `ChangeTracker.Clear()` + log (id/ประเภท exception — ไม่ใช่อีเมล) + ไปต่อ chunk ถัดไป; `DbUpdateConcurrencyException` (เช่นชนกับ join/ผู้ใช้ยกเลิกพร้อมกัน) → ทิ้ง chunk ทั้งก้อน (outbox rollback พร้อม flag) แล้วลองใหม่รอบถัดไป — ช่วงเตือนกว้างกว่ารอบหลายเท่า (ช่อง 15 นาที ≥ 15 รอบ)
6. **นับพลาดช่วง (observability เท่านั้น):** booking `Confirmed` ที่ `STARTS_AT_UTC ∈ (now − 60s, now]` ซึ่ง flag ช่องที่ "ควรได้" ยัง null และ `confirmedAt ≤ start − lead` ⇒ `skipped{reason="window_missed", slot}` + log Warning (id) — ไม่ประทับ flag

### 4.3 ความถูกต้องที่ต้องเทสต์ได้
- รัน job 3 ครั้งติดต่อกัน (เวลาเดียวกัน) ⇒ outbox/in-app เท่าเดิม · สอง instance พร้อมกัน ⇒ ชน `ROW_VERSION` หนึ่งตัวแพ้ ไม่ส่งซ้ำ
- booking ยกเลิกระหว่างรอบ ⇒ ไม่ส่ง (query กรอง `Confirmed` + ตรวจ concurrency)
- session ถูกยกเลิก/ปิดผลแล้ว ⇒ ไม่เตือน (กรอง `Scheduled`)
- group: ติวเตอร์ได้ **1 ฉบับต่อช่องต่อ session** (ไม่ใช่ต่อผู้เรียน) · ผู้เรียนแต่ละคนได้ของตัวเอง

---

## 5. ข้อความ (`TutoringReminderMessages` — static pure; แพทเทิร์น `LiveEmailTemplates`; ใช้ `TutoringSessionMessages` ร่วมกับ P13-10 สำหรับ helper `Encode/Subject/Page`)

กฎ: **อีเมล = ไทยก่อน + อังกฤษต่อท้ายในฉบับเดียว** (H6) · in-app = ไทยอย่างเดียว · ทุก string จาก DB (ชื่อวิชา, ชื่อติวเตอร์, nickname) ผ่าน `MeetingLinkText.ScrubRequired` + `WebUtility.HtmlEncode` · subject single-line ≤80 (ตัด control/CRLF) · **ลิงก์เดียวคือ `{Tutoring:PublicBaseUrl}/tutoring/sessions/{id:D}/join`** (สร้างด้วย `TutoringLinks.JoinUrl(options, id)` ของ P13-10) — ห้ามมี meetUrl/ลิงก์ห้องใด ๆ · เวลาแสดงเป็นเวลาไทย (pure helper `TutoringDateText.Thai(DateTime utc)`/`English(DateTime utc)` ใน `Tutoring.Application` — **P13-11 WP-B เป็นผู้สร้างและเป็นเจ้าของ** ไม่ใช่สำเนา `ThaiDateText` ของ Live; **ห้าม reference `Live.Application`**) และ EN (`Asia/Bangkok`) · **ไม่มี ICS** · ไม่มีอีเมล/เบอร์ผู้ปกครอง/ชื่อบัญชีผู้ปกครองในข้อความถึงติวเตอร์

| ผู้รับ | ช่อง | templateKey | in-app `type` | Subject (TH / EN) | เนื้อหา (สาระที่ต้องมี — สตริงสุดท้ายให้ implementer เขียนตามนี้) |
|---|---|---|---|---|---|
| ผู้เรียน | ยาว | `tutoring-reminder-learner-24h` | `tutoring.reminder_24h` | `เตือนคลาสติว: {วิชา} — {วัน-เวลาสั้น} / Class reminder` | คลาส "{วิชา}" กับครู {ชื่อติวเตอร์} สำหรับ {nickname} เริ่ม {เวลาไทย} ({เวลา EN}) · ปุ่ม "เข้าห้องเรียน" → join URL · "เปิดห้องได้ก่อนเริ่ม {JoinWindowMinutes} นาที" · **"กรุณากดเข้าห้องผ่านปุ่มนี้เท่านั้น เพื่อให้ระบบบันทึกการเข้าเรียน"** · "ลิงก์ใช้ได้เฉพาะบัญชีของคุณ โปรดอย่าส่งต่อ" · ยกเลิกได้ตามนโยบาย (ลิงก์ `/my-tutoring`) |
| ผู้เรียน | สั้น | `tutoring-reminder-learner-15m` | `tutoring.reminder_15m` | `อีก {n} นาทีเริ่มคลาส: {วิชา} / Class starts in {n} minutes` | เหมือนข้างบน ย่อ + "อีกประมาณ {n} นาที" (คำนวณตอนส่งจาก `remaining`) |
| ติวเตอร์ | ยาว | `tutoring-reminder-tutor-24h` | `tutoring.reminder_24h` | `เตือนคลาสสอน: {วิชา} — {วัน-เวลาสั้น} / Teaching reminder` | คลาส "{วิชา}" เริ่ม {เวลา} · ผู้เรียน: {nickname (ระดับชั้น)} ×1–6 · ปุ่ม "เข้าห้อง/เริ่มคลาส" → join URL · **"กดเริ่มคลาสจากปุ่มนี้ (ไม่ใช่จากปฏิทิน Google) เพื่อให้ระบบบันทึกว่าคุณเข้าสอน — ไม่เช่นนั้นอาจถูกบันทึกว่าไม่มา"** · ตรวจห้อง Meet/ลิงก์ในหน้าจัดการคลาส (`/instructor/tutoring/classes/{id}`) |
| ติวเตอร์ | สั้น | `tutoring-reminder-tutor-15m` | `tutoring.reminder_15m` | `อีก {n} นาทีเริ่มสอน: {วิชา} / Class starts in {n} minutes` | เหมือนข้างบน ย่อ + ย้ำ "กดเริ่มคลาส" |
in-app `Title` ≤200 / `Body` ≤2000 ไทยสั้น เช่น "เตือนคลาสติว" / `คลาส "{วิชา}" เริ่ม {เวลา} กดเข้าห้องผ่านแพลตฟอร์มเท่านั้น` · `linkUrl` = `/tutoring/sessions/{id:D}/join` (path แอป — ทั้งสอง role; หน้า join เดียวกันรองรับทั้งสอง) · `type` ใช้ชื่อ `_24h`/`_15m` ตามชื่อ flag (เป็น "ชื่อช่อง" ไม่ใช่ตัวเลขจริง ถ้า config เปลี่ยน — ข้อความใช้เวลาจริงเสมอ ไม่ฮาร์ดโค้ด "24 ชั่วโมง")

---

## 6. Observability
`TutoringTelemetry` (Meter `Siri.Tutoring`, สร้างโดย P13-10): `tutoring.reminders.sent{slot,role}` · `tutoring.reminders.skipped{reason ∈ no_email|no_contact|window_missed, slot}` · `tutoring.reminders.run_duration_ms` (histogram) · log ต่อรอบ: จำนวนส่ง/ข้าม/chunk ล้ม (ไม่มีที่อยู่) · cardinality ต่ำ (tag ปิดชุด)

## 7. Security / PDPA
- ผู้รับเป็นเจ้าของ booking (ผู้ปกครองสำหรับเด็ก) และติวเตอร์เจ้าของ session เท่านั้น — query ผูกกับ `b.LEARNER_USER_ID`/`tp.USER_ID` ของแถวที่ดึง ไม่รับ id จากภายนอก (job ไม่มี HTTP surface)
- ติวเตอร์เห็นเฉพาะ nickname + ระดับชั้น (เหมือน P13-10 §11); ผู้เรียนใน group ไม่เห็นกันในข้อความ
- ไม่ log: อีเมล, nickname, ชื่อวิชา (เฉพาะ id), เนื้อข้อความ · ไม่มี secret/URL ห้อง
- XSS: `HtmlEncode` ทุกค่าจาก DB + subject ตัด CR/LF · in-app เป็น plain text (FE render เป็น text ไม่ใช่ HTML)

## 8. Test checklist
**Unit:** `TutoringReminderPolicy` — ขอบ `remaining == lead` (รวม), `lead+1tick` (ไม่), `== Short` (Short ไม่ใช่ Long), `0`, จองหลังจุดเริ่มช่อง (None), เข้าทั้งสองช่อง (Short เท่านั้น), ช่องปิด (`LongEnabled=false`), flag ส่งแล้ว, `confirmedAt` = `startsAt − lead` พอดี (ผ่าน) vs +1tick (ข้าม) · `TutoringReminderOptions` validator (>1 ค่า/นอกช่วง/`Short ≥ Long`) + `GetEffective*` เมื่อไม่ตั้งค่า · `TutoringReminderMessages`: ไทย+อังกฤษครบ, ตัวเลข `{n}` ตามจริง, **ไม่มี meeting host/`meet.google.com`/ICS**, `<script>`/`"><img onerror>` ถูก encode, subject ไม่มี CR/LF, ลิงก์เดียวคือ join URL, ติวเตอร์ไม่เห็นอีเมล/ชื่อผู้ปกครอง
**Integration (Testcontainers PostgreSQL+Redis, `FakeClock`):** รัน 3 ครั้ง ⇒ ไม่ซ้ำ · สอง scope ซ้อนกัน ⇒ ชนแล้วไม่ซ้ำ · `DbUpdateConcurrencyException` ⇒ outbox rollback พร้อม flag (ไม่มีแถวค้างครึ่ง ๆ) · ไม่มีอีเมล ⇒ in-app + flag · group 3 คน ⇒ ติวเตอร์ 1 ฉบับ ผู้เรียน 3 ฉบับ · จองใน 10 นาทีก่อนเริ่ม ⇒ ไม่มีเตือน 15m · job ล่ม 5 นาทีกลางช่อง 15m แล้วกลับ ⇒ ส่งครั้งเดียว · ล่มพ้นช่อง ⇒ ข้าม + นับ `window_missed` · `RecurringJobIds.All` ตรงกับที่ลงทะเบียน · EXPLAIN/ตรวจว่าใช้ partial index (ไม่ seq-scan ตาราง booking ทั้งก้อน — ระบุใน migration ตาม database.md)

## 9. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | 2 คอลัมน์บน `TUTOR_SESSIONS` + 2 partial index + entity methods (`MarkReminderSent`, `MarkTutorReminderSent`, `ResetReminders`) + migration `AddTutoringReminderColumns` (อ่านทั้งไฟล์, ไม่ apply) + `docs/DATABASE.md` | build 0 warning; identifier ≤63; migration ไม่แตะคอลัมน์ของ P13-05 |
| B | `backend-developer` | `TutoringReminderPolicy` + options/validator + `TutoringDateText` + `TutoringReminderMessages` + appsettings `Tutoring:Reminders` (Api+Workers) | unit §8 ส่วน policy/options/messages |
| C | `backend-developer` | `TutoringReminderService` + job + registration (`RecurringJobIds.All`) + counter telemetry (เพิ่มใน `TutoringTelemetry` ของ P13-10) | integration §8 |
ไม่มี WP ฝั่ง P13-06 (รอบ 2 ข้อ 16: `Confirm` ของ P13-05 ตั้ง `CONFIRMED_AT_UTC` แล้ว) · **ลำดับ:** P13-11 WP-B/C เริ่มหลัง **P13-10 WP-B merge** (P13-10 สร้าง `TutoringLinks`/`TutoringTelemetry`/`TutoringSessionMessages` ให้ — P13-10 §9; ไม่สร้าง helper ซ้ำในไฟล์นี้) · WP-A ทำขนานได้ · `DONE` ตั้งโดย integrator-qa · ห้าม commit/apply migration เอง

## 10. Open decisions (defaulted)
| # | เรื่อง | ค่าที่ตั้ง |
|---|---|---|
| D1 | หลาย lead ต่อช่อง | ไม่รองรับ (≤1 ค่าต่อช่อง) |
| D2 | แนบ ICS ในเตือน | ไม่แนบ (ICS มาจาก Live ตอนจอง; ลดความเสี่ยงซ้ำ/รั่วลิงก์) |
| D3 | เตือน "จองใกล้กว่าหน้าต่าง" | ข้าม ไม่ประทับ flag |
| D4 | ภาษา | อีเมลไทย+อังกฤษซ้อน; in-app ไทย |
| D5 | ติวเตอร์ที่ถูก Suspended | ฝั่งติวเตอร์ **ไม่ส่งเตือน** (กรอง `tp.STATUS = Verified` — เข้าห้องไม่ได้อยู่แล้ว P13-10 §4.2 ข้อ 1); ฝั่งผู้เรียนเตือนตามปกติจนกว่า sweep ของ P13-08 ยกเลิกคลาส+คืนเงิน |
| D6 | ช่องทางอื่น (LINE/Push) | ไม่ทำ (Q14.6) |
**ความเสี่ยงที่เหลือ:** (1) outbox 100 ฉบับ/นาที ใช้ร่วมกับ Live — เตือนคลาสพร้อมกันจำนวนมากอาจช้าเกิน 15 นาทีที่ scale ใหญ่ (v1 ต่ำกว่ามาก; ปรับ `BatchSize` ของ outbox เป็นงานแยก) (2) อีเมลเข้ากล่องผู้ใช้ช้ากว่านาฬิกา job ≤2 นาที (3) `Email:Provider=Log` ใน production = ไม่มีอีเมลถึงใคร (ต้องตั้ง SMTP จริงก่อน launch — ข้อกำหนดเดียวกับ P11-04 §8)

## Appendix — Frontend (ไม่มี HTTP endpoint ใน P13-11)
FE เห็นผลผ่านระฆังแจ้งเตือน (`NOTIFY.USER_NOTIFICATIONS` เดิม): `type`/`linkUrl` ที่ต้อง map ไอคอน+ข้อความ (i18n `notifications.types.*`, th+en):
| `type` | ผู้รับ | `linkUrl` | ไอคอน/สี (token `tone-*` เท่านั้น) |
|---|---|---|---|
| `tutoring.reminder_24h` | ผู้เรียน, ติวเตอร์ | `/tutoring/sessions/{id}/join` | ปฏิทิน (info) |
| `tutoring.reminder_15m` | ผู้เรียน, ติวเตอร์ | `/tutoring/sessions/{id}/join` | นาฬิกา (warning) — แสดงปุ่ม "เข้าห้อง" ในแถวแจ้งเตือน |
ข้อความ `title/body` มาจาก server (ไทย) แสดงเป็น text; ห้าม render เป็น HTML

## Changelog
### 2026-10-14 รอบ 2 (cross-contract review) — แก้ในไฟล์เดิม ยัง FROZEN
- **ข้อ 16:** §2 ลบเงื่อนไข "เพิ่มถ้า P13-05 ยังไม่สร้าง" — `TUTOR_BOOKINGS.REMINDER_24H/15M_SENT_AT_UTC` และ `CONFIRMED_AT_UTC` เป็นของ P13-05 (สร้างแล้ว; `Confirm`/`CreateFromPackage`/trial ตั้ง `CONFIRMED_AT_UTC` ให้) ⇒ migration `AddTutoringReminderColumns` เหลือเฉพาะ `TUTOR_SESSIONS.TUTOR_REMINDER_24H_SENT_AT_UTC` / `TUTOR_REMINDER_15M_SENT_AT_UTC` + `IX_TUTOR_BOOKINGS_REMINDER_DUE` + `IX_TUTOR_SESSIONS_TUTOR_REMINDER_DUE` · **ลบ WP-D** (ไม่ต้องขอให้ P13-06 ตั้ง `CONFIRMED_AT_UTC`)
- **ข้อ 18:** `Tutoring:JoinWindowMinutes` ประกาศโดย P13-05 §9 (ไม่ใช่ P13-01); index อ้างอิง `IX_TUTOR_SESSIONS_ACTIVE_STARTS` (P13-05) แทนชื่อที่ไม่มีอยู่จริง; ลบ hedge "ถ้าทำก่อนให้สร้าง helper ขั้นต่ำเอง" — helper กลางเป็นของ P13-10 WP-B, `TutoringDateText` เป็นของ P13-11 WP-B (ไม่ reference Live) · เตือนฝั่งติวเตอร์กรอง `tp.STATUS = Verified` (สอดคล้อง join gate P13-10)
- **ข้อ 21:** appsettings placeholder `Tutoring:Reminders` ใน Api **และ** Workers (§3)
