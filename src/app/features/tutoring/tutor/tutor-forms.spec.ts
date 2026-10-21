import { ApiError } from '../../../core/http/error.interceptor';
import type { TutorOffering } from '../data/tutoring-tutor.models';
import {
  amountIssue,
  bangkokYear,
  integerIssue,
  optionalTextIssue,
  parseNumber,
  serverRejectedFields,
  textIssue,
  trimToNull,
} from '../ui/tutor-form.util';
import {
  educationRequest,
  emptyCertificateForm,
  emptyEducationForm,
  validateCertificate,
  validateEducation,
} from './tutor-credential-form.util';
import { emptyOfferingForm, offeringRequest, offeringToForm, selectableSubjects, subjectChoicesOf, validateOffering } from './tutor-offering-form.util';
import { emptyProfileForm, profileRequest, validateProfile } from './tutor-profile-form.util';

describe('form helpers', () => {
  it('parses a number field: empty is null, junk is NaN, a comma is a decimal point', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('  ')).toBeNull();
    expect(parseNumber('450')).toBe(450);
    expect(parseNumber('450,50')).toBe(450.5);
    expect(parseNumber('12abc')).toBeNaN();
  });

  it('trims optional text to null', () => {
    expect(trimToNull('   ')).toBeNull();
    expect(trimToNull(' hi ')).toBe('hi');
  });

  it('rejects markup and control characters in plain text', () => {
    expect(textIssue('Good tutor', 2, 80)).toBeUndefined();
    expect(textIssue('<b>bold</b>', 2, 80)?.key).toBe('tutoring.tutor.validation.noMarkup');
    expect(textIssue('3 < 4 is fine', 2, 80)).toBeUndefined();
    expect(textIssue('bad\u0007bell', 2, 80)?.key).toBe('tutoring.tutor.validation.noMarkup');
    expect(textIssue('', 2, 80)?.key).toBe('tutoring.tutor.validation.required');
    expect(textIssue('x', 2, 80)?.key).toBe('tutoring.tutor.validation.tooShort');
    expect(textIssue('x'.repeat(81), 2, 80)?.key).toBe('tutoring.tutor.validation.tooLong');
    expect(optionalTextIssue('', 120)).toBeUndefined();
    expect(optionalTextIssue('y'.repeat(121), 120)?.key).toBe('tutoring.tutor.validation.tooLong');
  });

  it('checks whole numbers and money amounts', () => {
    expect(integerIssue('0', 0, 60)).toBeUndefined();
    expect(integerIssue('61', 0, 60)?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(integerIssue('1.5', 0, 60)?.key).toBe('tutoring.tutor.validation.wholeNumber');
    expect(integerIssue('', 0, 60, true)).toBeUndefined();
    expect(amountIssue('450.5', 0.01)).toBeUndefined();
    expect(amountIssue('450.555', 0.01)?.key).toBe('tutoring.tutor.validation.tooManyDecimals');
    expect(amountIssue('0', 0.01)?.key).toBe('tutoring.tutor.validation.minAmount');
    expect(amountIssue('0', 0)).toBeUndefined();
    expect(amountIssue('abc', 0)?.key).toBe('tutoring.tutor.validation.notANumber');
  });

  it('computes the year in Thailand (UTC+7), not the visitor\'s', () => {
    expect(bangkokYear(new Date('2026-12-31T16:59:59Z'))).toBe(2026);
    expect(bangkokYear(new Date('2026-12-31T17:00:00Z'))).toBe(2027);
  });

  it('names the form fields a 400 validation answer rejected', () => {
    const error = new ApiError(400, 'x', 'validation', { errors: { Bio: ['too long'], Unknown: ['?'] } });
    expect([...serverRejectedFields(error, { Bio: 'bio', DisplayName: 'displayName' })]).toEqual(['bio']);
    expect(serverRejectedFields(new Error('boom'), { Bio: 'bio' }).size).toBe(0);
  });
});

