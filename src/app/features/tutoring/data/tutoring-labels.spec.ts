import { TUTORING_EN as en, TUTORING_TH as th } from '../testing/tutoring-i18n';
import type { BookingStatus } from './tutoring-learner.models';
import { LEARNER_GRADES } from '../learner/learner-profile-form.util';
import {
  SESSION_FORMATS,
  TUTOR_CURRICULA,
  TUTOR_GENDERS,
  TUTOR_LEVELS,
  TUTOR_SORTS,
  WEEKDAYS_MONDAY_FIRST,
} from './tutor-search-query.util';
import {
  curriculumLabelKey,
  formatLabelKey,
  genderLabelKey,
  levelLabelKey,
  localizedName,
  roundRating,
  sortLabelKey,
  truncateText,
  weekdayLabelKey,
  bookingStatusLabelKey,
  gradeLabelKey,
  packageCreditStatusLabelKey,
  packageStatusLabelKey,
} from './tutoring-labels';
import { PACKAGE_CREDIT_STATUSES, PACKAGE_EXPIRED_REVIEW_KEY, PACKAGE_PURCHASE_STATUSES } from './tutoring-package.util';

const BOOKING_STATUSES: readonly BookingStatus[] = [
  'PendingPayment',
  'Confirmed',
  'CancelledByLearner',
  'CancelledByTutor',
  'Completed',
  'NoShowLearner',
  'NoShowTutor',
  'NoShowBoth',
  'Disputed',
  'Expired',
];

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

describe('tutoring enum label keys', () => {
  // These keys are built at runtime, so i18n-guard.spec cannot see them - this is their guard.
  const keys = [
    ...TUTOR_LEVELS.map(levelLabelKey),
    ...TUTOR_CURRICULA.map(curriculumLabelKey),
    ...TUTOR_GENDERS.map(genderLabelKey),
    ...SESSION_FORMATS.map(formatLabelKey),
    ...TUTOR_SORTS.map(sortLabelKey),
    ...WEEKDAYS_MONDAY_FIRST.map(weekdayLabelKey),
    ...LEARNER_GRADES.map(gradeLabelKey),
    ...BOOKING_STATUSES.map(bookingStatusLabelKey),
    ...PACKAGE_PURCHASE_STATUSES.map(packageStatusLabelKey),
    ...PACKAGE_CREDIT_STATUSES.map(packageCreditStatusLabelKey),
    PACKAGE_EXPIRED_REVIEW_KEY,
  ];

  it('covers every value of every enum', () => {
    expect(keys).toHaveLength(6 + 3 + 4 + 2 + 6 + 7 + 16 + 10 + 5 + 5 + 1);
  });

  it.each(keys)('%s resolves to a non-empty string in Thai and English', (key) => {
    expect(typeof lookup(th, key)).toBe('string');
    expect(typeof lookup(en, key)).toBe('string');
    expect((lookup(en, key) as string).length).toBeGreaterThan(0);
  });

  it('lists the weekdays Monday first but keeps the wire index 0 = Sunday', () => {
    expect(WEEKDAYS_MONDAY_FIRST).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(lookup(en, weekdayLabelKey(0))).toBe('Sunday');
  });
});

describe('dynamically built filter and slot keys', () => {
  it.each(['subject', 'level', 'curriculum', 'format', 'gender', 'day'])('has the "any" option label for the %s filter', (name) => {
    const key = `tutoring.public.search.filters.${name}Any`;
    expect(typeof lookup(th, key)).toBe('string');
    expect(typeof lookup(en, key)).toBe('string');
  });

  it.each(['slotLabel', 'slotLabelJoinGroup', 'slotLabelNewGroup', 'seatsLeft', 'groupSeats'])('has the slot picker key %s', (name) => {
    expect(typeof lookup(th, `tutoring.slots.${name}`)).toBe('string');
    expect(typeof lookup(en, `tutoring.slots.${name}`)).toBe('string');
  });
});

describe('roundRating', () => {
  it('rounds to one decimal', () => {
    expect(roundRating(4.666)).toBe(4.7);
    expect(roundRating(4.64)).toBe(4.6);
    expect(roundRating(5)).toBe(5);
  });
});

describe('localizedName', () => {
  const subject = { nameTh: 'ฟิสิกส์', nameEn: 'Physics' };
  it('follows the active language', () => {
    expect(localizedName(subject, 'th')).toBe('ฟิสิกส์');
    expect(localizedName(subject, 'en')).toBe('Physics');
  });
});

describe('truncateText', () => {
  it('returns short text untouched apart from whitespace', () => {
    expect(truncateText('  hello   world ', 50)).toBe('hello world');
  });

  it('cuts long text to the limit including the ellipsis', () => {
    const cut = truncateText('a'.repeat(400), 300);
    expect(cut).toHaveLength(300);
    expect(cut.endsWith('…')).toBe(true);
  });
});
