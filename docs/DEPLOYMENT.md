# Deployment — Contabo VPS (self-hosted)

> Current integration setup (2026-09-08): use the PostgreSQL 17 Compose files and commands in [README.md](../README.md). The SQL Server deployment notes below are historical and do not describe the current database provider. The local stack uses `docker-compose.dev.yml`; production uses `docker-compose.prod.yml` with an explicit migration service.

> **ตัดสินใจแล้ว (Q3):** deploy บน **Contabo VPS** ที่มีอยู่แล้ว ไม่ใช้ cloud managed service
> วิดีโอและ bandwidth หนักอยู่ที่ Bunny Stream อยู่แล้ว VPS จึงรับแค่ API + SSR + DB

## ✅ สถานะจริงของ MSSQL (ตรวจสอบแล้ว 2026-08-17)

มี SQL Server รันอยู่บน Contabo แล้ว: `217.217.253.122,1433` (เครื่อง `vmi3262952`)
**Edition = Developer** (ตรวจจาก `SERVERPROPERTY('Edition')` โดยตรง) ใช้ร่วมกับ database โปรเจ็คอื่นของเจ้าของระบบอยู่แล้ว: `MRMOOMOVIE`, `SIRIEDUMARKET`, `SIRISTUDIOPHOTO`

Database `SIRIUPSKILL` มีเตรียมไว้แล้ว (เดิมว่างเปล่า) — ตั้งค่าให้แล้ว:
- Collation → `Thai_100_CI_AS_SC_UTF8`
- Login แอปเฉพาะ `siriupskill_app` สิทธิ์ `db_owner` จำกัดเฉพาะ `SIRIUPSKILL` เท่านั้น (ตรวจแล้วว่าเข้า DB อื่นบนเครื่องเดียวกันไม่ได้) — **แอปจะไม่ใช้ `sa` เชื่อมต่อ**

## ⚠️ 2 เรื่องที่ยังต้องจัดการ

### 1. License ของ SQL Server — Developer ใช้ production ไม่ได้

| Edition | ค่าใช้จ่าย | ข้อจำกัด | ใช้ production ได้ไหม |
|---------|-----------|---------|---------------------|
| **Developer** ← **ตัวที่ใช้อยู่ตอนนี้** | ฟรี | ไม่จำกัดฟีเจอร์ | ❌ **ห้ามใช้ production เด็ดขาด** (ผิด license) |
| **Express** | ฟรี | **10 GB ต่อ database**, RAM buffer pool ~1.4 GB, 4 cores | ✅ ได้ แต่ต้องจัดการขนาด |
| **Standard** | มีค่า license ต่อ core | 128 GB RAM | ✅ |

ใช้ Developer edition ระหว่างพัฒนา (P0–P6) ได้เต็มที่ ไม่มีปัญหาอะไร — **แต่ต้องตัดสินก่อนเข้า P7 (hardening & launch)** ว่าจะ:
(a) ซื้อ license Standard ให้เครื่องเดียวกัน หรือ
(b) ย้ายไป Express + แยก `WatchEvents` เป็น database ต่างหาก + purge 90 วัน (ดูแผนเดิมด้านล่าง) หรือ
(c) ย้ายไป PostgreSQL (ไม่มีทั้งค่า license และเพดานขนาด — แต่เอกสารทั้งหมดตอนนี้ยึดตาม MSSQL)

**แผนสำรองถ้าไปทาง Express:**
- แยก `WatchEvents` (ตัวที่โตเร็วที่สุด) ไปเป็น **database คนละตัว** — Express นับ 10 GB *ต่อ database* ไม่ใช่ต่อ instance
- purge `WatchEvents` ที่เก่ากว่า 90 วัน หลัง rollup ลง `analytics.*` แล้ว
- เก็บภาพสลิป/ไฟล์แนบไว้ที่ storage ไม่ใช่ใน DB
- ตั้ง alert ที่ 7 GB → เตรียมย้ายไป Standard หรือ PostgreSQL

### 2. Port 1433 เปิดออกอินเทอร์เน็ตสาธารณะ 🔴

