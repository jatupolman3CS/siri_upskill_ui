import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveLearnerApiService } from './live-learner-api.service';
import type { JoinLiveSessionResponse, MySessionsResponse, MyUpcomingSessionsResponse } from './live-learner.models';

describe('LiveLearnerApiService', () => {
  let service: LiveLearnerApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
    service = TestBed.inject(LiveLearnerApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads my sessions for a course from GET /live/courses/{id}/my-sessions', () => {
    const body: MySessionsResponse = {
      courseId: 'c-1',
      courseSlug: 'excel-pro',
      timezone: 'Asia/Bangkok',
      serverTimeUtc: '2026-10-08T02:55:10Z',
      hasAttendedAnySession: false,
      sessions: [
        {
          id: 's-1',
          title: 'คาบที่ 1',
          description: null,
          startsAtUtc: '2026-10-08T03:00:00Z',
          endsAtUtc: '2026-10-08T05:00:00Z',
          displayState: 'Live',
          status: 'Scheduled',
          cancelReason: null,
          canJoin: true,
          joinOpensAtUtc: '2026-10-08T02:45:00Z',
          roomReady: true,
          hasRecording: false,
          recordingEpisodeId: null,
          inviteStatus: 'Invited',
        },
      ],
    };
    const received = vi.fn();
    service.getMySessions('c-1').subscribe(received);

    const req = httpMock.expectOne('/api/live/courses/c-1/my-sessions');
    expect(req.request.method).toBe('GET');
    req.flush(body);
    expect(received).toHaveBeenCalledWith(body);
  });

  it('reads my upcoming sessions with the requested limit', () => {
    const body: MyUpcomingSessionsResponse = { serverTimeUtc: '2026-10-08T02:55:10Z', items: [] };
    const received = vi.fn();
    service.getMyUpcoming(10).subscribe(received);

    const req = httpMock.expectOne('/api/live/me/sessions/upcoming?limit=10');
    expect(req.request.method).toBe('GET');
    req.flush(body);
    expect(received).toHaveBeenCalledWith(body);
  });

  it('defaults the upcoming limit to 10', () => {
    service.getMyUpcoming().subscribe();
    httpMock.expectOne('/api/live/me/sessions/upcoming?limit=10').flush({ serverTimeUtc: '', items: [] });
  });

  it('posts to the join gate with no body and returns the room link payload', () => {
    const body: JoinLiveSessionResponse = {
      sessionId: 's-1',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      startsAtUtc: '2026-10-08T03:00:00Z',
      endsAtUtc: '2026-10-08T05:00:00Z',
      serverTimeUtc: '2026-10-08T02:55:10Z',
    };
    const received = vi.fn();
    service.joinSession('s-1').subscribe(received);

    const req = httpMock.expectOne('/api/live/sessions/s-1/join');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(body);
    expect(received).toHaveBeenCalledWith(body);
  });

  it('fetches the calendar file as a blob through HttpClient so the bearer token is attached', () => {
    const received = vi.fn();
    service.downloadCalendar('s-1').subscribe(received);

    const req = httpMock.expectOne('/api/live/sessions/s-1/calendar.ics');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    const file = new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' });
    req.flush(file);
    expect(received).toHaveBeenCalledWith(file);
  });

  it('percent-encodes ids placed in the path', () => {
    service.joinSession('a/b').subscribe();
    httpMock.expectOne('/api/live/sessions/a%2Fb/join').flush({});
  });
});
