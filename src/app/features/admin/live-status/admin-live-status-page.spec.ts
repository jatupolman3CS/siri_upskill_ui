import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { LiveAdminStatus } from '../../live/data/live-admin.models';
import { AdminLiveStatusPage, LIVE_STATUS_REFRESH_MS } from './admin-live-status-page';

registerLocaleData(localeTh);

const URL = '/api/live/admin/status';
const NOW = '2026-10-09T10:00:00Z';

const healthy = (overrides: Partial<LiveAdminStatus> = {}): LiveAdminStatus => ({
  serverTimeUtc: NOW,
  jobServer: {
    running: true,
    serverCount: 1,
    servers: [{ name: 'api-host:1234', startedAtUtc: '2026-10-09T07:00:00Z', heartbeatUtc: '2026-10-09T09:59:45Z' }],
  },
  recurringJobs: [
    {
      id: 'live-reminders',
      cron: '*/5 * * * *',
      lastExecutionUtc: '2026-10-09T09:55:00Z',
      nextExecutionUtc: '2026-10-09T10:05:00Z',
      lastJobState: 'Succeeded',
    },
    { id: 'live-invites', cron: '0 * * * *', lastExecutionUtc: null, nextExecutionUtc: null, lastJobState: null },
  ],
  email: { provider: 'Smtp', pendingCount: 2, failedCount: 0, oldestPendingAgeSeconds: 90 },
  live: {
    provider: 'GoogleMeet',
    googleConfigured: true,
    publicBaseUrl: 'https://upskill.example.test',
    meetingsPending: 1,
    meetingsAwaitingLink: 3,
    meetingsFailed: 0,
    invitesPending: 4,
  },
  warnings: [],
  ...overrides,
});

