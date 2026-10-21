import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { tutorProfile } from '../testing/tutor-fixtures';
import { TutorProfileEditorPage } from './tutor-profile-editor-page';

registerLocaleData(localeTh);

const PROFILE_URL = '/api/tutoring/tutor/profile';
const NOT_FOUND = { reason: 'tutoring.tutor_profile_not_found' };

describe('TutorProfileEditorPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/profile', component: TutorProfileEditorPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    for (let pass = 0; pass < 3; pass++) {
      harness.detectChanges();
      TestBed.flushEffects();
      await Promise.resolve();
    }
    harness.detectChanges();
  }

  async function open(): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/profile', TutorProfileEditorPage);
    await settle();
  }

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';

  async function loadNothing(): Promise<void> {
    await open();
    httpMock.expectOne(PROFILE_URL).flush(NOT_FOUND, { status: 404, statusText: 'Not Found' });
    await settle();
  }

  async function loadProfile(overrides: Parameters<typeof tutorProfile>[0] = {}): Promise<void> {
    await open();
    httpMock.expectOne(PROFILE_URL).flush(tutorProfile(overrides));
    await settle();
  }

  function field(selector: string): HTMLInputElement | HTMLTextAreaElement {
    return page().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  }

  async function type(selector: string, value: string): Promise<void> {
    const element = field(selector);
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await settle();
  }

  const displayName = 'app-input[formcontrolname="displayName"] input';
  const submitButton = (): HTMLButtonElement => page().querySelector<HTMLButtonElement>('form button[type="submit"]')!;

  async function submit(): Promise<void> {
    submitButton().click();
    await settle();
  }

  it('is the create form while the server says there is no profile yet', async () => {
    await loadNothing();
    expect(text()).toContain('Create profile');
    expect(text()).toContain('Save your profile first');
    expect(page().querySelector('app-tutor-photo-panel')).toBeNull();
  });

  it('does not send an invalid form: it explains the field, marks it invalid and moves focus there', async () => {
    await loadNothing();
    await submit();

    httpMock.expectNone(PROFILE_URL);
    const name = field(displayName);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(text()).toContain('This field is required.');
    expect(document.activeElement).toBe(name);
  });

  it('creates the profile with the typed values and then offers the photo and the intro video', async () => {
    await loadNothing();
    await type(displayName, '  Nina Tutor  ');
    await type('app-input[formcontrolname="headline"] input', 'Physics tutor');
    await type('#tutor-bio', 'I teach physics.');
    await type('app-input[formcontrolname="yearsExperience"] input', '6');
    await submit();

    const req = httpMock.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ displayName: 'Nina Tutor', headline: 'Physics tutor', bio: 'I teach physics.', gender: 'Undisclosed', yearsExperience: 6 });
    req.flush(tutorProfile({ displayName: 'Nina Tutor' }), { status: 201, statusText: 'Created' });
    await settle();

    expect(page().querySelector('app-tutor-photo-panel')).not.toBeNull();
    expect(page().querySelector('app-tutor-intro-video-panel')).not.toBeNull();
    expect(text()).toContain('Save changes');
  });

  it('blocks a double submit while the request is in flight', async () => {
    await loadNothing();
    await type(displayName, 'Nina Tutor');
    await submit();
    await submit();
    const requests = httpMock.match(PROFILE_URL);
    expect(requests).toHaveLength(1);
    requests[0].flush(tutorProfile(), { status: 201, statusText: 'Created' });
  });

  it('fills the editor from the server and saves with the row version it read', async () => {
    await loadProfile({ rowVersion: 'ROWVERSION-1' });
    expect(field(displayName).value).toBe('Nina Tutor');
    expect(field('#tutor-bio').value).toContain('six years');

    await type('app-input[formcontrolname="headline"] input', 'New headline');
    await submit();
    const first = httpMock.expectOne(PROFILE_URL);
    expect(first.request.method).toBe('PUT');
    expect((first.request.body as { rowVersion: string; headline: string }).rowVersion).toBe('ROWVERSION-1');
    expect((first.request.body as { headline: string }).headline).toBe('New headline');
    first.flush(tutorProfile({ headline: 'New headline', rowVersion: 'ROWVERSION-2' }));
    await settle();

    await type('app-input[formcontrolname="headline"] input', 'Third headline');
    await submit();
    expect((httpMock.expectOne(PROFILE_URL).request.body as { rowVersion: string }).rowVersion).toBe('ROWVERSION-2');
  });

  it('on a stale row version keeps the unsaved edits, explains, and only reloads when asked', async () => {
    await loadProfile();
    await type('app-input[formcontrolname="headline"] input', 'Edited headline');
    await submit();
    httpMock.expectOne(PROFILE_URL).flush({ reason: 'tutoring.concurrent_update' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(page().querySelector('app-tutor-problem')?.textContent).toContain('changed somewhere else');
    expect(field('app-input[formcontrolname="headline"] input').value).toBe('Edited headline');
    expect(submitButton().disabled).toBe(true);

    [...page().querySelectorAll('button')].find((b) => b.textContent?.includes('Load the latest version'))!.click();
    await settle();
    httpMock.expectOne(PROFILE_URL).flush(tutorProfile({ headline: 'Server headline', rowVersion: 'ROWVERSION-9' }));
    await settle();
    expect(field('app-input[formcontrolname="headline"] input').value).toBe('Server headline');
  });

  it('marks the field a server validation answer rejected, without showing server text', async () => {
    await loadProfile();
    await submit();
    httpMock.expectOne(PROFILE_URL).flush(
      { status: 400, errorCode: 'validation', title: 'SERVER TITLE', errors: { Bio: ['SERVER FIELD TEXT'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    expect(text()).toContain('The server did not accept this value.');
    expect(text()).not.toContain('SERVER');
  });

  it('is read-only for a suspended tutor', async () => {
    await loadProfile({ status: 'Suspended' });
    expect(text()).toContain('Your tutor account is suspended');
    expect(field(displayName).disabled).toBe(true);
    await submit();
    httpMock.expectNone(PROFILE_URL);
  });

  it('offers a retry when the profile cannot be loaded', async () => {
    await open();
    httpMock.expectOne(PROFILE_URL).flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(text()).toContain('We could not load your profile');
    [...page().querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!.click();
    await settle();
    httpMock.expectOne(PROFILE_URL).flush(tutorProfile());
    await settle();
    expect(field(displayName).value).toBe('Nina Tutor');
  });
});
