# Contract: P13-09 Live — ห้องประชุมอิสระ (ad-hoc room) + ICS + sync Google สำหรับ Tutoring

Status: FROZEN · วันที่: 2026-10-14 · Module: **`Siri.Modules.Live` (Repository+Service, UPPERCASE entity/DB — D-17) แบบ additive ล้วน** · ผู้บริโภค: `Siri.Modules.Tutoring` ผ่าน `Siri.Modules.Live.Contracts` เท่านั้น · ไม่มี HTTP endpoint ใหม่ใน Live

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..E)** — เหตุผล: refresh token ของติวเตอร์ + ลิงก์ห้องที่เป็น capability (เข้ารหัสที่ DB), `Contracts/` ข้ามโมดูลใหม่, อีเมล/ICS ถึงผู้เรียนจริง (ผู้เยาว์), ผูกกับสิทธิ์เข้าเรียน → ตรงเกณฑ์ที่ห้ามส่ง Antigravity · **ไม่ต้องผ่าน DESIGN_DATABASE** (2 ตาราง คัดลอกโครงจาก `SESSION_MEETINGS`/`SESSION_INVITES` ที่ live-verified แล้ว — §2 ระดับคอลัมน์/index/FK/ชื่อ constraint ครบ)

> **อ่านคู่กับ:** `docs/TUTORING.md` §0/§3.5/§4/§8/§10 · `docs/DECISIONS.md` D-25 + Q10 (ติวเตอร์เชื่อม Google ของตัวเอง) + Q11 (ICS เป็น baseline) · `docs/contracts/P11-03-live-module-google-meetings.md` · `P11-04-live-invites-ics-reminders.md` · `P11-05-live-learner-instructor-api-join-gate.md` · คู่กัน: **`P13-10`** (join gate/ attendance/ finalize/ materials — ผู้เรียก `GetJoinLinkAsync`) · **`P13-11`** (reminders) · P13-05/06 (session lifecycle + webhook — ผู้เรียก `CreateAsync/UpdateAsync/CancelAsync` ผ่าน `ISessionRoomSync` §9)

---

## 0. ข้อเท็จจริงจากโค้ดจริง (อ่าน method body ซ้ำ 2026-10-14 — ไม่เชื่อ doc comment/ผลสำรวจเดิมโดยไม่ตรวจ)

ผลสำรวจ 2026-10-14 ที่ได้รับมอบ **ถูกต้องทุกข้อ** ตามตารางนี้ + พบ 5 ข้อที่ผลสำรวจไม่ได้ระบุ (แถวที่มี ⚠)

| # | ข้อเท็จจริง | หลักฐาน (`src/Siri.Modules.Live` ถ้าไม่ระบุ) | ผลต่อ contract |
|---|---|---|---|
| F1 | sync job ผูกกับคอร์ส: อ่านบริบทผ่าน `ILiveScheduleReader.GetSessionContextsAsync` และ **ถ้าไม่พบ context → `MarkDeleted()`** | `Infrastructure/LiveMeetingSyncJob.cs:81`, `:197-201` | ห้ามเอาห้อง ad-hoc ใส่ `SESSION_MEETINGS` — job เดิมจะลบทิ้งเงียบ ๆ ⇒ **ตาราง + job ใหม่** |
| F2 | ผู้เข้าร่วม/ผู้รับเชิญมาจาก enrollment ของคอร์ส | `Application/SessionInviteService.cs:152-154` | ใช้ซ้ำไม่ได้ ⇒ Tutoring ส่งรายชื่อผู้เข้าร่วมเอง |
| F3 | ด่าน join เช็ค enrollment ของคอร์ส; `SESSION_JOIN_LOG.COURSE_ID` บังคับ (`Guid.Empty` → throw) | `Application/SessionJoinService.cs:58-60`; `Domain/SESSION_JOIN_LOG.cs:81-84` | ไม่แตะ — Tutoring มีด่าน join + `SESSION_JOIN_LOGS` ของตัวเอง (P13-10) |
| F4 | `LiveMeetingSink` ใช้ `IUserContext.UserId` เป็นเจ้าของห้อง | `Infrastructure/LiveMeetingSink.cs:87-90` | webhook Stripe ไม่มี user ⇒ **request ต้องส่ง `OrganizerUserId` เอง** |
| F5 | `INSTRUCTOR_GOOGLE_ACCOUNT` key ด้วย `INSTRUCTOR_USER_ID` (UQ); `InstructorGoogleAccountService` มี public: `GetActiveAccountAsync`/`GetAccountAsync`/`TryGetAccessTokenAsync`/`HandleCalendarUnauthorizedAsync` | `Domain/INSTRUCTOR_GOOGLE_ACCOUNT.cs:46`; `Application/InstructorGoogleAccountService.cs:392-409,502` | ใช้ซ้ำ **ตามที่เป็น** ไม่แก้ |
| F6 | connect/status/disconnect ของ Google เป็น `[Authorize(Policy = InstructorOnly)]`; `returnPath` ต้องเป็น `^/instructor/...` | `Siri.Api/Controllers/Live/LiveGoogleController.cs:27,53,147` | ติวเตอร์ (= Instructor) เชื่อม Google ด้วย **endpoint เดิม** ได้เลย; FE ส่ง `returnPath=/instructor/tutoring/...` |
| F7 ⚠ | **จุดบอด reset-on-reconnect:** หลังเชื่อมใหม่ มัน reset เฉพาะ `SESSION_MEETINGS` (`GetResettableByInstructorAsync`) และ `AffectedSessionCount`/อีเมล "เชื่อมใหม่" นับเฉพาะคาบคอร์สผ่าน `ILiveScheduleReader` | `InstructorGoogleAccountService.cs:356-362`, `:543-568` | ห้อง ad-hoc ที่ `AwaitingLink/NeedsReconnect` **จะไม่ถูก reset เอง** ⇒ job ใหม่ต้อง self-heal (§5.1 ขั้น 0 / §5.2) + FE ติวเตอร์ดูสถานะรายคลาส ไม่พึ่ง `affectedSessionCount` |
| F8 ⚠ | sink ของคอร์สตัดสิน `AwaitingLink` แบบ synchronous **โดยไม่ส่ง alert** (ผู้สอนคือคนกดสร้างเอง เห็นสถานะบนจอ) | `Infrastructure/LiveMeetingSink.cs:104-108` | Tutoring ต่างกัน: คนทำให้เกิดห้องคือ **ผู้เรียนที่จ่ายเงิน** ติวเตอร์ไม่รู้ ⇒ ต้องมี alert เอง (§5.3) |
| F9 | `ICalendarProvider` ใช้ปฏิทิน `primary` ของเจ้าของ token เสมอ + `sendUpdates=none` ทุก write + `guestsCan*=false` | `Siri.Integrations.Google/GoogleCalendarProvider.cs:24,61,165,188,355-357` | event ลงปฏิทิน **ติวเตอร์** ถูกต้องตาม Q10; ไม่แก้ |
| F10 | `IcsCalendarBuilder` เป็น `public static` ใน `Live.Application` รับ `IcsEvent(Guid SessionId,…)` generic | `Application/IcsCalendarBuilder.cs:49,80` | **คง ICS ไว้ใน Live** (เลือกทางเดียวที่ไม่ขยาย surface — §6.1) |
| F11 | Manual-link เดิมผูกคอร์ส: `SessionMeetingService.SetManualLinkAsync` → `GetOwnedSessionAsync` ผ่าน `ILiveScheduleReader` | `Application/SessionMeetingService.cs:74-93,229-245` | ต้องมี service ใหม่; **reuse `MeetingLinkValidator`** (Scoped, public) ได้ |
| F12 ⚠ | `SecurityAuditContract.RecordAuditAsync` เรียก **`SaveChangesAsync` ของ `AppDbContext` ที่ใช้ร่วมกัน** ⇒ flush งาน tracked ทั้งหมดของ caller | `Siri.Modules.Identity/Infrastructure/Contracts/SecurityAuditContract.cs:17-19` | **โค้ดของ Live ad-hoc ไม่เรียก audit contract เลย** (ทุกเมธอดของ provisioner เป็น stage-only — ถ้าเรียกจะ flush งานค้างของผู้เรียกกลางทาง) · Tutoring เรียก `RecordAuditAsync` เป็นขั้นสุดท้ายก่อน commit ภายใต้ `ITutoringUnitOfWork` (P13-06 F7 / P13-10 G4) |
| F13 ⚠ | architecture test บังคับแค่ห้าม reference `{other}.Domain`/`{other}.Infrastructure`; **ไม่ห้าม `{other}.Application`** | `tests/Siri.ArchitectureTests/LayeringTests.cs:115-123` | Tutoring ที่ใช้ `Live.Application.*` จะ build/test ผ่านแต่ผิดกฎ ⇒ เพิ่ม test เฉพาะกิจ (§8.3) |
| F14 ⚠ | `HangfireHostingTests` assert ว่า job ที่ลงทะเบียน == `RecurringJobIds.All` พอดี | `tests/Siri.UnitTests/Workers/HangfireHostingTests.cs:201` | เพิ่ม job ใหม่ต้องเพิ่ม id ใน `RecurringJobIds.All` ด้วย |
| F15 | DI cross-module ใช้ `AddScoped` ตรง ๆ ทับ default ของ Catalog; module Live ลงทะเบียนทั้ง Api และ Workers | `LiveModule.cs:99-107`; `Siri.Api/Program.cs:321`; `Siri.Workers/Program.cs:208` | ลงทะเบียน provisioner/job ใน `LiveModule` เดียว |

ไม่ขัดกับผลสำรวจข้อใด · ไม่มี endpoint/โครงสร้างใดในผลสำรวจที่ตรวจแล้วไม่จริง

---

## 1. Scope & task IDs

**ในขอบเขต (P13-09):**
- `Live.Contracts.ILiveRoomProvisioner` + records/enums (§3)
- ตาราง `LIVE.ADHOC_MEETINGS` + `LIVE.ADHOC_MEETING_PARTICIPANTS` + migration `AddLiveAdhocMeetings` (§2)
- `AdhocRoomService` (create/update/cancel/manual-link/resync/join-link/status), request validator, repository (§4)
- job `live-adhoc-sync` (Google sync + self-heal + alert + invites + optional attendee sync) (§5–§6)
- ICS แบบ **REQUEST/CANCEL** (ไม่ใช้ PUBLISH — ห้องหนึ่งคลาสต่อผู้รับ) ผ่าน EmailOutbox + อีเมลไทย+อังกฤษที่มีเฉพาะลิงก์ join ของแพลตฟอร์ม (§6)
- `LiveAdhocOptions` (`Live:AdHoc`) + validator + DI + `RecurringJobIds`/registration (§7)

**นอกขอบเขต (ห้ามทำ):** แก้ `LiveMeetingSyncJob`/`SessionInviteService`/`SessionJoinService`/`SESSION_JOIN_LOG`/`SESSION_MEETING`/`SESSION_INVITE`/`LiveMeetingSink`/`InstructorGoogleAccountService`/`InstructorAlertSender`/`LiveEmailTemplates`/`LiveOptions` · ด่าน join + attendance + เตือน (P13-10/11) · การสร้างห้องจาก payment (P13-06 เรียก `ISessionRoomSync` §9) · Meet REST/accessType · recording ของคลาสติว (ห้าม — TUTORING.md §7) · FE (ไม่มี HTTP surface — ดู Appendix)

---

## 2. Schema delta — migration `AddLiveAdhocMeetings` (additive ล้วน ไม่มี data migration)

> UPPERCASE ผ่าน `ApplyUppercaseNamingConventions` · property UPPER_SNAKE_CASE ยกเว้น `IAuditable` (`CreatedAtUtc/CreatedBy/UpdatedAtUtc/UpdatedBy`) ต้อง PascalCase · เวลา `timestamptz(3)` UTC (`HasPrecision(3)`; `Kind != Utc` → throw ที่ entity) · PK `UuidV7.NewId()` · enum เก็บ string (`HasConversion<string>()`) · concurrency = `ROW_VERSION bytea` (`ConcurrencyTokenInterceptor`) · **ไม่มี FK ข้าม schema/module** · **ไม่มี cascade delete** · ชื่อ constraint/index ตั้งเองทุกตัว (≤63 ไบต์ — `DatabaseIdentifierLengthTests`)

