import { TUTORING_EN as en, TUTORING_TH as th } from '../../../testing/tutoring-i18n';
import { cancelRuleKey } from './cancel-rule';

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

describe('cancelRuleKey', () => {
  it.each(['learner_cancel.full', 'learner_cancel.late', 'pending_payment.abandon', 'something.new'])('has a sentence for rule %s in both languages', (rule) => {
    const key = cancelRuleKey(rule);
    expect(typeof lookup(th, key)).toBe('string');
    expect(typeof lookup(en, key)).toBe('string');
  });

  it('reads an unknown rule as a neutral sentence rather than echoing the code', () => {
    expect(cancelRuleKey('something.new')).toBe('tutoring.learner.my.cancel.rule.other');
  });

  it('knows the three rules a quote can carry', () => {
    expect(cancelRuleKey('learner_cancel.full')).toBe('tutoring.learner.my.cancel.rule.full');
    expect(cancelRuleKey('learner_cancel.late')).toBe('tutoring.learner.my.cancel.rule.late');
    expect(cancelRuleKey('pending_payment.abandon')).toBe('tutoring.learner.my.cancel.rule.abandon');
  });
});
