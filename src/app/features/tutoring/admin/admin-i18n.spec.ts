/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import enBase from '../../../core/i18n/en.json';
import thBase from '../../../core/i18n/th.json';
import enShared from '../i18n/tutoring-shared.en.json';
import thShared from '../i18n/tutoring-shared.th.json';
import en from './i18n/admin-tutoring.en.json';
import th from './i18n/admin-tutoring.th.json';
import {
  ADMIN_TUTOR_STATUSES,
  DISPUTE_CATEGORIES,
  DISPUTE_FLOWS,
  DISPUTE_HINTS,
  DISPUTE_PRIORITIES,
  DISPUTE_SORTS,
  DISPUTE_STATUSES,
  KYC_QUEUE_STATUSES,
  disputeHintKey,
  disputePriorityKey,
  disputeSortKey,
} from './data/admin-labels';
import { FUNNEL_SEGMENTS, GRANULARITIES, REPORT_TABS, TOP_TUTOR_SORTS } from './data/admin-analytics.util';

/**
 * The i18n guard only sees `'key' | translate` written out literally; the administrator screens also build keys at run time
 * (`'tutoring.admin.kyc.decision.option.' + option`). This spec closes that gap: every literal `tutoring.admin.*` key written in
 * the sources exists in both of the area's lazy dictionaries, and every dynamic prefix resolves for every value that can follow it.
 * The texts every tutoring audience shares (`tutoring.enums.*`, `tutoring.tutor.validation.*`, ...) live in the shared lazy pair that the admin resolver
 * loads alongside, and the sidebar labels (`admin.nav.*`) in the base dictionaries; `has()` looks in all three.
 */

const ROOT = join(process.cwd(), 'src', 'app', 'features', 'tutoring', 'admin');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

const inBoth = (a: unknown, b: unknown, key: string): boolean => typeof lookup(a, key) === 'string' && typeof lookup(b, key) === 'string';
const has = (key: string): boolean => inBoth(th, en, key) || inBoth(thShared, enShared, key) || inBoth(thBase, enBase, key);

const SOURCES = walk(ROOT).filter((file) => (file.endsWith('.ts') || file.endsWith('.html')) && !file.endsWith('.spec.ts') && !file.includes(`${join('admin', 'testing')}`));

