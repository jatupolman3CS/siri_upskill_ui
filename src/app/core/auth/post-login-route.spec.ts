import { resolvePostLoginUrl } from './post-login-route';

describe('resolvePostLoginUrl', () => {
  it('honours a safe returnUrl over the role home', () => {
    expect(resolvePostLoginUrl('/courses/abc?x=1', ['Admin'])).toBe('/courses/abc?x=1');
  });

  it.each([['https://evil.example'], ['//evil.example'], ['/\\evil.example'], [''], [null], [undefined], [42]])(
    'ignores an unsafe returnUrl (%s)',
    (returnUrl) => {
      expect(resolvePostLoginUrl(returnUrl, [])).toBe('/my-courses');
    },
  );

  it('sends admins to /admin, instructors to /instructor and everyone else to /my-courses', () => {
    expect(resolvePostLoginUrl(null, ['SuperAdmin'])).toBe('/admin');
    expect(resolvePostLoginUrl(null, ['Instructor', 'Learner'])).toBe('/instructor');
    expect(resolvePostLoginUrl(null, ['Learner'])).toBe('/my-courses');
    expect(resolvePostLoginUrl(null, [])).toBe('/my-courses');
  });
});
