import { kycCase, kycDocument } from '../testing/fixtures';
import { KYC_NOTE_MAX, formatBytes, isDecidable, kycDecisionIssue, pendingDocuments, previewKindOf, verdictsToSend } from './kyc-case.util';

describe('kyc case helpers', () => {
  it('lets only a submitted or in-review case be decided', () => {
    expect(isDecidable('Submitted')).toBe(true);
    expect(isDecidable('InReview')).toBe(true);
    for (const status of ['Draft', 'NeedsInfo', 'Approved', 'Rejected'] as const) {
      expect(isDecidable(status)).toBe(false);
    }
  });

  it('lists the documents still waiting for a verdict and skips judged and deleted ones', () => {
    const detail = kycCase({
      documents: [
        kycDocument({ documentId: 'a', status: 'Pending' }),
        kycDocument({ documentId: 'b', status: 'Approved' }),
        kycDocument({ documentId: 'c', status: 'Pending', purged: true }),
      ],
    });
    expect(pendingDocuments(detail).map((document) => document.documentId)).toEqual(['a']);
  });

  it('sends verdicts only for documents that are still pending (an earlier verdict is final)', () => {
    const detail = kycCase({
      documents: [kycDocument({ documentId: 'a', status: 'Pending' }), kycDocument({ documentId: 'b', status: 'Approved' })],
    });
    expect(verdictsToSend(detail, { a: 'Approved', b: 'Rejected', gone: 'Approved' })).toEqual([{ documentId: 'a', status: 'Approved' }]);
    expect(verdictsToSend(detail, {})).toEqual([]);
  });

  describe('kycDecisionIssue', () => {
    it('lets an approval through without a note once every pending document has a verdict', () => {
      expect(kycDecisionIssue('Approve', '', 0)).toBeNull();
    });

    it('holds an approval back while a pending document has no verdict', () => {
      expect(kycDecisionIssue('Approve', '', 2)).toBe('undecidedDocuments');
    });

    it('needs a note to reject or ask for more, and ignores undecided documents then', () => {
      expect(kycDecisionIssue('Reject', '   ', 0)).toBe('noteRequired');
      expect(kycDecisionIssue('NeedsInfo', '', 3)).toBe('noteRequired');
      expect(kycDecisionIssue('Reject', 'Photo unreadable', 3)).toBeNull();
    });

    it('refuses a note over the limit', () => {
      expect(kycDecisionIssue('Reject', 'x'.repeat(KYC_NOTE_MAX + 1), 0)).toBe('noteTooLong');
      expect(kycDecisionIssue('Reject', 'x'.repeat(KYC_NOTE_MAX), 0)).toBeNull();
    });
  });

  it('shows sizes roughly, never as zero', () => {
    expect(formatBytes(10)).toBe('1 KB');
    expect(formatBytes(250_000)).toBe('244 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
  });

  it('chooses the preview from the type the server decided on, and renders nothing it does not know', () => {
    expect(previewKindOf('image/jpeg')).toBe('image');
    expect(previewKindOf('image/png')).toBe('image');
    expect(previewKindOf('application/pdf')).toBe('pdf');
    expect(previewKindOf('Application/PDF; charset=binary')).toBe('pdf');
    expect(previewKindOf('image/svg+xml')).toBe('other');
    expect(previewKindOf('text/html')).toBe('other');
    expect(previewKindOf('')).toBe('other');
  });
});
