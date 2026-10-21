# Contract: P13-04 ค้นหาติวเตอร์ + โปรไฟล์สาธารณะ + `GET subjects` + รูป/วิดีโอแนะนำสาธารณะ + search log + sitemap ติวเตอร์

Status: FROZEN · วันที่: 2026-10-14 · Module: `Siri.Modules.Tutoring` (Repository+Service, UPPERCASE) + `Siri.Api` (controller สาธารณะ, rate limit, output-cache policy, sitemap) + `Siri.Modules.Media` (**เพิ่ม 1 contract แบบ additive** — §6.3) + `Siri.SharedKernel` (contract ใหม่ 1 ตัว) + `Siri.Workers` (1 job)

ผู้ลงมือที่แนะนำ: **Claude — `DATABASE` (WP-A) → `backend-developer` (WP-B..E)** · ไม่ต้อง `DESIGN_DATABASE` (1 ตารางใหม่ + index ที่ระบุชื่อครบ) · เหตุผลที่ไม่ส่ง Antigravity: เป็นพื้นผิวสาธารณะที่ **ต้องไม่หลุดข้อมูลส่วนบุคคล/KYC** (พิสูจน์ด้วย JSON-walk test), และมี raw SQL `pg_trgm` + contract ข้ามโมดูล · เมื่อ FROZEN แล้ว UI หน้า `/tutors` `/tutors/:slug` (P13-20/21) **ทำโดย Antigravity ได้**

Dependency: **P13-01** (ตาราง/entity/`ITutorPublicCacheInvalidator`/constants) · **P13-03** (`TUTOR_AVAILABILITY_RULES` สำหรับตัวกรองวัน-เวลา, `NEXT_AVAILABLE_AT_UTC`) · ดัชนีกลาง `P13-README.md`

---

## 0. ข้อเท็จจริงจากโค้ดจริง + ผลต่อดีไซน์

