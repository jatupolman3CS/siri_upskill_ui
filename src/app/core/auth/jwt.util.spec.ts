import { decodeAccessToken, decodeAccessTokenUserId } from './jwt.util';

describe('jwt.util', () => {
  function makeToken(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload)).replace(/=/g, '');
    return `${header}.${body}.signature`;
  }

  it('returns null for malformed tokens', () => {
    expect(decodeAccessToken('')).toBeNull();
    expect(decodeAccessToken('not-a-jwt')).toBeNull();
    expect(decodeAccessToken('part1.invalid-base64-!@#.part3')).toBeNull();
    expect(decodeAccessTokenUserId('')).toBeNull();
  });

  it('decodes standard sub and single string role', () => {
    const token = makeToken({
      sub: 'user-123',
      role: 'Admin',
      sid: 'session-456',
      exp: 1800000000,
    });

    const decoded = decodeAccessToken(token);
    expect(decoded).toEqual({
      userId: 'user-123',
      roles: ['Admin'],
      sessionId: 'session-456',
      expiresAt: 1800000000,
    });

    expect(decodeAccessTokenUserId(token)).toBe('user-123');
  });

  it('decodes array of roles', () => {
    const token = makeToken({
      sub: 'user-456',
      role: ['Admin', 'Instructor'],
    });

    const decoded = decodeAccessToken(token);
    expect(decoded?.userId).toBe('user-456');
    expect(decoded?.roles).toEqual(['Admin', 'Instructor']);
  });

  it('decodes Microsoft-format identity claims and role claims', () => {
    const token = makeToken({
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': 'ms-user-789',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'SuperAdmin',
      sid: 'session-ms',
    });

    const decoded = decodeAccessToken(token);
    expect(decoded?.userId).toBe('ms-user-789');
    expect(decoded?.roles).toEqual(['SuperAdmin']);
    expect(decoded?.sessionId).toBe('session-ms');
  });

  it('returns null if no userId claim exists', () => {
    const token = makeToken({ role: 'Admin' });
    expect(decodeAccessToken(token)).toBeNull();
    expect(decodeAccessTokenUserId(token)).toBeNull();
  });
});
