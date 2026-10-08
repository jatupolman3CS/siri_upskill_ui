import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { ToastService } from '../../../../shared/toast/toast.service';
import { GOOGLE_AUTH_REDIRECT } from '../../data/google-connect.service';
import type { GoogleConnectionStatus } from '../../data/live-instructor.models';
import { LiveSettingsPage } from './live-settings-page';

registerLocaleData(localeTh);

const STATUS_URL = '/api/live/instructor/google/status';

function status(overrides: Partial<GoogleConnectionStatus> = {}): GoogleConnectionStatus {
  return {
    configured: true,
    connected: true,
    needsReconnect: false,
    googleEmail: 'teacher@gmail.com',
    connectedAtUtc: '2026-10-01T03:00:00Z',
    lastValidatedAtUtc: '2026-10-05T03:00:00Z',
    revokedReason: null,
    affectedSessionCount: 0,
    ...overrides,
  };
}

describe('LiveSettingsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;
  let toast: ToastService;
  let redirect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    redirect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/live-settings', component: LiveSettingsPage }]),
        // withFetch() + the real error interceptor — same transport/error shape as app.config.ts (ApiError carries `reason`).
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: GOOGLE_AUTH_REDIRECT, useValue: redirect },
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function open(url = '/instructor/live-settings'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, LiveSettingsPage);
    await settle();
  }

  async function flushStatus(body: GoogleConnectionStatus): Promise<void> {
    httpMock.expectOne(STATUS_URL).flush(body);
    await settle();
  }

  function text(): string {
    return (harness.routeNativeElement as HTMLElement).textContent ?? '';
  }

  function buttonByText(label: string): HTMLButtonElement | undefined {
    const buttons = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('button'));
    return buttons.find((button) => button.textContent?.includes(label));
  }

  it('shows a loading state, then the connected account', async () => {
    await open();
    expect((harness.routeNativeElement as HTMLElement).querySelector('[role="status"]')).not.toBeNull();

    await flushStatus(status());

    expect(text()).toContain('Connected');
    expect(text()).toContain('teacher@gmail.com');
    expect(buttonByText('Disconnect')).toBeDefined();
    expect(buttonByText('Connect Google Calendar')).toBeUndefined();
  });

  it('configured=false -> explains manual links and never offers a connect button', async () => {
    await open();
    await flushStatus(status({ configured: false, connected: false, googleEmail: null }));

    expect(text()).toContain('has not enabled this yet');
    expect(buttonByText('Connect Google Calendar')).toBeUndefined();
    expect(buttonByText('Reconnect')).toBeUndefined();
  });

  it('needsReconnect -> banner with the reason and the number of affected sessions, plus a Reconnect button', async () => {
    await open();
    await flushStatus(
      status({ connected: false, needsReconnect: true, revokedReason: 'invalid_grant', affectedSessionCount: 3 }),
    );

    expect(text()).toContain('access expired or was revoked');
    expect(text()).toContain('3 upcoming session(s)');
    expect(buttonByText('Reconnect')).toBeDefined();
  });

  it('not connected -> offers Connect, and clicking it posts the return path then redirects to Google', async () => {
    await open();
    await flushStatus(status({ connected: false, googleEmail: null, connectedAtUtc: null, lastValidatedAtUtc: null }));

    buttonByText('Connect Google Calendar')?.click();
    const req = httpMock.expectOne('/api/live/instructor/google/connect');
    expect(req.request.body).toEqual({ returnPath: '/instructor/live-settings' });
    req.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });

    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=abc');
  });

  it('a 503 on connect shows an error toast and refreshes the status instead of leaving a stuck button', async () => {
    const errorSpy = vi.spyOn(toast, 'error');
    await open();
    await flushStatus(status({ connected: false, googleEmail: null }));

    buttonByText('Connect Google Calendar')?.click();
    httpMock
      .expectOne('/api/live/instructor/google/connect')
      .flush({ reason: 'live.google_not_configured' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(errorSpy).toHaveBeenCalledWith(TestBed.inject(TranslationService).t('live.errors.googleNotConfigured'));
    expect(redirect).not.toHaveBeenCalled();
    httpMock.expectOne(STATUS_URL).flush(status({ configured: false, connected: false, googleEmail: null }));
  });

  it('Disconnect asks for confirmation first, and only then calls the API', async () => {
    await open();
    await flushStatus(status());

    buttonByText('Disconnect')?.click();
    await settle();
    expect(document.body.textContent).toContain('Disconnect Google?');
    httpMock.expectNone('/api/live/instructor/google');

    const confirm = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
      b.textContent?.includes('Disconnect'),
    ) as HTMLButtonElement;
    confirm.click();
    const req = httpMock.expectOne('/api/live/instructor/google');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    httpMock.expectOne(STATUS_URL).flush(status({ connected: false, googleEmail: null }));
  });

  it('cancelling the confirmation dialog sends nothing', async () => {
    await open();
    await flushStatus(status());

    buttonByText('Disconnect')?.click();
    await settle();
    const cancel = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
      b.textContent?.includes('Keep connected'),
    ) as HTMLButtonElement;
    cancel.click();
    await settle();

    httpMock.expectNone('/api/live/instructor/google');
  });

  describe('OAuth callback query (?google=…)', () => {
    it('?google=connected -> success toast, query cleared from the URL, no duplicate status request', async () => {
      const successSpy = vi.spyOn(toast, 'success');
      await open('/instructor/live-settings?google=connected');
      await flushStatus(status());
      await harness.fixture.whenStable();

      expect(successSpy).toHaveBeenCalledWith('Google Calendar connected');
      expect(router.url).toBe('/instructor/live-settings');
      expect(text()).toContain('teacher@gmail.com');
    });

    it('?google=error&reason=access_denied -> error toast with the mapped message, query cleared', async () => {
      const errorSpy = vi.spyOn(toast, 'error');
      await open('/instructor/live-settings?google=error&reason=access_denied');
      await flushStatus(status({ connected: false, googleEmail: null }));
      await harness.fixture.whenStable();

      expect(errorSpy).toHaveBeenCalledWith('You did not allow calendar access, so the connection was not completed.');
      expect(router.url).toBe('/instructor/live-settings');
    });

    it('an unknown reason falls back to the generic message instead of echoing the raw value', async () => {
      const errorSpy = vi.spyOn(toast, 'error');
      await open('/instructor/live-settings?google=error&reason=%3Cscript%3E');
      await flushStatus(status({ connected: false, googleEmail: null }));

      expect(errorSpy).toHaveBeenCalledWith('Could not connect Google. Please try again.');
    });

    it('a normal visit (no callback query) toasts nothing', async () => {
      const successSpy = vi.spyOn(toast, 'success');
      const errorSpy = vi.spyOn(toast, 'error');
      await open();
      await flushStatus(status());

      expect(successSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  it('a failed status request shows an error state with a retry that refetches', async () => {
    await open();
    httpMock.expectOne(STATUS_URL).flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text()).toContain('Could not load the connection status');
    expect(text()).not.toContain('teacher@gmail.com');

    buttonByText('Try again')?.click();
    await settle();
    await flushStatus(status());
    expect(text()).toContain('teacher@gmail.com');
  });
});