describe('administrator tutoring i18n', () => {
  it('finds the sources', () => {
    expect(SOURCES.length).toBeGreaterThan(40);
  });

  it('has every literal tutoring.admin key in both dictionaries', () => {
    const missing: string[] = [];
    for (const file of SOURCES) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/'(tutoring\.admin\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) {
        // A bare group name (`tutoring.admin.disputes.role`) is a prefix handed to a helper, not a key.
        const key = match[1];
        if (!has(key) && lookup(th, key) === undefined && lookup(thShared, key) === undefined && lookup(thBase, key) === undefined) {
          missing.push(`${file.slice(ROOT.length)}  ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  const ENUMS: readonly (readonly [string, readonly string[]])[] = [
    ['tutoring.admin.kyc.decision.option', ['Approve', 'NeedsInfo', 'Reject']],
    ['tutoring.admin.kyc.decision.effect', ['Approve', 'NeedsInfo', 'Reject']],
    ['tutoring.admin.kyc.decision.confirm', ['Approve', 'NeedsInfo', 'Reject']],
    ['tutoring.admin.kyc.decision.summary', ['Approve', 'NeedsInfo', 'Reject']],
    ['tutoring.admin.kyc.decision.purgeNotice', ['Approve', 'NeedsInfo', 'Reject']],
    ['tutoring.admin.kyc.decision.done', ['Approve', 'NeedsInfo', 'Reject']],
    ['tutoring.admin.kyc.decision.issue', ['noteRequired', 'noteTooLong', 'undecidedDocuments']],
    ['tutoring.admin.kyc.verdict', ['Approved', 'Rejected']],
    ['tutoring.admin.kyc.log.action', ['View', 'Download', 'Purge']],
    ['tutoring.admin.disputes.role', ['Learner', 'Tutor', 'Admin', 'System']],
    ['tutoring.admin.disputes.summary', ['open', 'underReview', 'overdue', 'highPriority', 'needsFollowUp', 'awaitingAdminReply']],
    ['tutoring.admin.disputes.message.option', ['Internal', 'Parties']],
    ['tutoring.admin.disputes.message.effect', ['Internal', 'Parties']],
    ['tutoring.admin.disputes.message.sent', ['Internal', 'Parties']],
    ['tutoring.admin.disputes.outcome.suspension', ['Done', 'SkippedNotVerified', 'Failed']],
    ['tutoring.admin.disputes.decide.flowHelp', ['Escrow', 'AttendanceAppeal']],
    ['tutoring.admin.disputes.decide.option.Escrow', ['FullRefund', 'PartialRefund', 'NoRefund', 'Reject']],
    ['tutoring.admin.disputes.decide.option.AttendanceAppeal', ['Resolve', 'Reject']],
    [
      'tutoring.admin.disputes.decide.effect',
      ['FullRefund', 'PartialRefund', 'NoRefund', 'RejectEscrow', 'packageCredit', 'tooLate', 'ResolveAppeal', 'RejectAppeal', 'overturn', 'compensation', 'suspend', 'bothSee'],
    ],
    ['tutoring.admin.tutors.moderation.suspend', ['open', 'title', 'effect', 'confirm', 'reason', 'reasonHelp', 'done']],
    ['tutoring.admin.tutors.moderation.reinstate', ['open', 'title', 'effect', 'confirm', 'reason', 'reasonHelp', 'done']],
    ['tutoring.admin.tutors.moderation.commission', ['open', 'title', 'effect', 'confirm', 'reason', 'reasonHelp', 'done']],
    // Analytics (P13-27): every family of texts the report screens build at run time.
    ['tutoring.admin.analytics.tab', REPORT_TABS],
    ['tutoring.admin.analytics.granularity', GRANULARITIES],
    ['tutoring.admin.analytics.segment', FUNNEL_SEGMENTS],
    ['tutoring.admin.analytics.sort', TOP_TUTOR_SORTS],
    ['tutoring.admin.analytics.range', ['incomplete', 'order', 'future']],
    ['tutoring.admin.analytics.range.tooLong', ['days', 'weeks', 'months']],
    ['tutoring.admin.analytics.revenue.notes', ['package_timing', 'ledger_excludes_fully_refunded_before_batch', 'fee_may_be_estimate', 'cash_vs_ledger_not_comparable_per_bucket']],
    ['tutoring.admin.analytics.funnel.group', ['beforePayment', 'afterPayment', 'outcome', 'problems']],
    [
      'tutoring.admin.analytics.funnel.counts',
      [
        'created',
        'stillPending',
        'expired',
        'abandonedByLearner',
        'everConfirmed',
        'stillConfirmed',
        'settled',
        'completed',
        'noShowLearner',
        'noShowTutor',
        'noShowBoth',
        'cancelledByLearnerAfterConfirm',
        'cancelledByTutorAfterConfirm',
        'inDispute',
        'withDispute',
      ],
    ],
    [
      'tutoring.admin.analytics.funnel.rates',
      ['holdConversionRate', 'completionRate', 'noShowLearnerRate', 'noShowTutorRate', 'noShowBothRate', 'cancelAfterConfirmLearnerRate', 'cancelAfterConfirmTutorRate', 'disputeRate'],
    ],
    ['tutoring.admin.analytics.kyc.band', ['lt24h', 'h24to48', 'h48to72', 'gt72h']],
  ];

  it.each(ENUMS)('resolves %s for every value that can follow it', (prefix, values) => {
    expect(values.filter((value) => !has(`${prefix}.${value}`))).toEqual([]);
  });

  it('labels every enum value the screens list (shared enum texts included)', () => {
    const lists: readonly (readonly [string, readonly string[]])[] = [
      ['tutoring.enums.kycCaseStatus', KYC_QUEUE_STATUSES],
      ['tutoring.enums.tutorStatus', ADMIN_TUTOR_STATUSES],
      ['tutoring.admin.disputes.status', DISPUTE_STATUSES],
      ['tutoring.enums.disputeCategory', DISPUTE_CATEGORIES],
      ['tutoring.enums.disputeFlow', DISPUTE_FLOWS],
      ['tutoring.enums.kycDocumentType', ['IdCard', 'Diploma', 'CriminalRecord', 'Certificate', 'Other']],
      ['tutoring.enums.disputeResolution', ['FullRefund', 'PartialRefund', 'NoRefund']],
      ['tutoring.enums.disputeSystemMessage', ['opened', 'claimed', 'decided', 'withdrawn', 'escrow_too_late', 'unknown']],
    ];
    const missing = lists.flatMap(([prefix, values]) => values.filter((value) => !has(`${prefix}.${value}`)).map((value) => `${prefix}.${value}`));
    expect(missing).toEqual([]);
    expect(DISPUTE_PRIORITIES.filter((value) => !has(disputePriorityKey(value)))).toEqual([]);
    expect(DISPUTE_SORTS.filter((value) => !has(disputeSortKey(value)))).toEqual([]);
    expect(DISPUTE_HINTS.map((hint) => disputeHintKey(hint)).filter((key) => key === null || !has(key))).toEqual([]);
  });

  it('keeps the two lazy dictionaries identical in keys and placeholders (the base guard cannot see them)', () => {
    const flat = (node: unknown, prefix = ''): Map<string, string> => {
      const out = new Map<string, string>();
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') {
          out.set(path, value);
        } else {
          flat(value, path).forEach((text, nested) => out.set(nested, text));
        }
      }
      return out;
    };
    const holes = (text: string): string[] => Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (match) => match[1]).sort();
    const thFlat = flat(th);
    const enFlat = flat(en);
    expect([...thFlat.keys()].filter((key) => !enFlat.has(key))).toEqual([]);
    expect([...enFlat.keys()].filter((key) => !thFlat.has(key))).toEqual([]);
    expect([...thFlat].filter(([key, text]) => JSON.stringify(holes(text)) !== JSON.stringify(holes(enFlat.get(key) ?? ''))).map(([key]) => key)).toEqual([]);
    expect([...thFlat].filter(([, text]) => text.trim() === '').length + [...enFlat].filter(([, text]) => text.trim() === '').length).toBe(0);
    expect([...enFlat].filter(([, text]) => /[฀-๿]/.test(text)).map(([key]) => key)).toEqual([]);
  });

  it('knows the admin error texts the error map points at', () => {
    const errors = lookup(th, 'tutoring.admin.errors');
    expect(Object.keys(errors as object).length).toBeGreaterThan(15);
    for (const key of Object.keys(errors as object)) {
      expect(has(`tutoring.admin.errors.${key}`)).toBe(true);
    }
  });
});
