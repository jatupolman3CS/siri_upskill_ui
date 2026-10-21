/**
 * Renders docs/audit/p13-43-fe-quality.md from the numbers `tutoring-audit.audit.ts` wrote to test-results/tutoring-audit/*.json,
 * plus two static checks of the source tree (`track $index`, class names with no CSS). Pure formatting: no number in the report is
 * typed by hand.
 *
 *   E2E_PORT=4310 npx playwright test -c e2e/tools/tutoring-audit.config.ts
 *   npm run build            # only for the "class names with no CSS" check (reads dist/siri_upskill_ui/browser/styles-*.css)
 *   node e2e/tools/tutoring-audit-report.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const RESULTS = path.join(ROOT, 'test-results', 'tutoring-audit');
const OUT = path.join(ROOT, 'docs', 'audit', 'p13-43-fe-quality.md');
const SHOT_DIR = path.join(ROOT, 'docs', 'audit', 'p13-43');

const rows = fs
  .readdirSync(RESULTS)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(path.join(RESULTS, file), 'utf8')));
const PAGE_ORDER = ['tutors', 'tutor-profile', 'booking', 'my-tutoring', 'checkout', 'availability', 'classes', 'kyc-queue', 'kyc-case'];
rows.sort((a, b) => PAGE_ORDER.indexOf(a.page) - PAGE_ORDER.indexOf(b.page) || a.width - b.width || (a.theme < b.theme ? 1 : -1));

const yes = (value) => (value ? 'yes' : 'no');
const cell = (text) => String(text).replace(/\|/g, '\\|');
const name = (label) => cell(label.length > 28 ? label.slice(0, 27) + '...' : label);
const pageTitle = (row) => `\`${row.title}\``;
const shot = (row) => {
  const file = `${row.page}-${row.width}-${row.theme}.png`;
  return fs.existsSync(path.join(SHOT_DIR, file)) ? `[png](p13-43/${file})` : '-';
};

const smallest = (targets) => {
  let best = null;
  for (const target of targets) {
    const size = Math.min(target.width, target.height);
    if (best === null || size < best.size) best = { size, target };
  }
  return best;
};
const lowestPair = (pairs) => pairs.reduce((best, pair) => (best === null || pair.ratio < best.ratio ? pair : best), null);
const failing = (pairs) => pairs.filter((pair) => pair.ratio < pair.need);

const lines = [];
const out = (text = '') => lines.push(text);

out('# P13-43 - Tutor Marketplace front-end quality audit');
out();
out(`Measured on ${new Date().toISOString().slice(0, 10)} by \`e2e/tools/tutoring-audit.audit.ts\` (Playwright, Chromium) in the UI repo. Screenshots are in the UI repo under \`docs/audit/p13-43/\` (the links below resolve there; this file is copied unchanged to the backend repo's \`docs/audit/\`, where the images are not).`);
out();
out('## How it was measured');
out();
out('- **Pages:** the tutoring screens a person actually uses - public search and profile, the booking page, checkout (a confirmed trial), "My tutoring", the tutor portal (availability, classes) and the admin KYC queue and case. 9 pages x 3 viewports (375 / 768 / 1280 px) x 2 themes (light / dark) = **' + rows.length + ' measurements**. The theme is the `siri_theme` cookie, i.e. the real switch; motion is reduced so entrance animations do not change colours mid-measurement.');
out('- **Data:** no backend. The API is the in-memory mock of `e2e/tutoring-mock-api.ts`, whose bodies are typed against the app models and compared field by field with the C# records; the pages hold a booking, a class and a pending KYC case, so the layouts are measured with data, not as empty states.');
out('- **Overflow:** `documentElement.scrollWidth` and `body.scrollWidth` against the viewport width (+1 px tolerance).');
out('- **Touch targets:** every visible interactive element inside the page\'s `<main>` (links, buttons, inputs, selects, tabs, radios...). A checkbox / radio is measured by its `<label>` (that is what a finger meets); a "stretched link" (`::after` covering its card) by the pseudo-element. Under 44 px in either direction is listed as an offender. The shared chrome outside `<main>` (header, sidebar, footer, bottom bar) belongs to no tutoring page and is listed once, in its own section.');
out('- **Focus ring:** one real `Tab` key press, then the element that has focus is inspected after the ring\'s CSS transition has finished: a visible `outline`, or a `box-shadow` layer with spread > 0 that is not transparent on the element - or >= 2 px on one of its four nearest ancestors (cards and input wrappers draw the ring on the box). Then the same for the first stop inside `<main>` and the next eight stops there.');
out('- **Contrast:** for every visible text element the *computed* foreground colour is composited over the stack of *computed* ancestor background colours (translucent glass is blended over the page background) and compared with the WCAG 2.x ratio: 4.5:1, or 3:1 for text of 24 px / 18.66 px bold. CSS colours of any syntax (`oklch`, `color-mix`, ...) are resolved to sRGB by the browser\'s own canvas. No token pair is typed into the script.');
out();
out('**Limits of the contrast number.** The decorative, blurred "ambient" background (`app-ambient-background`) is a separate fixed layer, not an ancestor of the text, so translucent glass is blended over the plain page colour and not over the blobs; elements over a CSS image/gradient cannot be resolved this way and are counted as `unresolved` (below) instead of being reported as passing. Placeholder text, input values and SVG icons are not text nodes and are not sampled.');
out();

// --- Matrix per page ----------------------------------------------------------------------------------------------------------
out('## Result by page (all six viewport/theme combinations of the page)');
out();
out('| Page | Horizontal overflow (6 of 6 measured) | Smallest target in `<main>` | Targets under 44 px | Ring on first Tab | Ring at first content stop | Lowest contrast | Text pairs failing WCAG AA |');
out('|---|---|---|---|---|---|---|---|');
for (const id of PAGE_ORDER) {
  const set = rows.filter((row) => row.page === id);
  if (set.length === 0) continue;
  const overflowing = set.filter((row) => row.overflow.document || row.overflow.body).length;
  const best = set.map((row) => smallest(row.targets.main)).filter(Boolean).reduce((a, b) => (b.size < a.size ? b : a));
  const offenders = new Set(set.flatMap((row) => row.targets.main.filter((t) => t.width < 44 || t.height < 44).map((t) => `${t.label}|${t.width}x${t.height}`)));
  const tab1 = set.filter((row) => row.firstTab && row.firstTab.ring).length;
  const tabC = set.filter((row) => row.firstInContent && row.firstInContent.ring).length;
  const low = set.map((row) => lowestPair(row.contrast.pairs)).reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const bad = set.reduce((sum, row) => sum + failing(row.contrast.pairs).length, 0);
  out(
    `| ${pageTitle(set[0])} | ${overflowing === 0 ? 'no' : `YES (${overflowing})`} | ${best.size} px - ${name(best.target.label)} (${best.target.width}x${best.target.height}) | ${offenders.size === 0 ? 'none' : [...offenders].map((entry) => cell(entry.replace('|', ' ') )).join('; ')} | ${tab1} of ${set.length} | ${tabC} of ${set.length} | ${low.ratio}:1 (${low.fg} on ${low.bg}) | ${bad} |`,
  );
}
out();

// --- Full table ----------------------------------------------------------------------------------------------------------------
out('## Every measurement');
out();
out('Overflow: `scrollWidth` vs viewport. Smallest target: the smaller side of the smallest interactive element inside `<main>` (and which one). Ring: yes/no for the element that took focus (first Tab = the skip link, or the "open menu" button of the studio shells at 375 px). Contrast: the lowest ratio among the sampled text pairs, and how many pairs were sampled / failed.');
out();
out('| Page | Viewport | Theme | Overflow | Smallest target in `<main>` | < 44 px | Ring, 1st Tab | Ring, 1st content stop (Tab #) | Lowest contrast | Pairs / failing / unresolved | Screenshot |');
out('|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) {
  const best = smallest(row.targets.main);
  const under = row.targets.main.filter((t) => t.width < 44 || t.height < 44).length;
  const low = lowestPair(row.contrast.pairs);
  out(
    `| ${pageTitle(row)} | ${row.width} | ${row.theme} | ${row.overflow.document || row.overflow.body ? `YES (${row.overflow.scrollWidth} > ${row.overflow.clientWidth})` : `no (${row.overflow.scrollWidth} = ${row.overflow.clientWidth})`} | ${best ? `${best.target.width}x${best.target.height} ${name(best.target.label)}` : '-'} | ${under} | ${yes(row.firstTab && row.firstTab.ring)} | ${yes(row.firstInContent && row.firstInContent.ring)} (#${row.tabsToContent}) | ${low ? `${low.ratio}:1` : '-'} | ${row.contrast.pairs.length} / ${failing(row.contrast.pairs).length} / ${row.contrast.unresolved} | ${shot(row)} |`,
  );
}
out();

// --- Findings ------------------------------------------------------------------------------------------------------------------
out('## Findings');
out();
const overflowing = rows.filter((row) => row.overflow.document || row.overflow.body);
out(`### Horizontal overflow\n\n${overflowing.length === 0 ? `None: ${rows.length} of ${rows.length} measurements have \`scrollWidth\` equal to the viewport width.` : overflowing.map((row) => `- ${row.title} @${row.width} ${row.theme}: ${row.overflow.offenders.join('; ')}`).join('\n')}`);
out();

const offenderMap = new Map();
for (const row of rows) {
  for (const target of row.targets.main) {
    if (target.width < 44 || target.height < 44) {
      const key = `${target.label}|${target.width}|${target.height}|${target.tag}`;
      const entry = offenderMap.get(key) || { target, pages: new Set() };
      entry.pages.add(row.title);
      offenderMap.set(key, entry);
    }
  }
}
out('### Touch targets (project rule: at least 44 x 44 px)');
out();
if (offenderMap.size === 0) {
  out('Every interactive element inside `<main>` of every measured page is at least 44 x 44 px.');
} else {
  out('Offenders inside the tutoring pages (`<main>`), de-duplicated across viewports and themes:');
  out();
  out('| Element | Size (w x h) | Seen on |');
  out('|---|---|---|');
  for (const { target, pages } of offenderMap.values()) {
    out(`| \`<${target.tag}>\` "${cell(target.label)}"${target.inline ? ' (inline in text)' : ''} | ${target.width} x ${target.height} | ${[...pages].map((page) => `\`${page}\``).join(', ')} |`);
  }
}
out();
const chromeMap = new Map();
for (const row of rows) {
  for (const target of row.targets.chrome) {
    if (target.width < 44 || target.height < 44) {
      const key = `${target.label}|${target.width}|${target.height}|${target.tag}`;
      const entry = chromeMap.get(key) || { target, pages: new Set() };
      entry.pages.add(row.area);
      chromeMap.set(key, entry);
    }
  }
}
out('**Shared chrome outside `<main>`** (header, studio / admin shell, footer, bottom bar - not part of the tutoring feature, listed once):');
out();
out('| Element | Size (w x h) | Layout |');
out('|---|---|---|');
for (const { target, pages } of [...chromeMap.values()].sort((a, b) => Math.min(a.target.width, a.target.height) - Math.min(b.target.width, b.target.height))) {
  out(`| \`<${target.tag}>\` "${cell(target.label)}" | ${target.width} x ${target.height} | ${[...pages].join(', ')} |`);
}
out();

const noRing = rows.filter((row) => !(row.firstTab && row.firstTab.ring) || !(row.firstInContent && row.firstInContent.ring) || row.contentStops.some((stop) => !stop.ring));
out('### Focus ring');
out();
out(
  noRing.length === 0
    ? `A visible ring was found on the first Tab and on the first ${rows[0].contentStops.length} stops inside \`<main>\` in all ${rows.length} measurements.`
    : noRing.map((row) => `- ${row.title} @${row.width} ${row.theme}: first Tab ${yes(row.firstTab && row.firstTab.ring)}, content ${row.contentStops.filter((stop) => !stop.ring).map((stop) => `"${stop.label}"`).join(', ') || 'ok'}`).join('\n'),
);
out();

const allPairs = rows.flatMap((row) => row.contrast.pairs.map((pair) => ({ ...pair, where: `${row.title} @${row.width} ${row.theme}` })));
const distinct = new Map();
for (const pair of allPairs) {
  const key = `${pair.fg}|${pair.bg}|${pair.large}`;
  if (!distinct.has(key) || distinct.get(key).ratio > pair.ratio) distinct.set(key, pair);
}
const below = allPairs.filter((pair) => pair.ratio < pair.need);
const unresolved = rows.reduce((sum, row) => sum + row.contrast.unresolved, 0);
out('### Contrast');
out();
out(`${allPairs.length} text samples (${distinct.size} distinct colour pairs) were measured; **${below.length} are below their WCAG AA threshold** (4.5:1, or 3:1 for large text); ${unresolved} elements sat on an image/gradient and could not be resolved.`);
out();
out('The tightest pairs (lowest first):');
out();
out('| Ratio | Text colour on background | Size | Example text | First seen on |');
out('|---|---|---|---|---|');
for (const pair of [...distinct.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 8)) {
  out(`| ${pair.ratio}:1 | \`${pair.fg}\` on \`${pair.bg}\` | ${pair.sizePx}px${pair.large ? ' (large)' : ''} | ${cell(pair.text)} | ${pair.where} |`);
}
if (below.length > 0) {
  out();
  out('**Below threshold:**');
  for (const pair of below.slice(0, 20)) out(`- ${pair.ratio}:1 (needs ${pair.need}) \`${pair.fg}\` on \`${pair.bg}\` "${cell(pair.text)}" - ${pair.where}`);
}
out();
const errors = rows.filter((row) => row.errors.length > 0);
out(`### Page errors\n\n${errors.length === 0 ? 'No uncaught page error in any of the measurements.' : errors.map((row) => `- ${row.title} @${row.width} ${row.theme}: ${row.errors.join('; ')}`).join('\n')}`);
out();

// --- Static checks -------------------------------------------------------------------------------------------------------------
function walk(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, acc);
    else if (ext.some((suffix) => entry.name.endsWith(suffix)) && !entry.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}
const featureDir = path.join(ROOT, 'src', 'app', 'features', 'tutoring');
const sources = walk(featureDir, ['.html', '.ts']);
const trackIndex = [];
for (const file of sources) {
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (/@for\s*\(.*;\s*track\s+\$index/.test(line)) trackIndex.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${index + 1}`);
    });
}
out('## Static checks of `src/app/features/tutoring`');
out();
out(`- **\`track $index\`:** ${trackIndex.length} occurrence(s)${trackIndex.length ? ': ' + trackIndex.map((entry) => `\`${entry}\``).join(', ') : ''}. Both iterate the public profile\'s \`educations\` / \`certificates\`, whose C# records (\`PublicEducation\`, \`PublicCertificate\`) carry no id; the lists are read-only, server-ordered and never reordered on the client, so index identity is stable. Every other \`@for\` in the feature tracks a real id (or a constant enum / number).`);

const dist = path.join(ROOT, 'dist', 'siri_upskill_ui', 'browser');
let cssFile = null;
if (fs.existsSync(dist)) {
  const candidates = fs.readdirSync(dist).filter((file) => /^styles.*\.css$/.test(file));
  cssFile = candidates.length ? path.join(dist, candidates[0]) : null;
}
if (cssFile === null) {
  out('- **Class names with no CSS:** not checked in this run (no build output; run `npm run build` first).');
} else {
  const css = fs.readFileSync(cssFile, 'utf8');
  const defined = new Set();
  // A class selector in the compiled CSS with its CSS escapes undone: "\32 xl\:grid-cols-2" (hex escape of a leading digit) -> "2xl:grid-cols-2".
  const unescape = (selector) =>
    selector.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1');
  for (const match of css.matchAll(/\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[A-Za-z0-9_-])+)/g)) defined.add(unescape(match[1]));
  const used = new Map();
  const note = (token, file) => {
    if (!token || token.includes('{') || token.includes('}')) return;
    if (!used.has(token)) used.set(token, new Set());
    used.get(token).add(path.relative(ROOT, file).replace(/\\/g, '/'));
  };
  // Static `class="a b c"`, string literals inside `[class]="expr"` / `[ngClass]="expr"` / `host: { class: '...' }`, and `[class.name]="..."`.
  // Only a literal that is a RESULT of the expression counts (right after "?", ":", "&&", "||", "??" or at its start); one that is compared
  // ("status === 'Failed'") or handed to a function ("message('bio')") is not a class list.
  const literals = (expression) =>
    [...expression.matchAll(/'([^']*)'|`([^`]*)`/g)]
      .filter((m) => /(^|[?:]|&&|\|\||\?\?)\s*$/.test(expression.slice(0, m.index)))
      .map((m) => (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' '));
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?<![\w[.-])class\s*=\s*"([^"]*)"/g)) {
      for (const token of match[1].replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/)) note(token, file);
    }
    for (const match of text.matchAll(/\[(?:class|ngClass)\]\s*=\s*"([^"]*)"/g)) {
      for (const literal of literals(match[1])) for (const token of literal.split(/\s+/)) note(token, file);
    }
    for (const match of text.matchAll(/\[class\.([A-Za-z0-9_-]+)\]/g)) note(match[1], file);
    for (const match of text.matchAll(/host:\s*\{[^}]*\bclass:\s*'([^']*)'/g)) for (const token of match[1].split(/\s+/)) note(token, file);
  }
  const markers = new Set(['group', 'peer']);
  const missing = [...used.keys()].filter((token) => !defined.has(token) && !markers.has(token));
  out(`- **Class names with no CSS definition** (every class used in a tutoring template or its component, looked up in the compiled \`${path.basename(cssFile)}\`; Tailwind marker classes \`group\`/\`peer\` excluded): ${missing.length === 0 ? '**none**' : missing.map((token) => `\`${token}\` (${[...used.get(token)].join(', ')})`).join('; ')}.`);
}
out();

// --- Summary, placed right under the introduction -------------------------------------------------------------------------------
const lowestOverall = allPairs.reduce((best, pair) => (pair.ratio < best.ratio ? pair : best));
const ringMisses = rows.filter((row) => !(row.firstTab && row.firstTab.ring) || row.contentStops.some((stop) => !stop.ring)).length;
const summary = [
  '## Summary',
  '',
  `- **Horizontal overflow:** ${overflowing.length === 0 ? 'none' : overflowing.length + ' measurement(s)'} - ${rows.length - overflowing.length} of ${rows.length} measurements fit their viewport exactly.`,
  `- **Touch targets (>= 44 px) inside the tutoring pages:** ${offenderMap.size === 0 ? 'all pass' : offenderMap.size + ' offender(s): ' + [...offenderMap.values()].map(({ target }) => '"' + target.label + '" ' + target.width + ' x ' + target.height).join('; ')}. The shared header / shell / footer has more (see below) and belongs to no tutoring page.`,
  `- **Focus ring:** visible on the first Tab and on the first content stops in ${rows.length - ringMisses} of ${rows.length} measurements.`,
  `- **Contrast:** lowest measured text ratio ${lowestOverall.ratio}:1 (${lowestOverall.fg} on ${lowestOverall.bg}, ${lowestOverall.sizePx}px) - ${below.length} of ${allPairs.length} samples below WCAG AA.`,
  '',
];
lines.splice(lines.indexOf('## How it was measured'), 0, ...summary);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)} (${rows.length} measurements)`);
