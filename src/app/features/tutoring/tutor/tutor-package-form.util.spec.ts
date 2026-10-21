import type { TutorPackage } from '../data/tutoring-packages.models';
import { PACKAGE_LIMITS, emptyPackageForm, packageRequest, packageToForm, validatePackage } from './tutor-package-form.util';

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

describe('package form', () => {
  it('starts with the documented defaults for the chosen subject', () => {
    const blank = emptyPackageForm('o-9');
    expect(blank).toMatchObject({ offeringId: 'o-9', sessionCount: '10', durationMinutes: '60', validDays: '90', isActive: true });
    expect(validatePackage(blank)).toEqual({});
  });

  it('needs a subject and keeps every number inside the documented ranges', () => {
    const blank = emptyPackageForm('o-1');
    expect(validatePackage({ ...blank, offeringId: '' }).offeringId?.key).toBe('tutoring.tutor.validation.required');
    expect(validatePackage({ ...blank, sessionCount: '1' }).sessionCount?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, sessionCount: String(PACKAGE_LIMITS.sessionCount.max + 1) }).sessionCount?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, sessionCount: '2.5' }).sessionCount?.key).toBe('tutoring.tutor.validation.wholeNumber');
    expect(validatePackage({ ...blank, validDays: '6' }).validDays?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, validDays: '366' }).validDays?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, durationMinutes: '45' }).durationMinutes?.key).toBe('tutoring.tutor.validation.notAllowed');
    expect(validatePackage({ ...blank, durationMinutes: '45' }, [45, 90])).toEqual({});
  });

  it('checks the discount: 0 to 50, at most two decimals', () => {
    const blank = emptyPackageForm('o-1');
    expect(validatePackage({ ...blank, discountPercent: '0' })).toEqual({});
    expect(validatePackage({ ...blank, discountPercent: '50' })).toEqual({});
    expect(validatePackage({ ...blank, discountPercent: '12,5' })).toEqual({});
    expect(validatePackage({ ...blank, discountPercent: '50.01' }).discountPercent?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, discountPercent: '-1' }).discountPercent?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validatePackage({ ...blank, discountPercent: '10.123' }).discountPercent?.key).toBe('tutoring.tutor.validation.tooManyDecimals');
    expect(validatePackage({ ...blank, discountPercent: 'ten' }).discountPercent?.key).toBe('tutoring.tutor.validation.notANumber');
    expect(validatePackage({ ...blank, discountPercent: '' }).discountPercent?.key).toBe('tutoring.tutor.validation.required');
  });

  it('round-trips a stored package into a request without ever carrying a price', () => {
    const request = packageRequest(packageToForm(PACKAGE));
    expect(request).toEqual({ offeringId: 'o-1', sessionCount: 8, durationMinutes: 90, discountPercent: 12.5, validDays: 120, isActive: false });
    expect(Object.keys(request).some((key) => /price|amount|total|savings/i.test(key))).toBe(false);
  });
});
