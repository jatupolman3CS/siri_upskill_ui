const KNOWN_RULES: Readonly<Record<string, string>> = {
  'learner_cancel.full': 'tutoring.learner.my.cancel.rule.full',
  'learner_cancel.late': 'tutoring.learner.my.cancel.rule.late',
  'pending_payment.abandon': 'tutoring.learner.my.cancel.rule.abandon',
};

/**
 * The sentence that explains which cancellation rule the server applied (the `ruleCode` of a cancellation quote, P13-08 section 5). An unknown
 * code reads as a neutral sentence. These texts live in the learner dictionary, so this sits with the learner's cancel dialog rather than in the
 * shared `data/` layer that the administrator screens import too.
 */
export function cancelRuleKey(ruleCode: string): string {
  return KNOWN_RULES[ruleCode] ?? 'tutoring.learner.my.cancel.rule.other';
}
