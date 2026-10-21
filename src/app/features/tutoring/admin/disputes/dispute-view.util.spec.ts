import { disputeItem } from '../testing/fixtures';
import { STATUS_PARAMS, formatBaht, isActiveDispute, isAwaitingAdmin, rowFlags, statusParamToQuery } from './dispute-view.util';

describe('dispute view helpers', () => {
  it('sends nothing for the default view, one status for a chosen one and all five for "all"', () => {
    expect(statusParamToQuery(null)).toBeUndefined();
    expect(statusParamToQuery('Resolved')).toEqual(['Resolved']);
    expect(statusParamToQuery('all')).toEqual(['Open', 'UnderReview', 'Resolved', 'Rejected', 'Withdrawn']);
    expect(STATUS_PARAMS).toContain('all');
  });

  it('calls a case active while it is open or under review', () => {
    expect(isActiveDispute('Open')).toBe(true);
    expect(isActiveDispute('UnderReview')).toBe(true);
    for (const status of ['Resolved', 'Rejected', 'Withdrawn'] as const) {
      expect(isActiveDispute(status)).toBe(false);
    }
  });

  it('says a case waits for us when a party wrote last on an active case', () => {
    expect(isAwaitingAdmin({ status: 'Open', lastMessageRole: 'Learner' })).toBe(true);
    expect(isAwaitingAdmin({ status: 'UnderReview', lastMessageRole: 'Tutor' })).toBe(true);
    expect(isAwaitingAdmin({ status: 'Open', lastMessageRole: 'Admin' })).toBe(false);
    expect(isAwaitingAdmin({ status: 'Open', lastMessageRole: null })).toBe(false);
    expect(isAwaitingAdmin({ status: 'Resolved', lastMessageRole: 'Learner' })).toBe(false);
  });

  describe('rowFlags', () => {
    const labels = (flags: ReturnType<typeof rowFlags>): string[] => flags.map((flag) => flag.labelKey.split('.').pop() ?? '');

    it('shows no flag for an ordinary case that an administrator last answered', () => {
      expect(rowFlags(disputeItem({ lastMessageRole: 'Admin' }))).toEqual([]);
    });

    it('shows the server\'s own flags, priority first', () => {
      const flags = rowFlags(
        disputeItem({ priority: 'High', isOverdue: true, repeatComplaintFlag: true, compensationRequired: true, compensationSettled: false, escrowFreeze: 'TooLate', lastMessageRole: 'Learner' }),
      );
      expect(labels(flags)).toEqual(['High', 'overdue', 'awaitingReply', 'repeatComplaint', 'followUp', 'tooLate']);
    });

    it('stops flagging a compensation once it is settled', () => {
      expect(labels(rowFlags(disputeItem({ compensationRequired: true, compensationSettled: true, lastMessageRole: 'Admin' })))).toEqual([]);
    });
  });

  it('writes baht for a sentence in the language of the page', () => {
    expect(formatBaht(1234.5, 'en')).toBe('฿1,234.50');
    expect(formatBaht(1234.5, 'th')).toBe('฿1,234.50');
  });
});
