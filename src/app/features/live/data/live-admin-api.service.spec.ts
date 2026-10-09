import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveAdminApiService } from './live-admin-api.service';
import type { LiveAdminStatus } from './live-admin.models';

describe('LiveAdminApiService', () => {
  let service: LiveAdminApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(LiveAdminApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getStatus -> GET /api/live/admin/status, returning the body as sent', () => {
    const body: LiveAdminStatus = {
      serverTimeUtc: '2026-10-09T10:00:00Z',
      jobServer: { running: true, serverCount: 1, servers: [{ name: 'api:1', startedAtUtc: '2026-10-09T08:00:00Z', heartbeatUtc: '2026-10-09T09:59:50Z' }] },
      recurringJobs: [{ id: 'live-reminders', cron: '*/5 * * * *', lastExecutionUtc: null, nextExecutionUtc: '2026-10-09T10:05:00Z', lastJobState: null }],
      email: { provider: 'Smtp', pendingCount: 0, failedCount: 0, oldestPendingAgeSeconds: null },
      live: {
        provider: 'GoogleMeet',
        googleConfigured: true,
        publicBaseUrl: 'https://example.test',
        meetingsPending: 0,
        meetingsAwaitingLink: 0,
        meetingsFailed: 0,
        invitesPending: 0,
      },
      warnings: [],
    };

    let received: LiveAdminStatus | undefined;
    service.getStatus().subscribe((value) => (received = value));
    const req = httpMock.expectOne('/api/live/admin/status');
    expect(req.request.method).toBe('GET');
    req.flush(body);

    expect(received).toEqual(body);
  });
});
