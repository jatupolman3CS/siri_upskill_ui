# UI / UX Rules

## ใช้ skill `ui-ux-pro-max` ก่อนเสมอ

งานที่ **ต้อง** เรียก skill นี้ก่อนลงมือ: ออกแบบหน้าใหม่, สร้าง/รื้อ component, เลือกสี-ฟอนต์-spacing-layout, ทำ navigation/animation/responsive, รีวิว UI, แก้ปัญหา a11y
งานที่ **ไม่ต้อง**: backend logic, API/DB, infra, script ที่ไม่มีผลกับหน้าตา

> ✅ **อัปเดต 2026-08-19:** ติดตั้ง Python สำเร็จแล้ว (`C:\Users\jatup\AppData\Local\Programs\Python\Python313\python.exe`) — สคริปต์ค้นหาของ skill (`scripts/search.py`) ใช้งานได้ปกติแล้ว ไม่ต้องใช้โหมด fallback (อ่าน `references/*.md` ตรง ๆ) อีกต่อไป

## Design system (ตัดสินใจครั้งเดียว ใช้ทั้งระบบ)

- Token อยู่ที่ `src/app/styles/tokens.css` — **ห้ามเขียน hex ดิบใน component** ใช้ CSS variable/Tailwind token เท่านั้น
- รองรับ light + dark + ตามระบบ (D-24): นิยาม palette เต็มที่ `:root`, override เฉพาะ token ที่ต่างใน `:root[data-theme='dark']` — `ThemeService` + inline script ใน `index.html` เป็นคนตั้ง attribute นี้ ห้ามเขียน `@media (prefers-color-scheme)` ในโค้ด component (ใช้ token หรือ `dark:` ที่ผูกกับ attribute แล้ว)
- **Glass (D-24)**: `.glass-panel` (blur) เฉพาะ header/sidebar/modal/hero · `.glass-card` (ไม่ blur) ใช้กับการ์ดทั่วไปได้ทุกใบ · `.glass-pill` สำหรับ nav/chip — ทั้งหมดอยู่ใน `styles.css` ห้ามเขียน `rgba()`/`backdrop-filter` ซ้ำในหน้า · ข้อความสีชมพูใช้ `--color-primary-text` ไม่ใช่ `--color-primary` · สีสถานะใช้ `tone-*` ห้าม Tailwind palette ดิบ (`text-emerald-600`) · พื้นหลัง blob มีชิ้นเดียวใน `app.html` ห้ามเพิ่มรายหน้า
- ธีมหลัก/CTA/active/focus = ชมพู (`--color-primary`) แต่ **icon และส่วนตกแต่งที่ไม่ใช่แบรนด์ใช้สีอื่นได้** (เจ้าของโปรเจ็คอนุมัติ 2026-10-10) — ใช้ชุด `--hue-*` ผ่านคลาส `tone-blue|teal|violet|orange|green|gold|red` ใน `tokens.css` (`class="tone-blue bg-[var(--tone-bg)] text-[var(--tone-fg)]"`) ห้ามใช้ Tailwind palette ดิบ (`text-emerald-600`) เพราะไม่ปรับตาม dark mode · ปุ่ม/ลิงก์/สถานะ active ยังเป็นชมพูเสมอ
- Spacing scale 4px, radius และ shadow มีแค่ชุดที่กำหนดไว้ ห้ามคิดค่าใหม่รายหน้า
- Icon ใช้ SVG ชุดเดียวทั้งระบบ (Phosphor/Lucide) — **ห้ามใช้ emoji แทน icon**
- ฟอนต์ต้องรองรับภาษาไทยครบน้ำหนัก — ใช้ **Prompt** (D-24, แทน IBM Plex Sans Thai) โหลดผ่าน `<link>` ใน `index.html` — เช็ครูปสระบน-ล่างไม่ชนกันที่ line-height ที่ใช้จริง

## Accessibility (ไม่ใช่ option)

- Contrast ข้อความปกติ ≥ 4.5:1, ข้อความใหญ่ ≥ 3:1
- **ห้ามลบ focus ring** ถ้าจะเปลี่ยนต้องทำให้เห็นชัดกว่าเดิม
- ทุก interactive element ต้องกดด้วยคีย์บอร์ดได้ และมีลำดับ tab ที่สมเหตุสมผล
- ปุ่มที่มีแต่ icon ต้องมี `aria-label`
- Touch target ≥ 44×44px และเว้นระยะกัน ≥ 8px
- Form: label ต้องมองเห็น (placeholder ไม่นับเป็น label), error อยู่ติดกับ field
- รองรับ `prefers-reduced-motion` ในทุก animation
- Video player: มี caption track, keyboard shortcut (space/←/→/f/m), และประกาศสถานะผ่าน aria-live

