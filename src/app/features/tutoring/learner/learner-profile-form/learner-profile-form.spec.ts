import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import { learnerProfile } from '../testing/learner-fixtures';
import { LearnerProfileForm } from './learner-profile-form';

describe('LearnerProfileForm', () => {
  let fixture: ComponentFixture<LearnerProfileForm>;
  let httpMock: HttpTestingController;
  let saved: LearnerProfile[];
  let cancelled: number;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LearnerProfileForm],
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LearnerProfileForm);
    saved = [];
    cancelled = 0;
    fixture.componentInstance.saved.subscribe((profile) => saved.push(profile));
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';

  async function render(profile: LearnerProfile | null = null): Promise<void> {
    fixture.componentRef.setInput('profile', profile);
    fixture.detectChanges();
    TestBed.tick();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function typeNickname(value: string): void {
    const input = root().querySelector<HTMLInputElement>('app-input input');
    if (input === null) {
      throw new Error('nickname input missing');
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function chooseGrade(value: string): void {
    const select = root().querySelector<HTMLSelectElement>('app-select select');
    if (select === null) {
      throw new Error('grade select missing');
    }
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  const checkbox = (labelPart: string): HTMLInputElement | null =>
    Array.from(root().querySelectorAll('app-checkbox')).find((host) => host.textContent?.includes(labelPart))?.querySelector('input') ?? null;

  function tick(): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  const submit = (): void => {
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    tick();
  };

  it('starts blank with the guardian consent unticked - it is never pre-ticked', async () => {
    await render();

    expect(root().querySelector<HTMLInputElement>('app-input input')?.value).toBe('');
    expect(checkbox('parent or guardian')?.checked).toBe(false);
    expect(text()).toContain('Consent text version 2026-10-v1');
  });

  it('tells the person that tutors only see the nickname and grade', async () => {
    await render();

    expect(text()).toContain('Tutors only ever see the nickname and the grade');
  });

  it('locks "under 18" for a school grade and frees it for an adult grade, hiding the consent when it is not needed', async () => {
    await render();

    const minor = checkbox('under 18');
    expect(minor?.checked).toBe(true);
    expect(minor?.disabled).toBe(true);
    expect(text()).toContain('always under 18');

    chooseGrade('University');
    tick();

    expect(checkbox('under 18')?.disabled).toBe(false);
    expect(checkbox('under 18')?.checked).toBe(true);
    checkbox('under 18')?.click();
    tick();
    expect(root().querySelector('fieldset')).toBeNull();
  });

  it('shows the field errors after a submit attempt and sends nothing', async () => {
    await render();

    submit();

    expect(text()).toContain('Enter a nickname.');
    expect(text()).toContain('A parent or guardian must agree');
    httpMock.expectNone('/api/tutoring/learner-profiles');
  });

  it('refuses a nickname that looks like a phone number before it reaches the server', async () => {
    await render();

    typeNickname('Mint 0812345678');
    checkbox('parent or guardian')?.click();
    submit();

    expect(text()).toContain('Use a nickname only - no e-mail address or phone number.');
    httpMock.expectNone('/api/tutoring/learner-profiles');
  });

  it('creates the profile with the consent and its version, then reports it saved', async () => {
    await render();

    typeNickname('  Mint  ');
    chooseGrade('Secondary3');
    checkbox('parent or guardian')?.click();
    submit();

    const request = httpMock.expectOne('/api/tutoring/learner-profiles');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      nickname: 'Mint',
      gradeLevel: 'Secondary3',
      isMinor: true,
      guardianConsent: true,
      guardianConsentVersion: '2026-10-v1',
    });
    const created = learnerProfile({ nickname: 'Mint', gradeLevel: 'Secondary3' });
    request.flush(created, { status: 201, statusText: 'Created' });
    tick();

    expect(saved).toEqual([created]);
  });

  it('sends no consent for an adult learner', async () => {
    await render();

    typeNickname('Pim');
    chooseGrade('Adult');
    tick();
    checkbox('under 18')?.click();
    tick();
    submit();

    const request = httpMock.expectOne('/api/tutoring/learner-profiles');
    expect(request.request.body).toEqual({ nickname: 'Pim', gradeLevel: 'Adult', isMinor: false, guardianConsent: false, guardianConsentVersion: null });
    request.flush(learnerProfile({ gradeLevel: 'Adult', isMinor: false }), { status: 201, statusText: 'Created' });
  });

  it('guards against a double submit while the request is in flight', async () => {
    await render();

    typeNickname('Mint');
    checkbox('parent or guardian')?.click();
    submit();
    submit();

    const requests = httpMock.match('/api/tutoring/learner-profiles');
    expect(requests).toHaveLength(1);
    requests[0].flush(learnerProfile(), { status: 201, statusText: 'Created' });
  });

  it('edits an existing profile with PUT, loads its values and asks for the consent again', async () => {
    await render(learnerProfile({ learnerProfileId: 'lp-7', nickname: 'Mint', gradeLevel: 'Primary3' }));

    expect(root().querySelector<HTMLInputElement>('app-input input')?.value).toBe('Mint');
    expect(root().querySelector<HTMLSelectElement>('app-select select')?.value).toBe('Primary3');
    expect(checkbox('parent or guardian')?.checked).toBe(false);
    expect(text()).toContain('Consent was recorded on');

    checkbox('parent or guardian')?.click();
    submit();

    const request = httpMock.expectOne('/api/tutoring/learner-profiles/lp-7');
    expect(request.request.method).toBe('PUT');
    request.flush(learnerProfile({ learnerProfileId: 'lp-7' }));
    tick();
    expect(saved).toHaveLength(1);
  });

  it('shows the server answer for the profile limit without losing what was typed', async () => {
    await render();

    typeNickname('Mint');
    checkbox('parent or guardian')?.click();
    submit();
    httpMock
      .expectOne('/api/tutoring/learner-profiles')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.learner_profile_limit' }, { status: 409, statusText: 'Conflict' });
    tick();

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('maximum number of learner profiles');
    expect(root().querySelector<HTMLInputElement>('app-input input')?.value).toBe('Mint');
    expect(saved).toEqual([]);
  });

  it('asks for a reload instead of re-sending an unknown consent version', async () => {
    await render();
    // jsdom's `location.reload` is unforgeable, so the component's own (protected) method is the seam.
    const reload = vi.spyOn(fixture.componentInstance as unknown as { reloadPage: () => void }, 'reloadPage').mockImplementation(() => undefined);

    typeNickname('Mint');
    checkbox('parent or guardian')?.click();
    submit();
    httpMock
      .expectOne('/api/tutoring/learner-profiles')
      .flush(
        { title: 'Bad request', status: 400, errorCode: 'validation', reason: 'tutoring.guardian_consent_required', currentVersion: '2027-01-v2' },
        { status: 400, statusText: 'Bad Request' },
      );
    tick();

    expect(text()).toContain('The guardian consent text has been updated');
    const reloadButton = Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes('Reload the page'));
    reloadButton?.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
    httpMock.expectNone('/api/tutoring/learner-profiles');
  });

  it('marks a field the server rejected', async () => {
    await render();

    typeNickname('Mint');
    checkbox('parent or guardian')?.click();
    submit();
    httpMock
      .expectOne('/api/tutoring/learner-profiles')
      .flush(
        { title: 'Bad request', status: 400, errorCode: 'validation', reason: 'tutoring.learner_nickname_invalid', errors: { Nickname: ['bad'] } },
        { status: 400, statusText: 'Bad Request' },
      );
    tick();

    expect(root().querySelector('app-input input')?.getAttribute('aria-invalid')).toBe('true');
    expect(text()).toContain('The server did not accept this value');
  });

  it('can be cancelled, and the cancel button is hidden when the form is the only thing to do', async () => {
    await render();
    const cancel = Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes('Cancel'));
    cancel?.querySelector('button')?.click();
    expect(cancelled).toBe(1);

    fixture.componentRef.setInput('cancellable', false);
    tick();
    expect(Array.from(root().querySelectorAll('app-button')).some((host) => host.textContent?.includes('Cancel'))).toBe(false);
  });
});
