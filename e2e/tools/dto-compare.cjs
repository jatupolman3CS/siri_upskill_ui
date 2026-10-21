/**
 * Compares the field NAMES of every DTO the e2e mock fakes (`e2e/tutoring-mock-api.ts`): the TypeScript model in `src/app` against the
 * C# record in the backend repo. A field that exists on one side only, or that the TypeScript side declares optional although the C#
 * record always serialises it, is printed as DIFF. It does not compare types - `tsc -p e2e/tsconfig.json` checks the mock bodies against
 * the TypeScript models, and this closes the other half (TypeScript model against C# record).
 *
 *   node e2e/tools/dto-compare.cjs                      # backend repo is expected next to this one
 *   BACKEND_SRC=C:/path/to/siri_upskill_backend/src node e2e/tools/dto-compare.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = process.env.BACKEND_SRC || path.resolve(process.cwd(), '..', 'siri_upskill_backend', 'src');
const UI = path.join(process.cwd(), 'src', 'app');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['bin', 'obj', 'node_modules'].includes(entry.name)) walk(full, out);
    } else out.push(full);
  }
  return out;
}
const csText = walk(BACKEND).filter((f) => f.endsWith('.cs')).map((f) => fs.readFileSync(f, 'utf8'));
const tsText = walk(UI).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')).map((f) => fs.readFileSync(f, 'utf8'));

const camel = (name) => name[0].toLowerCase() + name.slice(1);

/** Splits at top-level commas (ignores commas inside (), <> and []). */
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('(<['.includes(ch)) depth++;
    if (')>]'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function csRecord(name) {
  for (const text of csText) {
    const match = new RegExp(`record\\s+${name}\\s*\\(`).exec(text);
    if (!match) continue;
    let i = match.index + match[0].length;
    const start = i;
    let depth = 1;
    while (depth > 0 && i < text.length) {
      if (text[i] === '(') depth++;
      if (text[i] === ')') depth--;
      i++;
    }
    return splitTop(text.slice(start, i - 1))
      .map((parameter) => {
        const bare = parameter.replace(/\/\/.*$/gm, '').replace(/\[[^\]]*(\([^)]*\))?[^\]]*\]/g, '').trim().split('=')[0].trim();
        const tokens = bare.split(/\s+/);
        return camel(tokens[tokens.length - 1]);
      })
      .filter(Boolean);
  }
  return null;
}