## Layout & responsive

- Mobile-first; breakpoint หลัก 640 / 768 / 1024 / 1280
- **หน้า admin / instructor (studio)**: shell (`layouts/admin-layout`, `instructor-layout`) ให้คอลัมน์เนื้อหาเดียว `mx-auto w-full max-w-[100rem]` — root ของทุกหน้าเป็น `flex flex-col gap-8` (2rem) **ไม่ใส่ `max-w-*`/`mx-auto` เอง** ลูกชั้นบนสุด = header (ชื่อ+คำอธิบายซ้าย, action ขวา) แล้วตามด้วย panel (`glass-card`) หรือ grid ของ panel · ใช้ความกว้างด้วย grid (KPI `sm:grid-cols-2 xl:grid-cols-4`, การ์ด `md:grid-cols-2 2xl:grid-cols-3`, หลัก+ข้าง `xl:grid-cols-[minmax(0,1fr)_22rem]`, ฟอร์ม `md:grid-cols-2`) ภายใน panel ใช้ `flex flex-col gap-6`/`gap-4` ไม่ใช้ `space-y-*` · ตารางอยู่ใน panel พร้อม wrapper `overflow-x-auto` · มือถือเป็นคอลัมน์เดียวไม่มี horizontal scroll · **เนื้อหา studio กว้างแค่ ~960px ที่หน้าจอ 1280** (sidebar 256 + padding 64) — คอลัมน์ข้างกว้าง 22–24rem ให้เริ่มที่ `2xl` ไม่ใช่ `xl` ถ้าคอลัมน์หลักมีตาราง · เซลล์ข้อความที่ผู้ใช้ป้อน (ชื่อ, หัวข้อ, เหตุผล, อีเมล) ต้องมี `min-w-*` + `max-w-*` + `break-words`/`break-all` และ `<select>` ที่ option ยาวได้ต้องมีความกว้างตายตัว (`w-full sm:w-64`) ไม่งั้นหน้าจะกว้างตาม option
- ห้ามเกิด horizontal scroll ที่ระดับ body — ตาราง/โค้ด/กราฟกว้างต้อง scroll ในกล่องของตัวเอง
- จองพื้นที่ให้รูปและ block ที่โหลดทีหลังเสมอ (CLS < 0.1)
- Bottom nav บนมือถือไม่เกิน 5 รายการ; รองรับ safe area ของ iOS

## หน้าจอที่ต้องพิถีพิถันเป็นพิเศษ

| หน้า | จุดชี้เป็นชี้ตาย |
|-----|-----------------|
| Course detail | syllabus ที่ scan ง่าย, free preview เด่น, ราคา+ปุ่มซื้อ sticky บนมือถือ, social proof |
| Video player (`/learn`) | ควบคุมง่ายด้วยคีย์บอร์ด, resume ชัด, ความคืบหน้าเห็นตลอด, watermark ต้องไม่บังเนื้อหาสำคัญ |
| Checkout | ขั้นตอนน้อยที่สุด, สรุปยอดชัด, QR PromptPay อ่านง่ายบนมือถือ, บอกสถานะรอจ่ายแบบ real-time |
| Course builder | drag ต้องมี affordance ชัด + คีย์บอร์ดก็ย้ายได้, autosave พร้อม indicator, undo ได้ |
| Search/catalog | filter ไม่รีเซ็ตเมื่อกด back, จำนวนผลลัพธ์เห็นทันที, empty state บอกทางไปต่อ |

## Anti-patterns ที่ห้ามทำ

- ใส่ animation ความยาวเดียวกันทุกอย่าง / animate `width`,`height`,`top`,`left` (ใช้ `transform`,`opacity`) — ข้อยกเว้นเดียว: shimmer ของ headline หน้าแรก (`.text-shimmer`, 3 รอบ) ตาม D-24
- ผสม style หลายภาษาในหน้าเดียว (skeuomorphic/neumorphic/claymorphic ปนกับธีม glass) — glass + gradient ชมพู→ม่วง ตามกฎ D-24 ใช้ได้ ส่วน blur ทุกการ์ด / gradient บนข้อความ body / glow บนตารางข้อมูล ยังห้าม
- ตัวหนังสือ body เล็กกว่า 14px (ภาษาไทยควร ≥ 16px เพราะมีสระบน-ล่าง)
- เทาบนเทาแบบ contrast ต่ำ, ใช้สีอย่างเดียวสื่อความหมาย (ต้องมี icon/ข้อความกำกับ)
- state ที่ไม่มี feedback: กดแล้วเงียบ, โหลดแล้วไม่มี skeleton, error แล้วไม่บอกว่าต้องทำอะไรต่อ