describe('profile form', () => {
  it('accepts a minimal profile and builds the request without padding', () => {
    const value = { ...emptyProfileForm(), displayName: '  Nina Tutor  ', headline: '  ', bio: ' About me ' };
    expect(validateProfile(value)).toEqual({});
    expect(profileRequest(value)).toEqual({ displayName: 'Nina Tutor', headline: null, bio: 'About me', gender: 'Undisclosed', yearsExperience: 0 });
  });

  it('reports each broken field', () => {
    const issues = validateProfile({ ...emptyProfileForm(), displayName: '<script>', bio: '<a href="x">y</a>', yearsExperience: '70' });
    expect(Object.keys(issues).sort()).toEqual(['bio', 'displayName', 'yearsExperience']);
  });
});

describe('offering form', () => {
  const valid = { ...emptyOfferingForm(), subjectId: 'sub-1', hourlyRate: '450' };

  it('needs a subject and a rate', () => {
    expect(Object.keys(validateOffering(emptyOfferingForm())).sort()).toEqual(['hourlyRate', 'subjectId']);
    expect(validateOffering(valid)).toEqual({});
  });

  it('keeps the group rate at or below the one-to-one rate and the seats within 2-6', () => {
    expect(validateOffering({ ...valid, groupEnabled: true, groupRate: '250', groupSeats: '4' })).toEqual({});
    expect(validateOffering({ ...valid, groupEnabled: true, groupRate: '500', groupSeats: '4' }).groupRate?.key).toBe('tutoring.tutor.validation.groupRateAbove');
    expect(validateOffering({ ...valid, groupEnabled: true, groupRate: '250', groupSeats: '1' }).groupSeats?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validateOffering({ ...valid, groupEnabled: true, groupRate: '250', groupSeats: '7' }).groupSeats?.key).toBe('tutoring.tutor.validation.outOfRange');
  });

  it('allows a free trial and refuses a trial dearer than an hour', () => {
    expect(validateOffering({ ...valid, trialEnabled: true, trialPrice: '0' })).toEqual({});
    expect(validateOffering({ ...valid, trialEnabled: true, trialPrice: '999' }).trialPrice?.key).toBe('tutoring.tutor.validation.trialPriceAbove');
  });

  it('sends null for everything switched off (the API requires the pairs to be all-or-nothing)', () => {
    expect(offeringRequest(valid)).toEqual({
      subjectId: 'sub-1',
      level: 'UpperSecondary',
      curriculum: 'Thai',
      hourlyRateOneOnOne: 450,
      groupHourlyRatePerSeat: null,
      groupMaxSeats: null,
      trialEnabled: false,
      trialMinutes: null,
      trialPrice: null,
      isActive: true,
    });
    expect(offeringRequest({ ...valid, groupEnabled: true, groupRate: '250', groupSeats: '4', trialEnabled: true, trialMinutes: '15', trialPrice: '0' })).toMatchObject({
      groupHourlyRatePerSeat: 250,
      groupMaxSeats: 4,
      trialEnabled: true,
      trialMinutes: 15,
      trialPrice: 0,
    });
  });

  it('round-trips an offering through the form', () => {
    const offering: TutorOffering = {
      offeringId: 'o1',
      subject: { subjectId: 'sub-1', slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics' },
      level: 'Competitive',
      curriculum: 'EP',
      hourlyRateOneOnOne: 600,
      groupHourlyRatePerSeat: 300,
      groupMaxSeats: 5,
      trialEnabled: true,
      trialMinutes: 15,
      trialPrice: 0,
      isActive: false,
    };
    const form = offeringToForm(offering);
    expect(offeringRequest(form)).toEqual({
      subjectId: 'sub-1',
      level: 'Competitive',
      curriculum: 'EP',
      hourlyRateOneOnOne: 600,
      groupHourlyRatePerSeat: 300,
      groupMaxSeats: 5,
      trialEnabled: true,
      trialMinutes: 15,
      trialPrice: 0,
      isActive: false,
    });
  });

  describe('subject choices', () => {
    const SCIENCES = { subjectId: 'sub-sciences', slug: 'sciences', nameTh: 'วิทยาศาสตร์', nameEn: 'Sciences', parentSlug: null, sortOrder: 0 };
    const PHYSICS = { subjectId: 'sub-physics', slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentSlug: 'sciences', sortOrder: 0 };
    const CHEMISTRY = { subjectId: 'sub-chem', slug: 'chemistry', nameTh: 'เคมี', nameEn: 'Chemistry', parentSlug: 'sciences', sortOrder: 1 };
    const ART = { subjectId: 'sub-art', slug: 'art', nameTh: 'ศิลปะ', nameEn: 'Art', parentSlug: null, sortOrder: 2 };
    const taught = (subject: { subjectId: string; slug: string; nameTh: string; nameEn: string }) => ({ subject }) as TutorOffering;
    const OLD = { subjectId: 'sub-old', slug: 'old', nameTh: 'เก่า', nameEn: 'Old' };

    it('takes the ids from the catalogue and keeps its order', () => {
      expect(selectableSubjects([SCIENCES, PHYSICS, CHEMISTRY], []).map((subject) => subject.subjectId)).toEqual(['sub-sciences', 'sub-physics', 'sub-chem']);
    });

    it('adds a subject the tutor teaches but the catalogue no longer lists, flagged as retired, and never duplicates one it still lists', () => {
      const result = selectableSubjects([SCIENCES], [taught(SCIENCES), taught(OLD)]);
      expect(result.map((subject) => [subject.subjectId, subject.retired])).toEqual([
        ['sub-sciences', false],
        ['sub-old', true],
      ]);
    });

    it('groups by parent: each top-level subject first, its subjects indented beneath it, in the active language', () => {
      const choices = subjectChoicesOf(selectableSubjects([SCIENCES, ART, PHYSICS, CHEMISTRY], []), 'en');
      expect(choices.map((choice) => [choice.subjectId, choice.label.trim()])).toEqual([
        ['sub-sciences', 'Sciences'],
        ['sub-physics', 'Physics'],
        ['sub-chem', 'Chemistry'],
        ['sub-art', 'Art'],
      ]);
      expect(choices[1].label.startsWith('\u00a0')).toBe(true);
      expect(choices[0].label.startsWith('\u00a0')).toBe(false);
      expect(subjectChoicesOf(selectableSubjects([SCIENCES, PHYSICS], []), 'th').map((choice) => choice.label.trim())).toEqual(['วิทยาศาสตร์', 'ฟิสิกส์']);
    });

    it('shows a subject whose group is not in the list on its own instead of losing it', () => {
      expect(subjectChoicesOf(selectableSubjects([PHYSICS], []), 'en').map((choice) => choice.label)).toEqual(['Physics']);
    });

    it('disables a retired subject, so a new offering can not pick what the server would refuse', () => {
      const choices = subjectChoicesOf(selectableSubjects([ART], [taught(OLD)]), 'en');
      expect(choices.map((choice) => [choice.subjectId, choice.disabled === true])).toEqual([
        ['sub-art', false],
        ['sub-old', true],
      ]);
    });
  });
});

describe('credential forms', () => {
  it('requires the institution, the degree and a start year; the end year is optional and cannot precede the start', () => {
    expect(Object.keys(validateEducation(emptyEducationForm(), 2026)).sort()).toEqual(['degree', 'institution', 'yearFrom']);
    const ok = { institution: 'Chula', degree: 'B.Sc.', field: '', yearFrom: '2012', yearTo: '' };
    expect(validateEducation(ok, 2026)).toEqual({});
    expect(validateEducation({ ...ok, yearTo: '2010' }, 2026).yearTo?.key).toBe('tutoring.tutor.validation.yearOrder');
    expect(validateEducation({ ...ok, yearTo: '2040' }, 2026).yearTo?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validateEducation({ ...ok, yearFrom: '2030' }, 2026).yearFrom?.key).toBe('tutoring.tutor.validation.outOfRange');
  });

  it('sends null for a still-running study and a blank field', () => {
    expect(educationRequest({ institution: ' Chula ', degree: 'B.Sc.', field: ' ', yearFrom: '2012', yearTo: '' }, 3)).toEqual({
      institution: 'Chula',
      degree: 'B.Sc.',
      field: null,
      yearFrom: 2012,
      yearTo: null,
      sortOrder: 3,
    });
  });

  it('requires a certificate title and a year in range', () => {
    expect(Object.keys(validateCertificate(emptyCertificateForm(), 2026)).sort()).toEqual(['title', 'year']);
    expect(validateCertificate({ title: 'Licence', issuer: '', year: '2018' }, 2026)).toEqual({});
    expect(validateCertificate({ title: 'Licence', issuer: '', year: '1900' }, 2026).year?.key).toBe('tutoring.tutor.validation.outOfRange');
  });
});