describe('AdminLiveStatusPage', () => {
  let fixture: ComponentFixture<AdminLiveStatusPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    httpMock.verify();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  /** Creates the page, answers its first request (with a body, or a failing status) and renders. */
  async function open(body: LiveAdminStatus | { error: number }): Promise<void> {
    fixture = TestBed.createComponent(AdminLiveStatusPage);
    await settle();
    const req = httpMock.expectOne(URL);
    if ('error' in body) {
      req.flush({}, { status: body.error, statusText: 'Err' });
    } else {
      req.flush(body);
    }
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const refreshButton = () =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Refresh')) as HTMLButtonElement;

  describe('verdict', () => {
    it('says "Ready" and lists no warnings when the server reports none', async () => {
      await open(healthy());

      expect(root().querySelector('h2')?.textContent).toContain('Ready');
      expect(text()).not.toMatch(/\d+ to fix/);
      expect(root().querySelector('[aria-live="polite"] ul')).toBeNull();
    });

    it('is NOT ready when there is any warning, and explains each with impact and what to do', async () => {
      await open(healthy({ warnings: ['no_job_server', 'email_unconfigured'] }));

      expect(text()).not.toMatch(/\bReady\b/);
      expect(text()).toContain('Not fully ready — 2 to fix');
      const cards = root().querySelectorAll('[aria-live="polite"] ul > li');
      expect(cards.length).toBe(2);
      expect(cards[0].textContent).toContain('No background job server');
      expect(cards[0].textContent).toContain('Invite/reminder e-mail and room creation will not run.');
      expect(cards[0].textContent).toContain('Enable Hangfire:ServerInApi or deploy the Workers.');
      expect(cards[1].textContent).toContain('E-mail sending is not configured');
    });

    it('covers every known warning code with its own text, and shows an unknown code verbatim with a generic message', async () => {
      await open(
        healthy({
          warnings: [
            'outbox_backlog',
            'public_base_url_not_https',
            'google_not_configured',
            'meetings_stuck_pending',
            'a_future_code',
          ],
        }),
      );

      const cards = Array.from(root().querySelectorAll('[aria-live="polite"] ul > li')).map((c) => c.textContent ?? '');
      expect(cards[0]).toContain('E-mail is piling up in the outbox');
      expect(cards[1]).toContain('The public URL is not https');
      expect(cards[2]).toContain('Google connection is not configured');
      expect(cards[3]).toContain('Some rooms are stuck in “preparing”');
      expect(cards[4]).toContain('A warning this page does not know yet');
      expect(cards[4]).toContain('a_future_code');
      // a known code is never exposed raw
      expect(cards[0]).not.toContain('outbox_backlog');
    });

    it('does not duplicate a card when the server repeats a code', async () => {
      await open(healthy({ warnings: ['no_job_server', 'no_job_server'] }));
      expect(root().querySelectorAll('[aria-live="polite"] ul > li').length).toBe(1);
      expect(text()).toContain('Not fully ready — 1 to fix');
    });

    it('reads in Thai', async () => {
      TestBed.inject(TranslationService).setLocale('th');
      await open(healthy());
      expect(root().querySelector('h2')?.textContent).toContain('พร้อมใช้งาน');

      fixture.destroy();
      await open(healthy({ warnings: ['no_job_server'] }));
      expect(text()).toContain('ยังไม่มีตัวรันงานเบื้องหลัง');
      expect(text()).toContain('เปิด Hangfire:ServerInApi หรือ deploy Workers');
    });
  });

  describe('sections', () => {
    it('job server: running state, count and each server with relative + Bangkok times', async () => {
      await open(healthy());

      const section = root().querySelector('[aria-labelledby="live-status-jobserver-heading"]') as HTMLElement;
      expect(section.textContent).toContain('Running');
      expect(section.textContent).toContain('1 server(s)');
      expect(section.textContent).toContain('api-host:1234');
      expect(section.textContent).toContain('15 s ago'); // heartbeat, measured against serverTimeUtc
      expect(section.textContent).toContain('3 h ago'); // started
      expect(section.textContent).toContain('9 Oct 16:59'); // heartbeat 09:59:45Z is 16:59 in Bangkok (UTC+7)
    });

    it('job server: stopped with no servers says so plainly', async () => {
      await open(
        healthy({
          jobServer: { running: false, serverCount: 0, servers: [] },
          recurringJobs: [],
          warnings: ['no_job_server'],
        }),
      );

      const section = root().querySelector('[aria-labelledby="live-status-jobserver-heading"]') as HTMLElement;
      expect(section.textContent).toContain('Not running');
      expect(section.textContent).toContain('0 server(s)');
      expect(section.textContent).toContain('No job server is registered.');
      expect(section.querySelector('table')).toBeNull();
    });

    it('recurring jobs: one row each with cron, last/next run, and a state that is text, not just colour', async () => {
      await open(healthy());

      const rows = root().querySelectorAll('[aria-labelledby="live-status-recurring-heading"] tbody tr');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('live-reminders');
      expect(rows[0].textContent).toContain('*/5 * * * *');
      expect(rows[0].textContent).toContain('5 min ago');
      expect(rows[0].textContent).toContain('in 5 min');
      expect(rows[0].textContent).toContain('Succeeded');
      // a job that never ran
      expect(rows[1].textContent).toContain('Never ran');
      expect(rows[1].textContent).toContain('No data');
    });

    it('recurring jobs: an empty list explains what it usually means', async () => {
      await open(healthy({ recurringJobs: [] }));
      const section = root().querySelector('[aria-labelledby="live-status-recurring-heading"]') as HTMLElement;
      expect(section.textContent).toContain('No recurring jobs are registered');
      expect(section.querySelector('table')).toBeNull();
    });

    it('a failed job state is shown by name', async () => {
      await open(
        healthy({
          recurringJobs: [
            { id: 'live-invites', cron: '0 * * * *', lastExecutionUtc: '2026-10-09T09:00:00Z', nextExecutionUtc: null, lastJobState: 'Failed' },
          ],
        }),
      );
      const row = root().querySelector('[aria-labelledby="live-status-recurring-heading"] tbody tr') as HTMLElement;
      expect(row.textContent).toContain('Failed');
    });

    it('e-mail outbox: provider, counts and the age of the oldest waiting message', async () => {
      await open(healthy());

      const section = root().querySelector('[aria-labelledby="live-status-email-heading"]') as HTMLElement;
      expect(section.textContent).toContain('SMTP');
      expect(section.textContent).toContain('Waiting to send');
      expect(section.textContent).toContain('1 min'); // 90 s
      expect(section.textContent).not.toContain('Needs attention');
    });

    it('e-mail outbox: log-only provider, failures and nothing waiting are all called out', async () => {
      await open(healthy({ email: { provider: 'Log', pendingCount: 0, failedCount: 5, oldestPendingAgeSeconds: null } }));

      const section = root().querySelector('[aria-labelledby="live-status-email-heading"]') as HTMLElement;
      expect(section.textContent).toContain('Log only — no real e-mail is sent');
      expect(section.textContent).toContain('Nothing waiting');
      expect(section.textContent).toContain('Needs attention'); // failed > 0, announced to screen readers
    });

    it('e-mail outbox: an unconfigured provider reads as such', async () => {
      await open(healthy({ email: { provider: 'Unconfigured', pendingCount: 0, failedCount: 0, oldestPendingAgeSeconds: null } }));
      expect((root().querySelector('[aria-labelledby="live-status-email-heading"]') as HTMLElement).textContent).toContain('Not configured');
    });

    it('live settings: provider, Google state, public URL and the four counters', async () => {
      await open(healthy());

      const section = root().querySelector('[aria-labelledby="live-status-live-heading"]') as HTMLElement;
      expect(section.textContent).toContain('Google Meet (created automatically)');
      expect(section.textContent).toContain('Configured');
      expect(section.textContent).toContain('https://upskill.example.test');
      const counters = Array.from(section.querySelectorAll('dl > div')).map((d) => [
        d.querySelector('dt')?.textContent?.trim(),
        d.querySelector('dd')?.textContent?.trim(),
      ]);
      expect(counters).toEqual([
        ['Rooms being prepared', '1'],
        ['Waiting for a pasted link', '3'],
        ['Room creation failed', '0'],
        ['Invitations waiting', '4'],
      ]);
    });

    it('live settings: manual-only mode and a missing Google client', async () => {
      await open(
        healthy({
          live: {
            provider: 'ManualOnly',
            googleConfigured: false,
            publicBaseUrl: 'http://localhost:4200',
            meetingsPending: 0,
            meetingsAwaitingLink: 0,
            meetingsFailed: 2,
            invitesPending: 0,
          },
          warnings: ['google_not_configured', 'public_base_url_not_https'],
        }),
      );

      const section = root().querySelector('[aria-labelledby="live-status-live-heading"]') as HTMLElement;
      expect(section.textContent).toContain('Instructors paste room links themselves');
      expect(section.textContent).toContain('Not configured');
      expect(section.textContent).toContain('http://localhost:4200');
      expect(section.textContent).toContain('Needs attention'); // meetingsFailed > 0
    });

    it('shows when the snapshot was taken, in Bangkok time', async () => {
      await open(healthy());
      expect(text()).toContain('Checked 9 Oct 2026 17:00');
    });
  });

  describe('states', () => {
    it('shows a skeleton before the first answer', async () => {
      fixture = TestBed.createComponent(AdminLiveStatusPage);
      await settle();
      expect(root().querySelector('[role="status"]')).not.toBeNull();
      expect(root().querySelector('app-live-status-verdict')).toBeNull();
      httpMock.expectOne(URL).flush(healthy());
    });

    it('shows an error with a working retry when the first load fails', async () => {
      await open({ error: 500 });

      expect(text()).toContain('Could not load the system status');
      expect(root().querySelector('app-live-status-verdict')).toBeNull();

      const retry = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Try again')) as HTMLButtonElement;
      retry.click();
      await settle();
      httpMock.expectOne(URL).flush(healthy());
      await settle();

      expect(text()).not.toContain('Could not load the system status');
      expect(root().querySelector('h2')?.textContent).toContain('Ready');
    });

    it('manual refresh re-requests and shows the new snapshot', async () => {
      await open(healthy());
      expect(root().querySelector('h2')?.textContent).toContain('Ready');

      refreshButton().click();
      await settle();
      httpMock.expectOne(URL).flush(healthy({ warnings: ['outbox_backlog'] }));
      await settle();

      expect(text()).toContain('Not fully ready — 1 to fix');
    });

    it('keeps the last good snapshot with a notice when a refresh fails', async () => {
      await open(healthy());

      refreshButton().click();
      await settle();
      httpMock.expectOne(URL).flush({}, { status: 503, statusText: 'Unavailable' });
      await settle();

      expect(root().querySelector('[role="alert"]')?.textContent).toContain('Refresh failed');
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('9 Oct 2026 17:00');
      // the earlier data is still on screen
      expect(text()).toContain('api-host:1234');
      expect(root().querySelector('h2')?.textContent).toContain('Ready');
    });
  });

  describe('auto refresh', () => {
    it('re-checks every 30 seconds while the tab is visible', async () => {
      vi.useFakeTimers();
      await open(healthy());

      vi.advanceTimersByTime(LIVE_STATUS_REFRESH_MS - 1);
      httpMock.expectNone(URL);
      vi.advanceTimersByTime(1);
      TestBed.flushEffects();
      httpMock.expectOne(URL).flush(healthy({ warnings: ['no_job_server'] }));
      await settle();
      expect(text()).toContain('Not fully ready');

      vi.advanceTimersByTime(LIVE_STATUS_REFRESH_MS);
      TestBed.flushEffects();
      httpMock.expectOne(URL).flush(healthy());
    });

    it('skips the check while the tab is hidden and resumes when it is visible again', async () => {
      vi.useFakeTimers();
      await open(healthy());
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

      vi.advanceTimersByTime(LIVE_STATUS_REFRESH_MS * 2);
      TestBed.flushEffects();
      httpMock.expectNone(URL);

      visibility.mockReturnValue('visible');
      vi.advanceTimersByTime(LIVE_STATUS_REFRESH_MS);
      TestBed.flushEffects();
      httpMock.expectOne(URL).flush(healthy());
    });

    it('stops when the page is destroyed', async () => {
      vi.useFakeTimers();
      await open(healthy());

      fixture.destroy();
      vi.advanceTimersByTime(LIVE_STATUS_REFRESH_MS * 3);
      httpMock.expectNone(URL);
    });
  });
});
