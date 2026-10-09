import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { GOOGLE_AUTH_REDIRECT } from '../../../data/google-connect.service';
import type { InstructorMeetingSummary } from '../../../data/live-instructor.models';
import type { MeetingNeedsAction } from '../../../data/live.models';
import { MeetingActions } from './meeting-actions';

describe('MeetingActions (needsAction -> UI)', () => {
  let fixture: ComponentFixture<MeetingActions>;
  let httpMock: HttpTestingController;
  let redirect: ReturnType<typeof vi.fn>;
  let toast: ToastService;

  const summary = (needsAction: MeetingNeedsAction, overrides: Partial<InstructorMeetingSummary> = {}): InstructorMeetingSummary => ({
    sessionId: 's1',
    provider: 'GoogleMeet',
    syncStatus: 'Pending',
    hasMeetingLink: false,
    isUsable: false,
    lastSyncAtUtc: null,
    needsAction,
    errorCode: null,
    ...overrides,
  });

  beforeEach(() => {
    redirect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: GOOGLE_AUTH_REDIRECT, useValue: redirect },
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  function render(meeting: InstructorMeetingSummary, googleConfigured: boolean | null = true): HTMLElement {
    fixture = TestBed.createComponent(MeetingActions);
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('meeting', meeting);
    fixture.componentRef.setInput('googleConfigured', googleConfigured);
    fixture.componentRef.setInput('returnPath', '/instructor/sessions/s1');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const button = (root: HTMLElement, label: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(label));

  it('Waiting -> only a status message (no inputs, no buttons)', () => {
    const root = render(summary('Waiting'));
    expect(root.textContent).toContain('Preparing the room for this session');
    expect(root.textContent).toContain('updates by itself');
    expect(root.querySelector('[role="status"]')).not.toBeNull();
    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('a')).toBeNull();
  });

  it('None -> renders nothing actionable', () => {
    const root = render(summary('None', { syncStatus: 'Synced', hasMeetingLink: true, isUsable: true }));
    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('PasteLink -> a url input; saving PUTs the link and never shows it back', async () => {
    const successSpy = vi.spyOn(toast, 'success');
    const root = render(summary('PasteLink', { syncStatus: 'AwaitingLink' }));
    const input = root.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    input.value = 'https://meet.google.com/abc-defg-hij';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); // a real browser re-renders between typing and clicking
    (button(root, 'Save link') as HTMLButtonElement).click();

    const req = httpMock.expectOne('/api/live/instructor/sessions/s1/meeting-link');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ meetUrl: 'https://meet.google.com/abc-defg-hij' });

    const changes: InstructorMeetingSummary[] = [];
    fixture.componentInstance.meetingChange.subscribe((value) => changes.push(value));
    const updated = summary('None', { syncStatus: 'Synced', hasMeetingLink: true, isUsable: true, provider: 'Manual' });
    req.flush(updated);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changes).toEqual([updated]);
    expect(successSpy).toHaveBeenCalled();
    // the field was cleared and the link is not echoed anywhere in the component
    expect(input.value).toBe('');
    expect(root.textContent).not.toContain('meet.google.com/abc-defg-hij');
  });

  it('PasteLink -> a 2-step helper: open Meet in a new tab, then paste the link into the field', () => {
    const root = render(summary('PasteLink', { syncStatus: 'AwaitingLink' }));

    expect(root.textContent).toContain('Set up the room yourself in 2 steps');
    const steps = root.querySelectorAll('ol > li');
    expect(steps.length).toBe(2);

    // Step 1: exactly one safe external link to Google's "new meeting" entry point.
    const anchors = Array.from(root.querySelectorAll('a'));
    expect(anchors.length).toBe(1);
    const createMeet = anchors[0];
    expect(createMeet.textContent).toContain('Create a Google Meet room');
    expect(createMeet.getAttribute('href')).toBe('https://meet.google.com/new');
    expect(createMeet.getAttribute('target')).toBe('_blank');
    expect(createMeet.getAttribute('rel')).toBe('noopener noreferrer');
    expect(steps[0].contains(createMeet)).toBe(true);

    // Zoom / Teams are plain text hints only — no extra buttons or links.
    expect(steps[0].textContent).toContain('Zoom or Microsoft Teams');
    expect(steps[0].textContent).toContain('zoom.us');
    expect(steps[0].textContent).toContain('teams.microsoft.com');

    // Step 2: the instruction, the field and the accepted-hosts note.
    expect(steps[1].textContent).toContain('copy its link and paste it in this field');
    expect(steps[1].querySelector('input[type="url"]')).not.toBeNull();
    expect(steps[1].textContent).toContain('meet.google.com, zoom.us, teams.microsoft.com');
  });

  it('PasteLink -> Thai copy for the helper', () => {
    TestBed.inject(TranslationService).setLocale('th');
    const root = render(summary('PasteLink', { syncStatus: 'AwaitingLink' }));
    expect(root.textContent).toContain('สร้างห้อง Google Meet');
    expect(root.textContent).toContain('สร้างห้องแล้วคัดลอกลิงก์มาวางที่ช่องนี้');
    expect(root.textContent).toContain('meet.google.com, zoom.us, teams.microsoft.com');
  });

  it('PasteLink -> a non-https link is rejected on the client without calling the API', () => {
    const root = render(summary('PasteLink', { syncStatus: 'AwaitingLink' }));
    const input = root.querySelector('input[type="url"]') as HTMLInputElement;
    input.value = 'http://zoom.us/j/123';
    input.dispatchEvent(new Event('input'));
    (button(root, 'Save link') as HTMLButtonElement).click();
    fixture.detectChanges();

    httpMock.expectNone('/api/live/instructor/sessions/s1/meeting-link');
    expect(root.textContent).toContain('https');
  });

  it('PasteLink -> a server rejection (host not allowed) shows the allowed hosts and keeps the field', () => {
    const root = render(summary('PasteLink', { syncStatus: 'AwaitingLink' }));
    const input = root.querySelector('input[type="url"]') as HTMLInputElement;
    input.value = 'https://evil.example/room';
    input.dispatchEvent(new Event('input'));
    (button(root, 'Save link') as HTMLButtonElement).click();

    httpMock
      .expectOne('/api/live/instructor/sessions/s1/meeting-link')
      .flush({ reason: 'live.meeting_link_host_not_allowed' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('meet.google.com');
  });

  it('ReconnectGoogle -> a reconnect button that starts the OAuth flow with this page as the return path', () => {
    const root = render(summary('ReconnectGoogle', { syncStatus: 'NeedsReconnect', errorCode: 'invalid_grant' }));
    expect(root.textContent).toContain('Google access expired or was revoked');

    (button(root, 'Reconnect Google') as HTMLButtonElement).click();
    const req = httpMock.expectOne('/api/live/instructor/google/connect');
    expect(req.request.body).toEqual({ returnPath: '/instructor/sessions/s1' });
    req.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=z' });
    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=z');
  });

  it('ReconnectGoogle -> hides the connect button when the server has no Google client, but still offers manual paste', () => {
    const root = render(summary('ReconnectGoogle', { syncStatus: 'NeedsReconnect' }), false);
    expect(button(root, 'Reconnect Google')).toBeUndefined();
    expect(button(root, 'Paste a room link instead')).toBeDefined();
  });

  it('opting into manual paste after a failure reveals the same 2-step helper', () => {
    const root = render(summary('Retry', { syncStatus: 'Failed' }));
    expect(root.querySelector('a[href="https://meet.google.com/new"]')).toBeNull();

    (button(root, 'Paste a room link instead') as HTMLButtonElement).click();
    fixture.detectChanges();

    const createMeet = root.querySelector('a[href="https://meet.google.com/new"]');
    expect(createMeet).not.toBeNull();
    expect(createMeet?.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('input[type="url"]')).not.toBeNull();
  });

  it('Retry -> a resync button; clicking it POSTs and emits the new summary', () => {
    const root = render(summary('Retry', { syncStatus: 'Failed', errorCode: 'conference_pending' }));
    expect(root.textContent).toContain('still preparing the Meet room');

    const changes: InstructorMeetingSummary[] = [];
    fixture.componentInstance.meetingChange.subscribe((value) => changes.push(value));
    (button(root, 'Try creating the room again') as HTMLButtonElement).click();
    const req = httpMock.expectOne('/api/live/instructor/sessions/s1/meeting/resync');
    expect(req.request.method).toBe('POST');
    req.flush(summary('Waiting'));

    expect(changes.length).toBe(1);
  });

  it('guards against double submit: a second click while a request is in flight sends nothing', () => {
    const root = render(summary('Retry', { syncStatus: 'Failed' }));
    const resync = button(root, 'Try creating the room again') as HTMLButtonElement;
    resync.click();
    fixture.detectChanges();
    resync.click();

    const req = httpMock.expectOne('/api/live/instructor/sessions/s1/meeting/resync');
    req.flush(summary('Waiting'));
    httpMock.expectNone('/api/live/instructor/sessions/s1/meeting/resync');
  });

  it('an unknown meeting errorCode shows a generic hint, never the raw code', () => {
    const root = render(summary('Retry', { syncStatus: 'Failed', errorCode: 'weird_internal_code_42' }));
    expect(root.textContent).toContain('Could not create the room');
    expect(root.textContent).not.toContain('weird_internal_code_42');
  });
});
