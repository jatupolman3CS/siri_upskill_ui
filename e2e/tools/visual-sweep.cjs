/**
 * Visual + contrast + keyboard-focus sweep of the app with a MOCKED API — no backend, no database.
 * Logs in as a fake Admin (so /admin, /instructor and the learner pages all open), answers every other
 * GET with an empty paged list, and for each route x theme records: screenshot, horizontal overflow,
 * page errors, text with contrast below WCAG AA (4.5:1, 3:1 for large text) and focusable elements
 * that show no focus ring. It sees layouts, empty states and error states, NOT data-rich states.
 *
 *   npx ng serve --port 4210                       # terminal 1
 *   node e2e/tools/visual-sweep.cjs                # terminal 2 (all routes, light + dark)
 *   ROUTES=/admin/users,/cart THEMES=dark node e2e/tools/visual-sweep.cjs
 *   (Git Bash: prefix with MSYS_NO_PATHCONV=1 when ROUTES contains a leading slash)
 *
 * Output: test-results/visual-sweep/*.png and summary.json. Needs Chromium (npx playwright install chromium).
 * The focus check reads box-shadow rings; a form/wrapper with a translucent `color-mix` ring (the header
 * search) is reported as a false positive.
 */
const path = require('path');
const { chromium } = require('playwright-core');
const OUT = path.join(process.cwd(), 'test-results', 'visual-sweep');
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4210';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const uid = '11111111-1111-4111-8111-111111111111';
const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: uid, role: ['Admin'], sid: '22222222-2222-4222-8222-222222222222', exp: 4102444800 })}.x`;
const empty = { items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false };

const ROUTES = (process.env.ROUTES || '').split(',').filter(Boolean);
const DEFAULT = [
  '/admin', '/admin/payments', '/admin/payouts', '/admin/users', '/admin/courses', '/admin/categories', '/admin/instructors',
  '/admin/marketing', '/admin/banners', '/admin/menus', '/admin/posts', '/admin/payment-settings', '/admin/contact-messages', '/admin/live-status',
  '/instructor', '/instructor/courses', '/instructor/courses/new', '/instructor/announcements', '/instructor/analytics', '/instructor/earnings', '/instructor/onboarding', '/instructor/live-settings', '/instructor/sessions',
  '/my-courses', '/cart', '/checkout', '/account/orders', '/account/devices', '/account/privacy', '/wishlist', '/become-instructor', '/blog', '/faq', '/contact',
];
const routes = ROUTES.length ? ROUTES : DEFAULT;
const themes = (process.env.THEMES || 'light,dark').split(',');

// Contrast sampler: walks text elements, composites ancestor backgrounds over the page background.
const sampler = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const pageBg = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (cs.backgroundImage !== 'none') return { c: null, image: true };
      if (c && c.a >= 1) break;
    }
    let acc = pageBg;
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return { c: acc, image: false };
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.nodeValue.trim();
    const el = t.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.closest('.sr-only, [aria-hidden="true"], script, style')) continue;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || bg.image || !bg.c) continue;
    const fgc = over(fg, bg.c);
    const a = L(fgc), b = L(bg.c);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push({ ratio: Number(ratio.toFixed(2)), need, text: text.slice(0, 40), tag: el.tagName.toLowerCase(), cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 90) });
  }
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const summary = [];
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: 'reduce' });
    await ctx.addCookies([{ name: 'siri_theme', value: theme, url: BASE }]);
    await ctx.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const p = url.pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (p.endsWith('/identity/refresh')) return json({ accessToken: token, accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z' });
      if (p.endsWith('/identity/me')) return json({ id: uid, email: 'admin@example.test', displayName: 'Admin Tester', avatarUrl: null, roles: ['Admin'] });
      if (route.request().method() !== 'GET') return json({}, 200);
      return json(empty);
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    for (const r of routes) {
      errors.length = 0;
      const name = `${theme}${r.replace(/\//g, '_') || '_home'}`;
      try {
        await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);
        const html = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        const bad = await page.evaluate(sampler);
        const focusBad = [];
        for (let i = 0; i < 45; i++) {
          await page.keyboard.press('Tab'); await page.waitForTimeout(30);
          const r = await page.evaluate(() => {
            const el = document.activeElement; if (!el || el === document.body) return null;
            const cs = getComputedStyle(el);
            const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
            const hasRing = (bs) => bs.split(/,(?![^(]*\))/).some((part) => {
              const color = part.match(/rgba?\(([^)]+)\)/); if (!color) return false;
              const nums = color[1].split(/[ ,\/]+/).map(Number); const alpha = nums.length > 3 ? nums[3] : 1;
              const rest = part.replace(color[0], '').trim().split(/\s+/).map((x) => parseFloat(x));
              return alpha > 0 && rest.length >= 4 && rest[3] > 0;
            });
            const shadow = hasRing(cs.boxShadow);
            const wrap = el.closest('form,[class*=focus-within]');
            const parentRing = wrap ? hasRing(getComputedStyle(wrap).boxShadow) : false;
            const rect = el.getBoundingClientRect();
            const vis = rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden';
            return { ok: outline || shadow || parentRing, vis, tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), cls: String(el.className).slice(0, 60) };
          });
          if (r && r.vis && !r.ok) focusBad.push(r);
        }
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        summary.push({ focusBad, theme, route: r, finalUrl: new URL(page.url()).pathname, dataTheme: html, overflow, lowContrast: bad.length, worst: bad.sort((a, b) => a.ratio - b.ratio).slice(0, 4), errors: [...errors] });
      } catch (e) {
        summary.push({ theme, route: r, failed: String(e).slice(0, 120) });
      }
    }
    await ctx.close();
  }
  await browser.close();
  require('fs').writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  for (const s of summary) {
    if (s.failed) { console.log('FAIL', s.theme, s.route, s.failed); continue; }
    console.log(`${s.theme.padEnd(5)} ${s.route.padEnd(28)} -> ${s.finalUrl.padEnd(26)} overflow=${s.overflow} lowContrast=${s.lowContrast} pageErrors=${s.errors.length} noFocusRing=${s.focusBad.length}`);
  }
})();
