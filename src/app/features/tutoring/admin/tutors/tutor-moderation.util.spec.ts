import { commissionIssue, commissionValue, reasonIssue } from './tutor-moderation.util';

describe('reasonIssue', () => {
  it('requires a reason to suspend or change a commission, and not to reinstate', () => {
    expect(reasonIssue('', true)?.key).toBe('tutoring.tutor.validation.required');
    expect(reasonIssue('   ', true)?.key).toBe('tutoring.tutor.validation.required');
    expect(reasonIssue('', false)).toBeUndefined();
  });

  it('caps the length at 1000 characters', () => {
    expect(reasonIssue('x'.repeat(1000), true)).toBeUndefined();
    expect(reasonIssue('x'.repeat(1001), true)).toEqual({ key: 'tutoring.tutor.validation.tooLong', params: { max: 1000 } });
    expect(reasonIssue('x'.repeat(1001), false)?.key).toBe('tutoring.tutor.validation.tooLong');
  });
});

describe('commissionIssue', () => {
  it('accepts 0 to 50 with up to two decimals', () => {
    for (const value of ['0', '50', '15', '12.5', '12.25', '12,5']) {
      expect(commissionIssue(value)).toBeUndefined();
    }
  });

  it('refuses what the API refuses', () => {
    expect(commissionIssue('')?.key).toBe('tutoring.tutor.validation.required');
    expect(commissionIssue('abc')?.key).toBe('tutoring.tutor.validation.notANumber');
    expect(commissionIssue('12.345')?.key).toBe('tutoring.tutor.validation.tooManyDecimals');
    expect(commissionIssue('-1')?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(commissionIssue('50.01')?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(commissionIssue('51')?.params).toEqual({ min: 0, max: 50 });
  });
});

describe('commissionValue', () => {
  it('sends null when the override is cleared and the number otherwise', () => {
    expect(commissionValue(true, '15')).toBeNull();
    expect(commissionValue(false, '15')).toBe(15);
    expect(commissionValue(false, '12,5')).toBe(12.5);
  });
});