function tsInterface(name) {
  for (const text of tsText) {
    const match = new RegExp(`export interface ${name}(\\s+extends\\s+([^{]+))?\\s*\\{`).exec(text);
    if (!match) continue;
    let i = match.index + match[0].length;
    const start = i;
    let depth = 1;
    while (depth > 0 && i < text.length) {
      if (text[i] === '{') depth++;
      if (text[i] === '}') depth--;
      i++;
    }
    const body = text.slice(start, i - 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const members = [];
    let nesting = 0;
    let current = '';
    for (const ch of body) {
      if ('{(<['.includes(ch)) nesting++;
      if ('})>]'.includes(ch)) nesting--;
      if (nesting === 0 && (ch === ';' || ch === '\n')) {
        if (current.trim()) members.push(current.trim());
        current = '';
      } else current += ch;
    }
    if (current.trim()) members.push(current.trim());
    const own = members.map((member) => /^(?:readonly\s+)?([A-Za-z0-9_]+)(\??):/.exec(member)).filter(Boolean).map((found) => ({ name: found[1], optional: found[2] === '?' }));
    let inherited = [];
    if (match[2]) {
      for (const parent of splitTop(match[2]).map((part) => part.trim())) {
        const omit = /^Omit<(\w+),\s*'(\w+)'>$/.exec(parent);
        if (omit) inherited = inherited.concat((tsInterface(omit[1]) ?? []).filter((member) => member.name !== omit[2]));
        else inherited = inherited.concat(tsInterface(parent) ?? []);
      }
    }
    return inherited.concat(own);
  }
  return null;
}

// [TypeScript interface, C# record]
const PAIRS = [
  ['TutorSearchItem', 'TutorSearchItem'], ['TutorSearchResponse', 'TutorSearchResponse'], ['TutorSearchFacets', 'TutorSearchFacets'], ['TutorSearchSubject', 'TutorSearchSubject'],
  ['SubjectFacet', 'SubjectFacet'], ['LevelFacet', 'LevelFacet'], ['CurriculumFacet', 'CurriculumFacet'], ['GenderFacet', 'GenderFacet'], ['FormatFacet', 'FormatFacet'], ['HourlyRateRange', 'HourlyRateRange'],
  ['PublicSubjectItem', 'PublicSubjectItem'], ['TutorPublicProfile', 'TutorPublicProfileResponse'], ['PublicOffering', 'PublicOffering'], ['PublicTrial', 'PublicTrial'], ['PublicEducation', 'PublicEducation'], ['PublicCertificate', 'PublicCertificate'],
  ['TutorSlot', 'TutorSlotItem'], ['TutorQuote', 'TutorQuoteDto'], ['TutorSlotsResponse', 'TutorSlotsResponse'],
  ['LearnerProfile', 'LearnerProfileResponse'], ['Booking', 'BookingResponse'], ['BookingTutorSummary', 'BookingTutorSummary'], ['BookingOfferingSummary', 'BookingOfferingSummary'], ['BookingLearnerSummary', 'BookingLearnerSummary'], ['BookingAttendance', 'BookingAttendance'],
  ['CancellationPolicy', 'CancellationPolicyResponse'], ['JoinTutoringSessionResponse', 'JoinTutoringSessionResponse'], ['CreateBookingRequest', 'CreateBookingRequest'],
  ['TutorAvailability', 'TutorAvailabilityResponse'], ['AvailabilitySettings', 'AvailabilitySettings'], ['AvailabilityRule', 'AvailabilityRuleDto'], ['AvailabilityException', 'AvailabilityExceptionResponse'], ['ReplaceRulesRequest', 'ReplaceRulesRequest'], ['SettingsRequest', 'SettingsRequest'],
  ['TutorClassListItem', 'TutorClassListItem'], ['TutorClassLearner', 'TutorClassLearner'], ['TutorClassRoom', 'TutorClassRoom'],
  ['AdminKycCaseListItem', 'AdminKycCaseListItem'], ['AdminKycCaseDetail', 'AdminKycCaseDetail'], ['AdminKycDocument', 'AdminKycDocumentItem'], ['DecideKycCaseRequest', 'DecideKycCaseRequest'], ['KycDocumentVerdict', 'KycDocumentDecision'],
  ['TutorProfile', 'TutorProfileResponse'], ['TutorOffering', 'TutorOfferingResponse'], ['TutorReadiness', 'TutorReadiness'], ['OfferingSubjectRef', 'OfferingSubjectRef'],
  ['TutorReviewsResponse', 'TutorReviewsResponse'], ['TutorReviewsSummary', 'TutorReviewsSummaryDto'], ['RatingDistribution', 'RatingDistributionDto'],
  ['MeResponse', 'MeResponse'], ['RefreshResponse', 'RefreshResponse'], ['InstructorProfileResponse', 'InstructorProfileResponse'], ['PackageOffer', 'PackageOffer'],
];

let differences = 0;
for (const [ts, cs] of PAIRS) {
  const tsFields = tsInterface(ts);
  const csFields = csRecord(cs);
  if (!tsFields || !csFields) {
    differences++;
    console.log(`?? ${ts} <-> ${cs}: ${!tsFields ? 'TypeScript interface not found ' : ''}${!csFields ? 'C# record not found' : ''}`);
    continue;
  }
  const tsNames = new Set(tsFields.map((field) => field.name));
  const csNames = new Set(csFields);
  const onlyTs = [...tsNames].filter((field) => !csNames.has(field));
  const onlyCs = [...csNames].filter((field) => !tsNames.has(field));
  const optional = tsFields.filter((field) => field.optional).map((field) => field.name);
  if (onlyTs.length || onlyCs.length || optional.length) {
    differences++;
    console.log(`DIFF ${ts} <-> ${cs}: onlyInTypeScript=[${onlyTs}] onlyInCSharp=[${onlyCs}] optionalInTypeScriptButAlwaysSent=[${optional}]`);
  } else console.log(`ok   ${ts} <-> ${cs} (${csFields.length} fields)`);
}
console.log(differences === 0 ? `\nALL ${PAIRS.length} PAIRS MATCH` : `\n${differences} of ${PAIRS.length} pairs differ`);
process.exitCode = differences === 0 ? 0 : 1;
