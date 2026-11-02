import { ApiError } from '../../../core/http/error.interceptor';
import { nothingToPayHeldBackOf, payoutReasonKey, payoutReasonOf, serverMessageOr } from './payout-batch-error.util';

/** What the error interceptor makes of `Results.Problem(409, title, extensions)`: the whole ProblemDetails is `details`. */
const conflict = (members: Record<string, unknown>, status = 409): ApiError =>
  new ApiError(status, 'ไม่มีรายการที่ต้องจ่าย', 'conflict', { type: 't', title: 'ไม่มีรายการที่ต้องจ่าย', status, traceId: 'x', errorCode: 'conflict', ...members });

describe('nothingToPayHeldBackOf', () => {
  it('reads the three held-back members from the top level of the ProblemDetails', () => {
    const held = nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay', heldBackTutorCount: 3, heldBackRowCount: 5, heldBackAmount: 4500.5 }));
    expect(held).toEqual({ tutorCount: 3, rowCount: 5, amount: 4500.5 });
  });

  it('treats missing row count / amount as zero but needs a positive tutor count', () => {
    expect(nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay', heldBackTutorCount: 1 }))).toEqual({ tutorCount: 1, rowCount: 0, amount: 0 });
    expect(nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay', heldBackTutorCount: 0 }))).toBeNull();
    expect(nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay' }))).toBeNull();
  });

  it('ignores the shapes an ASP.NET answer never has: a nested "extensions" object, the old "heldBackCount" key, numbers sent as text', () => {
    expect(nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay', extensions: { heldBackTutorCount: 3, heldBackAmount: 10 } }))).toBeNull();
    expect(nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay', heldBackCount: 3 }))).toBeNull();
    expect(nothingToPayHeldBackOf(conflict({ reason: 'payout.nothing_to_pay', heldBackTutorCount: '3' }))).toBeNull();
  });

  it('answers only a 409 that carries the nothing_to_pay reason and came through the error interceptor', () => {
    const members = { heldBackTutorCount: 2, heldBackRowCount: 2, heldBackAmount: 10 };
    expect(nothingToPayHeldBackOf(conflict({ ...members, reason: 'payout.batch_exists' }))).toBeNull();
    expect(nothingToPayHeldBackOf(conflict({ ...members, reason: 'payout.nothing_to_pay' }, 400))).toBeNull();
    expect(nothingToPayHeldBackOf(conflict(members))).toBeNull();
    // A raw HttpErrorResponse-shaped value (what the page used to read) is not an ApiError.
    expect(nothingToPayHeldBackOf({ status: 409, error: { reason: 'payout.nothing_to_pay', ...members } })).toBeNull();
    expect(nothingToPayHeldBackOf(new ApiError(409, 'x'))).toBeNull();
    expect(nothingToPayHeldBackOf(undefined)).toBeNull();
  });
});

describe('payoutReasonOf / payoutReasonKey', () => {
  it('finds the reason extension and maps the ones it knows', () => {
    expect(payoutReasonOf(conflict({ reason: 'payout.batch_exists' }))).toBe('payout.batch_exists');
    expect(payoutReasonKey(conflict({ reason: 'payout.batch_exists' }))).toBe('admin.payouts.errors.reasons.batchExists');
    expect(payoutReasonKey(conflict({ reason: 'payout.period_not_started' }))).toBe('admin.payouts.errors.reasons.periodNotStarted');
  });

  it('knows nothing of a reason it was not told about, or of an error without a body', () => {
    expect(payoutReasonKey(conflict({ reason: 'payout.something_new' }))).toBeNull();
    expect(payoutReasonKey(conflict({}))).toBeNull();
    expect(payoutReasonKey(new ApiError(0, 'common.error'))).toBeNull();
    expect(payoutReasonOf('boom')).toBeNull();
  });
});

describe('serverMessageOr', () => {
  it('never shows the server text (not translated); appends the reason, else the errorCode, to the line of the caller', () => {
    expect(serverMessageOr(new ApiError(409, 'รอบนี้ถูกยืนยันจ่ายไปแล้ว'), 'fallback')).toBe('fallback');
    expect(serverMessageOr(new ApiError(409, 'x', 'conflict', { title: 'x', reason: 'payout.batch_exists', errorCode: 'conflict' }), 'fallback')).toBe('fallback (payout.batch_exists)');
    expect(serverMessageOr(new ApiError(409, 'x', 'conflict', { title: 'x', errorCode: 'conflict' }), 'fallback')).toBe('fallback (conflict)');
  });

  it('uses the caller\'s line when there is no message, or only the interceptor\'s placeholder, or not an ApiError at all', () => {
    expect(serverMessageOr(new ApiError(502, 'common.error'), 'fallback')).toBe('fallback');
    expect(serverMessageOr(new ApiError(500, '  '), 'fallback')).toBe('fallback');
    expect(serverMessageOr(new Error('network down'), 'fallback')).toBe('fallback');
    expect(serverMessageOr({ error: { detail: 'old shape' } }, 'fallback')).toBe('fallback');
  });
});