### 2.1 `LIVE.ADHOC_MEETINGS` (entity `ADHOC_MEETING : IAuditable`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `ADHOC_MEETING_ID` | uuid PK | no | UUIDv7 = `RoomId` ที่ส่งกลับผู้เรียก |
| `SOURCE_KEY` | varchar(20) | no | ค่าปิด: `tutoring` (ตอนนี้) — string constant `LiveRoomSources.Tutoring` |
| `SOURCE_REF_ID` | uuid | no | = `TUTOR_SESSIONS.SESSION_ID` (ไม่มี FK) · **ใช้เป็น ICS UID และ id ใน join URL** |
| `ORGANIZER_USER_ID` | uuid | no | user id ของติวเตอร์ = เจ้าของ `INSTRUCTOR_GOOGLE_ACCOUNT` · **immutable** |
| `TITLE` | varchar(200) | no | ผ่าน `MeetingUrlScrubber` + ตัด control char แล้ว (ตรงกับกฎ 1–200 ใน §4.1) |
| `DESCRIPTION` | varchar(2000) | yes | scrub เหมือน TITLE |
| `STARTS_AT_UTC` / `ENDS_AT_UTC` | timestamptz(3) | no | |
| `JOIN_URL` | varchar(500) | no | URL ของ **แพลตฟอร์ม** `{Tutoring:PublicBaseUrl}/tutoring/sessions/{SOURCE_REF_ID:D}/join` ที่ Tutoring ส่งมา — validate §4.1 (ไม่ใช่ URL ห้อง) · **immutable** · host ของมันคือ `uidHost` ของ ICS |
| `JOIN_OPENS_MINUTES_BEFORE` | int | no | 0–120; ใส่ในข้อความ ICS ("เข้าห้องผ่านแพลตฟอร์มก่อนเวลา N นาที") |
| `MANAGE_PATH` | varchar(200) | no | หน้าจัดการคลาสของติวเตอร์ (app-relative `^/instructor/[A-Za-z0-9/_\-]*$`) — ใช้ใน alert อีเมล/แจ้งเตือนในแอป |
| `SEND_CALENDAR_INVITES` | bool | no | default true |
| `SYNC_GOOGLE_ATTENDEES` | bool | no | default **false** (§6.4) |
| `CANCELLED_AT_UTC` | timestamptz(3) | yes | ตั้งโดย `Cancel`; **ล้างได้ทางเดียวคือ `Revive`** (= `CreateAsync` บนห้องที่ cancelled และยังไม่จบ — §4.1 ข้อ 2; รอบ 2 ข้อ 9) |
| `CANCEL_REASON` | varchar(300) | yes | scrub แล้ว |
| `PROVIDER` | varchar(20) | yes | `MeetingProvider` เดิม (`GoogleMeet`\|`Manual`\|`Logging`) · null = ยังไม่ตัดสิน |
| `INSTRUCTOR_GOOGLE_ACCOUNT_ID` | uuid | yes | FK → `LIVE.INSTRUCTOR_GOOGLE_ACCOUNTS` **NoAction** (`FK_ADHOC_MEETINGS_GOOGLE_ACCT`) |
| `PROVIDER_EVENT_ID` | varchar(200) | yes | Google event id |
| `MEET_URL_ENCRYPTED` | text | yes | `ISensitiveDataProtector.Encrypt(url)` — **อ่านผ่าน `AdhocRoomService.RevealUrl` ที่เดียว** (ห้าม log) |
| `SYNC_STATUS` | varchar(20) | no | `MeetingSyncStatus` เดิม (Pending/AwaitingLink/Synced/NeedsReconnect/Failed/PendingDelete/Deleted) |
| `ICS_SEQUENCE` | int | no | default 0 |
| `ATTEMPTS` | int | no | default 0 |
| `NEXT_RETRY_AT_UTC` / `LAST_SYNC_AT_UTC` | timestamptz(3) | yes | |
| `BLOCKED_AT_UTC` | timestamptz(3) | yes | เวลาที่เข้าสถานะ `AwaitingLink`/`NeedsReconnect`/`Failed` ครั้งล่าสุด (ล้างตอน `RequestResync`) — ใช้ตัดสิน self-heal §5.2 |
| `ERROR` | varchar(500) | yes | **code สั้นเท่านั้น** — ห้ามมี token/URL/อีเมล |
| `MEETING_ALERT_SENT_AT_UTC` | timestamptz(3) | yes | alert "ห้องติดขัด" ครั้งแรก (once) |
| `READINESS_ALERT_SENT_AT_UTC` | timestamptz(3) | yes | alert เร่งด่วน < `ReadinessAlertMinutes` (once) |
| `LAST_REQUEST_ID` | uuid | yes | idempotency ของ mutating call ล่าสุด (§4.6) |
| `ROW_VERSION` | bytea | no | |
| `CreatedAtUtc/CreatedBy/UpdatedAtUtc/UpdatedBy` | IAuditable | | PascalCase |

Index/ชื่อ: `PK_ADHOC_MEETINGS` · **UQ** `IX_ADHOC_MEETINGS_SOURCE_REF` (`SOURCE_KEY`,`SOURCE_REF_ID`) · `IX_ADHOC_MEETINGS_SYNC_DUE` (`SYNC_STATUS`,`NEXT_RETRY_AT_UTC`) `HasFilter("\"SYNC_STATUS\" IN ('Pending','PendingDelete')")` · `IX_ADHOC_MEETINGS_BLOCKED` (`ORGANIZER_USER_ID`) `HasFilter("\"SYNC_STATUS\" IN ('AwaitingLink','NeedsReconnect','Failed') AND \"CANCELLED_AT_UTC\" IS NULL")` · `IX_ADHOC_MEETINGS_UPCOMING` (`STARTS_AT_UTC`) `HasFilter("\"CANCELLED_AT_UTC\" IS NULL")` · `IX_ADHOC_MEETINGS_GOOGLE_ACCT_ID` (`INSTRUCTOR_GOOGLE_ACCOUNT_ID`)

### 2.2 `LIVE.ADHOC_MEETING_PARTICIPANTS` (entity `ADHOC_MEETING_PARTICIPANT : IAuditable`)

| Column / property | Type | Null | หมายเหตุ |
|---|---|---|---|
| `ADHOC_MEETING_PARTICIPANT_ID` | uuid PK | no | |
| `ADHOC_MEETING_ID` | uuid | no | FK → `ADHOC_MEETINGS` **NoAction** (`FK_ADHOC_PARTICIPANTS_MEETING`) |
| `USER_ID` | uuid | no | ไม่มี FK · อีเมลดึงจาก `IUserContactReader` ตอนส่ง — **ไม่เก็บอีเมลซ้ำ** |
| `ROLE` | varchar(16) | no | `LiveRoomRole`: `Organizer`\|`Participant` |
| `DISPLAY_NAME` | varchar(100) | no | ชื่อที่ใช้ใน `ATTENDEE;CN=` — Tutoring ส่ง **ชื่อเล่น/ชื่อสาธารณะ** (ไม่ใช่ชื่อจริงผู้ปกครองของเด็ก) |
| `STATUS` | varchar(16) | no | `InviteStatus` เดิม (Pending/Invited/Cancelled/Skipped) |
| `WITHDRAWN_AT_UTC` | timestamptz(3) | yes | null = ยังเป็นผู้เข้าร่วม; มีค่า = Tutoring ถอดออก (รอส่ง CANCEL) |
| `ICS_SEQUENCE_SENT` | int | yes | monotonic ต่อแถว (รวม CANCEL) |
| `INVITE_SENT_AT_UTC` / `CANCEL_SENT_AT_UTC` | timestamptz(3) | yes | |
| `GOOGLE_ATTENDEE_SYNCED_AT_UTC` | timestamptz(3) | yes | §6.4 |
| `ERROR` | varchar(60) | yes | `no_contact` |
| `ROW_VERSION` | bytea | no | |
| audit | | | PascalCase |

Index: `PK_ADHOC_PARTICIPANTS` · **UQ** `IX_ADHOC_PARTICIPANTS_MEETING_USER` (`ADHOC_MEETING_ID`,`USER_ID`) · `IX_ADHOC_PARTICIPANTS_USER_ID` (`USER_ID`) · ไม่ hard delete (หลักฐานว่าใครถูกเชิญ/ถอด)

### 2.3 Domain methods (ห้าม setter ภายนอก; entity ไม่รู้จัก EF/HTTP)

`ADHOC_MEETING` **คัดลอกโครงจาก `SESSION_MEETING` (ไม่ใช้ base class ร่วม — เพื่อไม่แตะ entity เดิม)**:

| method | ผล |
|---|---|
| `static Stage(IClock, in StageArgs)` | `Pending`, `PROVIDER=null`, `ICS_SEQUENCE=0`, `ATTEMPTS=0` · validate เวลา UTC/ลำดับ/ความยาว |
| `ApplyChange(title, description, startsAt, endsAt, requestId)` → `bool significant` | ถ้า title/description/เวลาต่างจากเดิม: `ICS_SEQUENCE++`; `PROVIDER==GoogleMeet && PROVIDER_EVENT_ID!=null` → `Pending`, `ATTEMPTS=0`, `NEXT_RETRY=null` · `PendingDelete`/`Deleted` ไม่ฟื้น |
| `MarkCancelled(reason, IClock)` | idempotent: ตั้ง `CANCELLED_AT_UTC`/`CANCEL_REASON`, `ICS_SEQUENCE++` (ครั้งเดียว), `PROVIDER_EVENT_ID is null ? Deleted : PendingDelete`, reset retry |
| `Revive(title, description, startsAt, endsAt, requestId, IClock)` | ได้เมื่อ `CANCELLED_AT_UTC != null` และ `ENDS_AT_UTC > now` (ไม่งั้น `InvalidOperationException` → service แปลง `Conflict live.room_cancelled`): ล้าง `CANCELLED_AT_UTC`/`CANCEL_REASON`/`ERROR`/`BLOCKED_AT_UTC`/`MEETING_ALERT_SENT_AT_UTC`/`READINESS_ALERT_SENT_AT_UTC` (ให้ alert ทำงานใหม่), ใช้ title/description/เวลาใหม่, `ICS_SEQUENCE++` · สถานะ: `PROVIDER_EVENT_ID != null` (cancel ยังลบ event ไม่เสร็จ → `PendingDelete`) ⇒ `Pending` (job patch event เดิม; 404/410 ⇒ สร้างใหม่ตามตาราง §5.4) · ไม่มี event แต่มี `MEET_URL_ENCRYPTED` (ลิงก์ Manual ที่รอดจาก cancel) ⇒ `Synced`, `PROVIDER` คงเดิม · ไม่มีทั้งคู่ ⇒ `Pending`, `PROVIDER=null`, `ATTEMPTS=0` (ตัดสิน provider ใหม่ §4.1 ข้อ 4) · `LAST_REQUEST_ID=requestId` |
| `SetManualLink(urlEncrypted)` | `PROVIDER=Manual`, URL, `ERROR=null`, reset retry, `PROVIDER_EVENT_ID is null ? Synced : PendingDelete` · ปฏิเสธเมื่อ cancelled |
| `RequestResync()` | ได้เมื่อ `Failed` หรือ (`NeedsReconnect`/`AwaitingLink` และไม่มี URL) → `Pending`, `PROVIDER=null`, reset retry, `BLOCKED_AT_UTC=null` · อื่น ๆ → `InvalidOperationException` (service แปลง 409) |
| `AssignProvider` · `ResolveAsAwaitingLink` · `RecordGoogleSynced` · `RecordNeedsReconnect` · `RecordAttemptFailed` (backoff 1/5/15/60 นาที, ครั้งที่ 5 → `Failed`) · `ClearProviderEvent` · `RecordError` · `FinishDelete` · `ResolveEndedSession` · `SettleWithExistingLink` · `MarkDeleted` · `MarkAlertSent` · `MarkReadinessAlertSent` | **semantics เดียวกับ `SESSION_MEETING` ทุกตัว** (`Domain/SESSION_MEETING.cs:188-457`) · ที่ต่าง: ทุกเมธอดที่ย้ายเข้า `AwaitingLink`/`NeedsReconnect`/`Failed` ตั้ง `BLOCKED_AT_UTC=now` · `FinishDelete` ใช้ `CANCELLED_AT_UTC is null` แทน "sessionStillScheduled" |
| `bool IsUsable` | `MEET_URL_ENCRYPTED != null && SYNC_STATUS != Deleted && CANCELLED_AT_UTC == null` (derived, `builder.Ignore`) |
| `bool CanRequestResync` | เหมือน `SESSION_MEETING` |

