import type { TutorPackage } from '../data/tutoring-packages.models';
import { PACKAGE_LIMITS, defaultPackageDuration, emptyPackageForm, packageRequest, packageToForm, validatePackage } from './tutor-package-form.util';

const PACKAGE: TutorPackage = {
  packageId: 'p-1',
  offering: { offeringId: 'o-1', subjectNameTh: 'ฟิสิกส์', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
  sessionCount: 8,
  durationMinutes: 90,
  discountPercent: 12.5,
  validDays: 120,
  singleSessionPrice: 675,
  totalPrice: 4725,
  pricePerSession: 590.63,
  savingsAmount: 675,
  currency: 'THB',
  isActive: false,
  rowVersion: 'AAAAAAAAB9E=',
};

// The allowed lesson lengths are the server's list (`allowedDurationMinutes`), always handed in - the validator has no list of its own.
const LENGTHS = [30, 60, 90, 120];

describe('package form', () => {
  it('starts with the documented defaults for the chosen subject', () => {
    const blank = emptyPackageForm('o-9', LENGTHS);
    expect(blank).toMatchObject({ offeringId: 'o-9', sessionCount: '10', durationMinutes: '60', validDays: '90', isActive: true });
    expect(validatePackage(blank, LENGTHS)).toEqual({});
  });

  it('starts on 60 minutes only when the server allows it, else on the shortest allowed length, and never on an unlisted one', () => {
    expect(defaultPackageDuration([30, 60, 90])).toBe('60');
    expect(defaultPackageDuration([90, 45])).toBe('45');
    expect(emptyPackageForm('o-1', [45, 90]).durationMinutes).toBe('45');
    expect(defaultPackageDuration([])).toBe('');
  });

  it('needs a subject and keeps every number inside the documented ranges', () => {
    const blank = emptyPackageForm('o-1', LENGTHS);
    expect(validatePackage({ ...blank, offeringId: '' }, LENGTHS).offeringId?.key).toBe('tutoring.tutor.validation.required');
    expect(validatePackage({ ...blank, sessionCount: '1' }, LENGTHS).sessionCount?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, sessionCount: String(PACKAGE_LIMITS.sessionCount.max + 1) }, LENGTHS).sessionCount?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, sessionCount: '2.5' }, LENGTHS).sessionCount?.key).toBe('tutoring.tutor.validation.wholeNumber');
    expect(validatePackage({ ...blank, validDays: '6' }, LENGTHS).validDays?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, validDays: '366' }, LENGTHS).validDays?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, durationMinutes: '45' }, LENGTHS).durationMinutes?.key).toBe('tutoring.tutor.validation.notAllowed');
    expect(validatePackage({ ...blank, durationMinutes: '45' }, [45, 90])).toEqual({});
  });

  it('checks the discount: 0 to 50, at most two decimals', () => {
    const blank = emptyPackageForm('o-1', LENGTHS);
    expect(validatePackage({ ...blank, discountPercent: '0' }, LENGTHS)).toEqual({});
    expect(validatePackage({ ...blank, discountPercent: '50' }, LENGTHS)).toEqual({});
    expect(validatePackage({ ...blank, discountPercent: '12,5' }, LENGTHS)).toEqual({});
    expect(validatePackage({ ...blank, discountPercent: '50.01' }, LENGTHS).discountPercent?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, discountPercent: '-1' }, LENGTHS).discountPercent?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, discountPercent: '10.123' }, LENGTHS).discountPercent?.key).toBe('tutoring.tutor.validation.tooManyDecimals');
    expect(validatePackage({ ...blank, discountPercent: 'ten' }, LENGTHS).discountPercent?.key).toBe('tutoring.tutor.validation.notANumber');
    expect(validatePackage({ ...blank, discountPercent: '' }, LENGTHS).discountPercent?.key).toBe('tutoring.tutor.validation.required');
  });

  it('round-trips a stored package into a request without ever carrying a price', () => {
    const request = packageRequest(packageToForm(PACKAGE));
    expect(request).toEqual({ offeringId: 'o-1', sessionCount: 8, durationMinutes: 90, discountPercent: 12.5, validDays: 120, isActive: false });
    expect(Object.keys(request).some((key) => /price|amount|total|savings/i.test(key))).toBe(false);
  });
});