| # | ข้อเท็จจริง | ผล |
|---|---|---|
| F1 | ค้นหาคอร์สใช้ `Database.SqlQuery<T>` + `similarity()`/`ILIKE` บน `pg_trgm` (`SearchCoursesHandler.FindMatchesInDatabaseAsync`) และ ranking แบบ "ดึง id ที่ผ่าน filter → เรียงใน memory → ตัดหน้า → ดึงแถวเต็มเฉพาะหน้านั้น"; extension ประกาศใน `AppDbContext.OnModelCreating` แล้ว (`pg_trgm`) · โค้ดเดิม **ไม่ escape `% _ \`** ใน pattern | ใช้แพทเทิร์นเดียวกัน แต่ **escape wildcard + `ESCAPE '\'`**; ไม่ต้องเพิ่ม extension; modules provider-agnostic ⇒ ใช้ raw SQL ได้เฉพาะ `SqlQuery<T>`/`ExecuteSql*` (ไม่ใช้ `EF.Functions.ILike`) |
| F2 | `GET /api/catalog/courses/search` และ detail ใช้ `[OutputCache]` policy `PublicCourseCatalog` (5 นาที, tag) แต่ **ไม่มี rate limit**; `UseOutputCache()` อยู่ก่อน `UseRateLimiter()` ⇒ cache hit ข้ามตัวจำกัดอัตรา; request ที่มี `Authorization` ไม่ถูก cache | `GET tutors/{slug}` ใช้ output cache 60 วิ + rate limit; **search ไม่ cache ตาม default** (เพื่อให้ search log นับครบ — ดู §4.4) |
| F3 | เซิร์ฟเวอร์อยู่หลัง reverse proxy โดยไม่มี forwarded-headers ⇒ `RemoteIpAddress` = IP ของ proxy / ของ SSR host | rate limit ต่อ IP = เพดานรวมของแอป (โควตา `tutoring-search` 120/นาที ตั้งไว้เป็น backstop); **ไม่ใช่การจำกัดต่อผู้ใช้** — เขียนไว้ตรง ๆ ใน Open decisions |
| F4 | `IMediaAssetContract` คืนแค่ `Id/UploadedByUserId/Status/DurationSeconds` — ไม่มี provider asset id; `PlaybackSessionService` ออก URL เล่นได้เฉพาะ **episode + entitlement** (`CanUserAccessEpisodeAsync`) ⇒ ไม่มีทางเล่นวิดีโอสาธารณะที่ไม่ผูก episode | วิดีโอแนะนำติวเตอร์ต้องมี Media contract เล็ก ๆ ใหม่ (§6.3) — additive |
| F5 | ไม่มี image-upload สาธารณะ/CDN ของแพลตฟอร์ม; bucket `Storage:R2` เป็น private + presigned GET (`IFileStorage.GetSignedUrlAsync`) | รูปติวเตอร์เสิร์ฟผ่าน **endpoint 302 ไป presigned URL อายุสั้น** (URL สาธารณะของเราคงที่ ไม่ใช่ URL ของ bucket) |
| F6 | sitemap ของคอร์สใช้ `Seo:PublicBaseUrl` เป็น origin ของทั้ง `<loc>` ลูกและ URL หน้า (สมมติว่า FE/proxy ส่งต่อ `/sitemap*.xml` มาที่ API); `GetSitemapIndexHandler` และ `GetRobotsTxtHandler` เป็นของ Catalog | Tutoring มี sitemap ของตัวเองแยกไฟล์ (`sitemap-tutors*.xml`) และ **ไม่แตะ** Catalog index/robots — การโยงจาก `/sitemap.xml` ทำภายหลัง (Open decision #4) |
| F7 | `SqlQuery<T>` map alias ได้เฉพาะเมื่อ alias อยู่ใน double quote (`AS "TutorId"`) และทุก identifier ต้อง quote (UPPERCASE) | SQL ทุกตัวในสัญญานี้ quote ครบ |

---

## 1. Scope & task IDs
**ใน:** `GET /api/tutoring/tutors` (ค้นหา+facet) · `GET …/tutors/{slug}` · `GET …/tutors/{slug}/photo` · `GET …/tutors/{slug}/intro-video` · `GET /api/tutoring/subjects` · `GET /sitemap-tutors.xml` + `/sitemap-tutors-{page}.xml` · `SEARCH_LOGS` + sink + job purge · index ค้นหา · migration `AddTutorSearch` · `Siri.SharedKernel.Contracts.IPublicVideoPlaybackContract` + implement ใน Media · output-cache policy `TutoringPublicProfile`/`TutoringSearch`/`TutoringSitemap`/`TutoringSubjects` · Options `TutoringSearchOptions`
**นอก:** รีวิวสาธารณะ `GET tutors/{slug}/reviews` (P13-13) · slots (P13-03 — มีแล้ว) · analytics query จาก `SEARCH_LOGS` (P13-15) · FE · การโยง sitemap เข้า `/sitemap.xml` ของ Catalog

---

## 2. Schema delta — migration `AddTutorSearch`

### 2.1 `TUTORING.SEARCH_LOGS` (entity `SEARCH_LOG` — **append-only**, ไม่ implement IAuditable/ISoftDelete; มีแค่ `static Record(...)`)
| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `SEARCH_LOG_ID` | uuid PK | no | UUIDv7 |
| `CREATED_AT_UTC` | timestamptz(3) | no | |
| `SUBJECT_ID` | uuid | yes | วิชา/กลุ่มที่ resolve จาก `subject` slug (ไม่มี FK) |
| `LEVEL` | varchar(24) | yes | `TutorLevel` |
| `CURRICULUM` | varchar(16) | yes | `TutorCurriculum` |
| `QUERY_TEXT` | varchar(100) | yes | ผ่านการ sanitize (§4.4) |
| `RESULT_COUNT` | int | no | `TotalCount` ของผลค้นหา |
**ไม่มีคอลัมน์ user/IP/UA/session ใด ๆ** (เทสต์ reflection + ตรวจ schema) · Index: `PK_SEARCH_LOGS` · `IX_SEARCH_LOGS_CREATED` (`CREATED_AT_UTC`) (retention) · `IX_SEARCH_LOGS_SUBJECT_CREATED` (`SUBJECT_ID`,`CREATED_AT_UTC`) (analytics P13-15) · การ DELETE ทำได้**เฉพาะ** job retention (ข้อยกเว้นเดียวของกฎ append-only เพราะไม่ใช่ข้อมูลเงิน/สิทธิ์)

### 2.2 Index ค้นหาบน `TUTOR_PROFILES` / `TUTOR_OFFERINGS` (EF-managed ผ่าน `IEntityTypeConfiguration` ที่ P13-01 สร้าง — เพิ่มใน config เดิม แล้ว generate เป็น migration นี้)
| ชื่อ | บน | คอลัมน์ | พิเศษ | ใช้โดย |
|---|---|---|---|---|
| `IX_TUTOR_PROFILES_NAME_TRGM` | `TUTOR_PROFILES` | `DISPLAY_NAME` | `HasMethod("gin").HasOperators("gin_trgm_ops")` · `HasFilter("\"STATUS\" = 'Verified' AND \"IS_LISTED\" = true")` | `ILIKE`/`similarity` ชื่อ |
| `IX_TUTOR_PROFILES_HEADLINE_TRGM` | `TUTOR_PROFILES` | `HEADLINE` | gin_trgm_ops · filter เดียวกัน | `ILIKE` headline |
| `IX_TUTOR_PROFILES_LISTED_RATING` | `TUTOR_PROFILES` | (`RATING_AVERAGE` DESC, `RATING_COUNT` DESC, `TUTOR_ID`) | filter เดียวกัน (`IsDescending(true,true,false)`) | sort rating/relevance-ว่าง |
| `IX_TUTOR_PROFILES_LISTED_NEXT` | `TUTOR_PROFILES` | (`NEXT_AVAILABLE_AT_UTC`, `TUTOR_ID`) | filter เดียวกัน | sort nextAvailable |
| `IX_TUTOR_PROFILES_LISTED_NEWEST` | `TUTOR_PROFILES` | (`VERIFIED_AT_UTC` DESC, `TUTOR_ID`) | filter เดียวกัน | sort newest |
| (มีแล้วจาก P13-01) `IX_TUTOR_OFFERINGS_SUBJECT_ACTIVE` · `UQ_TUTOR_OFFERINGS_COMBO` (นำหน้า `TUTOR_ID`) | `TUTOR_OFFERINGS` | | | filter offering / join ต่อ tutor |
| (มีแล้วจาก P13-03) `IX_TUTOR_AVAIL_RULES_TUTOR_DOW` | `TUTOR_AVAILABILITY_RULES` | | | ตัวกรองวัน-เวลา |
- partial GIN ใช้ได้เพราะทุก query ค้นหาของสัญญานี้ใส่เงื่อนไข `STATUS='Verified' AND IS_LISTED = true` เสมอ (ต้อง**คงข้อความเงื่อนไขให้ planner พิสูจน์ implication ได้** — เขียนเป็น literal เดียวกับ `HasFilter`)
- ชื่อ ≤ 63 ไบต์ ตรวจด้วย `DatabaseIdentifierLengthTests` · ไม่สร้างดัชนีบน `BIO` (ใช้ `similarity` ตอน rank เท่านั้น — ไม่ใช่เงื่อนไขกรอง)
- ชื่อ migration `AddTutorSearch` · สร้างหลัง `AddTutorAvailability` · อ่านทั้งไฟล์ (index เป็น `CreateIndex` additive; ไม่มี drop)

---

## 3. Contracts ข้ามโมดูล (additive)
### 3.1 `Siri.SharedKernel.Contracts.IPublicVideoPlaybackContract` (ใหม่ — implement ใน Media)
```csharp
namespace Siri.SharedKernel.Contracts;
public sealed record PublicVideoPlayback(string ManifestUrl, DateTime ExpiresAtUtc);

/// <summary>ออก URL เล่นวิดีโอชั่วคราวสำหรับ asset ที่ "เปิดเป็นสาธารณะโดยการออกแบบ" (วิดีโอแนะนำตัวติวเตอร์). ไม่ตรวจสิทธิ์ผู้ชม ไม่ใส่ watermark.
/// ⚠ ผู้เรียกต้องรับประกันเองว่า asset นี้เปิดสาธารณะได้ — ห้ามส่ง id ที่มาจาก request ตรง ๆ. คืน NotFound เมื่อไม่มี asset, Conflict เมื่อไม่ Ready.</summary>
public interface IPublicVideoPlaybackContract
{
    Task<Result<PublicVideoPlayback>> GetPublicPlaybackAsync(Guid mediaAssetId, TimeSpan timeToLive, CancellationToken cancellationToken);
}
```
- impl: `Siri.Modules.Media.Application.PublicVideoPlaybackService` (Scoped; `AddMediaModule` ลงทะเบียน `services.AddScoped<IPublicVideoPlaybackContract, PublicVideoPlaybackService>()`) — ใช้ `IMediaAssetRepository.GetByIdAsync` + `IVideoProvider.GetSignedPlaybackUrlAsync(asset.PROVIDER_ASSET_ID, ttl)` (เหมือนที่ `PlaybackSessionService` ใช้) · **ไม่เขียน `PLAYBACK_SESSION`** (ไม่ใช่การเล่นที่ผูกผู้ใช้) · ttl clamp 1–10 นาที · unit test (asset ไม่มี/ไม่ Ready/Ready/ttl clamp)
- **ผลต่อ Media เป็น additive ล้วน** (ไฟล์ใหม่ 1 + DI 1 บรรทัด) · ความเสี่ยงที่รู้: ยังไม่ยืนยันว่า MediaCage Basic ("Embed View only", Q1) เล่น manifest นี้จากโดเมน FE ได้ ⇒ **FE ต้องซ่อนวิดีโอแนะนำอย่างสุภาพเมื่อ endpoint ตอบ 404/503** (Open decision #3)

### 3.2 `ITutorPublicCacheInvalidator` — เพิ่มเมธอด (ไฟล์ของ P13-01)
`Task InvalidateSubjectsAsync(CancellationToken)` (evict tag `tutoring-subjects`) · `SubjectService` (admin create/update) เรียกหลัง commit · ค่าคงที่ `TutoringOutputCache.SubjectsPolicyName="TutoringSubjects"`, `SubjectsTag="tutoring-subjects"`, `SearchPolicyName="TutoringSearch"`, `SearchTag="tutoring-search"` เพิ่มในไฟล์ของ P13-01

---

## 4. ค้นหา — ดีไซน์ query (พฤติกรรมที่ต้องตรง)

### 4.1 พารามิเตอร์ (`GET /api/tutoring/tutors`)
| param | ชนิด | กฎ |
|---|---|---|
| `q` | string? | trim, collapse whitespace, ≤100 (เกินตัดทิ้ง) · ว่าง = ไม่ค้นข้อความ |
| `subject` | string? (slug) | slug ของวิชาหรือ**กลุ่ม** — กลุ่มรวมลูกที่ `IS_ACTIVE` ทั้งหมด · ไม่รู้จัก ⇒ ผลว่าง (200, ไม่ใช่ error) |
| `level` | `TutorLevel`? | enum ผิด ⇒ 400 (model binding) |
| `curriculum` | `TutorCurriculum`? | |
| `format` | `SessionFormat`? | `Group` ⇒ offering ต้องมี `GROUP_HOURLY_RATE_PER_SEAT` · ไม่ส่ง = ไม่กรองรูปแบบ |
| `priceMin`,`priceMax` | decimal? | บาท/ชม. · ใช้กับอัตรา **ของ `format`** (Group ⇒ ต่อที่นั่ง; อื่น ⇒ ตัวต่อตัว) · `priceMin > priceMax` ⇒ 400 `tutoring.search_invalid` · ติดลบ ⇒ 400 |
| `gender` | `TutorGender`? | `Undisclosed` ถูกกรองได้ |
| `day`,`from`,`to` | int? 0–6 (**0 = อาทิตย์ … 6 = เสาร์**, ฐานเดียวกับ `DAY_OF_WEEK` ของ P13-03 / `System.DayOfWeek` / JS `getDay()`) / `HH:mm` / `HH:mm` (เวลาไทย) | ต้องมาครบสามตัว (ขาด ⇒ 400) · `from < to` · ตีความ "ติวเตอร์ที่มี rule ว่างคลุมช่วงนี้" (§4.3) |
| `sort` | `relevance`\|`rating`\|`priceAsc`\|`priceDesc`\|`nextAvailable`\|`newest` | default `relevance` (ไม่มี `q` ⇒ เทียบเท่า `rating`) |
| `page`,`pageSize` | int | page ≥1; pageSize 1–`MaxPageSize`(48), default 12 (ค่านอกช่วง clamp ไม่ error) |
| `facets` | bool | default true · ส่ง false ในหน้า 2+ เพื่อลดงาน |

### 4.2 เงื่อนไข "ติวเตอร์ที่ค้นเจอได้" (เสมอ ไม่ว่า filter อะไร)
`TUTOR_PROFILES.STATUS = 'Verified' AND IS_LISTED = true AND EXISTS (offering active ของ tutor นั้น)` — Draft/PendingVerification/NeedsInfo/Rejected/Suspended/unlisted/ไม่มี offering active **ไม่ปรากฏเด็ดขาด** (เทสต์ครบทุกสถานะ)

### 4.3 ขั้นตอน (`TutorSearchService.SearchAsync(TutorSearchQuery)`)
```
0. normalize/validate query (ตาราง 4.1) ; subject slug → ids = {subject} ∪ {children active}
1. base = TUTOR_PROFILES eligible (4.2)   [ใช้ partial index IX_TUTOR_PROFILES_LISTED_*]
2. offeringFilter (ต้องเป็น offering ตัวเดียวที่ตรงทุกเงื่อนไข — "single-offering semantics"):
     EXISTS (SELECT 1 FROM TUTOR_OFFERINGS o WHERE o.TUTOR_ID = p.TUTOR_ID AND o.IS_ACTIVE
             AND (ids IS NULL OR o.SUBJECT_ID = ANY(ids)) AND (level IS NULL OR o.LEVEL = level) AND (curriculum IS NULL OR o.CURRICULUM = curriculum)
             AND (format <> Group OR o.GROUP_HOURLY_RATE_PER_SEAT IS NOT NULL)
             AND (priceMin IS NULL OR rate(o) >= priceMin) AND (priceMax IS NULL OR rate(o) <= priceMax))
     โดย rate(o) = format = Group ? o.GROUP_HOURLY_RATE_PER_SEAT : o.HOURLY_RATE_ONE_ON_ONE          [IX_TUTOR_OFFERINGS_SUBJECT_ACTIVE / UQ_…_COMBO]
3. dayTimeFilter (เมื่อมี day/from/to):
     EXISTS (SELECT 1 FROM TUTOR_AVAILABILITY_RULES r WHERE r.TUTOR_ID = p.TUTOR_ID AND r.IS_ACTIVE AND r.DAY_OF_WEEK = day
             AND r.START_LOCAL <= from AND (r.END_LOCAL >= to OR r.END_LOCAL <= r.START_LOCAL))       ← rule ข้ามเที่ยงคืน (END ≤ START) ครอบถึง 24:00 ของวันนั้น
     ⚠ เป็นตัวกรอง "ช่วงที่ติวเตอร์ตั้งว่าว่างไว้" เท่านั้น — ไม่ตัด exception/คลาสที่จองแล้ว (ปฏิทิน slots เป็นตัวตัดสิน) · [IX_TUTOR_AVAIL_RULES_TUTOR_DOW]
4. gender filter : p.GENDER = gender
5. text (เมื่อ q ไม่ว่าง) :
     5a. raw SQL (SqlQuery<TutorSearchMatch>, ทุก identifier + alias ใน double quote):
           SELECT p."TUTOR_ID" AS "TutorId",
                  GREATEST(similarity(p."DISPLAY_NAME", {q}) * 100,
                           similarity(COALESCE(p."HEADLINE", ''), {q}) * 60,
                           similarity(p."BIO", {q}) * 10)::int AS "Rank"
           FROM "TUTORING"."TUTOR_PROFILES" p
           WHERE p."STATUS" = 'Verified' AND p."IS_LISTED" = true
             AND (p."DISPLAY_NAME" ILIKE {pattern} ESCAPE '\' OR p."HEADLINE" ILIKE {pattern} ESCAPE '\')
         pattern = "%" + EscapeLike(q) + "%"  (escape `\` ก่อน แล้ว `%` `_`)   [IX_TUTOR_PROFILES_NAME_TRGM / _HEADLINE_TRGM]
         ⚠ เขียน SQL เป็น raw string literal (`$"""…"""`) เหมือน `SearchCoursesHandler` — ใน string ปกติ `'\'` จะถูก C# ตีความเป็น escape และ `ESCAPE` เพี้ยน ; ส่ง q/pattern เป็นพารามิเตอร์ (interpolation → parameter) ห้าม concat
     5b. LINQ (provider-agnostic): subjects active ที่ NAME_TH/NAME_EN `.ToLower().Contains(lowered)` → tutors ที่มี offering active ในวิชานั้น → rank คงที่ SubjectNameMatchRank = 40
     ranks = merge(5a, 5b) โดยเก็บค่า Rank สูงสุดต่อ tutor ; ผู้ที่ไม่อยู่ใน ranks ถูกตัดทิ้ง (q เป็นเงื่อนไขกรอง)
6. filteredIds = base ∧ ข้อ 2-4 ∧ (q ? ∈ ranks : true) → SELECT TUTOR_ID, RATING_AVERAGE, RATING_COUNT, NEXT_AVAILABLE_AT_UTC, VERIFIED_AT_UTC (+ minRate เมื่อ sort ราคา)
7. sort + page :
     relevance (มี q) : ในหน่วยความจำ — Rank DESC, RATING_AVERAGE DESC, RATING_COUNT DESC, TUTOR_ID ASC
     relevance (ไม่มี q) / rating : RATING_AVERAGE DESC, RATING_COUNT DESC, TUTOR_ID                      [IX_TUTOR_PROFILES_LISTED_RATING]
     priceAsc / priceDesc : minRate (ต่ำสุดของ offering ที่ตรง filter, ตาม rate(o)) ASC/DESC, TUTOR_ID
     nextAvailable : NEXT_AVAILABLE_AT_UTC ASC โดย NULL ท้ายสุด (เขียนเป็น `OrderBy(x => x.Next == null).ThenBy(x => x.Next)` ให้ provider-agnostic), TUTOR_ID   [IX_TUTOR_PROFILES_LISTED_NEXT]
     newest : VERIFIED_AT_UTC DESC, TUTOR_ID                                                              [IX_TUTOR_PROFILES_LISTED_NEWEST]
     **ทุก sort มี TUTOR_ID เป็น tie-break ท้ายสุด** (pagination เสถียร ไม่ซ้ำ/ไม่ตกหล่นข้ามหน้า)
8. page ids → ดึง card ด้วย 2 query แบบ batch (ไม่ N+1): (a) TUTOR_PROFILES ของ id ในหน้า (b) TUTOR_OFFERINGS active + SUBJECTS ของ id เหล่านั้น → ประกอบ Subjects(≤5 เรียงตาม SORT_ORDER), Levels, Curricula, FromHourlyRate, HasGroup, HasTrial, HasFreeTrial
9. facets (facets=true) : คำนวณบน "ฐาน" = base ∧ (q ? ∈ ranks : true) **ก่อนใช้ filter อื่นของ request** (ตามแนว Catalog v1, ระบุเหตุผลเดียวกัน) — นับ **ติวเตอร์ที่ไม่ซ้ำ** (COUNT(DISTINCT TUTOR_ID)) :
     subjects (กลุ่มและวิชา), levels, curricula, genders, formats {OneOnOne: ทั้งหมด, Group: มีอัตรากลุ่ม}, trialCount, hourlyRate {min,max} ของฐาน
10. SEARCH_LOGS : ISearchLogSink.TryEnqueue(...) (เมื่อ page = 1 และ (q หรือ subject/level/curriculum อย่างใดอย่างหนึ่งมีค่า)) — ไม่รอ ไม่ throw
11. ตอบ 200 TutorSearchResponse
```
**ดัชนีที่ query ใช้ (ยืนยันด้วย integration test §9 ข้อ 12):** text → `IX_TUTOR_PROFILES_NAME_TRGM`/`_HEADLINE_TRGM` · offering → `IX_TUTOR_OFFERINGS_SUBJECT_ACTIVE` / `UQ_TUTOR_OFFERINGS_COMBO` · rating/next/newest → ดัชนี partial ตามชื่อ · day-time → `IX_TUTOR_AVAIL_RULES_TUTOR_DOW` · slug lookup → `UQ_TUTOR_PROFILES_SLUG`
**ต้นทุน:** ≤ 6 query ต่อ request (id-set, page cards, offerings, facets ×~3) · ขอบเขต: ติวเตอร์ที่ eligible < ~10k (D-10) — relevance ใน memory ใช้ได้ที่ขนาดนี้ (เหมือน Catalog)

### 4.4 `SEARCH_LOGS` — ห้ามขวาง response, ทนล้มเหลว
```csharp
public readonly record struct SearchLogEntry(DateTime CreatedAtUtc, Guid? SubjectId, TutorLevel? Level, TutorCurriculum? Curriculum, string? QueryText, int ResultCount);
public interface ISearchLogSink { bool TryEnqueue(in SearchLogEntry entry); }       // ไม่ await ไม่ throw ไม่แตะ DB
```
- `ChannelSearchLogSink : BackgroundService, ISearchLogSink` (Singleton + `AddHostedService` ด้วย instance เดียวกัน): `Channel.CreateBounded<SearchLogEntry>(new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true })` · `TryEnqueue` = `writer.TryWrite` (เต็ม ⇒ คืน false + นับ counter + log warning จำกัดอัตรา 1/นาที) · ลูป: อ่านเป็นชุด ≤100 หรือทุก 2 วิ → `CreateAsyncScope` → `ISearchLogRepository.AddRange` + `SaveChanges` ; **exception ใด ๆ ⇒ log warning (จำนวนแถวเท่านั้น ไม่ log ข้อความค้นหา) แล้วทิ้งชุดนั้น ไม่ retry** · หยุดอย่างปลอดภัยเมื่อ host stop (flush ที่ค้าง ≤ 3 วิ)
- sanitize ที่ตอน enqueue: `QueryText` = trim → collapse whitespace → lower-invariant → ตัดที่ 100 · **ไม่เก็บ (ตั้งเป็น null)** เมื่อมี `@` หรือเลขติดกัน ≥7 หลัก (กันอีเมล/เบอร์โทร) หรือยาว < 2 ตัวอักษร
- การที่ Api และ Workers เรียก `AddTutoringModule` ทั้งคู่ ⇒ hosted service ทำงานในทั้งสอง host (Workers ไม่มีใครเรียก `TryEnqueue` จึงว่าง) — ยอมรับ
- **หมายเหตุความครบของ log:** ค่า default ไม่ output-cache search เพื่อให้ทุกการค้นหา (page 1) ถูกนับ; ถ้าเปิด cache (`Tutoring:Search:OutputCacheSeconds>0`) ยอดจะนับเฉพาะ cache miss (ลำเอียงไปทางคำค้นยอดนิยม) — บันทึกใน config
- job `tutoring-search-log-purge` : `Cron.Daily(3, 30)`, `[DisableConcurrentExecution(timeoutInSeconds: 1500)]` — `DELETE … WHERE CREATED_AT_UTC < now − SearchLogRetentionDays(90)` เป็นชุด ≤5,000 แถว (`ExecuteDeleteAsync` ในลูป จนไม่เหลือหรือครบ 20 ชุด/รัน)
```csharp
// RecurringJobIds.cs :  public const string TutoringSearchLogPurge = "tutoring-search-log-purge";   (+ ใน All)
recurringJobManager.AddOrUpdate<TutoringSearchLogPurgeJob>(RecurringJobIds.TutoringSearchLogPurge, job => job.RunAsync(CancellationToken.None), Cron.Daily(3, 30));
```

### 4.5 โปรไฟล์สาธารณะ `GET tutors/{slug}`
```
1. tutor = WHERE SLUG=@slug AND STATUS='Verified' AND IS_LISTED AND EXISTS(offering active)  → ไม่ผ่าน → 404 tutoring.tutor_not_found (body เดียวกันทุกกรณี: ไม่มี slug / Draft / Suspended / unlisted / ไม่มี offering)
2. ดึง offerings(active)+subjects, educations (ORDER BY SORT_ORDER, YEAR_FROM DESC), certificates (ORDER BY SORT_ORDER, YEAR DESC) แบบ batch
3. intro video: ถ้ามี INTRO_VIDEO_ASSET_ID → IMediaAssetContract.GetAssetSummaryAsync ; Status="Ready" → introVideo {durationSeconds, playbackPath} ; อื่น ๆ → null
4. map ผ่าน DTO allow-list ด้านล่างเท่านั้น (ห้ามคืน entity / ห้าม map แบบ spread) 
```
Cache: `[OutputCache(PolicyName = TutoringOutputCache.ProfilePolicyName)]` — TTL `ProfileCacheSeconds` (60), tag `tutoring-profile`; evict โดย P13-01 services (`InvalidateProfilesAsync`), `TutorModerationService`, KYC decision · ผู้ล็อกอินข้าม cache (default framework) — ยอมรับ
### 4.6 รูป / วิดีโอแนะนำ / วิชา / sitemap
- `GET tutors/{slug}/photo` : tutor eligible ⇒ `PHOTO_STORAGE_KEY` ว่าง ⇒ 404 `tutoring.photo_not_found` · มี ⇒ `IFileStorage.GetSignedUrlAsync(key, PhotoSignedUrlSeconds=600)` ⇒ **302** `Location: <presigned>` + `Cache-Control: public, max-age=300` + `Referrer-Policy: no-referrer` (TTL ของ cache < TTL ของ URL) · storage ไม่พร้อม ⇒ 503 `storage.provider_not_configured` · ไม่ output-cache (redirect มี signature)
- `GET tutors/{slug}/intro-video` : eligible ⇒ มี `INTRO_VIDEO_ASSET_ID` ⇒ `IPublicVideoPlaybackContract.GetPublicPlaybackAsync(assetId, IntroVideoUrlTtl=5 นาที)` ⇒ 200 `{ manifestUrl, expiresAtUtc }` + `Cache-Control: no-store` · ไม่มี/ไม่ Ready ⇒ 404 `tutoring.intro_video_not_found` · provider ล้ม ⇒ 503
- `GET /api/tutoring/subjects?parent=<slug>&page=1&pageSize=200` : `parent` (string, **slug ของวิชาแม่**, optional) — ไม่ส่ง ⇒ ทุกวิชา `IS_ACTIVE` ; ส่ง ⇒ เฉพาะ**ลูก**ของวิชานั้น (ไม่รวมตัวแม่) ; slug ไม่รู้จัก ⇒ หน้าว่าง (200) · วิชา `IS_ACTIVE` เรียง `PARENT_ID NULLS FIRST, SORT_ORDER` ⇒ `PagedResult<PublicSubjectItem>` (pageSize ≤500) · output cache 300 วิ tag `tutoring-subjects`
- sitemap: `GET /sitemap-tutors.xml` (index; ≥1 หน้าเสมอ) และ `GET /sitemap-tutors-{page:int}.xml` (5,000 URL/หน้า, เรียง `TUTOR_ID`, เฉพาะ eligible; `<loc>` = `{PublicBaseUrl}/tutors/{slug}`, `<lastmod>` = `MAX(VerifiedAtUtc, UpdatedAtUtc)`); `[AllowAnonymous]` · rate `tutoring-search` · output cache `TutoringSitemap` 1 ชม. tag `tutoring-sitemap` · ใช้ `XElement` แล้วต่อ `<?xml …?>` ด้วยมือเหมือน `GetSitemapIndexHandler` · หน้าเกินช่วง ⇒ `<urlset>` ว่าง (ถูกต้องตามสเปค) · **ต้องให้ proxy/Caddy ส่งต่อ `/sitemap-tutors*.xml` ไปที่ API** เหมือน `/sitemap-courses-*.xml` (บันทึกใน runbook)

---

## 5. Endpoint ที่ FROZEN (ทุกตัว `[AllowAnonymous]`, rate `tutoring-search` เว้นแต่ระบุ) · error = RFC 9457 + `traceId` + `errorCode` + `reason`
| # | Method + path | Cache | สำเร็จ | Error |
|---|---|---|---|---|
| 1 | `GET /api/tutoring/tutors` | `TutoringSearch` (default `NoCache`) | 200 `TutorSearchResponse` | 400 `tutoring.search_invalid` (ext `field`) · 429 |
| 2 | `GET /api/tutoring/tutors/{slug}` | `TutoringPublicProfile` 60 วิ | 200 `TutorPublicProfileResponse` | 404 `tutoring.tutor_not_found` · 429 |
| 3 | `GET /api/tutoring/tutors/{slug}/photo` | ไม่ cache ฝั่ง server (client 300 วิ) | 302 | 404 `tutoring.tutor_not_found` / `tutoring.photo_not_found` · 503 |
| 4 | `GET /api/tutoring/tutors/{slug}/intro-video` | `no-store` | 200 `IntroVideoPlaybackResponse` | 404 `tutoring.tutor_not_found` / `tutoring.intro_video_not_found` · 503 |
| 5 | `GET /api/tutoring/subjects` | `TutoringSubjects` 300 วิ | 200 `PagedResult<PublicSubjectItem>` | |
| 6 | `GET /sitemap-tutors.xml` · `GET /sitemap-tutors-{page:int}.xml` | `TutoringSitemap` 1 ชม. | 200 `application/xml` | |
กฎร่วม: ไม่มี `userId`/ข้อมูลผู้ใช้ใน request หรือ response · ไม่ตั้ง cookie · เวลา UTC `…Z`

### 5.1 DTO (C#) — **allow-list: ห้ามเพิ่ม field โดยไม่ออก revision ของ contract**
```csharp
public sealed record PublicSubjectItem(Guid SubjectId, string Slug, string NameTh, string NameEn, string? ParentSlug, int SortOrder);

public sealed record TutorSearchSubject(string Slug, string NameTh, string NameEn);
public sealed record TutorSearchItem(
    string Slug, string DisplayName, string? Headline, string? PhotoUrl, TutorGender Gender, int YearsExperience,
    decimal RatingAverage, int RatingCount, int CompletedSessionsCount,
    IReadOnlyList<TutorSearchSubject> Subjects, IReadOnlyList<TutorLevel> Levels, IReadOnlyList<TutorCurriculum> Curricula,
    decimal FromHourlyRate, bool HasGroup, bool HasTrial, bool HasFreeTrial, DateTime? NextAvailableAtUtc);
public sealed record SubjectFacet(string Slug, string NameTh, string NameEn, string? ParentSlug, int Count);
public sealed record LevelFacet(TutorLevel Level, int Count);
public sealed record CurriculumFacet(TutorCurriculum Curriculum, int Count);
public sealed record GenderFacet(TutorGender Gender, int Count);
public sealed record FormatFacet(SessionFormat Format, int Count);
public sealed record HourlyRateRange(decimal Min, decimal Max);
public sealed record TutorSearchFacets(IReadOnlyList<SubjectFacet> Subjects, IReadOnlyList<LevelFacet> Levels, IReadOnlyList<CurriculumFacet> Curricula,
    IReadOnlyList<GenderFacet> Genders, IReadOnlyList<FormatFacet> Formats, int TrialCount, HourlyRateRange? HourlyRate);
public sealed record TutorSearchResponse(PagedResult<TutorSearchItem> Results, TutorSearchFacets? Facets);   // Facets = null เมื่อ facets=false

public sealed record TutorIntroVideoInfo(int DurationSeconds, string PlaybackPath);                           // PlaybackPath = "/api/tutoring/tutors/{slug}/intro-video"
public sealed record IntroVideoPlaybackResponse(string ManifestUrl, DateTime ExpiresAtUtc);
public sealed record PublicTrial(int Minutes, decimal Price, bool IsFree);
public sealed record PublicOffering(Guid OfferingId, TutorSearchSubject Subject, TutorLevel Level, TutorCurriculum Curriculum,
    decimal HourlyRateOneOnOne, decimal? GroupHourlyRatePerSeat, int? GroupMaxSeats, PublicTrial? Trial);
public sealed record PublicEducation(string Institution, string Degree, string? Field, int YearFrom, int? YearTo);
public sealed record PublicCertificate(string Title, string? Issuer, int Year);
public sealed record TutorPublicProfileResponse(
    string Slug, string DisplayName, string? Headline, string Bio, string? PhotoUrl, TutorIntroVideoInfo? IntroVideo, TutorGender Gender, int YearsExperience,
    decimal RatingAverage, int RatingCount, int CompletedSessionsCount, bool Verified, DateTime? VerifiedAtUtc, int MinNoticeHours, int MaxAdvanceDays,
    DateTime? NextAvailableAtUtc, string Timezone, IReadOnlyList<int> AllowedDurationMinutes,
    IReadOnlyList<PublicOffering> Offerings, IReadOnlyList<PublicEducation> Educations, IReadOnlyList<PublicCertificate> Certificates);
```
- `AllowedDurationMinutes` (**E4**) = `Tutoring:Slots:AllowedDurationsMinutes` (default `[30,60,90,120]`, เรียงน้อย→มาก) — ความยาวคลาสที่จองได้ทั้งระบบ ให้ FE สร้างตัวเลือกความยาวโดยไม่ฮาร์ดโค้ด (trial ใช้ `offerings[].trial.minutes` แทน) · อยู่ใน allow-list ของ JSON-walk test
- `TutorIntroVideoInfo.PlaybackPath` (**E3**) = path แบบ ApiService-relative เหมือน endpoint อื่นของสัญญานี้ (**ไม่มี `/api` นำหน้า, มี `/` นำหน้า**): `"/tutoring/tutors/{slug}/intro-video"` — FE ส่งต่อให้ `ApiService` ตรง ๆ (interceptor เติม `/api` + base URL เอง) ; FE จะประกอบจาก slug เองก็ได้ผลเหมือนกัน
- `PhotoUrl` (**E5**) = **path แบบ origin-relative ของ API ที่ขึ้นต้นด้วย `/api/`** — `"/api/tutoring/tutors/{slug}/photo?v={token}"` (ไม่ใช่ absolute URL: API ไม่รู้ origin สาธารณะของตัวเองเพราะไม่มี forwarded-headers จึงไม่ประกอบ absolute ให้) · **FE ต้องแปลงด้วย `resolveApiUrl(photoUrl, environment.apiUrl)`** (ตัวเดียวกับที่ `apiBaseUrlInterceptor` ใช้) ก่อนใส่ `<img src>`/JSON-LD `image` — dev (`apiUrl=''`) ใช้ตรง ๆ ได้ ; **CSP `img-src` ของ FE ต้องมี origin ของ API และ `https://*.r2.cloudflarestorage.com`** (เบราว์เซอร์บังคับ CSP กับปลายทางของ 302 ด้วย) ; รูปแบบนี้ใช้เหมือนกันใน `BookingTutorSummary.photoUrl` (P13-05) · เป็น path ที่ไม่ใช่ presigned URL โดย `token` = 10 ตัวแรกของ base64url(SHA-256(`PHOTO_STORAGE_KEY`)) (cache-bust เมื่อเปลี่ยนรูป; **ไม่เผยส่วนของ key**) หรือ `null`
- ข้อมูลที่ **ไม่มีใน response ใด ๆ ของสัญญานี้**: `tutorId`, `userId`, `instructorProfileId`, อีเมล/เบอร์, `STATUS`/`STATUS_REASON`, `IS_LISTED`, `RELIABILITY_SCORE`, `COMMISSION_*`, `BUFFER_MINUTES`, `ROW_VERSION`, storage key, asset id ของวิดีโอ, ข้อมูล KYC/เอกสาร, ข้อมูลผู้เรียน

---

## 6. Config (`TutoringSearchOptions`, section `Tutoring:Search`; ค่าอื่นของโปรไฟล์ใช้ `Tutoring:Profile:*` จาก P13-01)
| Key | Default | หมายเหตุ |
|---|---|---|
| `DefaultPageSize` / `MaxPageSize` | `12` / `48` | |
| `OutputCacheSeconds` | `0` | 0 = ไม่ cache search (search log นับครบ); >0 ⇒ ยอด log นับเฉพาะ cache miss |
| `ProfileCacheSeconds` | `60` | 1–600 |
| `SubjectsCacheSeconds` | `300` | |
| `SitemapCacheSeconds` | `3600` | |
| `SubjectNameMatchRank` | `40` | |
| `IntroVideoUrlTtlSeconds` | `300` | 60–600 |
| `SearchLog:Enabled` | `true` | false ⇒ sink เป็น no-op |
| `SearchLog:RetentionDays` | `90` | 7–365 |
| `SearchLog:ChannelCapacity` / `BatchSize` / `FlushSeconds` | `1000` / `100` / `2` | |
ใส่ placeholder ใน `appsettings.json` ของ Api และ Workers · ไม่มี secret

## 7. Test checklist
**Unit:** `EscapeLike` (`%`, `_`, `\`, ผสม, Thai) · parser/validator ของ query (priceMin>priceMax, day/from/to ไม่ครบ, `from>=to`, pageSize clamp) · ตัวสร้าง facets/การ map card (ไม่มี N+1 — นับ query ผ่านเทสต์ interceptor/fake) · **DTO allow-list**: reflection เทียบชุด property ของแต่ละ DTO กับค่าคงที่ allow-list ในเทสต์ (เพิ่ม field = เทสต์แดง ต้องแก้สัญญาก่อน) · `ChannelSearchLogSink`: เต็ม ⇒ `TryEnqueue=false` ไม่ throw/ไม่บล็อก; repo ล้ม ⇒ ทิ้งชุดและยังรับต่อ; sanitize (อีเมล/เบอร์/สั้น/ยาว/ช่องว่าง); ไม่เขียน log ข้อความค้นหา · `PublicVideoPlaybackService` · `TutorSitemapService` (หน้า/ลำดับ/XML prolog/เฉพาะ eligible) · `SearchLogPurgeJob` (ชุด ≤5,000, วนจนหมด/ครบ 20 ชุด) · `SEARCH_LOG` ไม่มีคอลัมน์ user/IP (reflection)
**Integration (`SiriApiFactory`, PostgreSQL 17 + `pg_trgm`):**
1. eligibility: seed ติวเตอร์ครบ 6 สถานะ × listed/unlisted × มี/ไม่มี offering active ⇒ เฉพาะ Verified+listed+มี offering ปรากฏทั้งใน search, `{slug}`, slots(P13-03), sitemap; ที่เหลือ ⇒ 404 body เดียวกัน
2. ทุก filter รายตัวและรวมกัน (subject slug ของกลุ่ม ⇒ รวมลูก; level; curriculum; format=Group; ช่วงราคา by format; gender; day+from+to รวม rule ข้ามเที่ยงคืน) · **single-offering semantics**: ติวเตอร์ที่มี offering A (ตรง subject) และ offering B (ตรงราคา) แต่ไม่มีตัวเดียวที่ตรงทั้งคู่ ⇒ ไม่ปรากฏ
3. `q` ภาษาไทย/อังกฤษ/ผสม: ตรงชื่อ, ตรง headline, ตรงชื่อวิชา, `%`/`_` ใน q ไม่ทำหน้าที่ wildcard, q ยาว 500 ตัวถูกตัด, SQL injection string ปลอดภัย
4. sort ทั้ง 6 + pagination เสถียร (หน้า 1+2 ไม่ซ้ำ/ไม่ตกหล่นแม้คะแนนเท่ากัน — ใช้ TUTOR_ID tie-break) · nextAvailable วาง NULL ท้าย
5. facets: นับติวเตอร์ไม่ซ้ำ (ติวเตอร์ที่มี 3 offering ในกลุ่มเดียวกันนับ 1), `facets=false` ⇒ `facets:null` และลดจำนวน query
6. **JSON-walk leak test** (ทั้ง search, profile, subjects, intro-video, sitemap): serialize response → เดินทุก property name ทุกชั้น ต้องเป็นสมาชิกของ allow-list (§5.1) เท่านั้น; และ string ทั้งหมดต้องไม่มีค่า seed ต่อไปนี้: อีเมลผู้ใช้ของติวเตอร์, เบอร์โทรปลอมที่ seed, `userId`/`instructorProfileId`/`tutorId`/`INTRO_VIDEO_ASSET_ID`/`PHOTO_STORAGE_KEY` (ทั้งค่าเต็มและส่วน `tutoring/photos/`), ข้อความ `kyc`, `commission`, `reliability`, `statusReason`, `rowVersion`, `documentId`
7. `SEARCH_LOGS`: ค้นด้วย q ⇒ มีแถว (รอ flush) · ไม่มีแถวเมื่อ page>1 หรือไม่มี filter · แถวไม่มีคอลัมน์ผู้ใช้ · **จำลอง DB ล้มระหว่าง flush (เช่น drop ตารางใน test schema/ใช้ repo ที่ throw) ⇒ search ยังตอบ 200 และ hosted service ไม่ตาย**
8. output cache: `GET {slug}` สองครั้ง ⇒ query ครั้งเดียวภายใน TTL; แก้โปรไฟล์ผ่าน P13-01 ⇒ ครั้งถัดไปเห็นค่าใหม่ทันที (tag evict); ผู้ล็อกอิน (มี `Authorization`) ข้าม cache · search ไม่ cache ตาม default
9. rate limit `tutoring-search` ครั้งที่ 121 ใน 60 วิ ⇒ 429 (ProblemDetails + Retry-After + no-store)
10. photo: ไม่มีรูป ⇒ 404; มี ⇒ 302 ไป URL ที่ลงชื่อ, `Cache-Control: public, max-age=300`, Location ไม่ถูกบันทึกลง log, `PhotoUrl` ใน profile ไม่มีส่วนของ key · intro-video: ไม่ Ready ⇒ 404; Ready ⇒ 200 `no-store`; asset ของ tutor อื่นไม่หลุด (endpoint ไม่รับ asset id)
11. sitemap: เฉพาะ eligible, ลำดับ `TUTOR_ID`, 5,001 ติวเตอร์ ⇒ index มี 2 หน้า, XML prolog ถูก
12. **EXPLAIN test** (กันดัชนีไม่ถูกใช้ตอนข้อมูลโต): seed ≥2,000 ติวเตอร์ eligible, `SET LOCAL enable_seqscan = off` แล้ว `EXPLAIN` query ข้อ 5a / sort rating / nextAvailable ⇒ แผนอ้างชื่อดัชนีใน §2.2 (ยืนยัน partial-index implication ของ `HasFilter`)
13. migration: `AddTutorSearch` บน PG17 ผ่าน, ดัชนีครบตามชื่อ, ไม่มี drop · ทุก action มี `[AllowAnonymous]` (reflection) และไม่มี `[Authorize]` โดยไม่ตั้งใจ

## 8. Work packages
| WP | ใคร | ทำอะไร | Acceptance |
|---|---|---|---|
| **A** | `DATABASE` | `SEARCH_LOG` entity/config + เพิ่ม index ใน config เดิมของ P13-01 + migration `AddTutorSearch` + `docs/DATABASE.md` | architecture เขียว (identifier ≤63) · ไม่ apply DB จริง · migration มีแต่ `CreateTable`/`CreateIndex` |
| **B** | `backend-developer` | `IPublicVideoPlaybackContract` + `PublicVideoPlaybackService` (Media) + unit | Media architecture เขียว · เพิ่มไฟล์ใหม่เท่านั้น |
| **C** | `backend-developer` | `TutorSearchService`, `TutorPublicProfileService`, `SubjectQueries`, `ChannelSearchLogSink` + repo + job purge, `TutorSitemapService`, DTO, Options, invalidator เพิ่มเมธอด | unit §7 |
| **D** | `backend-developer` | `TutoringPublicController` (+sitemap controller) + output-cache policies + rate-limit + job registration + appsettings | ทุก action `[AllowAnonymous]` ชัดเจน |
| **E** | `backend-developer` | integration tests §7 (รวม JSON-walk + EXPLAIN) | เขียนครบ (รายงานว่ายังไม่เคยรันถ้าไม่มี Docker) |
ขนานได้: A ∥ B · C หลัง A · `DONE` โดย integrator-qa · **ห้ามแตะ** `Siri.Modules.Catalog/**` และ `Siri.SharedKernel/Search/**` · **ห้าม commit เอง**

## 9. FE notes (P13-20/21 — Antigravity ทำได้เมื่อ FROZEN)
- `/tutors` (SSR + `SeoService`): ทุก filter/sort/page อยู่ใน **query string (single source of truth)** กด back ไม่รีเซ็ต · แสดงจำนวนผลทันที · facets จาก `facets` (ส่ง `facets=false` เมื่อ page>1) · การ์ด: รูป (`NgOptimizedImage` + กันขนาด), ชื่อ, headline, ★ (แสดงเมื่อ `ratingCount>0`), วิชา, "เริ่มต้น ฿{fromHourlyRate}/ชม.", ป้าย "ทดลองเรียนฟรี" (`hasFreeTrial`), "ว่างเร็วสุด" จาก `nextAvailableAtUtc` · empty state บอกทางไปต่อ (ล้างตัวกรอง) · ช่องวัน-เวลาอธิบายว่า "ติวเตอร์ที่ตั้งเวลานี้เป็นช่วงว่าง" 
- `/tutors/:slug` (SSR): `SeoService` — title `{displayName} — ติวเตอร์ {วิชาหลัก}`, canonical ไม่รวม query, JSON-LD `Person` (`name`, `description`=bio ตัด 300, `image`=URL เต็มของ `photoUrl`, `jobTitle`=headline, `knowsAbout`=ชื่อวิชา, **`aggregateRating` เฉพาะ `ratingCount>0`**) + `BreadcrumbList`; ไม่ใส่ `Review` จนกว่าจะมีรีวิวจริง (P13-13) · `<img src>` = `resolveApiUrl(photoUrl, environment.apiUrl)` (กติกา E5 ข้างบน; browser ตาม 302 เอง) · วิดีโอแนะนำ `@defer (on viewport)` + `@placeholder` กัน CLS, เรียก `playbackPath` เมื่อผู้ใช้กดเล่น, ซ่อนบล็อกเมื่อ 404/503 · ปฏิทิน slot = P13-21 ใช้ endpoint ของ P13-03
- **canonical / robots (E6 — ตัดสินแล้ว ไม่มีข้อขัดกัน):** `/tutors` (ไม่มี query) : `canonical = /tutors`, **ไม่ noindex** (index ได้) · `/tutors?<filters/sort/page>` : `canonical` ชี้ `/tutors` เปล่า (ไม่ใช่ตัวเอง) และ**ไม่ noindex** (ให้ crawler ตาม link ได้ แต่รวมสัญญาณไปที่ `/tutors`) · `/tutors/:slug` : `canonical = /tutors/:slug` (ไม่รวม query) · **slug ที่ไม่พบ (API 404 `tutoring.tutor_not_found`) ⇒ SSR ตอบ HTTP 404 จริง + `noindex`** (ไม่ใช่ 200 ที่แสดงข้อความ "ไม่พบ")
- i18n `tutoring.public.*` (หน้า `/tutors`, `/tutors/:slug`), `tutoring.slots.*`, `tutoring.enums.*`, `tutoring.errors.*` (th+en) — convention กลางที่ README §6 · token/`tone-*` เท่านั้น · loading/error/empty ครบ

## Deviations from TUTORING.md
| # | ใน TUTORING.md | ที่ contract นี้ทำ | เหตุผล |
|---|---|---|---|
| D1 | `q` = "ชื่อ/headline" | + ชื่อวิชา (th/en) และ bio ใช้เฉพาะ rank | ผู้ใช้พิมพ์ "ฟิสิกส์" ต้องเจอ |
| D2 | filter `subject` | รับ slug ของกลุ่มและรวมลูก | taxonomy 2 ระดับ |
| D3 | sitemap "แยกจากของคอร์ส" | `sitemap-tutors*.xml` แยก + ไม่แตะ index/robots ของ Catalog | Catalog มี session อื่นค้างอยู่ (Meilisearch) |
| D4 | วิดีโอแนะนำ (TM-02) ไม่ระบุวิธีเล่นสาธารณะ | endpoint `intro-video` + Media contract ใหม่ | เล่นผ่าน `PlaybackSessionService` ไม่ได้ (ผูก entitlement) |
| D5 | `PHOTO_STORAGE_KEY` ไม่ระบุวิธีเสิร์ฟ | `GET …/photo` → 302 presigned | bucket private, ไม่มี CDN |
| D6 | `GET subjects` | คืน `PagedResult` (pageSize default 200) | กฎ "ทุก list ต้อง paginate" |
| D7 | search ไม่ระบุ cache | **ไม่ cache ตาม default** | ให้ search log นับครบ |

## Open decisions (defaulted)
1. facet คำนวณจากฐานก่อน filter (แนว Catalog v1) — ปรับเป็น "ลบมิติของตัวเอง" ภายหลังได้โดย shape เดิม · 2. ตัวกรองวัน-เวลา = "rule ครอบคลุม" ไม่ใช่ "ว่างจริง ณ ตอนนี้" · 3. **การเล่นวิดีโอแนะนำยังไม่ยืนยันกับ MediaCage Basic/Embed-only (Q1)** — FE ต้องรองรับกรณีเล่นไม่ได้ · 4. โยง `sitemap-tutors.xml` เข้า `/sitemap.xml` + `robots.txt` ต้องแก้ Catalog (`ISitemapSectionProvider`) — ทำเป็นงานแยกหลัง session Meilisearch จบ; ระหว่างนี้ส่ง URL เข้า Search Console ตรง ๆ · 5. rate limit ต่อ IP = เพดานรวม (ไม่มี forwarded-headers) · 6. รูปไม่ตัด EXIF (P13-01 Open #4) · 7. ไม่ทำ typo-tolerant ภาษาไทยนอกเหนือจาก trigram

## Frontend DTO appendix (TypeScript)
```ts
type Guid = string; type IsoUtc = string;
type TutorGender = 'Male'|'Female'|'Other'|'Undisclosed';
type TutorLevel = 'Primary'|'LowerSecondary'|'UpperSecondary'|'University'|'Competitive'|'Adult';
type TutorCurriculum = 'Thai'|'EP'|'International';
type SessionFormat = 'OneOnOne'|'Group';
type TutorSort = 'relevance'|'rating'|'priceAsc'|'priceDesc'|'nextAvailable'|'newest';
interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number; totalPages: number; }

interface TutorSearchQuery { q?: string; subject?: string; level?: TutorLevel; curriculum?: TutorCurriculum; format?: SessionFormat; priceMin?: number; priceMax?: number;
  gender?: TutorGender; day?: 0|1|2|3|4|5|6; from?: string /*HH:mm*/; to?: string; sort?: TutorSort; page?: number; pageSize?: number; facets?: boolean; }
interface TutorSearchSubject { slug: string; nameTh: string; nameEn: string; }
interface TutorSearchItem {
  slug: string; displayName: string; headline: string|null; photoUrl: string|null; gender: TutorGender; yearsExperience: number;
  ratingAverage: number; ratingCount: number; completedSessionsCount: number; subjects: TutorSearchSubject[]; levels: TutorLevel[]; curricula: TutorCurriculum[];
  fromHourlyRate: number; hasGroup: boolean; hasTrial: boolean; hasFreeTrial: boolean; nextAvailableAtUtc: IsoUtc|null;
}
interface SubjectFacet extends TutorSearchSubject { parentSlug: string|null; count: number; }
interface TutorSearchFacets {
  subjects: SubjectFacet[]; levels: { level: TutorLevel; count: number }[]; curricula: { curriculum: TutorCurriculum; count: number }[];
  genders: { gender: TutorGender; count: number }[]; formats: { format: SessionFormat; count: number }[]; trialCount: number; hourlyRate: { min: number; max: number }|null;
}
interface TutorSearchResponse { results: PagedResult<TutorSearchItem>; facets: TutorSearchFacets|null; }

interface PublicSubjectItem { subjectId: string; slug: string; nameTh: string; nameEn: string; parentSlug: string|null; sortOrder: number; }   // GET /api/tutoring/subjects ⇒ PagedResult<PublicSubjectItem> (ชื่อเดียวกับ C# ; ?parent=<slug แม่>&page&pageSize)

interface TutorIntroVideoInfo { durationSeconds: number; playbackPath: string /* "/tutoring/tutors/{slug}/intro-video" — ApiService-relative, ไม่มี /api */; }
interface IntroVideoPlayback { manifestUrl: string; expiresAtUtc: IsoUtc; }
interface PublicTrial { minutes: 15|30; price: number; isFree: boolean; }
interface PublicOffering { offeringId: Guid; subject: TutorSearchSubject; level: TutorLevel; curriculum: TutorCurriculum; hourlyRateOneOnOne: number; groupHourlyRatePerSeat: number|null; groupMaxSeats: number|null; trial: PublicTrial|null; }
interface PublicEducation { institution: string; degree: string; field: string|null; yearFrom: number; yearTo: number|null; }
interface PublicCertificate { title: string; issuer: string|null; year: number; }
interface TutorPublicProfile {
  slug: string; displayName: string; headline: string|null; bio: string; photoUrl: string|null; introVideo: TutorIntroVideoInfo|null; gender: TutorGender; yearsExperience: number;
  ratingAverage: number; ratingCount: number; completedSessionsCount: number; verified: boolean; verifiedAtUtc: IsoUtc|null; minNoticeHours: number; maxAdvanceDays: number;
  nextAvailableAtUtc: IsoUtc|null; timezone: 'Asia/Bangkok'; allowedDurationMinutes: number[]; offerings: PublicOffering[]; educations: PublicEducation[]; certificates: PublicCertificate[];
}
```
`reason` → i18n: `tutoring.search_invalid` (ext `field`), `tutoring.tutor_not_found`, `tutoring.photo_not_found`, `tutoring.intro_video_not_found`

## Changelog
- **2026-10-14 รอบ 2 (cross-contract review + errata จาก FE public):** E1 ระบุฐาน `day` = 0 อาทิตย์ · E2 `GET subjects` = `PagedResult<PublicSubjectItem>`, `parent` = slug วิชาแม่, TS ชื่อ `PublicSubjectItem` · E3 `introVideo.playbackPath` = `"/tutoring/tutors/{slug}/intro-video"` (ApiService-relative ไม่มี `/api`) · E4 เพิ่ม `allowedDurationMinutes` ใน `TutorPublicProfileResponse` (จาก `Tutoring:Slots:AllowedDurationsMinutes`) · E5 `photoUrl` = path origin-relative ขึ้นต้น `/api/` + FE ต้อง `resolveApiUrl(...)` + CSP `img-src` ต้องมี API origin และ `*.r2.cloudflarestorage.com` · E6 canonical/robots: `/tutors` ไม่ noindex, `/tutors?…` canonical → `/tutors`, tutor ไม่พบ = HTTP 404 + noindex · `SessionFormat` ประกาศที่ P13-01 (ไม่ใช่ที่นี่) · `TutorPriceCalculator` ไม่ได้ถูกเรียกที่ P13-04
- **2026-10-14 รอบ 3 (errata จาก FE tutor portal P13-24):** `PublicSubjectItem` เพิ่ม `SubjectId` (Guid / TS `subjectId: string`) เป็นฟิลด์แรก — ติวเตอร์ใช้เป็น `UpsertOfferingRequest.subjectId` ตอนเพิ่ม offering (เดิมไม่มี id ใน DTO สาธารณะ ทำให้เลือกวิชาไม่ได้) · id ของวิชาไม่ใช่ข้อมูลอ่อนไหว (วิชาเป็นข้อมูลสาธารณะ) · เพิ่ม assertion ใน test JSON-walk ของ allow-list ว่า `subjectId` มีเฉพาะใน `/subjects` ไม่ใช่ในโปรไฟล์ติวเตอร์/ผลค้นหา

- **Changelog 2026-10-15 hardening (P13-33):** (L9) `GET /sitemap-tutors-{page}.xml` ให้บริการเฉพาะ **page 1..100000**; ค่าอื่น (0, ลบ, > 100000) = **404** ไม่ cache ไม่แตะ DB (เดิมทุกเลขเป็น cache entry + query ของตัวเอง) — ข้อความ "หน้าเกินท้ายสุดคือ urlset ว่าง" ยังใช้กับ 1..100000 · output-cache policy `TutoringPublicProfile` และ `TutoringSitemap` **ไม่ vary ตาม query string** (`SetVaryByQuery()` ว่าง) เพื่อไม่ให้ `?x=1`, `?x=2` … สร้าง entry ใหม่ทุกค่า; policy search/subjects/slots ยัง vary ด้วย `*`
