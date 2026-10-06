import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { accessTokenStore } from '../../../core/http/access-token.store';
import { GoogleIdentityApi, GoogleIdentityService } from '../../../core/auth/google-identity.service';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { GoogleSignIn } from './google-sign-in';

@Component({ selector: 'app-stub', template: '' })
class StubPage {}

/** Builds an unsigned JWT-shaped string; the app only decodes the payload for roles. */
function fakeAccessToken(roles: string[]): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '');
  return `${encode({ alg: 'none' })}.${encode({ sub: 'user-1', role: roles })}.sig`;
}

interface RenderCall {
  readonly parent: HTMLElement;
  readonly options: Parameters<GoogleIdentityApi['renderButton']>[1];
}

describe('GoogleSignIn', () => {
  let fixture: ComponentFixture<GoogleSignIn>;
  let httpMock: HttpTestingController;
  let router: Router;
  let initializeConfig: Parameters<GoogleIdentityApi['initialize']>[0] | undefined;
  let renderCalls: RenderCall[];
  let loadShouldFail: boolean;

  const fakeGoogle: GoogleIdentityApi = {
    initialize: (config) => {
      initializeConfig = config;
    },
    renderButton: (parent, options) => {
      renderCalls.push({ parent, options });
    },
  };

  const fakeIdentityService = {
    load: () => (loadShouldFail ? Promise.reject(new Error('blocked')) : Promise.resolve(fakeGoogle)),
  };

  beforeEach(() => {
    initializeConfig = undefined;
    renderCalls = [];
    loadShouldFail = false;
    accessTokenStore.set(null);

    TestBed.configureTestingModule({
      imports: [GoogleSignIn],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'my-courses', component: StubPage },
          { path: 'admin', component: StubPage },
          { path: 'courses/:slug', component: StubPage },
        ]),
        { provide: GoogleIdentityService, useValue: fakeIdentityService },
      ],
    });
    fixture = TestBed.createComponent(GoogleSignIn);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    accessTokenStore.set(null);
    httpMock.verify();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function startWithClientId(clientId: string | null): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    httpMock.expectOne('/api/auth/oauth-clients').flush({ google: clientId ? { clientId } : null });
    await settle();
  }

  it('renders nothing when the server has Google sign-in switched off', async () => {
    await startWithClientId(null);

    expect(fixture.nativeElement.querySelector('div')).toBeNull();
    expect(renderCalls).toHaveLength(0);
  });

  it('renders nothing when the oauth-clients lookup fails', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    httpMock.expectOne('/api/auth/oauth-clients').flush({}, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(fixture.nativeElement.querySelector('div')).toBeNull();
  });

  it('initialises Google with the server-provided client id and renders the button', async () => {
    await startWithClientId('abc.apps.googleusercontent.com');

    expect(initializeConfig?.client_id).toBe('abc.apps.googleusercontent.com');
    expect(initializeConfig?.ux_mode).toBe('popup');
    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0].options.text).toBe('signin_with');
    expect(renderCalls[0].parent).toBe(fixture.nativeElement.querySelector('[aria-busy]'));
  });

  it('uses the "sign up" wording in signup mode', async () => {
    fixture.componentRef.setInput('mode', 'signup');
    await startWithClientId('abc.apps.googleusercontent.com');

    expect(renderCalls[0].options.text).toBe('signup_with');
  });

  it('hides the section when the Google script cannot be loaded', async () => {
    loadShouldFail = true;
    await startWithClientId('abc.apps.googleusercontent.com');
    await settle();

    expect(fixture.nativeElement.querySelector('[aria-busy]')).toBeNull();
  });

  it('posts the credential to the API, stores the access token and goes to the role home', async () => {
    await startWithClientId('abc.apps.googleusercontent.com');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    initializeConfig?.callback({ credential: 'google-id-token' });

    const request = httpMock.expectOne('/api/identity/external-login/google');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ idToken: 'google-id-token' });
    expect(request.request.withCredentials).toBe(true);

    request.flush({ accessToken: fakeAccessToken(['Learner']), accessTokenExpiresAtUtc: '2026-10-06T12:15:00Z' });
    await settle();

    expect(accessTokenStore.token()).not.toBeNull();
    expect(navigate).toHaveBeenCalledWith('/my-courses');
  });

  it('sends admins to /admin after Google sign-in', async () => {
    await startWithClientId('abc.apps.googleusercontent.com');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    initializeConfig?.callback({ credential: 'google-id-token' });
    httpMock
      .expectOne('/api/identity/external-login/google')
      .flush({ accessToken: fakeAccessToken(['Admin']), accessTokenExpiresAtUtc: '2026-10-06T12:15:00Z' });
    await settle();

    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('shows the API error and keeps the user signed out when sign-in is rejected', async () => {
    await startWithClientId('abc.apps.googleusercontent.com');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    initializeConfig?.callback({ credential: 'bad-token' });
    httpMock
      .expectOne('/api/identity/external-login/google')
      .flush(
        { title: 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้ กรุณาลองใหม่อีกครั้ง', status: 400, errorCode: 'validation' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
    expect(accessTokenStore.token()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a Google callback that carries no credential', async () => {
    await startWithClientId('abc.apps.googleusercontent.com');

    initializeConfig?.callback({});

    httpMock.expectNone('/api/identity/external-login/google');
  });
});
