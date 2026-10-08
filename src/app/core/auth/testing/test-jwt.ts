/**
 * Test-only helper (excluded from the app build via tsconfig.app.json): builds a properly formed but
 * *unsigned* access token — header.payload.signature with a real base64url JSON payload — so specs go
 * through the real `decodeAccessToken` path instead of faking `AuthService` state.
 */

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildTestAccessToken(options: {
  readonly userId: string;
  readonly roles?: readonly string[];
  readonly sessionId?: string;
  readonly expiresInSeconds?: number;
}): string {
  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const payload = base64Url({
    sub: options.userId,
    sid: options.sessionId ?? 'test-session',
    role: options.roles ?? ['Learner'],
    exp: Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? 3600),
  });
  return `${header}.${payload}.unsigned`;
}
