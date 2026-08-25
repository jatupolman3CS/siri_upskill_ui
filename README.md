# SIRI UpSkill — Frontend (UI)

Frontend ของ SIRI UpSkill (E-Learning marketplace): Angular 22.1 standalone + signals + zoneless + SSR, Tailwind CSS v4, Shaka Player

Backend อยู่คนละ repo: <https://gitlab.com/Jatuphon.khotsopha/siri_upskill_backend>

## โครงสร้าง

```
src/app/
  core/            http, auth, i18n, seo — ของกลางทั้งแอป
  features/        แยกตามโดเมน (catalog, identity, ...) แต่ละอันมี data/ ของตัวเอง
  layouts/         public / learn / instructor / admin
  shared/          UI kit (button, input, modal, toast, ...)
  styles/          tokens.css — design token ทั้งหมด (ห้ามเขียน hex ดิบใน component)
e2e/               Playwright smoke
design-system/     MASTER.md + mockup ที่เจ้าของโปรเจ็คส่งมา
docs/              เอกสารทั้งโปรเจ็ค (สำเนา — ต้นฉบับอยู่ที่ repo backend)
```

## เริ่มพัฒนา

```bash
npm ci
```

```bash
npm run start
```

เปิดที่ `http://localhost:4200`

หน้าที่ดึงข้อมูลจริงต้องมี backend รันคู่กันที่ `http://localhost:5190` (`proxy.conf.json` proxy `/api` ไปให้เอง) — ที่โฟลเดอร์ backend รัน:

```bash
dotnet run --project src/Siri.Api --launch-profile http
```

## ตรวจก่อนส่งงาน

```bash
npm run lint && npm run test && npm run build
```

```bash
# ต้องมี backend รันอยู่จริงก่อน — register.spec.ts's happy-path สร้าง user row จริงบน DB ที่ backend ต่ออยู่
npm run e2e
```

## เอกสาร

เริ่มที่ [`docs/TASKS.md`](docs/TASKS.md) (คิวงาน + สถานะ) และ [`CLAUDE.md`](CLAUDE.md) (กฎการทำงานทั้งหมด) · ประวัติงานที่ทำไปแล้วอยู่ที่ [`docs/PROGRESS.md`](docs/PROGRESS.md)
