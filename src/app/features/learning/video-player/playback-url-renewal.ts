/**
 * X-28: proactively renewing a Bunny Stream signed playback URL before its short (5-minute)
 * `expiresAtUtc` deadline, and swapping the fresh signed-URL prefix into in-flight Shaka
 * network requests without reloading the player (so playback position/state is never disturbed).
 *
 * Framework/Shaka-agnostic on purpose: everything here is pure string/number logic so it can be
 * unit tested in isolation, independent of whether a real `shaka.Player` (which jsdom can't
 * exercise — it lacks MediaSource) is available.
 *
 * Bunny's "directory token authentication" (see backend `BunnyVideoProvider.GenerateSignedPlaybackUrl`)
 * embeds the auth token as a URL PATH PREFIX in front of the actual video path, e.g.
 * `https://cdn/bcdn_token=X&expires=Y&token_path=Z/{videoId}/playlist.m3u8` — not a query string
 * appended after `?`. Shaka's HLS parser resolves relative playlist/segment URIs against the
 * manifest URI it was given to `player.load()` once, at parse time, and replays that same (now
 * possibly stale) prefix on every subsequent segment/sub-playlist fetch. That means a renewal
 * can't just re-fetch the manifest once — every outgoing request has to be rewritten for the
 * remainder of the episode via a Shaka `registerRequestFilter`, which is exactly what
 * `rewriteRequestUris` below is for.
 */

/** How long before `expiresAtUtc` to fetch a fresh playback session. Leaves headroom for the
 * renewal HTTP round-trip to land well before Bunny's CDN starts rejecting requests on the old
 * token (backend's signed URL is valid for 5 minutes total — see `PlaybackSessionService`), and
 * for a single retry (see `VideoPlayer.renewPlaybackUrl`) if the first attempt fails transiently.
 * X-28's acceptance bar calls for ~60s specifically — matched exactly here, not just "safely under
 * the 5-minute TTL". */
export const PLAYBACK_RENEWAL_MARGIN_MS = 60_000;

/** Floor for the computed renewal delay so a session that's already at/near expiry when this is
 * scheduled (e.g. a slow initial load, or re-arming right after a manual retry) still renews
 * almost immediately instead of computing a zero/negative `setTimeout` delay. */
const MIN_RENEWAL_DELAY_MS = 1_000;

export interface AuthPrefixRewrite {
  readonly oldPrefix: string;
  readonly newPrefix: string;
}

function isAsciiDigit(charCode: number): boolean {
  return charCode >= 48 /* '0' */ && charCode <= 57 /* '9' */;
}

/**
 * Length of the longest common suffix shared by two strings, with one correction: a boundary is
 * never left in the middle of a run of digits. Bunny's signed URL embeds a Unix `expires=`
 * timestamp — two renewals only ~5 minutes apart can easily share several *trailing* digits by
 * plain numeric coincidence (e.g. `...expires=1758000000` vs `...expires=1758000300` share `00`),
 * which would otherwise get misclassified as part of the "invariant" suffix and corrupt the
 * rewritten prefix by an off-by-a-few-digits amount. Once a mismatch is hit, any matched digits
 * immediately adjacent to it are walked back out of the suffix so the boundary always lands on a
 * non-digit character (or the whole string). This only ever shrinks matches right at the point of
 * first difference — a token/video-path segment that is *genuinely, deterministically* identical
 * (not a coincidence) is never touched, since the scan only stops shrinking once it reaches a
 * non-digit, which every real separator (`/`, `&`, `=`, `-`) in these URLs is.
 */
function commonSuffixLength(a: string, b: string): number {
  const maxLen = Math.min(a.length, b.length);
  let i = 0;
  while (i < maxLen && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) {
    i++;
  }
  while (i > 0 && isAsciiDigit(a.charCodeAt(a.length - i))) {
    i--;
  }
  return i;
}

/**
 * Diffs the manifest URL Shaka originally loaded against a freshly renewed one, returning the
 * differing leading "auth prefix" (the part before the invariant video path — e.g. `/{videoId}/
 * playlist.m3u8` — the two URLs share) so a Shaka network request filter can swap it into any
 * outgoing request. Returns `null` when there's no meaningful prefix boundary to rewrite: either
 * the URLs share no suffix at all, or they're identical (e.g. the unsigned dev/mock stream used
 * when Bunny credentials aren't configured yet, where `originalUrl === freshUrl` every time —
 * nothing to renew).
 */
export function computeAuthPrefixRewrite(originalUrl: string, freshUrl: string): AuthPrefixRewrite | null {
  const suffixLen = commonSuffixLength(originalUrl, freshUrl);
  if (suffixLen === 0) return null;
  const oldPrefix = originalUrl.slice(0, originalUrl.length - suffixLen);
  if (oldPrefix.length === 0) return null;
  const newPrefix = freshUrl.slice(0, freshUrl.length - suffixLen);
  return { oldPrefix, newPrefix };
}

/** Rewrites any request URI that still starts with the stale auth prefix to use the fresh one,
 * leaving unrelated URIs and the video path/query that follows the prefix untouched. Pass `null`
 * for `rewrite` to leave every URI as-is (no renewal has happened yet, or nothing to rewrite). */
export function rewriteRequestUris(uris: readonly string[], rewrite: AuthPrefixRewrite | null): string[] {
  if (!rewrite) return [...uris];
  return uris.map((uri) =>
    uri.startsWith(rewrite.oldPrefix) ? rewrite.newPrefix + uri.slice(rewrite.oldPrefix.length) : uri
  );
}

/** Computes the `setTimeout` delay (ms) to renew `expiresAtUtc` with `PLAYBACK_RENEWAL_MARGIN_MS`
 * of headroom, clamped so an already-expired/near-expiry session still schedules an
 * almost-immediate renewal instead of firing instantly in a tight loop. */
export function computeRenewalDelayMs(expiresAtUtc: string, nowMs: number = Date.now()): number {
  const expiresAtMs = new Date(expiresAtUtc).getTime();
  const delay = expiresAtMs - nowMs - PLAYBACK_RENEWAL_MARGIN_MS;
  return Math.max(MIN_RENEWAL_DELAY_MS, delay);
}

/**
 * Owns a single pending renewal timer so `VideoPlayer` doesn't hand-manage `setTimeout` handles
 * inline. Callers are responsible for guarding against stale callbacks (e.g. a renewal that was
 * mid-flight when the learner switched episodes) with their own version counter — this class only
 * guarantees at most one pending timer at a time.
 */
export class PlaybackRenewalTimer {
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  /** Schedules `onDue` to fire once, `PLAYBACK_RENEWAL_MARGIN_MS` before `expiresAtUtc`. Replaces
   * any previously scheduled firing. */
  schedule(expiresAtUtc: string, onDue: () => void): void {
    this.stop();
    this.timeoutId = setTimeout(onDue, computeRenewalDelayMs(expiresAtUtc));
  }

  /** Cancels any pending renewal. Safe to call when nothing is scheduled. */
  stop(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
