/**
 * Where to send someone right after they sign in: the page they were trying to reach (`returnUrl`)
 * when it is a safe in-app path, otherwise the home of their highest role.
 */
export function resolvePostLoginUrl(returnUrl: unknown, roles: readonly string[]): string {
  if (isSafeInternalPath(returnUrl)) {
    return returnUrl;
  }
  if (roles.includes('SuperAdmin') || roles.includes('Admin')) {
    return '/admin';
  }
  if (roles.includes('Instructor')) {
    return '/instructor';
  }
  return '/my-courses';
}

/** Only same-origin absolute paths ("/x"); "//host" and "/\host" are protocol-relative tricks. */
function isSafeInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  );
}