`ADHOC_MEETING_PARTICIPANT`: `static Create(meetingId, userId, role, displayName)` (Pending) · `MarkInvited(seq, clock)` · `MarkCancelled(seq, clock)` · `MarkSkipped(code)` · `Withdraw(clock)` · `Reinvite()` (Cancelled→Pending, ล้าง `WITHDRAWN_AT_UTC`/cancel/attendee stamps — ใช้เมื่อ Tutoring เพิ่มคนที่เคยถูกถอดกลับมา) · `RequeueInvite()` (Invited→Pending **คง** `ICS_SEQUENCE_SENT`/`INVITE_SENT_AT_UTC` — ใช้ตอนผู้จัดสลับ GoogleMeet→Manual เพื่อให้ได้ ICS REQUEST ใหม่ด้วย SEQUENCE สูงกว่าเดิม) · `UpdateDisplayName` · `NextSequence(meetingSeq) => Math.Max(meetingSeq, (ICS_SEQUENCE_SENT ?? -1) + 1)`

> **กันหลุดจากกัน:** unit test "parity table" ป้อน input ชุดเดียวกันให้ `SESSION_MEETING` และ `ADHOC_MEETING` แล้วเทียบสถานะผลลัพธ์ทุก transition (กัน drift ของสองก๊อปปี้)

---

## 3. Contract ข้ามโมดูล — `Siri.Modules.Live.Contracts` (ไฟล์ใหม่ `ILiveRoomProvisioner.cs`)

```csharp
namespace Siri.Modules.Live.Contracts;

public static class LiveRoomSources { public const string Tutoring = "tutoring"; }

public enum LiveRoomRole { Organizer, Participant }

/// <summary>DisplayName = ชื่อที่จะขึ้นในปฏิทิน (ติวเตอร์: ชื่อสาธารณะ; ผู้เรียน: ชื่อเล่น) — ไม่ใช่ที่อยู่อีเมล; อีเมลดึงโดย Live จาก Identity.</summary>
public sealed record LiveRoomParticipant(Guid UserId, string DisplayName, LiveRoomRole Role);

public sealed record LiveRoomOptions(bool SendCalendarInvites = true, bool SyncGoogleAttendees = false);

public sealed record LiveRoomCreateRequest(
    Guid RequestId,                 // idempotency + base ของ conference requestId ครั้งแรก
    string SourceKey,               // LiveRoomSources.Tutoring
    Guid SourceRefId,               // TUTOR_SESSIONS.SESSION_ID — natural key (UQ ร่วมกับ SourceKey)
    Guid OrganizerUserId,           // ติวเตอร์ (ต้องตรงกับ participant ที่ Role=Organizer)
    string Title, string? Description,
    DateTime StartsAtUtc, DateTime EndsAtUtc,           // Kind=Utc
    string JoinUrl,                 // URL ของแพลตฟอร์ม — ห้ามเป็นลิงก์ห้องประชุมจริง (§4.1)
    int JoinOpensMinutesBefore,     // 0–120
    string OrganizerManagePath,     // "/instructor/tutoring/classes/{id}"
    IReadOnlyList<LiveRoomParticipant> Participants,    // 1..MaxParticipants, มี Organizer พอดี 1
    LiveRoomOptions? Options = null);

/// <summary>ส่ง "สถานะที่ต้องการทั้งหมด" ทุกครั้ง (converge) — Live เป็นคน diff · OrganizerUserId/JoinUrl/SourceRefId เปลี่ยนไม่ได้.</summary>
public sealed record LiveRoomUpdateRequest(
    Guid RequestId, Guid RoomId,
    string Title, string? Description, DateTime StartsAtUtc, DateTime EndsAtUtc,
    IReadOnlyList<LiveRoomParticipant> Participants);

public sealed record LiveRoomCancelRequest(Guid RequestId, Guid RoomId, string? ReasonText);

public sealed record LiveRoomManualLinkRequest(Guid RoomId, Guid OrganizerUserId, string? MeetUrl);

public enum LiveRoomState { Pending, AwaitingLink, Ready, NeedsReconnect, Failed, Cancelled }
public enum LiveRoomNeedsAction { None, Waiting, PasteLink, ReconnectGoogle, Retry }
public enum LiveRoomProvider { GoogleMeet, Manual, Logging }

public sealed record LiveRoomRef(Guid RoomId, Guid SourceRefId, bool AlreadyExisted, bool Revived = false);   // Revived=true เมื่อ CreateAsync ปลุกห้องที่ cancelled ขึ้นมาใหม่ (RoomId เดิม)

/// <summary>ไม่มี URL ห้อง · ErrorCode เป็น code สั้นที่ปลอดภัย (conference_pending, google_rate_limited, ...).</summary>
public sealed record LiveRoomStatus(
    Guid RoomId, string SourceKey, Guid SourceRefId,
    LiveRoomState State, LiveRoomNeedsAction NeedsAction, LiveRoomProvider? Provider,
    bool HasMeetingLink, bool IsUsable,
    DateTime StartsAtUtc, DateTime EndsAtUtc, int IcsSequence, DateTime? LastSyncAtUtc, string? ErrorCode);

/// <summary>มี URL ห้องจริง = capability: ห้าม log/persist/cache/ใส่ใน error; ส่งออกได้ทาง response ที่ no-store ของด่าน join เท่านั้น.</summary>
public sealed record LiveRoomJoinLink(Guid RoomId, string MeetUrl, DateTime StartsAtUtc, DateTime EndsAtUtc);

public static class LiveRoomReasons
{
    public const string NotFound = "live.room_not_found";            // not_found — รวม "ไม่ใช่ผู้เข้าร่วม"
    public const string Cancelled = "live.room_cancelled";           // conflict
    public const string NotEditable = "live.room_not_editable";      // conflict — จบแล้ว/ยกเลิกแล้ว
    public const string MeetingNotReady = "live.meeting_not_ready";  // unavailable (503) — ext needsAction
    public const string AdhocDisabled = "live.adhoc_disabled";       // unavailable
    public const string InvalidRequest = "live.room_invalid_request";// validation
    public const string NotResyncable = "live.meeting_not_resyncable"; // conflict (ของเดิม)
    // ลิงก์ที่วางเอง: live.meeting_link_invalid / live.meeting_link_host_not_allowed (ของเดิมจาก MeetingLinkValidator)
}

public interface ILiveRoomProvisioner
{
    /// <summary>STAGE ONLY — ไม่เรียก SaveChanges; ผู้เรียก (Tutoring) เป็นเจ้าของ transaction เดียวกับการยืนยัน booking.
    /// Idempotent ตาม (SourceKey, SourceRefId): มีอยู่แล้วและไม่ถูกยกเลิก → คืน ref เดิม (AlreadyExisted=true) ไม่ว่า payload ต่างหรือไม่;
    /// ถูกยกเลิกแล้วแต่ยังไม่จบ (EndsAtUtc > now) → REVIVE ห้องเดิมด้วย payload ใหม่ (RoomId เดิม, AlreadyExisted=true, Revived=true — session ถูก Revive/Reopen ที่ฝั่ง Tutoring);
    /// ถูกยกเลิกและจบแล้ว → Conflict live.room_cancelled. ตัดสิน provider แบบ no-network ทันที (MeetingProviderDecision.ForNewRoom).</summary>
    Task<Result<LiveRoomRef>> CreateAsync(LiveRoomCreateRequest request, CancellationToken cancellationToken);

    /// <summary>STAGE ONLY. Converge ไปยังสถานะที่ส่งมา (เวลา/ชื่อ/รายชื่อ). ไม่มีอะไรเปลี่ยน → Success โดยไม่ bump SEQUENCE.</summary>
    Task<Result<LiveRoomRef>> UpdateAsync(LiveRoomUpdateRequest request, CancellationToken cancellationToken);

    /// <summary>STAGE ONLY. Idempotent (ยกเลิกแล้ว → Success). จบแล้ว (EndsAtUtc ≤ now) → Conflict live.room_not_editable.</summary>
    Task<Result> CancelAsync(LiveRoomCancelRequest request, CancellationToken cancellationToken);

    /// <summary>STAGE ONLY. เฉพาะ OrganizerUserId ตรงเท่านั้น (ไม่ใช่ → NotFound รวม). ผ่าน MeetingLinkValidator + เข้ารหัสก่อนเก็บ.</summary>
    Task<Result<LiveRoomStatus>> SetManualLinkAsync(LiveRoomManualLinkRequest request, CancellationToken cancellationToken);

    /// <summary>STAGE ONLY. ติวเตอร์กด "ลองสร้างห้องใหม่" (Failed / NeedsReconnect / AwaitingLink ที่ไม่มี URL).</summary>
    Task<Result<LiveRoomStatus>> RequestResyncAsync(Guid roomId, Guid organizerUserId, CancellationToken cancellationToken);

    /// <summary>READ (เห็น row ที่ stage ใน unit-of-work เดียวกันด้วย). null = ไม่มีห้อง.</summary>
    Task<LiveRoomStatus?> GetStatusAsync(Guid roomId, CancellationToken cancellationToken);

    /// <summary>READ แบบ batch (ห้ามวน GetStatusAsync) — id ที่ไม่พบไม่อยู่ใน dictionary.</summary>
    Task<IReadOnlyDictionary<Guid, LiveRoomStatus>> GetStatusesAsync(IReadOnlyCollection<Guid> roomIds, CancellationToken cancellationToken);

    /// <summary>READ + ถอดรหัส. userId ต้องเป็น Organizer หรือ Participant ที่ไม่ใช่ Cancelled (ไม่ใช่ → LiveRoomReasons.NotFound ตัวเดียวกัน).
    /// Live ไม่ตัดสินหน้าต่างเวลา (นั่นคือ Tutoring.JoinWindowMinutes — P13-10); ไม่เขียน join log.</summary>
    Task<Result<LiveRoomJoinLink>> GetJoinLinkAsync(Guid roomId, Guid userId, CancellationToken cancellationToken);
}
```

`Siri.Modules.Live.Contracts` ไม่ reference อะไรนอกจาก `Siri.SharedKernel` (`Result`) — ไม่มี type จาก `Domain/Application` รั่วออกมา (enum ของ contract แมปจาก `MeetingProvider`/`MeetingSyncStatus` ใน `LiveRoomMapper`)

### 3.1 แมปสถานะ → `LiveRoomState` / `LiveRoomNeedsAction` (ตารางเดียว — unit test ทุกแถว)

| เงื่อนไข (ตามลำดับ) | `State` | `NeedsAction` |
|---|---|---|
| `CANCELLED_AT_UTC != null` | `Cancelled` | `None` |
| `IsUsable` (มี URL) และไม่ใช่ `Deleted` | `Ready` | `None` (ยกเว้น `PendingDelete`/`Pending` ที่มี URL เดิม → ยัง `Ready`) |
| `Pending` / `PendingDelete` (ไม่มี URL) | `Pending` | `Waiting` |
| `AwaitingLink` | `AwaitingLink` | `PasteLink` |
| `NeedsReconnect` | `NeedsReconnect` | `ReconnectGoogle` |
| `Failed` | `Failed` | `Retry` |
| `Synced` แต่ไม่มี URL | `AwaitingLink` | `PasteLink` |

---

## 4. พฤติกรรมของ `AdhocRoomService` (aggregate: ADHOC_MEETING) — ลำดับตรวจบังคับ

