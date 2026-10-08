import { TestBed } from '@angular/core/testing';

import { ApiError } from '../../../core/http/error.interceptor';
import { LiveSubmitIssues } from './live-submit-issues.service';

describe('LiveSubmitIssues', () => {
  let issues: LiveSubmitIssues;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    issues = TestBed.inject(LiveSubmitIssues);
  });

  it('records the sessions named by a live.meetings_not_ready refusal', () => {
    const error = new ApiError(400, 'x', 'validation', { reason: 'live.meetings_not_ready', sessionIds: ['s1', 's2'] });
    expect(issues.capture(error)).toBe(true);
    expect(issues.notReadySessionIds()).toEqual(['s1', 's2']);
  });

  it('ignores every other failure and leaves the marks untouched', () => {
    issues.capture(new ApiError(400, 'x', 'validation', { reason: 'live.meetings_not_ready', sessionIds: ['s1'] }));
    expect(issues.capture(new ApiError(409, 'x', 'conflict', { reason: 'something.else' }))).toBe(false);
    expect(issues.capture(new Error('boom'))).toBe(false);
    expect(issues.notReadySessionIds()).toEqual(['s1']);
  });

  it('clear() empties the marks', () => {
    issues.capture(new ApiError(400, 'x', 'validation', { reason: 'live.meetings_not_ready', sessionIds: ['s1'] }));
    issues.clear();
    expect(issues.notReadySessionIds()).toEqual([]);
  });
});
