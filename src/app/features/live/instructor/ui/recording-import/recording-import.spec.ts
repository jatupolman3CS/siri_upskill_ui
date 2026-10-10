import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { RecordingImportInfo } from '../../../data/live-instructor.models';
import { RecordingImport } from './recording-import';

const RETRY_URL = '/api/live/instructor/sessions/s1/recording-import/retry';

const info = (overrides: Partial<RecordingImportInfo> = {}): RecordingImportInfo => ({
  mode: 'Auto',
  status: null,
  errorCode: null,
  nextAttemptAtUtc: null,
  canRetry: false,
  ...overrides,
});

describe('RecordingImport', () => {
  let fixture: ComponentFixture<RecordingImport>;
  let httpMock: HttpTestingController;
  let toast: ToastService;

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
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function mount(
    recordingImport: RecordingImportInfo | null,
    options: { hasRecording?: boolean; variant?: 'row' | 'detail' } = {},
  ): Promise<void> {
    fixture = TestBed.createComponent(RecordingImport);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('sessionTitle', 'Session 1');
    fixture.componentRef.setInput('recordingImport', recordingImport);
    fixture.componentRef.setInput('hasRecording', options.hasRecording ?? false);
    fixture.componentRef.setInput('variant', options.variant ?? 'row');
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const button = (label: string) =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

  it('puts the status sentence in one polite, atomic live region and keeps the upload available', async () => {
    await mount(info({ status: 'Waiting' }));

    const region = root().querySelector('[aria-live="polite"]') as HTMLElement;
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toContain('Waiting for Google Meet');
    expect(button('Upload recording')).toBeDefined();
  });

  it('the importing spinner spins, but holds still for prefers-reduced-motion, and is hidden from assistive tech', async () => {
    await mount(info({ status: 'Processing' }));

    const icon = root().querySelector('ng-icon') as HTMLElement;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.className).toContain('animate-spin');
    expect(icon.className).toContain('motion-reduce:animate-none');
  });

  it('a terminal state does not spin', async () => {
    await mount(info({ status: 'Failed', errorCode: 'transcode_timeout', canRetry: true }));

    expect(root().querySelector('ng-icon')?.className).not.toContain('animate-spin');
    expect(text()).toContain('Processing the video took too long.');
  });

  it('uses the wording of the surface it sits on for the plain states', async () => {
    await mount(null, { variant: 'row' });
    expect(text()).toContain('This session has ended. Upload the recording');

    await mount(null, { variant: 'detail' });
    expect(text()).toContain('No recording yet. Upload a video');

    await mount(null, { variant: 'detail', hasRecording: true });
    expect(text()).toContain('This session has a recording');
  });

  it('Retry is one request at a time: a second click while it is running sends nothing', async () => {
    await mount(info({ status: 'Failed', canRetry: true }));
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);

    const retry = button('Try importing again');
    retry?.click();
    await settle();
    expect(retry?.disabled).toBe(true);
    retry?.click();
    const req = httpMock.expectOne(RETRY_URL);
    expect(changed).not.toHaveBeenCalled();

    req.flush(info({ status: 'Waiting' }));
    await settle();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Waiting for Google Meet');
    expect(button('Try importing again')).toBeUndefined();
  });

  it('toasts a success message after a retry', async () => {
    const success = vi.spyOn(toast, 'success');
    await mount(info({ status: 'NoRecording', canRetry: true }));

    button('Try importing again')?.click();
    httpMock.expectOne(RETRY_URL).flush(info({ status: 'Waiting' }));

    expect(success).toHaveBeenCalledWith("We'll look for this session's recording again");
  });

  it('a refused retry (409) toasts the reason, re-enables the button and asks the parent to refetch', async () => {
    const error = vi.spyOn(toast, 'error');
    await mount(info({ status: 'Failed', canRetry: true }));
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);

    button('Try importing again')?.click();
    httpMock.expectOne(RETRY_URL).flush({ reason: 'live.recording_import_not_retryable' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(error).toHaveBeenCalledWith(TestBed.inject(TranslationService).t('live.errors.recordingImportNotRetryable'));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(button('Try importing again')?.disabled).toBe(false);
  });

  it('a newer server value wins over the answer to an earlier retry', async () => {
    await mount(info({ status: 'Failed', canRetry: true }));
    button('Try importing again')?.click();
    httpMock.expectOne(RETRY_URL).flush(info({ status: 'Waiting' }));
    await settle();
    expect(text()).toContain('Waiting for Google Meet');

    fixture.componentRef.setInput('recordingImport', info({ status: 'Attached' }));
    fixture.componentRef.setInput('hasRecording', true);
    await settle();
    expect(text()).not.toContain('Waiting for Google Meet');
    expect(text()).toContain('Recording attached');
  });

  it('NeedsReconnect: the link to the Google settings page is a real, keyboard-reachable link with a visible label', async () => {
    await mount(info({ status: 'NeedsReconnect' }));

    const link = Array.from(root().querySelectorAll('a')).find((a) => a.textContent?.includes('Reconnect Google')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/instructor/live-settings');
    expect(link.className).toContain('min-h-11');
    expect(link.className).toContain('focus-visible:ring-2');
  });

  it('the upload completing bubbles up as "changed"', async () => {
    await mount(null);
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);

    const uploader = root().querySelector('app-live-recording-uploader') as HTMLElement;
    expect(uploader).not.toBeNull();
    // Driving the real upload needs the whole media pipeline; the wiring is what matters here.
    fixture.debugElement.query((d) => d.name === 'app-live-recording-uploader').triggerEventHandler('attached', {});
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