### 4.0 กฎร่วม
- ทุกเมธอด stage-only ใช้ `AppDbContext` scoped ตัวเดียวกับผู้เรียก (เหมือน `IEmailOutbox`/`ILiveMeetingSink`); repository ต้องมองเห็น row ที่ `Add` แล้วแต่ยังไม่ save (`context.AdhocMeetings().Local` ก่อน query — เหมือน `SessionMeetingRepository.GetBySessionIdAsync`)
- เวลา = `IClock` เท่านั้น · `DbUpdateConcurrencyException` โผล่ตอน Tutoring `SaveChanges` → Tutoring แปลง 409/retry (ไม่ใช่หน้าที่ Live)
- `Live:AdHoc:Enabled=false` → ทุก mutator คืน `Unavailable.WithReason(live.adhoc_disabled)`; reader ยังทำงาน

### 4.1 `CreateAsync`
1. validate (`AdhocRoomRequestValidator`, pure — ล้ม → `Validation.WithReason(live.room_invalid_request)`; ข้อความไม่มีค่าที่ผู้ใช้ส่งมาแบบดิบ):
   `RequestId`/`SourceRefId`/`OrganizerUserId` ≠ empty · `SourceKey ∈ {tutoring}` · เวลา `Kind=Utc`, `Starts < Ends`, ระยะ `[MinDurationMinutes, MaxDurationMinutes]`, `Ends > now`, `Starts ≤ now + MaxFutureDays` · `Title` 1–200 หลัง scrub (`MeetingUrlScrubber.ScrubRequired`, ตัด control) · `Description` ≤ 2000 (scrub) · `JoinOpensMinutesBefore` 0–120 · `OrganizerManagePath` regex `^/instructor/[A-Za-z0-9/_\-]*$` ≤200, ไม่มี `//`/`..`/`\` · Participants: 1..`MaxParticipants`, `UserId` ไม่ซ้ำ ≠ empty, **Organizer พอดี 1 และ `UserId == OrganizerUserId`**, `DisplayName` 1–100 หลัง trim/scrub
   **`JoinUrl`:** absolute `https` (http เฉพาะ loopback), ไม่มี userinfo/whitespace/control/backslash, ความยาว ≤500, **origin ∈ `AllowedJoinUrlOrigins`** (ว่าง = origin ของ `Live:PublicBaseUrl`), **host ไม่ตรง meeting host** (`MeetingLinkText.ContainsLink(JoinUrl, effectiveHosts)` = false), path ต้องมี `SourceRefId:D` (กัน URL ของ session อื่น)
2. idempotency: `GetBySourceAsync(SourceKey, SourceRefId)` → (ก) พบ & `CANCELLED_AT_UTC == null` → `LiveRoomRef(RoomId, SourceRefId, AlreadyExisted: true)` (ไม่แตะ row) · (ข) พบ & cancelled & `ENDS_AT_UTC > now` → **REVIVE** (`ADHOC_MEETING.Revive(...)` ด้วย payload ใหม่ที่ validate แล้ว; participants: คนที่ยังอยู่ในรายชื่อและเคย `Cancelled` ⇒ `Reinvite()`, คนที่เคย `Invited` แต่รายชื่อใหม่ไม่มี ⇒ `Withdraw`, คนใหม่ ⇒ `Create`; ไม่ใช่ organizer ใหม่ — `OrganizerUserId`/`JoinUrl` ต้องตรงของเดิมไม่งั้น `Validation live.room_invalid_request`) → `LiveRoomRef(RoomId เดิม, SourceRefId, AlreadyExisted: true, Revived: true)` · (ค) พบ & cancelled & จบแล้ว → `Conflict(live.room_cancelled)`
3. (สร้างใหม่) `ADHOC_MEETING.Stage(...)`; `LAST_REQUEST_ID = RequestId`; เพิ่ม participants ทุกคน (`Pending`) · (revive — ข้อ 2ข) ข้ามข้อนี้ ใช้ `Revive` + diff ตามข้อ 2
4. (สร้างใหม่ และ revive ที่ไม่เหลือทั้ง event และ URL) ตัดสิน provider **ใน transaction เดียว ไม่แตะเครือข่าย:** `account = mode==GoogleMeet ? googleAccounts.GetByInstructorUserIdAsync(OrganizerUserId) : null` → `MeetingProviderDecision.ForNewRoom(mode, account)` → `AwaitingLink`/`NeedsReconnect(reason)`/ปล่อย `Pending` (กฎเดียวกับ `LiveMeetingSink.DecideProviderAsync` — ใช้ static เดิมซ้ำ ไม่คัดลอกกฎ)
5. `repo.Add` (เฉพาะสร้างใหม่) → คืน `LiveRoomRef(RoomId, SourceRefId, AlreadyExisted: false)` (revive: `AlreadyExisted: true, Revived: true`) — **ไม่ส่งอีเมล/alert ที่นี่** (job ทำ — ผูกกับ commit ของผู้เรียก)

### 4.2 `UpdateAsync`
ห้องไม่พบ → `NotFound(live.room_not_found)` · `CANCELLED_AT_UTC != null` หรือ `ENDS_AT_UTC <= now` → `Conflict(live.room_not_editable)` · `RequestId == LAST_REQUEST_ID` → Success (no-op, ไม่ตรวจซ้ำ) · validate ชุดเดียวกับ Create (ยกเว้นฟิลด์ immutable; Organizer ใน list ต้องตรงของเดิม) · `significant = ApplyChange(...)` (title/description/เวลาต่างจากเดิม → `ICS_SEQUENCE++`) · **diff participants ตาม `UserId`:** เพิ่ม → `Create` (หรือ `Reinvite` ถ้ามีแถว Cancelled/withdrawn) · หาย → `Withdraw(clock)` (Organizer ห้ามหาย — validation) · `DisplayName` เปลี่ยน → อัปเดตฟิลด์ (ไม่ส่งอีเมล) · ไม่มีอะไรเปลี่ยน → ไม่แตะ `ICS_SEQUENCE`/status · ตั้ง `LAST_REQUEST_ID`

### 4.3 `CancelAsync`
ห้องไม่พบ → NotFound · `RequestId == LAST_REQUEST_ID` หรือ `CANCELLED_AT_UTC != null` → Success (idempotent) · `ENDS_AT_UTC <= now` → `Conflict(live.room_not_editable)` · `MarkCancelled(scrubbed reason, clock)` · ผู้เข้าร่วมที่ `Invited` จะได้ CANCEL จาก job §6 (ไม่ส่งตอนนี้) · **กติกาผู้เรียก (รอบ 2 ข้อ 9):** Tutoring เรียก `CancelAsync` **เฉพาะเมื่อ `session.STATUS = Cancelled`** — ห้ามยกเลิกเพราะ booking `Confirmed` หมด (กลุ่มที่ยังมี booking PendingPayment/Reopen ต้องรักษาห้องไว้ แล้วปรับรายชื่อด้วย `UpdateAsync`); session ที่ถูก `Revive` ภายหลัง (P13-05 §5.5) ⇒ `CreateAsync` ปลุกห้องเดิม (§4.1 ข้อ 2ข)

### 4.4 `SetManualLinkAsync` / `RequestResyncAsync`
ห้องไม่พบ **หรือ** `OrganizerUserId` ไม่ตรง → `NotFound` ตัวเดียวกัน (ไม่เปิดเผยการมีอยู่) · cancelled/จบแล้ว → `Conflict(live.room_not_editable)` · `MeetingLinkValidator.Validate(url)` → `protector.Encrypt` → `SetManualLink` · **ถ้า PROVIDER เดิมเป็น `GoogleMeet`:** `RequeueInvite()` แถว Organizer (event ใน Google ของติวเตอร์จะถูกลบ → ติวเตอร์ต้องได้ ICS REQUEST ใหม่ผ่าน §6.2 ด้วย SEQUENCE ≥ ที่ส่งไป +1) · log เฉพาะ `roomId`+host (ห้าม path/query) · Resync ผิดสถานะ → `Conflict(live.meeting_not_resyncable)` · คืน `LiveRoomStatus` (ไม่มี URL)

### 4.5 `GetJoinLinkAsync` (ลำดับ)
1. ห้องไม่พบ หรือ `userId` ไม่ใช่ Organizer/Participant (ที่ `STATUS != Cancelled` และ `WITHDRAWN_AT_UTC == null`) → `NotFound(LiveRoomReasons.NotFound)` **ตัวเดียวกันทุกไบต์** (static instance แบบ `LiveErrors.NotFound`)
2. `CANCELLED_AT_UTC != null` → `Conflict(live.room_cancelled)`
3. `!IsUsable` → `Unavailable(live.meeting_not_ready)` + `Extensions["needsAction"] = LiveRoomNeedsAction` (Tutoring ตัดสินว่าจะส่งต่อให้ role ไหน)
4. `RevealUrl` ล้ม (decrypt) → log Error(roomId, exception type) + `Unavailable` ตัวเดียวกับข้อ 3 (ห้าม 500)
5. คืน `LiveRoomJoinLink` — **ไม่ log URL, ไม่เขียน join log** (หน้าที่ P13-10)

### 4.6 ตาราง idempotency (`RequestId`)
| call | key | ซ้ำ → |
|---|---|---|
| Create | `(SourceKey, SourceRefId)` (+ `RequestId` เก็บไว้) | ref เดิม · ห้อง cancelled ที่ยังไม่จบ ⇒ revive (ซ้ำด้วย `RequestId` เดิม ⇒ no-op ไม่ bump SEQUENCE ซ้ำ) |
| Update / Cancel | `ROOM.LAST_REQUEST_ID == RequestId` | Success no-op |
| SetManualLink / Resync | สถานะ (ลิงก์เดียวกันซ้ำ = ตั้งซ้ำได้ ไม่ bump SEQUENCE) | Success |
Google conference `requestId` = `ADHOC_MEETING_ID:N` (คงที่; สร้างใหม่หลัง 404 ใช้ `{id:N}-{8 hex}` เหมือน `LiveMeetingSyncJob.NewRequestId`) · `PrivateSessionId` = `SourceRefId:N` (adopt event หลัง response หาย — `FindEventByPrivateSessionIdAsync`)

### 4.7 `IAdhocMeetingRepository` (Application; impl ใน Infrastructure — แพทเทิร์น `ISessionMeetingRepository`)
`GetByIdAsync(roomId)` (tracked; ดู `Local` ก่อน) · `GetBySourceAsync(sourceKey, sourceRefId)` (tracked; ดู `Local` ก่อน) · `GetByIdsAsync(roomIds)` (untracked + participants, batch) · `GetDueIdsAsync(now, take)` (ใช้ `IX_ADHOC_MEETINGS_SYNC_DUE`) · `GetBlockedForResetAsync(take)` และ `GetBlockedForAlertAsync(take)` (ใช้ `IX_ADHOC_MEETINGS_BLOCKED`) · `GetUnreadyUpcomingAsync(now, withinMinutes, take)` (ใช้ `IX_ADHOC_MEETINGS_UPCOMING`) · `GetForInviteReconcileAsync(now, take)` (ห้อง active ที่ยังไม่จบ **หรือ** cancelled ที่ยังมี participant `Invited`; tracked พร้อม participants; เรียง `STARTS_AT_UTC`) · `Add(room)` · `SaveChangesAsync` · `ClearTracking()` · **ห้าม N+1** — query ที่คืนหลายห้อง `Include` participants ครั้งเดียวหรือใช้ projection; query อ่านอย่างเดียวใส่ `AsNoTracking()`

---

## 5. Job `live-adhoc-sync` (Hangfire recurring ทุก 1 นาที, เฉพาะ `Siri.Workers`)

`LiveAdhocMeetingSyncJob.RunAsync` → `AdhocRoomSyncService` · `[DisableConcurrentExecution(timeoutInSeconds: 55)]` · เพดานเวลา 45 วิต่อรอบ (เหมือน `LiveMeetingSyncJob.MaxRunDuration`) · แต่ละห้อง try/catch + `SaveChanges` แยก + `ChangeTracker.Clear()` เมื่อ exception; `DbUpdateConcurrencyException` → ข้ามรอบหน้า · `OperationCanceledException` ผ่านออก · **ไม่ log token/URL/อีเมล** (เฉพาะ roomId/eventId/code)

### 5.1 ลำดับขั้นต่อรอบ (แต่ละขั้นมี try/catch ครอบ — ขั้นหนึ่งล้มไม่ทำให้ขั้นอื่นหยุด)
| ขั้น | ทำอะไร | เพดาน |
|---|---|---|
| 0 | **Self-heal reset** (§5.2) | `ResetBatchSize` 50 |
| 1 | **Google sync** ห้องที่ `Pending`/`PendingDelete` ถึงเวลา (`NEXT_RETRY_AT_UTC null/≤now`) — ตาราง §5.4 | `BatchSize` 50 |
| 2 | **Alert ห้องติดขัดครั้งแรก** (§5.3a) | 50 |
| 3 | **Alert เร่งด่วน < 30 นาที** (§5.3b) | 50 |
| 4 | **Invites/ICS** (§6.2) | `InviteBatchSize` 100 ห้อง / `MaxEmailsPerRun` 200 |
| 5 | **Google attendee sync** (§6.4, เฉพาะ `SYNC_GOOGLE_ATTENDEES`) | 20 ห้อง |

ลำดับนี้ทำให้ provider ถูกตัดสินก่อนส่ง ICS ให้ติวเตอร์ และ ICS ไปหาผู้เรียนใน run เดียวกับที่ห้องถูกยืนยัน

### 5.2 Self-heal (ทดแทนจุดบอด F7 โดยไม่แก้ `InstructorGoogleAccountService`)
เลือกห้อง `AwaitingLink|NeedsReconnect|Failed` ที่ **ไม่มี URL**, `CANCELLED_AT_UTC null`, `ENDS_AT_UTC > now` ผ่าน `IX_ADHOC_MEETINGS_BLOCKED` → จัดกลุ่มตาม `ORGANIZER_USER_ID` → `googleAccounts.GetActiveAccountAsync(userId)` ถ้า **`account != null && account.CONNECTED_AT_UTC > room.BLOCKED_AT_UTC`** (เชื่อม/เชื่อมใหม่ *หลังจาก* ห้องติดขัด) → `RequestResync()` · เงื่อนไขหลังบังคับว่า `Failed` ที่เกิดจากสาเหตุชั่วคราวกับบัญชีเดิม **ไม่ retry วนไม่รู้จบ** (ติวเตอร์กด Resync เองผ่าน `RequestResyncAsync`) · `Live:Provider=ManualOnly` → ข้ามทั้งขั้น

### 5.3 Alert (ผ่าน `IAdhocRoomAlertSender` ใหม่: อีเมล `IEmailOutbox` + in-app `IUserNotificationOutbox` ในชุดเดียว; อีเมลผู้รับจาก `IUserContactReader.GetEmailAsync`; ไม่มีอีเมล → in-app อย่างเดียว + log ไม่มีที่อยู่)
- **(a) ติดขัดครั้งแรก:** ห้องไม่ cancelled, ไม่มี URL, `SYNC_STATUS ∈ {AwaitingLink, NeedsReconnect, Failed}`, `MEETING_ALERT_SENT_AT_UTC null` → ส่ง 1 ครั้ง + stamp: `AwaitingLink` → "ยังไม่มีห้อง — เชื่อม Google หรือวางลิงก์" · `NeedsReconnect` → "เชื่อม Google ใหม่" · `Failed` → "สร้างห้องไม่สำเร็จ ลองใหม่/วางลิงก์" (ครอบคลุมเคสที่ตัดสินแบบ synchronous ตอน Create — F8)
- **(b) เร่งด่วน:** ห้องไม่ cancelled, `!IsUsable`, `STARTS_AT_UTC − now ≤ ReadinessAlertMinutes` (30) และ `ENDS_AT_UTC > now` (ยังไม่จบ), `READINESS_ALERT_SENT_AT_UTC null` → ส่ง 1 ครั้งข้อความเร่งด่วน "คลาสเริ่มในอีก N นาที แต่ยังไม่มีห้อง" + stamp · **ฝั่ง admin queue เป็นของ Tutoring** (Live ไม่รู้จัก admin): P13-10 มี `GET /api/tutoring/admin/sessions/attention` ที่อ่าน `GetStatusesAsync` (P13-10 §7.3)
- in-app `type`: `live.adhoc_needs_link` · `live.adhoc_needs_reconnect` · `live.adhoc_failed` · `live.adhoc_unready`; `linkUrl` = `MANAGE_PATH`; templateKey อีเมล: `live-adhoc-alert-needs-link` / `-reconnect` / `-failed` / `-unready`
- ลิงก์ในอีเมลสร้างจาก `Live:PublicBaseUrl + MANAGE_PATH` เท่านั้น — **ไม่มี meetUrl**

### 5.4 ตารางประมวลผลห้องที่ถึงเวลา (ลำดับสำคัญ — mirror `LiveMeetingSyncJob` §6.3 ของ P11-03, อ้าง `LiveMeetingSyncJob.cs:194-330`)
| เงื่อนไข | การกระทำ |
|---|---|
| `Pending`, `ENDS_AT_UTC ≤ now` | `ResolveEndedSession()` (มี URL → `Synced` ไม่มี → `Deleted`) |
| `PendingDelete` | มี event + มี account active → refresh → `DeleteEventAsync` (404/410 = สำเร็จ); ไม่มี account/`unauthorized` → `RecordError("orphan_event")` ข้ามการลบ; transient → `RecordAttemptFailed`; แล้ว `FinishDelete()` |
| `Pending`, `Live:Provider=Logging` | `AssignProvider(Logging)` → fake calendar → `RecordGoogleSynced(Logging)` (รับเฉพาะ URL รูป `https://meet.invalid/dev/…`) |
| `Pending`, ไม่มี account active หรือ `ManualOnly` | มี event เดิม → `RecordNeedsReconnect("google_account_unavailable")`; มี URL → `SettleWithExistingLink()`; `BrokenConnectionReason(account)` → `RecordNeedsReconnect(reason)`; ไม่งั้น `ResolveAsAwaitingLink()` |
| `Pending`, มี account active | `AssignProvider(GoogleMeet, accountId)` → `TryGetAccessTokenAsync(ORGANIZER_USER_ID)` · `google.unauthorized` → `RecordNeedsReconnect("invalid_grant")` (+ `HandleCalendarUnauthorizedAsync` ตามเดิม) · transient → `RecordAttemptFailed(code)` · สำเร็จ: ไม่มี event → (`ATTEMPTS>0` ⇒ `FindEventByPrivateSessionIdAsync` ก่อน; พบ ⇒ adopt/patch) ไม่งั้น `CreateEventWithMeetAsync`; มี event → `UpdateEventAsync` (404/410 ⇒ `ClearProviderEvent` + สร้างใหม่ใน run เดียว); `ConferencePending` ⇒ `GetEventAsync` ซ้ำ ≤3 ครั้ง ห่าง 1 วิ ไม่งั้น `RecordAttemptFailed("conference_pending")`; URL ที่ได้ **ต้องผ่าน `MeetingLinkValidator`** แล้ว `protector.Encrypt` → `RecordGoogleSynced` |
| ครบ 5 ครั้ง → `Failed` | alert (a) ใน run ถัดไป (ขั้น 2) |