เครื่องนี้ต่อได้จากอินเทอร์เน็ตทั่วไปโดยตรง (ทดสอบแล้วจากเครื่อง dev คนละที่กับ VPS) และ**ใช้ร่วมกับโปรเจ็คอื่น** — ถ้า `sa` รั่วหรือถูกเดารหัส เสี่ยงข้อมูลทุกโปรเจ็คบนเครื่องพร้อมกัน ไม่ใช่แค่ SIRI UpSkill
สิ่งที่ควรทำโดยเร็วที่สุด (ต้องมีสิทธิ์ SSH เข้า VPS):
- จำกัด firewall (ufw/iptables) ให้พอร์ต 1433 รับเฉพาะ IP ที่รู้จัก (เครื่อง dev, เครื่องรัน API จริง)
- เปลี่ยนรหัส `sa` เป็นระยะ และเก็บไว้ใช้เฉพาะงาน admin เท่านั้น (แอปใช้ `siriupskill_app` ตามที่ตั้งไว้แล้ว)
- พิจารณาเปลี่ยนเป็นเข้าถึงผ่าน SSH tunnel/VPN แทนการเปิดพอร์ตตรงในระยะยาว
- เมื่อ API ย้ายไป deploy บน VPS เครื่องเดียวกันจริงจัง (ตาม docker network ที่ออกแบบไว้เดิม) ให้ปิด 1433 ออกเน็ตไปเลย เหลือแค่ local docker network

## Sizing ที่แนะนำ

| ทรัพยากร | ขั้นต่ำ | แนะนำ |
|---------|--------|-------|
| vCPU | 4 | 6–8 |
| RAM | 8 GB | 16 GB (MSSQL กินเยอะ) |
| Disk | 100 GB NVMe | 200 GB+ |
| Bandwidth | — | วิดีโอไม่ผ่าน VPS (Bunny CDN จัดการ) จึงไม่ใช่คอขวด |

## Stack บนเครื่อง (Docker Compose)

```
caddy            → reverse proxy + TLS อัตโนมัติ (Let's Encrypt) + security headers + rate limit ชั้นนอก
angular-ssr      → Node container รัน Angular SSR (หน้า public)
api              → ASP.NET Core 10 Web API (Hangfire Client + Dashboard + Processing Server + Recurring Jobs เป็นค่า default — ดู "Background jobs" ด้านล่าง)
workers          → .NET 10 Worker Service (ทางเลือก: Hangfire Processing Server + Recurring Jobs แยก process)
mssql            → SQL Server (persistent volume + tempdb แยก)
redis            → cache + session/device registry
seq              → เก็บ log แบบ query ได้
backup           → sidecar cron: dump DB → บีบอัด → เข้ารหัส → อัปขึ้น off-site
uptime-kuma      → เช็ค uptime + แจ้งเตือน
```

## Background jobs (Hangfire) — ใครรัน job server

งานเบื้องหลังทั้งหมด (ส่งอีเมล outbox, สร้างห้อง Live/Meet, invite + reminder ของคาบสด, recount enrollment, reconcile การจ่ายเงิน, ...) **ทำงานก็ต่อเมื่อมี Hangfire processing server รันอยู่เท่านั้น** — ถ้าไม่มี: ห้อง Live ค้าง "รอ", ไม่มีอีเมลยืนยัน/เชิญ/เตือนส่งออกเลย

| ทางเลือก | ตั้งค่า | เมื่อไหร่ใช้ |
|---|---|---|
| **API รัน server เอง** (default) | ไม่ต้องตั้งอะไร (`Hangfire__ServerInApi=true` เป็นค่า default) | deploy container เดียว (image `Dockerfile.api` รันแค่ `Siri.Api`) — ครบในตัว |
| **แยก Workers** | `Hangfire__ServerInApi=false` ที่ API + deploy `Siri.Workers` | อยาก scale/restart งานเบื้องหลังแยกจาก web |
| **ทั้งสองอย่างพร้อมกัน** | (ปล่อย default + deploy Workers เพิ่ม) | ปลอดภัย — ดูด้านล่าง |

