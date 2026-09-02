/**
 * Minimal, read-only JWT payload decoder — no signature verification (the frontend has no key to
 * verify with, and has no reason to: the token only ever reached this app because the backend's
 * own `AddJwtBearer` pipeline already validated it on whichever request returned it, and every API
 * call this app makes gets independently re-validated server-side regardless of what this decodes).
 * This exists purely so `AuthService` can read the two claims it needs for UI state back out of the
 * access token it already holds in memory, without adding a "who am I" HTTP round-trip.
 *
 * Uses the global `atob`/`TextDecoder` — real Web Platform APIs, not `window`/`document`, and both
 * are available as Node.js globals too (Node 18+, which this SSR app already requires), so no
 * `isPlatformBrowser` guard is needed here (frontend.md's SSR-safety rule targets DOM globals like
 * `window`/`document`/`localStorage`, not these).
 */

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(paddingLength);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface DecodedAccessToken {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly sessionId?: string;
  readonly expiresAt?: number;
}

/**
 * Decodes the claims out of a raw JWT access token.
 * Reads `sub`/`nameidentifier` for userId, `role` claim (or Microsoft role claim URI) for roles,
 * `sid` for session id, and `exp` for expiry.
 * Returns `null` on any malformed input without throwing.
 */
export function decodeAccessToken(token: string): DecodedAccessToken | null {
  try {
    const segments = token.split('.');
    const payloadSegment = segments[1];
    if (!payloadSegment) {
      return null;
    }
    const payload: unknown = JSON.parse(base64UrlDecode(payloadSegment));
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const sub = record['sub'] ?? record['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
    const userId = typeof sub === 'string' && sub.length > 0 ? sub : null;
    if (!userId) {
      return null;
    }

    const rawRoles = record['role'] ?? record['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
    let roles: string[] = [];
    if (typeof rawRoles === 'string') {
      roles = [rawRoles];
    } else if (Array.isArray(rawRoles)) {
      roles = rawRoles.filter((r): r is string => typeof r === 'string');
    }

    const sid = record['sid'];
    const sessionId = typeof sid === 'string' && sid.length > 0 ? sid : undefined;

    const exp = record['exp'];
    const expiresAt = typeof exp === 'number' ? exp : undefined;

    return { userId, roles, sessionId, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Reads the `sub` claim (the user's own id — `AccessTokenGenerator.cs`'s
 * `JwtRegisteredClaimNames.Sub`) out of a raw JWT access token.
 * Returns `null` for any malformed/unexpected input rather than throwing.
 */
export function decodeAccessTokenUserId(token: string): string | null {
  return decodeAccessToken(token)?.userId ?? null;
}