event ที่ส่งไป Google: `Summary = Title` · `Description = "เข้าห้องเรียนผ่านแพลตฟอร์ม: {JOIN_URL}" + ("\n\n" + DESCRIPTION)` · เวลา UTC พร้อม `timeZone:"Asia/Bangkok"` · **ไม่มีรายชื่อ/อีเมลผู้เรียนใน event** (เว้น §6.4 ที่ opt-in) · `RequestId`/`PrivateSessionId` ตาม §4.6

---

## 6. อีเมล / ICS (เฉพาะลิงก์ join ของแพลตฟอร์ม — กฎเหล็กเดียวกับ P11-04 §0 ข้อ 3)

### 6.1 ICS อยู่ที่ไหน (เลือกอย่างไม่รุกล้ำที่สุด)
**เก็บการสร้าง ICS ไว้ใน Live** (`IcsCalendarBuilder` เรียกจาก `AdhocRoomInviteService` ภายใน module เท่านั้น). เหตุผล: (1) ไม่ต้องเพิ่ม/แก้ `Live.Contracts` ด้วยตัว builder, (2) กฎ "ไม่มี raw Meet URL ใน ICS/อีเมล" บังคับที่จุดเดียว (builder ไม่มี parameter ที่เป็น URL ห้อง; `JoinUrl` ผ่าน allow-list ตอน Create), (3) Tutoring ไม่ต้องถือ organizer address/uidHost/SEQUENCE state — ทางเลือก "เปิด builder เป็น contract" ตกเพราะต้องพา SEQUENCE ต่อผู้รับกลับไปเก็บฝั่ง Tutoring ซึ่งซ้ำซ้อนกับ `ADHOC_MEETING_PARTICIPANTS`. **Tutoring ไม่เห็น ICS และไม่ต้องรู้ว่ามีไฟล์ปฏิทิน**

### 6.2 ใครได้อะไร (ต่อห้อง, `SEND_CALENDAR_INVITES = true`, ห้องยังไม่จบหรือมี CANCEL ค้าง)
| ผู้รับ | เหตุการณ์ | method | เงื่อนไข |
|---|---|---|---|
| ผู้เรียน (`Participant`) แถว `Pending` | สร้างห้อง/เพิ่มเข้า group | **REQUEST** (ATTENDEE ตัวเอง, SEQUENCE = `NextSequence(room.ICS_SEQUENCE)`) → `MarkInvited` | ไม่รอห้องพร้อม (ลิงก์แพลตฟอร์มคงที่) |
| ผู้เรียน `Invited` และ `ICS_SEQUENCE_SENT < room.ICS_SEQUENCE` | เวลา/ชื่อ/คำอธิบายเปลี่ยน | **REQUEST** SEQUENCE ใหม่ → `MarkInvited` | ห้องยัง active |
| ผู้เรียน `Invited` + (`WITHDRAWN_AT_UTC` หรือ ห้อง cancelled) | ถูกถอด / ห้องยกเลิก | **CANCEL** (`Cancelled: true`, SEQUENCE ≥ ที่ส่งไป +1) → `MarkCancelled` | `Pending` ที่ไม่เคยส่ง → `MarkCancelled` เงียบ ๆ |
| ติวเตอร์ (`Organizer`) | เช่นเดียวกับข้างบน | เหมือนข้างบน | **ส่งเฉพาะ `PROVIDER != GoogleMeet`** และรอ `PROVIDER != null` ก่อน (ถ้า `GoogleMeet` event อยู่ในปฏิทิน Google ของติวเตอร์แล้ว — ส่ง ICS ซ้ำ = event ซ้ำ; ปิดแถวเงียบ ๆ ด้วย `MarkInvited(seq)` ไม่ส่งอีเมล) |
| ใครก็ตามที่ไม่มีอีเมลใช้ได้ | — | — | `MarkSkipped("no_contact")` ไม่ throw ไม่บล็อกคนอื่น |

- **ICS:** `IcsCalendarBuilder.Build(Request|Cancel, [IcsEvent(SessionId = SOURCE_REF_ID, Sequence, Summary = TITLE, Description, Starts, Ends, JoinUrl = JOIN_URL, Cancelled)], organizerEmail, "SIRI UpSkill", uidHost, attendeeEmail, DISPLAY_NAME, now, JOIN_OPENS_MINUTES_BEFORE)`
  - **UID = `{SOURCE_REF_ID:N}@{uidHost}`** (คงที่ตลอดชีวิตห้อง ทุก method) · `uidHost` = `Uri(JOIN_URL).IdnHost` (เก็บถาวรกับห้อง ไม่เปลี่ยนตาม config ทีหลัง) · `organizerEmail` = `Live:OrganizerEmail` (เดิม)
  - **SEQUENCE:** ห้อง `ICS_SEQUENCE` เริ่ม 0 → +1 เมื่อ title/description/เวลาเปลี่ยน (`ApplyChange`) หรือยกเลิก (`MarkCancelled`) · ต่อผู้รับ `NextSequence(...)` monotonic (ไคลเอนต์ทิ้ง SEQUENCE ที่ต่ำกว่า) · การเพิ่ม/ถอดผู้เข้าร่วมเพียงอย่างเดียว **ไม่ bump** ห้อง
    - ขึ้นต้น `METHOD:REQUEST|CANCEL` (ไม่มี PUBLISH) · DTSTART/DTEND UTC `…Z` · `VALARM -PT15M`
  - **หลัง revive (§4.1 ข้อ 2ข):** UID เดิม; ผู้เรียนที่ได้ CANCEL ไปแล้วแต่ถูกเพิ่มกลับ ⇒ `Reinvite()` ⇒ REQUEST ด้วย `NextSequence` ≥ SEQUENCE ของ CANCEL +1 (RFC 5546: REQUEST ที่ SEQUENCE สูงกว่าทำให้นัดกลับมา) — ไคลเอนต์บางตัวอาจยังเก็บนัดที่ยกเลิกไว้ไม่ฟื้น; ผลกระทบจำกัดแค่ปฏิทิน เพราะลิงก์ในอีเมลคือ join URL ของแพลตฟอร์มซึ่งใช้ได้เสมอ