- ตัวแปรเดียว: `Hangfire:ServerInApi` (env `Hangfire__ServerInApi`, bool, default **true**) — API ใช้โค้ดชุดเดียวกับ Workers เป๊ะ (`AddHangfireWorker` → queue/จำนวน worker เท่ากัน) และ schedule recurring job ชุดเดียวกัน **id เดียวกัน** (`RecurringJobIds`) ใน `Siri.Workers`. ใน environment `IntegrationTest` ค่า default คือ false (เทสต์ไม่สตาร์ท job เอง) · dev (`scripts/dev.ps1`) ตั้ง `false` เพราะรัน Workers แยกอยู่แล้ว
- **รัน API server + Workers พร้อมกันได้ ไม่ซ้ำซ้อนอันตราย**: (1) recurring job ถูกเก็บใน storage เดียว key ด้วย id → ลงทะเบียนซ้ำ = เขียนทับ definition เดิม ไม่เกิด job ที่สอง (2) scheduler ของ Hangfire ใช้ distributed lock ใน storage จึง enqueue แต่ละรอบ **ครั้งเดียว** ไม่ว่ามีกี่ server (3) job ที่เขียน/ส่งของออกนอกระบบทุกตัวมี `[DisableConcurrentExecution]` (lock อยู่ใน storage → กันข้าม server ด้วย): email outbox, live sync/invite/reminder, announcement, order expiry, stripe reconciliation, analytics, pdpa, bunny poll (4) ที่เหลือ 3 ตัวไม่มี lock โดยตั้งใจเพราะ idempotent — `course-enrollment-recount` (นับใหม่จาก enrollment จริง ทีละแถวใน transaction + row lock), `playback-anomaly-detection` (อ่านอย่างเดียว เขียนแค่ audit), `course-search-reindex` (upsert ตาม course id) — มีเทสต์ล็อกไว้ (`HangfireHostingTests`) ว่า job ใหม่ต้องมี lock หรือขึ้น allow-list พร้อมเหตุผล
- ข้อควรระวัง: ถ้า pod ของ API ถูก restart/scale-down กลางงาน Hangfire จะรัน job นั้นซ้ำเอง (at-least-once) — job ทั้งหมดออกแบบให้ idempotent อยู่แล้ว (มี idempotency key / status transition) · ตั้ง `terminationGracePeriodSeconds` ≥ 30 วินาที
- **ตรวจว่าระบบ Live ใช้งานได้จริงไหม**: `GET /api/live/admin/status` (Admin เท่านั้น) บอก job server รันอยู่ไหม, recurring job ลงทะเบียน/รันล่าสุดเมื่อไหร่, อีเมล (provider/ค้าง/ล้มเหลว), Live provider/Google/public URL, จำนวนห้องที่ค้าง และ `warnings` เป็นรหัสคงที่ (`no_job_server`, `email_unconfigured`, `outbox_backlog`, `public_base_url_not_https`, `google_not_configured`, `meetings_stuck_pending`, ...) · Production จะ log สรุปรหัสเดียวกันนี้ **บรรทัดเดียว** (level Warning) ~90 วินาทีหลัง start — ค้นใน log ด้วยคำว่า `Live system check`

## Admin คนแรกของ DB ว่าง (Owner bootstrap) + runbook เปิดระบบ Live

- ตั้ง env `Identity__Bootstrap__OwnerEmails__0` (`__1`, `__2` ... เพิ่มได้) เป็นอีเมลเจ้าของระบบ (**ไม่ใช่ secret**) · เจ้าของ**สมัครบัญชีเองตามปกติ + ยืนยันอีเมล** แล้ว `OwnerBootstrapService` (`src/Siri.Api/Bootstrap/`, ตรวจทุก 30 วินาทีจนทุกคนครบ แล้วหยุด) จะให้ role ทั้งสี่ (Learner/Instructor/Admin/SuperAdmin) + โปรไฟล์ผู้สอนที่อนุมัติแล้ว — เฉพาะบัญชีที่ **มีอยู่แล้วและ Active** (ไม่สร้างบัญชี ไม่แตะรหัสผ่าน ไม่ให้บัญชีที่ยังไม่ยืนยันอีเมล) · ไม่ต้อง restart · role มีผลตอน login ครั้งถัดไป · ไม่ตั้งค่า = ไม่ทำอะไรเลย · ใช้ได้ทุก environment รวม Production (ต่างจาก `--seed` ที่ห้ามใน Production)
- ขั้นตอนเปิดระบบคอร์สสอนสดทั้งหมด (env ที่ต้องมี, Google Cloud, เช็คครั้งแรกบนเบราว์เซอร์, ตารางแก้ปัญหา): **[`docs/runbooks/live-course-go-live.md`](runbooks/live-course-go-live.md)**

Subdomain: `siriupskill.com` (SSR) · `api.siriupskill.com` · `admin.siriupskill.com` · `staging.siriupskill.com`

