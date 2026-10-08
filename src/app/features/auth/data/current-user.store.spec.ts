import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { buildTestAccessToken } from '../../../core/auth/testing/test-jwt';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { CurrentUserStore } from './current-user.store';

const ME_URL = '/api/identity/me';

function me(id: string, displayName = 'Test User') {
  return { id, email: `${id}@example.test`, displayName, avatarUrl: null, roles: ['Learner'] };
}

describe('CurrentUserStore', () => {
  let store: CurrentUserStore;
  let httpMock: HttpTestingController;

  /** Lets the resource's effect run and its stream settle (flush is synchronous, state propagation is not). */
  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  }

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    store = TestBed.inject(CurrentUserStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    accessTokenStore.set(null);
    httpMock.verify();
  });

  it('does not call /me while signed out', async () => {
    await settle();

    expect(store.profile()).toBeNull();
    httpMock.expectNone(ME_URL);
  });

  it('loads the profile once the access token appears', async () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'user-a' }));
    await settle();
    httpMock.expectOne(ME_URL).flush(me('user-a', 'Anna'));
    await settle();

    expect(store.profile()?.displayName).toBe('Anna');
  });

  it('does not refetch when the token is refreshed for the same user', async () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'user-a', sessionId: 's1' }));
    await settle();
    httpMock.expectOne(ME_URL).flush(me('user-a'));
    await settle();

    accessTokenStore.set(buildTestAccessToken({ userId: 'user-a', sessionId: 's1', expiresInSeconds: 7200 }));
    await settle();

    httpMock.expectNone(ME_URL);
    expect(store.profile()?.id).toBe('user-a');
  });

  it('clears the profile on sign-out and loads the new one when somebody else signs in', async () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'user-a' }));
    await settle();
    httpMock.expectOne(ME_URL).flush(me('user-a', 'Anna'));
    await settle();
    expect(store.profile()?.displayName).toBe('Anna');

    accessTokenStore.set(null);
    await settle();
    expect(store.profile()).toBeNull();

    accessTokenStore.set(buildTestAccessToken({ userId: 'user-b' }));
    await settle();
    httpMock.expectOne(ME_URL).flush(me('user-b', 'Boon'));
    await settle();
    expect(store.profile()?.displayName).toBe('Boon');
  });

  it('degrades to no profile (never throws) when /me fails', async () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'user-a' }));
    await settle();
    httpMock.expectOne(ME_URL).flush({ title: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(store.profile()).toBeNull();
    expect(store.hasError()).toBe(true);
  });

  it('ignores a profile that belongs to a different user than the current token', async () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'user-a' }));
    await settle();
    httpMock.expectOne(ME_URL).flush(me('someone-else'));
    await settle();

    expect(store.profile()).toBeNull();
  });
});