- **อีเมล** (`AdhocRoomEmailContent`, static/pure, **ภาษาไทยก่อน + อังกฤษต่อท้ายในฉบับเดียว** — ไม่มี locale ของผู้ใช้ฝั่ง server): subject ไทย + ` / ` + อังกฤษ (≤80 ตัว `SubjectText`) · เนื้อหา: ชื่อคลาส (HtmlEncode) · เวลาไทย (`ThaiDateText.Format`) + เวลาอังกฤษ (`AdhocDateText.Format` ใหม่ pure — "Thursday 1 October 2026, 10:00–12:00 (Asia/Bangkok)") · ปุ่ม/ลิงก์ `JOIN_URL` เท่านั้น · "ลิงก์เข้าห้องใช้ได้เฉพาะบัญชีของคุณ — โปรดอย่าส่งต่อ / This link works only for your account — please do not share it." · templateKey `live-adhoc-invite` / `live-adhoc-updated` / `live-adhoc-cancelled`
- **ไม่มี in-app notification จาก Live สำหรับ invite** (Tutoring ส่งของตัวเอง — P13-06/10/11) — มีเฉพาะ alert ติวเตอร์ §5.3
- **ทุก string ที่มาจาก DB/ผู้ใช้** (title, description, cancel reason, display name) ผ่าน `MeetingUrlScrubber` + `WebUtility.HtmlEncode`; ICS ผ่าน `EscapeText`/`QuoteParameter` ของ builder (ป้องกัน property injection)
- **idempotent:** อีเมล + แถว outbox + การเปลี่ยนสถานะ participant อยู่ใน `SaveChanges` เดียวต่อห้อง (all-or-nothing) — รัน job ซ้ำไม่ส่งซ้ำ; UQ(`ADHOC_MEETING_ID`,`USER_ID`) กัน instance ชน → จับ `DbUpdateException` ข้ามห้อง
- throughput: outbox ส่ง 100 ฉบับ/นาที (`EmailOutboxSenderJob.BatchSize`) — ปริมาณ tutoring ต่ำ ไม่เป็นคอขวดใน v1

### 6.3 ผู้เรียน (ผู้เยาว์): ข้อมูลที่ออกนอกระบบ
`ATTENDEE` ใน ICS ใช้ **อีเมลบัญชีผู้จ่าย (ผู้ปกครอง)** + `DISPLAY_NAME` ที่ Tutoring ส่ง (ชื่อเล่น) — ไม่มีชื่อจริงเด็ก/วันเกิด/ระดับชั้นใน ICS/อีเมล

### 6.4 Google attendee sync (optional · default OFF · WP-F แยกส่งทีหลังได้)
`SYNC_GOOGLE_ATTENDEES = true` (Tutoring ตั้งจาก `Tutoring:Rooms:GoogleAttendeeSync`, default false) และ `PROVIDER=GoogleMeet`, `Synced`, มี event, ห้อง active → `SetAttendeesAsync(token, eventId, อีเมลของ Participant ที่ Invited ไม่ withdrawn)` **หนึ่งครั้งต่อห้องเมื่อมีความต่าง** แล้ว stamp/เคลียร์ `GOOGLE_ATTENDEE_SYNCED_AT_UTC` · `sendUpdates=none` · cap `Live:GoogleAttendeeCap` · **เหตุผลที่ default ปิด:** อีเมลผู้ปกครองจะไปถึง Google; เปิดแล้วผู้เรียนเข้าห้องตรง (ไม่ต้องรอ host admit) และคนที่ได้ลิงก์ต่อต้อง "ขอเข้า" — เป็น mitigation เดียวของ link-sharing สำหรับคลาสผู้เยาว์ → ตัดสินใจเปิดเป็นรายสภาพแวดล้อมหลัง PDPA/privacy policy ครอบคลุม (Open decision D3)

---

## 7. Config / Options / DI (`Live:AdHoc`, section ใหม่ — ไม่แตะ `LiveOptions.cs`)

`LiveAdhocOptions` + `IValidateOptions<LiveAdhocOptions>` + `ValidateOnStart()` (ผูกใน `LiveModule` ผ่าน extension ใหม่ `AddLiveAdhocRooms(IServiceCollection, IConfiguration)`):

| Key | Default | ช่วง/หมายเหตุ |
|---|---|---|
| `Live:AdHoc:Enabled` | `true` | false = mutator คืน 503 `live.adhoc_disabled` (kill-switch) |
| `Live:AdHoc:AllowedJoinUrlOrigins` | `[]` | ว่าง = origin ของ `Live:PublicBaseUrl`; แต่ละค่า absolute https origin (ไม่มี path) |
| `Live:AdHoc:ReadinessAlertMinutes` | `30` | 5–240 |
| `Live:AdHoc:MaxParticipants` | `20` | 2–50 |
| `Live:AdHoc:MinDurationMinutes` / `MaxDurationMinutes` | `10` / `240` | trial 15 นาทีต้องผ่าน |
| `Live:AdHoc:MaxFutureDays` | `400` | 1–730 |
| `Live:AdHoc:BatchSize` / `InviteBatchSize` / `ResetBatchSize` / `MaxEmailsPerRun` | `50` / `100` / `50` / `200` | |

ค่าอื่นใช้ของ `Live:*` เดิม (`Provider`, `PublicBaseUrl`, `OrganizerEmail`, `AllowedMeetingHosts`, `GoogleAttendeeCap`) · **ไม่มี key ใหม่ที่เป็น secret** · กฎ `Live:Provider != Logging` ใช้กับห้อง ad-hoc อยู่แล้ว

**appsettings placeholder (รอบ 2 ข้อ 21):** เพิ่มบล็อก `"Live": { "AdHoc": { "Enabled": true, "AllowedJoinUrlOrigins": [], "ReadinessAlertMinutes": 30, "MaxParticipants": 20, "MinDurationMinutes": 10, "MaxDurationMinutes": 240, "MaxFutureDays": 400, "BatchSize": 50, "InviteBatchSize": 100, "ResetBatchSize": 50, "MaxEmailsPerRun": 200 } }` ใน **`appsettings.json` ของทั้ง `Siri.Api` และ `Siri.Workers`** (WP-C ของ P13-09; ไม่มี secret) — เพราะ job รันที่ Workers และ validator `ValidateOnStart` ทำงานทั้งสอง host

### 7.1 Production guard — `JoinUrl` origin (รอบ 2 ข้อ 15)
ปัญหา: `AllowedJoinUrlOrigins` ว่าง = origin ของ `Live:PublicBaseUrl` แต่ `JoinUrl` ที่ Tutoring ส่งสร้างจาก `Tutoring:PublicBaseUrl` — ถ้าสองค่าต่าง origin ห้องจะล้ม `live.room_invalid_request` ทุกห้อง (booking ยังสำเร็จ แต่ไม่มีห้อง/ICS)
- เพิ่ม `LiveAdhocProductionRequirements.GetProblems(IConfiguration)` (คลาสใหม่ใน `Siri.Modules.Live`, แพทเทิร์น `LiveProductionRequirements`; ไม่ echo ค่า secret) — **อ่าน `Tutoring:PublicBaseUrl` (fallback `Seo:PublicBaseUrl`) เป็น config string ตรง ๆ ไม่ reference โค้ด Tutoring**; คำนวณ `effectiveOrigins` = `Live:AdHoc:AllowedJoinUrlOrigins` (ถ้าไม่ว่าง) มิฉะนั้น origin ของ `Live:PublicBaseUrl` (fallback `Seo:PublicBaseUrl`); ใน Production: origin ของ `Tutoring:PublicBaseUrl` ต้องเป็น https และ **∈ `effectiveOrigins`** (เทียบ scheme+host+port แบบ case-insensitive) ไม่งั้นคืน problem ⇒ **startup ล้ม (fail-fast)** · เรียกจาก `ProductionConfigurationGuard.ValidateProductionConfiguration` **และ** `WorkersProductionRequirements.GetProblems` — การ wire สองจุดนี้ทำโดย P13-06 (ข) ตามที่ระบุไว้แล้ว; P13-09 เป็นเจ้าของตัวคลาส/เทสต์ (ตัวเดียวกับที่ P13-06 อ้างว่า "ฝั่ง Live เพิ่ม key+validator ของตน")
- Development/Test ไม่บังคับ แต่ `AddLiveAdhocRooms` log Warning ตอน start ถ้า origin ไม่ตรง
- runtime: `AdhocRoomRequestValidator` ที่ล้มเพราะ `JoinUrl` ใส่ `Extensions { field: "joinUrl", problem: "origin_not_allowed" }` (ไม่มีค่าดิบ) เพื่อให้ `SessionRoomSync` (P13-10 §7.1b) log Error ระบุสาเหตุ + นับ `tutoring.room_sync.failures{reason}` — ไม่ปล่อยให้ล้มเงียบ
- เทสต์: ต่าง origin ⇒ problem · origin เดียวกัน ⇒ ผ่าน · `AllowedJoinUrlOrigins` ระบุ origin ของ Tutoring ⇒ ผ่านแม้ต่างจาก `Live:PublicBaseUrl` · Development ⇒ ไม่ล้ม

### 7.2 DI และ job
DI (เพิ่มใน `AddLiveAdhocRooms` ซึ่ง `LiveModule.AddLiveModule` เรียกบรรทัดเดียว): `IAdhocMeetingRepository`→`AdhocMeetingRepository` · `AdhocRoomService` · `AdhocRoomSyncService` · `AdhocRoomInviteService` · `IAdhocRoomAlertSender` · `AdhocRoomRequestValidator` · `LiveAdhocMeetingSyncJob` (Scoped) · **`ILiveRoomProvisioner`→`LiveRoomProvisioner` (Scoped, adapter บางที่เรียก `AdhocRoomService` + แมป contract↔domain)**

Job: `RecurringJobIds.LiveAdhocSync = "live-adhoc-sync"` เพิ่มใน `All` **เท่านั้น** — **ไม่เพิ่มใน `LiveDiagnostics`** (list นั้นขับ admin Live status + `LiveAdminStatusTests`/`HangfireHostingIntegrationTests`; ขยายเป็น follow-up แยก ไม่ใช่ขอบเขตนี้) · `RecurringJobsRegistration`: `AddOrUpdate<LiveAdhocMeetingSyncJob>(LiveAdhocSync, j => j.RunAsync(CancellationToken.None), Cron.Minutely())` ต่อจาก `LiveMeetingSync`

---

## 8. ไฟล์ที่แตะ + ผลต่อ architecture test