⚠️ **ตั้งค่า `caddy` ให้ forward header บอก scheme จริงไปหา `angular-ssr`** (`X-Forwarded-Proto`/`Forwarded` — Caddy's `reverse_proxy` ทำให้อัตโนมัติอยู่แล้วโดย default ปกติ ไม่ต้องเพิ่ม directive พิเศษ แค่ต้อง**ยืนยัน**ตอน deploy จริง) แล้วตั้ง env `NG_TRUST_PROXY_HEADERS=true` ให้ container `angular-ssr` — ถ้าไม่ทำ Angular SSR (`SeoService`, task P1-24) จะเข้าใจผิดว่า request เป็น `http://` เสมอ (เช็คจาก `socket.encrypted` ตรง ๆ แทน) เพราะ Caddy→Node เป็น plain HTTP ภายใน docker network แม้ฝั่งผู้ใช้เข้าผ่าน `https://` จริง — canonical/OG URL ในหน้า SSR จะผิดเป็น `http://...` เงียบ ๆ ถ้าลืมข้อนี้

## Meilisearch (ค้นหาคอร์ส + ชื่อผู้สอน — D-22)

ตั้งค่าเป็น env ให้ **ทั้ง API และ Workers** (ทั้งสองโหลด `AddCatalogModule`; Workers เป็นคนรัน job `course-search-reindex`):

| env | ความหมาย |
|---|---|
| `Meilisearch__Url` | base URL ของ Meilisearch เช่น `http://host:7700` (ว่าง = ปิดฟีเจอร์ ใช้ `pg_trgm`) |
| `Meilisearch__ApiKey` | **secret** — key ที่ต้องมีสิทธิ์ `search`, `documents.add`, `documents.get`, `documents.delete`, `indexes.create`, `indexes.get`, `settings.update`, `tasks.get` (master key ใช้ได้) · ว่างหรือ `CHANGE_ME` = ปิดฟีเจอร์ |
| `Meilisearch__DocumentsIndexUid` | uid ของ index (default `siriupskill_documents`; ใช้ได้เฉพาะ `A-Z a-z 0-9 - _`) |
| `Meilisearch__Enabled` | `false` = ปิดทันทีทั้งที่ตั้งค่าครบ (default `true`) |

- ตั้งแล้ว restart → ตอน start API จะสร้าง index + settings และเติมให้เองถ้า index ว่าง (log: `Meilisearch index is ready…` / `initial reindex indexed N`) ไม่ต้องสั่งอะไรเพิ่ม · ถ้าไม่ได้ผลดู log บรรทัด `Meilisearch course search is off (...)` จะบอกเหตุผล (ไม่มี URL / key ยังเป็น `CHANGE_ME` / ถูกปิด)
- ตรวจสถานะ: `GET /api/catalog/admin/search/status` (Admin) → `enabled`, `reachable`, `indexedCourses` เทียบ `publishedCoursesInDatabase` · สั่งสร้างใหม่ทั้งหมด: `POST /api/catalog/admin/search/reindex`
- **ความปลอดภัย:** ถ้า URL เป็น `http://` ไป public IP ตัว bearer key วิ่งแบบไม่เข้ารหัส → ใช้ `https://` (reverse proxy หน้า Meilisearch) หรือ private network, แนะนำสร้าง key แยกที่จำกัด action ตามตารางด้านบนแทน master key และอย่า commit ลงไฟล์ใด ๆ (`.env_prd`/Jenkins credentials เท่านั้น)
- Meilisearch ล่มไม่ทำให้เว็บล่ม — ค้นหาตกกลับไป PostgreSQL อัตโนมัติ (ดู `ARCHITECTURE.md` § 6)

## CI/CD

```
push → GitHub Actions:
  build + unit test + integration test (Testcontainers) + architecture test
  → build docker image (api, ssr) → push GHCR
  → ssh เข้า Contabo → docker compose pull && up -d (staging)
  → smoke test
  → manual approve → deploy production
  → รัน EF migration bundle แยกขั้นตอน (ไม่ใช่ตอน app start)
```
- Migration ขึ้น production ด้วย **bundle** เท่านั้น และ **backup ก่อนรันทุกครั้ง**
- สร้าง bundle ด้วย `backend/scripts/migrate-bundle.sh` (self-contained, `linux-x64` — ตรงกับ VPS/Docker target ด้านบน) ไม่ฝัง connection string ไว้ในไฟล์ — ส่งตอนรันจริงผ่าน `--connection` หรือ env `ConnectionStrings__Default`, ต้องก็อบ `appsettings.json` ไปวางข้าง ๆ ด้วย (ดู comment ในสคริปต์)
- Zero-downtime: รัน 2 replica ของ api หลัง caddy + health check (ต้องออกแบบ migration ให้ backward compatible: เพิ่มคอลัมน์ก่อน → deploy โค้ด → ค่อยลบของเก่าในรอบถัดไป)

## Backup & DR (สำคัญมากเพราะ self-host = ไม่มีใครกู้ให้)

- Full backup รายวัน + transaction log ทุก 1 ชั่วโมง
- เก็บ **off-site** (Bunny Storage หรือ Backblaze B2) — เก็บบน VPS เครื่องเดียวกันไม่นับเป็น backup
- เข้ารหัสไฟล์ backup ก่อนอัป
- เก็บย้อนหลัง 30 วัน + snapshot รายเดือน 12 เดือน
- **ซ้อมกู้จริงทุกไตรมาส** และบันทึกเวลาที่ใช้ (ถ้าไม่เคยซ้อม = ไม่มี backup)
- RPO เป้าหมาย ≤ 1 ชม. · RTO ≤ 4 ชม.

## Hardening เครื่อง

- SSH: key-only, ปิด root login, เปลี่ยน port, fail2ban
- ufw: เปิดแค่ 22 (จำกัด IP ถ้าทำได้), 80, 443 — **MSSQL 1433 และ Redis 6379 ห้ามเปิดออกเน็ตเด็ดขาด** (อยู่ใน docker network เท่านั้น)
- Redis ต้องตั้ง password + `bind` ภายใน; MSSQL sa password แข็งแรงและเก็บใน secret
- อัปเดต OS อัตโนมัติ (unattended-upgrades) + รีบูตตามรอบที่กำหนด
- Docker: ห้าม mount docker socket เข้า container ที่รับ request จากภายนอก
- ตั้ง swap 4–8 GB กัน OOM ตอน MSSQL พีค

## Monitoring & alert

> **อัปเดต 2026-09-21:** Uptime Kuma (`https://kuma.siristudiophoto.com/`) และ .NET Aspire
> Dashboard (`https://monitor.siristudiophoto.com/`, แทนที่แผน Seq เดิมด้านล่าง) รันอยู่จริงบน
> VPS แล้ว (shared ข้ามหลายโปรเจ็คบนเครื่องเดียวกัน) — ขั้นตอนตั้งค่าละเอียดอยู่ที่
> `docs/runbooks/uptime-and-log-monitoring-setup.md` ค้างอยู่ 2 อย่างที่ต้องเจ้าของโปรเจ็คทำเอง
> (login Kuma เพิ่ม monitor + รันคำสั่งเดียวบน VPS หา OTLP endpoint จริง) — Claude Code ทำแทนไม่ได้
> ทั้งคู่ (ห้ามกรอกรหัสผ่าน + ไม่มีสิทธิ์ SSH เข้า production โดยตรง)

- Uptime Kuma: เช็ค `/health`, หน้าแรก, และ Bunny playback ตัวอย่าง
- Netdata หรือ Prometheus+Grafana: CPU / RAM / disk / IO
- ~~Seq~~ .NET Aspire Dashboard: log + trace + metric ผ่าน OTLP (`Observability:OtlpEndpoint`, P0-13)
- Alert เข้า LINE Notify หรือ Discord webhook
- ต้อง alert เป็นพิเศษ: disk > 80%, DB > 7 GB (ถ้าใช้ Express), Stripe webhook ล้มเหลว/ตอบไม่ทันติดต่อกัน, ออร์เดอร์ค้างสถานะผิดปกติ (ops queue) > 20 รายการ

## สิ่งที่ต้องยอมรับเมื่อ self-host

- ไม่มี auto-scaling — ถ้า traffic พุ่งต้องเพิ่มเครื่องเอง
- ไม่มี managed failover — เครื่องล่ม = ระบบล่มจนกว่าจะกู้
- งาน ops (patch, backup, monitor) เป็นภาระของทีมเอง ~2–4 ชม./สัปดาห์
- ถ้ารับความเสี่ยงนี้ไม่ได้ตอน scale ขึ้น ควรวางแผนย้าย DB ไป managed service ในภายหลัง
