import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PLAYBACK_RENEWAL_MARGIN_MS,
  PlaybackRenewalTimer,
  computeAuthPrefixRewrite,
  computeRenewalDelayMs,
  rewriteRequestUris,
} from './playback-url-renewal';

describe('computeAuthPrefixRewrite', () => {
  it('diffs a renewed Bunny signed URL to the stale->fresh auth-prefix swap, keeping the invariant token_path/video-path in the shared suffix', () => {
    const original =
      'https://cdn.example.com/bcdn_token=OLDTOKEN&expires=1000&token_path=%2Fvid123%2F/vid123/playlist.m3u8';
    const fresh =
      'https://cdn.example.com/bcdn_token=NEWTOKEN&expires=2000&token_path=%2Fvid123%2F/vid123/playlist.m3u8';

    const rewrite = computeAuthPrefixRewrite(original, fresh);

    expect(rewrite).toEqual({
      oldPrefix: 'https://cdn.example.com/bcdn_token=OLDTOKEN&expires=1000',
      newPrefix: 'https://cdn.example.com/bcdn_token=NEWTOKEN&expires=2000',
    });
  });

  it('does not misplace the boundary when expires timestamps coincidentally share trailing digits', () => {
    // Regression test: a naive longest-common-suffix diff treats the shared trailing "000" of
    // 1758000000 / 1758000300 as part of the "invariant" suffix, corrupting the split point by
    // 3 characters. Two renewals ~5 minutes (300s) apart can plausibly share trailing digits like
    // this for real Unix timestamps, not just in this contrived example.
    const original = 'https://cdn.example.com/bcdn_token=OLD&expires=1758000000&token_path=%2Fv%2F/v/playlist.m3u8';
    const fresh = 'https://cdn.example.com/bcdn_token=NEW&expires=1758000300&token_path=%2Fv%2F/v/playlist.m3u8';

    const rewrite = computeAuthPrefixRewrite(original, fresh);

    expect(rewrite).toEqual({
      oldPrefix: 'https://cdn.example.com/bcdn_token=OLD&expires=1758000000',
      newPrefix: 'https://cdn.example.com/bcdn_token=NEW&expires=1758000300',
    });
  });

  it('returns null when the URLs are identical (unsigned dev/mock stream — nothing to renew)', () => {
    const url = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    expect(computeAuthPrefixRewrite(url, url)).toBeNull();
  });

  it('returns null when there is no shared suffix at all', () => {
    expect(computeAuthPrefixRewrite('https://a.example/one', 'https://b.example/two')).toBeNull();
  });
});

describe('rewriteRequestUris', () => {
  const rewrite = {
    oldPrefix: 'https://cdn.example.com/bcdn_token=OLD&expires=1000&token_path=%2Fvid123%2F',
    newPrefix: 'https://cdn.example.com/bcdn_token=NEW&expires=2000&token_path=%2Fvid123%2F',
  };

  it('rewrites the manifest URI to carry the fresh token', () => {
    const uris = [`${rewrite.oldPrefix}/vid123/playlist.m3u8`];
    expect(rewriteRequestUris(uris, rewrite)).toEqual([`${rewrite.newPrefix}/vid123/playlist.m3u8`]);
  });

  it('rewrites segment URIs resolved relative to the stale manifest the same way', () => {
    const uris = [
      `${rewrite.oldPrefix}/vid123/video/segment_0.ts`,
      `${rewrite.oldPrefix}/vid123/video/segment_1.ts`,
    ];
    expect(rewriteRequestUris(uris, rewrite)).toEqual([
      `${rewrite.newPrefix}/vid123/video/segment_0.ts`,
      `${rewrite.newPrefix}/vid123/video/segment_1.ts`,
    ]);
  });

  it('leaves unrelated URIs untouched', () => {
    const uris = ['https://other-host.example/unrelated.ts'];
    expect(rewriteRequestUris(uris, rewrite)).toEqual(uris);
  });

  it('passes every URI through unchanged when there is no rewrite yet', () => {
    const uris = [`${rewrite.oldPrefix}/vid123/playlist.m3u8`];
    expect(rewriteRequestUris(uris, null)).toEqual(uris);
  });
});

describe('computeRenewalDelayMs', () => {
  it('schedules the margin ahead of expiry', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const expiresAtUtc = new Date(now + 5 * 60_000).toISOString(); // 5 minutes from now

    expect(computeRenewalDelayMs(expiresAtUtc, now)).toBe(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS);
  });

  it('clamps to a small positive floor when already at/past the renewal margin', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const expiresAtUtc = new Date(now + 10_000).toISOString(); // 10s from now, well inside the margin

    expect(computeRenewalDelayMs(expiresAtUtc, now)).toBe(1_000);
  });
});

describe('PlaybackRenewalTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onDue after the computed renewal delay, not before', () => {
    const timer = new PlaybackRenewalTimer();
    const onDue = vi.fn();
    const now = Date.now();
    // Comfortably longer than PLAYBACK_RENEWAL_MARGIN_MS so the computed delay is a real positive
    // gap, not the MIN_RENEWAL_DELAY_MS floor (which a duration equal to the margin would hit).
    const ttlMs = PLAYBACK_RENEWAL_MARGIN_MS + 30_000;
    const expiresAtUtc = new Date(now + ttlMs).toISOString();

    timer.schedule(expiresAtUtc, onDue);

    vi.advanceTimersByTime(ttlMs - PLAYBACK_RENEWAL_MARGIN_MS - 1);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDue).toHaveBeenCalledOnce();
  });

  it('replaces a previously scheduled firing when scheduled again', () => {
    const timer = new PlaybackRenewalTimer();
    const first = vi.fn();
    const second = vi.fn();
    const now = Date.now();

    // Offset both from the margin so `second`'s computed delay (90_000) lands cleanly between the
    // two advances below regardless of PLAYBACK_RENEWAL_MARGIN_MS's exact value; `first`'s delay
    // is irrelevant — `schedule()` cancels it synchronously before it ever gets a chance to fire.
    timer.schedule(new Date(now + PLAYBACK_RENEWAL_MARGIN_MS + 60_000).toISOString(), first);
    timer.schedule(new Date(now + PLAYBACK_RENEWAL_MARGIN_MS + 90_000).toISOString(), second);

    vi.advanceTimersByTime(60_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('never fires after stop()', () => {
    const timer = new PlaybackRenewalTimer();
    const onDue = vi.fn();
    timer.schedule(new Date(Date.now() + 60_000).toISOString(), onDue);

    timer.stop();
    vi.advanceTimersByTime(10 * 60_000);

    expect(onDue).not.toHaveBeenCalled();
  });
});