### 8.1 `src/Siri.Modules.Live` — ต้องเป็น **เพิ่มไฟล์ + DI เท่านั้น**
| ไฟล์ | ชนิด | หมายเหตุ |
|---|---|---|
| `Contracts/ILiveRoomProvisioner.cs` | **ใหม่** | §3 |
| `Domain/ADHOC_MEETING.cs`, `Domain/ADHOC_MEETING_PARTICIPANT.cs` | **ใหม่** | enum reuse: `MeetingProvider`, `MeetingSyncStatus`, `InviteStatus` (ไม่แก้) |
| `Infrastructure/AdhocMeetingConfiguration.cs`, `AdhocMeetingParticipantConfiguration.cs`, `AdhocMeetingRepository.cs`, `AppDbContextLiveAdhocExtensions.cs`, `LiveRoomProvisioner.cs`, `LiveAdhocMeetingSyncJob.cs` | **ใหม่** | accessor `AdhocMeetings()`/`AdhocMeetingParticipants()` อยู่ไฟล์ใหม่ — **ไม่แก้** `AppDbContextLiveExtensions.cs` |
| `Application/IAdhocMeetingRepository.cs`, `AdhocRoomService.cs`, `AdhocRoomRequestValidator.cs`, `AdhocRoomSyncService.cs`, `AdhocRoomInviteService.cs`, `IAdhocRoomAlertSender.cs`+`AdhocRoomAlertSender.cs`, `AdhocRoomEmailContent.cs`, `AdhocDateText.cs`, `LiveAdhocOptions.cs`, `LiveRoomMapper.cs`, `LiveAdhocServiceCollectionExtensions.cs` | **ใหม่** | เรียก `IcsCalendarBuilder`, `MeetingLinkValidator`, `MeetingProviderDecision`, `MeetingUrlScrubber`, `ThaiDateText`, `InstructorGoogleAccountService` แบบ read-only reuse |
| `LiveModule.cs` | **แก้ 1 บรรทัด (DI)** | `services.AddLiveAdhocRooms(configuration);` ต่อท้ายส่วน jobs |
| ไฟล์นอก Live ที่ต้องแก้ (wiring): `Siri.Workers/RecurringJobIds.cs`, `Siri.Workers/RecurringJobsRegistration.cs`, `Siri.Persistence/Migrations/*AddLiveAdhocMeetings*` (+snapshot อัตโนมัติ), `docs/DATABASE.md`, `tests/**` | | |

**ห้ามแก้:** `LiveMeetingSyncJob`, `SessionInviteService(.Reminders)`, `SessionJoinService`, `SESSION_JOIN_LOG`, `SESSION_MEETING`, `SESSION_INVITE`, `LiveMeetingSink`, `LiveMeetingReadinessReader`, `InstructorGoogleAccountService`, `SessionMeetingService`, `InstructorAlertSender`, `LiveEmailTemplates`, `IcsCalendarBuilder`, `LiveOptions.cs`, `AppDbContextLiveExtensions.cs`, controllers ของ Live. (`git diff` ของไฟล์เหล่านี้ต้องว่าง — เป็น acceptance ของ WP-E)

### 8.2 `Siri.Modules.Live.csproj`
`Siri.Modules.Live.csproj` ไม่เพิ่ม ProjectReference/package (ใช้ Catalog/Learning/Identity/Notification/SharedKernel/Persistence/Integrations.Google ที่มีแล้ว). **Live ห้าม reference Tutoring** (ทิศทาง: Tutoring → Live.Contracts; csproj วนจะ build ไม่ผ่านอยู่แล้ว)
**`Siri.Modules.Tutoring.csproj` ต้องเพิ่ม `<ProjectReference Include="..\Siri.Modules.Live\Siri.Modules.Live.csproj" />`** (รอบ 2 ข้อ 21) — ตาม README §4 แถว csproj: "ผู้เริ่มใช้เป็นคนเพิ่ม" ⇒ **P13-09 WP-B เป็นผู้เพิ่ม** (project reference ไป assembly เดียวกับที่มี `Live.Application`/`Domain` ด้วย — การจำกัดให้ใช้เฉพาะ `Live.Contracts` บังคับด้วยเทสต์ §8.3 ไม่ใช่ csproj) · `Siri.Api.csproj`/`Siri.Workers.csproj` มี reference ไป Live อยู่แล้ว

### 8.3 Architecture-test impact
- `ModuleAssemblyCatalog` ไม่เปลี่ยน (ไม่มี module ใหม่จาก contract นี้); `DatabaseIdentifierLengthTests` count 11→12 เป็นงานของ P13-01 (module Tutoring)
- `LayeringTests.ModuleAssemblies_DoNotReferenceOtherModules_...` ผ่านโดยโครง: Tutoring ใช้ `Siri.Modules.Live.Contracts` เท่านั้น
- **เพิ่ม test ใหม่ (ในไฟล์ใหม่ `LiveTutoringBoundaryTests.cs`) 2 ข้อ:** (1) `Tutoring_DoesNotDependOn_LiveApplicationDomainInfrastructure` — `NotHaveDependencyOnAny("Siri.Modules.Live.Application","Siri.Modules.Live.Domain","Siri.Modules.Live.Infrastructure")` (F13: test เดิมไม่จับ `Application`) · (2) `Live_DoesNotDependOn_Tutoring` — `Types.InAssembly(Live).Should().NotHaveDependencyOn("Siri.Modules.Tutoring")`
- identifier ของตารางใหม่ ≤63 ไบต์ (ยาวสุด `FK_ADHOC_PARTICIPANTS_MEETING` = 29)

---

## 9. ภาระฝั่ง Tutoring (ที่ contract นี้ **ต้องการ** จาก P13-05/06/10 — ชื่อภายใน Tutoring, ไม่ใช่ cross-module)

| ต้องการ | ใครทำ | สาระ |
|---|---|---|
| `ISessionRoomSync.ConvergeAsync(Guid sessionId, CancellationToken)` — **stage-only, idempotent** | **P13-05 §5.0ค ประกาศแล้ว** (interface + `TryAddScoped<ISessionRoomSync, NullSessionRoomSync>`; P13-06 §6.2 ข้อ 6c / P13-05 §5.5 เรียกครอบ `ITutoringUnitOfWork.TryInSavepointAsync` — ล้ม ⇒ rollback ถึง savepoint + detach, booking ยัง Confirmed); **P13-10 แทนที่ด้วย `SessionRoomSync` จริง**. ข้อกำหนดต่อ `AdhocRoomService`: ทุก mutator ต้อง **stage ได้อย่างเดียว** (ไม่เปิด transaction/ไม่ SaveChanges) และเมื่อ throw ต้องไม่ทิ้ง entity ครึ่งทางไว้ใน tracker เกินกว่าที่ detach ของ savepoint จัดการได้ (สร้าง entity ให้ครบก่อนเรียก `repo.Add` ครั้งเดียว) | **สัญญา converge (รอบ 2 ข้อ 9 — รายละเอียดเต็ม P13-10 §7.1b):** โหลด session + bookings + **สถานะห้องจริง** (`GetStatusAsync`, ไม่ใช่แค่ `MEETING_ROOM_ID` null) → session `Scheduled`/อนาคต และมี booking `Confirmed` ≥1: ไม่มีห้อง **หรือห้องเป็น `Cancelled`** → `CreateAsync` (ใหม่/revive ห้องเดิม; ตั้ง `MEETING_ROOM_ID`) · มีห้อง active → `UpdateAsync` ถ้า title/เวลา/รายชื่อต่าง (รวมกรณีเหลือเพียงติวเตอร์) · **`session.STATUS = Cancelled` เท่านั้น → `CancelAsync`** (booking `Confirmed` หมดแต่ session ยัง Scheduled ⇒ ไม่ยกเลิกห้อง) · finalized → ไม่ทำอะไร |
| จุดเรียก `ConvergeAsync` (ใน unit-of-work เดียวกับการเปลี่ยนสถานะ) | P13-06 (payment succeeded; free trial confirm), P13-05/08 (booking ยกเลิก/หมดอายุ ใน group; session ยกเลิก; reschedule ถ้ามี) | ก่อน `SaveChanges` ของ transaction นั้น |
| Self-heal | P13-10 (ขั้น 0 ของ `tutoring-session-finalize`) | session `Scheduled`, อนาคต (ภายใน `Tutoring:Finalize:RoomHealLookaheadHours`), มี booking `Confirmed`, และ (`MEETING_ROOM_ID` null **หรือ `GetStatusesAsync` รายงานห้อง `Cancelled`**); กับ session `Cancelled` อนาคตที่ยังมี `MEETING_ROOM_ID` แต่ห้องไม่ `Cancelled` → `ConvergeAsync` (≤20/รอบ) — กัน webhook ที่ `CreateAsync` ล้ม (validation/disabled) แต่ booking ต้องไม่ล้ม ("ห้ามกลืนเงินเงียบ" ได้ booking Confirmed เสมอ) |
| ตัวสร้าง request | P13-10 `TutoringRoomRequestFactory` | `Title` = "{วิชา} · {ชื่อติวเตอร์}"; `JoinUrl` = `{Tutoring:PublicBaseUrl}/tutoring/sessions/{id:D}/join`; `JoinOpensMinutesBefore` = `Tutoring:JoinWindowMinutes`; `OrganizerManagePath` = `/instructor/tutoring/classes/{id:D}`; ผู้เรียน `DisplayName` = `LEARNER_PROFILES.NICKNAME` (ไม่ใช่ชื่อบัญชีผู้ปกครอง) |
| config ฝั่ง Tutoring | P13-10 | `Tutoring:Rooms:GoogleAttendeeSync` (default false), `Tutoring:Rooms:SendCalendarInvites` (default true) |

---

## 10. Security

- **ไม่มี HTTP surface ใหม่ใน Live** ⇒ ไม่มี `[Authorize]`/rate limit ที่นี่ · การป้องกัน IDOR เป็นสองชั้น: Tutoring เช็คความเป็น participant ใน query ของมันก่อน (P13-10) **และ** Live เช็คซ้ำใน `GetJoinLinkAsync` (ไม่ใช่ participant → NotFound ตัวเดียว); `SetManualLink`/`RequestResync` เช็ค `OrganizerUserId` ใน query เดียวกับการดึงห้อง
- **ลิงก์ห้อง = capability:** เก็บ `MEET_URL_ENCRYPTED` (AES-GCM ผ่าน `ISensitiveDataProtector` เหมือน `SESSION_MEETINGS`) · ออกจากระบบได้ทางเดียวคือ `GetJoinLinkAsync` → ด่าน P13-10 (`no-store`) · ไม่อยู่ใน: `LiveRoomStatus`, error/ProblemDetails/`Extensions`, อีเมล/ICS/in-app, log, `ERROR` column (เทสต์ recursive scan) · URL ที่ Google ส่งกลับผ่าน allow-list host เดียวกับ Manual ก่อนเก็บ
- **`JoinUrl` ที่ caller ส่งมาเป็น input ที่ไม่น่าไว้ใจ** (defense in depth): origin allow-list + ห้ามเป็น meeting host + ต้องมี `SourceRefId` ⇒ caller ผิดพลาดส่ง raw Meet URL มาก็ถูกปฏิเสธ ไม่ถูกส่งเข้าอีเมล
- ผู้รับอีเมล = ผู้เข้าร่วมของห้องเท่านั้น (ดึงอีเมลจาก Identity ตอนส่ง; ไม่เก็บ) · ไม่ log อีเมล/token/URL (เฉพาะ roomId, sessionRefId, eventId, status code) · PII ในตาราง: `DISPLAY_NAME` (ชื่อเล่น/ชื่อสาธารณะ) เท่านั้น
- Google: scope/flow ไม่เปลี่ยน; `sendUpdates=none`; `guestsCan*=false`; ติวเตอร์เพิกถอน → `NeedsReconnect` + alert (ห้อง `Ready` ที่มี URL เดิมยังใช้ได้ แต่แก้/ลบ event ผ่านระบบไม่ได้จนกว่าจะเชื่อมใหม่ — พฤติกรรมเดียวกับคอร์ส)
- ผู้เยาว์: ไม่มีข้อมูลเด็กนอกจากชื่อเล่นใน ICS; **ไม่ sync attendee เข้า Google โดย default**; ห้องไม่บันทึก (ไม่มี recording flow)

---

## 11. Test checklist

