import {
  DISPUTE_LIMITS,
  REVIEW_LIMITS,
  disputeDescriptionIssue,
  disputeMessageIssue,
  evidenceInputs,
  evidenceRowIssue,
  firstEvidenceIssue,
  hostOfUrl,
  reviewCommentIssue,
} from './feedback-form.util';

describe('reviewCommentIssue', () => {
  it('lets a review go without a comment', () => {
    expect(reviewCommentIssue('')).toBeUndefined();
    expect(reviewCommentIssue('   ')).toBeUndefined();
  });

  it('refuses markup and a comment longer than the limit', () => {
    expect(reviewCommentIssue('<script>alert(1)</script>')?.key).toBe('tutoring.tutor.validation.noMarkup');
    expect(reviewCommentIssue('a'.repeat(REVIEW_LIMITS.comment + 1))?.key).toBe('tutoring.tutor.validation.tooLong');
    expect(reviewCommentIssue('a'.repeat(REVIEW_LIMITS.comment))).toBeUndefined();
  });
});

describe('dispute text rules', () => {
  it('asks for a description of at least ten characters', () => {
    expect(disputeDescriptionIssue('')?.key).toBe('tutoring.tutor.validation.required');
    expect(disputeDescriptionIssue('too short')?.key).toBe('tutoring.tutor.validation.tooShort');
    expect(disputeDescriptionIssue('The tutor never joined.')).toBeUndefined();
  });

  it('asks for a message of at least one character and at most the limit', () => {
    expect(disputeMessageIssue('   ')?.key).toBe('tutoring.tutor.validation.required');
    expect(disputeMessageIssue('x'.repeat(DISPUTE_LIMITS.message + 1))?.key).toBe('tutoring.tutor.validation.tooLong');
    expect(disputeMessageIssue('x')).toBeUndefined();
  });

  it('refuses markup in a dispute text', () => {
    expect(disputeMessageIssue('see <img src=x onerror=alert(1)>')?.key).toBe('tutoring.tutor.validation.noMarkup');
  });
});

describe('evidenceRowIssue', () => {
  it('ignores a row with nothing in it', () => {
    expect(evidenceRowIssue({ url: '', label: '' })).toBeUndefined();
    expect(evidenceRowIssue({ url: '  ', label: ' ' })).toBeUndefined();
  });

  it('asks for the link when only a label was typed', () => {
    expect(evidenceRowIssue({ url: '', label: 'Screenshot' })?.key).toBe('tutoring.dispute.validation.linkRequired');
  });

  it('accepts a public https link', () => {
    expect(evidenceRowIssue({ url: 'https://files.example.test/a.png', label: 'Screenshot' })).toBeUndefined();
  });

  it.each([
    ['http://files.example.test/a.png', 'tutoring.dispute.validation.linkNotHttps'],
    ['javascript:alert(1)', 'tutoring.dispute.validation.linkNotHttps'],
    ['not a link', 'tutoring.dispute.validation.linkInvalid'],
    ['https://user:secret@files.example.test/a.png', 'tutoring.dispute.validation.linkInvalid'],
    ['https://localhost/a.png', 'tutoring.dispute.validation.linkInvalid'],
    ['https://192.168.0.10/a.png', 'tutoring.dispute.validation.linkInvalid'],
    ['https://[::1]/a.png', 'tutoring.dispute.validation.linkInvalid'],
    ['https://printer.local/a.png', 'tutoring.dispute.validation.linkInvalid'],
    ['https://db.internal/a.png', 'tutoring.dispute.validation.linkInvalid'],
  ])('refuses %s', (url, key) => {
    expect(evidenceRowIssue({ url, label: '' })?.key).toBe(key);
  });

  it('refuses a link or a label that is too long', () => {
    expect(evidenceRowIssue({ url: `https://files.example.test/${'a'.repeat(DISPUTE_LIMITS.linkUrl)}`, label: '' })?.key).toBe('tutoring.tutor.validation.tooLong');
    expect(evidenceRowIssue({ url: 'https://files.example.test/a', label: 'x'.repeat(DISPUTE_LIMITS.linkLabel + 1) })?.key).toBe('tutoring.tutor.validation.tooLong');
  });
});

describe('evidenceInputs and firstEvidenceIssue', () => {
  it('sends nothing when no row is filled, and a trimmed link with a null label otherwise', () => {
    expect(evidenceInputs([{ url: '', label: '' }])).toBeNull();
    expect(evidenceInputs([{ url: ' https://a.example.test/x ', label: '  ' }, { url: '', label: '' }, { url: 'https://b.example.test/y', label: ' Photo ' }])).toEqual([
      { url: 'https://a.example.test/x', label: null },
      { url: 'https://b.example.test/y', label: 'Photo' },
    ]);
  });

  it('finds the first row that cannot be sent', () => {
    const rows = [
      { url: 'https://a.example.test/x', label: '' },
      { url: 'http://insecure.example.test', label: '' },
    ];

    expect(firstEvidenceIssue(rows)).toMatchObject({ index: 1 });
    expect(firstEvidenceIssue([rows[0]])).toBeUndefined();
  });
});

describe('hostOfUrl', () => {
  it('shows the host, or the text itself when it is not a link', () => {
    expect(hostOfUrl('https://files.example.test/a.png')).toBe('files.example.test');
    expect(hostOfUrl('nonsense')).toBe('nonsense');
  });
});