**Unit:** transitions ของ `ADHOC_MEETING` ทุกแถว §2.3 + **parity table เทียบ `SESSION_MEETING`** · backoff 1/5/15/60→Failed · `BLOCKED_AT_UTC` ตั้ง/ล้าง · `AdhocRoomRequestValidator` (ทุก field/ขอบ; `JoinUrl` ที่เป็น `https://meet.google.com/...`, `https://evil.example/...`, ไม่มี `SourceRefId`, userinfo, http ที่ไม่ใช่ loopback → ปฏิเสธ) · `LiveRoomMapper` ตาราง §3.1 · `AdhocRoomService`: create idempotent / cancelled+ยังไม่จบ→revive (ล้าง cancel/alert stamps, `ICS_SEQUENCE++`, participants Reinvite/Withdraw/Create, สถานะตามมีผล event/URL; ซ้ำด้วย `RequestId` เดิม no-op) / cancelled+จบแล้ว→conflict / revive แล้ว invite engine ส่ง REQUEST SEQUENCE > CANCEL / provider-decision ทันที (3 ทาง) / update no-op ไม่ bump / update bump + `Pending` เมื่อมี Google event / participants diff (เพิ่ม, ถอด, re-add) / cancel idempotent / manual link: organizer ผิด→NotFound, host ไม่ผ่าน→400, GoogleMeet→Manual ⇒ organizer `RequeueInvite` (ได้ ICS REQUEST ใหม่ SEQUENCE สูงกว่าเดิม) / `GetJoinLink`: ไม่ใช่ participant & ไม่มีห้อง **ผลเท่ากันทุกฟิลด์**, cancelled→conflict, ไม่พร้อม→503 ext `needsAction`, decrypt ล้ม→503 ไม่ใช่ 500 · **ไม่เรียก `SaveChanges` ในทุก mutator** · `AdhocRoomSyncService` ทุกแถว §5.4 ด้วย `FakeCalendarProvider`/`FakeGoogleOAuthService`/`FakeClock` (รวม self-heal: reconnect หลัง blocked ⇒ reset, ก่อน blocked ⇒ ไม่, `Failed` บัญชีเดิม ⇒ ไม่วน) · alert (a)/(b) once + ไม่มีอีเมล→in-app · invite engine: REQUEST/CANCEL/silent, SEQUENCE monotonic หลัง CANCEL→Reinvite, tutor+GoogleMeet ไม่ส่ง, Pending ของ withdrawn→เงียบ · `AdhocRoomEmailContent`: HtmlEncode (`<script>`, `"><img onerror>`), subject ไม่มี CR/LF, **ไม่มี meeting host ใด ๆ ใน body/ICS** (seed Manual URL จริงแล้ว assert ไม่รั่ว) · ICS: UID ตรง `SOURCE_REF_ID:N@host`, METHOD ถูก, ไม่มี ATTENDEE ซ้ำ
**Integration (Testcontainers PostgreSQL+Redis, `SiriApiFactory`):** Create stage + Tutoring `SaveChanges` เดียวกัน ⇒ มี row หลัง commit / rollback ⇒ ไม่มี · Create สองครั้ง ⇒ row เดียว · concurrent Create (สอง scope) ⇒ UQ ชนแล้วไม่ throw ถึงผู้ใช้ปลายทาง (ผู้เรียก retry) · Cancel vs job race ⇒ concurrency ปลอดภัย · `MEET_URL_ENCRYPTED` ใน DB ไม่ใช่ plaintext (raw SQL) · job end-to-end ด้วย Logging provider · `RecurringJobIds.All` ตรงกับที่ลงทะเบียน (`HangfireHostingTests`) · architecture 2 ข้อ §8.3 · `git diff --stat` ของไฟล์ห้ามแก้ = 0 บรรทัด

## 12. Work packages (ลำดับบังคับ)
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| A | `DATABASE` | entity ×2 + configuration + migration `AddLiveAdhocMeetings` (อ่านทั้งไฟล์ — additive, ไม่มี shadow FK, FK NoAction, ชื่อ ≤63) + `docs/DATABASE.md` | build 0 warning; architecture เขียว; **ไม่ apply DB จริง** |
| B | `backend-developer` | Contracts + `AdhocRoomService` (รวม revive) + validator + repository + mapper + `LiveRoomProvisioner` + options/validator/DI + `LiveAdhocProductionRequirements` (§7.1) + appsettings `Live:AdHoc` (Api+Workers) + `ProjectReference` Tutoring→Live (§8.2) | unit §11 ส่วน service/validator/mapper |
| C | `backend-developer` | `AdhocRoomSyncService` + job + self-heal + alert sender + `RecurringJobIds`/registration | unit ตาราง §5.4 ครบ |
| D | `backend-developer` | `AdhocRoomInviteService` + `AdhocRoomEmailContent` + `AdhocDateText` | unit ICS/อีเมล/ไม่รั่วลิงก์ |
| E | `backend-developer` | architecture tests §8.3 + integration tests §11 + ตรวจ `git diff` ห้ามแก้ | เขียนครบ (รายงานว่ายังไม่เคยรันถ้าไม่มี Docker) |
| F (ทีหลังได้) | `backend-developer` | attendee sync §6.4 | unit: diff/cap/ถอดคน |
ขนานได้: B กับ A (หลัง entity ลงถึง) · C,D หลัง B · `DONE` ตั้งโดย integrator-qa · **ห้าม commit/apply migration เอง**

---

## 13. Open decisions (defaulted) · ความเสี่ยงที่เหลือ

| # | เรื่อง | ค่าที่ตั้ง | เปลี่ยนได้ที่ |
|---|---|---|---|
| D1 | ใครส่ง alert ห้องติดขัด/เร่งด่วน | Live ส่งให้ติวเตอร์ (อีเมล+in-app); **admin queue เป็นของ Tutoring** (อ่านสถานะผ่าน `GetStatusesAsync`) | — |
| D2 | invite ไม่รอห้องพร้อม (เหมือน P11-04) | ผู้เรียนได้ ICS ทันทีที่ commit (ลิงก์แพลตฟอร์มคงที่); ห้องไม่พร้อม → join 503 + alert | — |
| D3 | Google attendee sync | **ปิด** (`SyncGoogleAttendees=false`) — ไม่ส่งอีเมลผู้ปกครองไป Google | `Tutoring:Rooms:GoogleAttendeeSync` |
| D4 | ผู้เรียนต้องรอ host admit บน Meet ไหม | ใช่เมื่อ sync ปิดและผู้เรียนไม่ใช่ผู้ได้รับเชิญใน Google — **ติวเตอร์ต้องกดรับจาก lobby**; ข้อความในหน้า Tutor Portal/อีเมลติวเตอร์ต้องบอก | UX ของ P13-24/25 |
| D5 | ภาษาอีเมล | ไทย+อังกฤษซ้อนในฉบับเดียว (ไม่มี locale ของผู้ใช้ใน `IUserContactReader`) | เมื่อมี locale preference |
| D6 | `Live:AdHoc:Enabled=false` | mutator ทั้งหมดคืน 503; Tutoring ต้องไม่ทำให้ booking ล้ม (self-heal เก็บงาน) | config |
| D7 | ติวเตอร์สลับผู้สอน (organizer) | **ไม่รองรับ** (immutable) — ยกเลิกแล้วสร้าง session ใหม่ | revision ถ้าจำเป็น |
| D8 | session ถูก Revive/Reopen หลังห้องถูก cancel (P13-05 §5.5) | **revive ห้องเดิมแบบ in-place ผ่าน `CreateAsync`** (RoomId/UID/JoinUrl เดิม, `ICS_SEQUENCE++`) แทนการทำ generation ใหม่ (`UQ (SOURCE_KEY, SOURCE_REF_ID, GENERATION)` + UID ต่อ generation) — เล็กกว่า: ไม่เพิ่มคอลัมน์/ไม่เปลี่ยน UQ/ไม่แตะ pipeline คอร์ส, `MEETING_ROOM_ID` ของ session คงเดิม, join URL เดิม | ถ้า calendar client ไม่ฟื้นนัดหลัง CANCEL→REQUEST ให้ออก revision เป็น generation |

**ความเสี่ยงที่เหลือ (ยอมรับ ไม่ซ่อน):** (1) ติวเตอร์ Google OAuth app ยังเป็น Testing → refresh token หมดอายุ 7 วัน ⇒ ห้องที่สร้างใหม่ต้องใช้ Manual/เชื่อมใหม่ (Q14.5) (2) ห้อง `Ready` ที่ผู้เรียนส่งลิงก์ Meet ต่อให้คนอื่น — กันได้เฉพาะจาก "ได้ลิงก์จากแพลตฟอร์มโดยไม่มีสิทธิ์" ไม่ใช่การแชร์ต่อ (เหมือน P11-05 §0 ข้อ 6) (3) **ติวเตอร์เข้า Meet ตรงจากปฏิทิน Google ของตัวเองได้โดยไม่ผ่านด่านเรา** — อยู่ที่ P13-10 §4 (4) `EmailOutboxSenderJob` 100 ฉบับ/นาที ร่วมกับ pipeline คอร์ส

---

## Appendix — Frontend DTO (ไม่มี HTTP surface ใน P13-09)

Live ไม่เปิด endpoint; FE เห็นผลผ่าน wrapper ของ Tutoring (P13-10 §7: `GET /api/tutoring/tutor/classes/{sessionId}/room`) ที่คืน `RoomStatusDto` = `LiveRoomStatus` ลบ `roomId/sourceKey/sourceRefId` (ไม่เปิดเผย id ภายใน). mapping เพื่อ UI ติวเตอร์ (i18n `tutoring.tutor.room.*`):
```ts
type LiveRoomState = 'Pending' | 'AwaitingLink' | 'Ready' | 'NeedsReconnect' | 'Failed' | 'Cancelled';
type LiveRoomNeedsAction = 'None' | 'Waiting' | 'PasteLink' | 'ReconnectGoogle' | 'Retry';
```
| `needsAction` | UI ติวเตอร์ |
|---|---|
| `Waiting` | "กำลังสร้างห้อง" (poll ทุก 15 วิ สูงสุด 5 นาที) |
| `PasteLink` | ช่องวางลิงก์ Meet/Zoom/Teams (`PUT …/meeting-link`) + ปุ่ม "เชื่อม Google" (`POST /api/live/instructor/google/connect` ด้วย `returnPath=/instructor/tutoring/classes/{id}`) |
| `ReconnectGoogle` | ปุ่มเชื่อม Google ใหม่ + วางลิงก์แทนได้ |
| `Retry` | ปุ่ม "ลองสร้างห้องใหม่" (`POST …/room/retry`) + วางลิงก์ |
| `None` + `Ready` | "ห้องพร้อม" |
คำเตือนคงที่บนหน้า: ผู้เรียนที่ไม่ได้ถูกเชิญใน Google ต้อง "ขอเข้า" — ติวเตอร์ต้องกดอนุญาตจาก lobby ของ Meet (D4)

## Changelog
**2026-10-14 รอบ 2 (cross-contract review — additive; ไม่เปลี่ยน signature ที่ P13-05/06/08 เรียกอยู่ ยกเว้นเพิ่ม `Revived` แบบ optional):**
- ข้อ 9 (MAJOR): `CreateAsync` บนห้อง cancelled+ยังไม่จบ = **revive ห้องเดิม** (`ADHOC_MEETING.Revive`, `LiveRoomRef.Revived`, §2.1/§2.3/§3/§4.1/§4.3/§4.6/§6.2/§9/§11/D8); ผู้เรียกยกเลิกห้องเฉพาะเมื่อ `session.STATUS = Cancelled`; `ISessionRoomSync.ConvergeAsync` + heal ตรวจ **สถานะห้องจริง** ไม่ใช่แค่ `MEETING_ROOM_ID` null
- ข้อ 15 (MAJOR): เพิ่ม §7.1 `LiveAdhocProductionRequirements` (origin ของ `Tutoring:PublicBaseUrl` ต้อง ∈ origin ที่ Live รับ — fail-fast ใน Production; wire โดย P13-06 (ข)) + validator ล้มพร้อม `Extensions {field, problem}` ไม่ปล่อยเงียบ
- ข้อ 18: `ISessionRoomSync` ประกาศที่ **P13-05 §5.0ค** (เดิมเขียน P13-06 §7)
- ข้อ 21: ระบุ appsettings placeholder `Live:AdHoc` ใน Api **และ** Workers; `Siri.Modules.Tutoring.csproj` เพิ่ม `ProjectReference` ไป `Siri.Modules.Live` โดย P13-09 WP-B; FK ทุกเส้นเป็น `NoAction` (ยืนยันตรงกับ README §2)
