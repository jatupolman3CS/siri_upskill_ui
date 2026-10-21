import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { learnerProfile, pagedOf } from '../testing/learner-fixtures';
import { LearnerProfilesPage } from './learner-profiles-page';

registerLocaleData(localeTh);

const LIST_URL = (req: { url: string }): boolean => req.url === '/api/tutoring/learner-profiles';

describe('LearnerProfilesPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'account/learner-profiles', component: LearnerProfilesPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.tick();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function open(answer: 'items' | 'empty' | 'error' | 'pending', items = [learnerProfile()]): Promise<void> {
    await harness.navigateByUrl('/account/learner-profiles', LearnerProfilesPage);
    await settle();
    if (answer === 'pending') {
      return;
    }
    const request = httpMock.expectOne(LIST_URL);
    if (answer === 'error') {
      request.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    } else {
      request.flush(pagedOf(answer === 'empty' ? [] : items));
    }
    await settle();
    await settle();
  }

  const button = (label: string): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes(label))?.querySelector('button') ?? null;

  it('shows a busy skeleton while the profiles load', async () => {
    await open('pending');

    expect(root().querySelector('[role="status"][aria-label="Loading learner profiles"]')).not.toBeNull();
    httpMock.expectOne(LIST_URL).flush(pagedOf([]));
  });

  it('states up front that tutors only see the nickname and grade', async () => {
    await open('items');

    expect(text()).toContain('Tutors see only the nickname and the grade of a learner');
  });

  it('lists each learner with the grade label, the under-18 badge and the consent date', async () => {
    await open('items', [learnerProfile({ nickname: 'Mint', gradeLevel: 'Secondary4' }), learnerProfile({ learnerProfileId: 'lp-2', nickname: 'Pim', gradeLevel: 'Adult', isMinor: false, guardianConsentAtUtc: null })]);

    const cards = root().querySelectorAll('ul > li');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Mint');
    expect(cards[0].textContent).toContain('Secondary 4 (Grade 10)');
    expect(cards[0].textContent).toContain('Under 18');
    expect(cards[0].textContent).toContain('Guardian consent recorded on 10 Oct 2026');
    expect(cards[1].textContent).toContain('Adult');
    expect(cards[1].textContent).not.toContain('Under 18');
  });

  it('offers a clear way forward when there are no learners yet', async () => {
    await open('empty');

    expect(text()).toContain('No learner profiles yet');
    expect(text()).toContain('Add a learner to book your first tutoring lesson.');
    expect(button('Add a learner')).not.toBeNull();
  });

  it('shows an error state with a retry that reads the list again', async () => {
    await open('error');

    expect(text()).toContain('Could not load your learner profiles');
    button('Try again')?.click();
    await settle();
    httpMock.expectOne(LIST_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();

    expect(text()).toContain('Mint');
  });

  it('opens the add form with the consent unticked and reloads the list after saving', async () => {
    await open('empty');

    button('Add a learner')?.click();
    await settle();
    expect(root().querySelector('app-learner-profile-form')).not.toBeNull();
    expect(Array.from(root().querySelectorAll('app-checkbox input')).every((box) => !(box as HTMLInputElement).checked || (box as HTMLInputElement).disabled)).toBe(true);

    const form = root().querySelector('app-learner-profile-form');
    const input = form?.querySelector<HTMLInputElement>('app-input input');
    if (input) {
      input.value = 'Mint';
      input.dispatchEvent(new Event('input'));
    }
    const consent = Array.from(form?.querySelectorAll('app-checkbox') ?? []).find((host) => host.textContent?.includes('parent or guardian'));
    consent?.querySelector('input')?.click();
    await settle();
    form?.querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();

    httpMock.expectOne('/api/tutoring/learner-profiles').flush(learnerProfile(), { status: 201, statusText: 'Created' });
    await settle();
    httpMock.expectOne(LIST_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();

    expect(root().querySelector('app-learner-profile-form')).toBeNull();
    expect(text()).toContain('Mint');
  });

  it('asks for confirmation before removing a learner, then removes it and reloads', async () => {
    await open('items');

    button('Remove')?.click();
    await settle();
    expect(document.body.textContent).toContain('Remove this learner?');
    httpMock.expectNone('/api/tutoring/learner-profiles/lp-1');

    const confirm = Array.from(document.body.querySelectorAll('app-modal app-button')).find((host) => host.textContent?.includes('Remove learner'));
    confirm?.querySelector('button')?.click();
    await settle();
    const request = httpMock.expectOne('/api/tutoring/learner-profiles/lp-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    httpMock.expectOne(LIST_URL).flush(pagedOf([]));
    await settle();
    await settle();

    expect(text()).toContain('No learner profiles yet');
  });

  it('keeps the learner and explains why when the server refuses the removal (a live booking)', async () => {
    await open('items');

    button('Remove')?.click();
    await settle();
    const confirm = Array.from(document.body.querySelectorAll('app-modal app-button')).find((host) => host.textContent?.includes('Remove learner'));
    confirm?.querySelector('button')?.click();
    await settle();
    httpMock
      .expectOne('/api/tutoring/learner-profiles/lp-1')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.learner_profile_in_use' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(text()).toContain('still has a booking or an active package');
    expect(text()).toContain('Mint');
  });

  it('displays an anonymized learner profile with badge and hides edit and remove buttons', async () => {
    await open('items', [
      learnerProfile({
        learnerProfileId: 'lp-anon',
        nickname: 'NongB',
        gradeLevel: 'Secondary4',
        anonymizedAtUtc: '2026-10-10T00:00:00Z',
      }),
    ]);

    expect(text()).toContain('NongB');
    expect(text()).toContain('Data erased');
    expect(button('Edit')).toBeNull();
    expect(button('Remove')).toBeNull();
    expect(button('Withdraw guardian consent')).toBeNull();
  });

  it('displays a profile with withdrawn consent with badge and hides actions', async () => {
    await open('items', [
      learnerProfile({
        learnerProfileId: 'lp-withdrawn',
        nickname: 'NongC',
        gradeLevel: 'Secondary4',
        guardianConsentWithdrawnAtUtc: '2026-10-10T00:00:00Z',
      }),
    ]);

    expect(text()).toContain('NongC');
    expect(text()).toContain('Consent withdrawn');
    expect(button('Edit')).toBeNull();
    expect(button('Remove')).toBeNull();
    expect(button('Withdraw guardian consent')).toBeNull();
  });

  it('opens withdraw consent modal, requires typing WITHDRAW, calls API and reloads on success', async () => {
    await open('items', [
      learnerProfile({
        learnerProfileId: 'lp-minor',
        nickname: 'NongA',
        isMinor: true,
        isActive: true,
        guardianConsentWithdrawnAtUtc: null,
      }),
    ]);

    const withdrawBtn = button('Withdraw guardian consent');
    expect(withdrawBtn).not.toBeNull();
    withdrawBtn?.click();
    await settle();

    expect(document.body.textContent).toContain('Withdraw guardian consent');
    expect(document.body.textContent).toContain('Type WITHDRAW to confirm');

    const input = document.body.querySelector<HTMLInputElement>('#withdraw-consent-confirm');
    expect(input).not.toBeNull();
    if (input) {
      input.value = 'WITHDRAW';
      input.dispatchEvent(new Event('input'));
    }
    await settle();

    const confirm = Array.from(document.body.querySelectorAll('app-modal app-button')).find((host) =>
      host.textContent?.includes('Confirm withdrawal'),
    );
    expect(confirm?.querySelector('button')?.disabled).toBe(false);
    confirm?.querySelector('button')?.click();
    await settle();

    const req = httpMock.expectOne('/api/tutoring/learner-profiles/lp-minor/withdraw-consent');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ confirmation: 'WITHDRAW' });
    req.flush({
      learnerProfileId: 'lp-minor',
      withdrawnAtUtc: new Date().toISOString(),
      message: 'Success',
    });
    await settle();

    httpMock.expectOne(LIST_URL).flush(pagedOf([]));
    await settle();
    await settle();
  });

  it('displays blockers when withdraw guardian consent returns 409 conflict', async () => {
    await open('items', [
      learnerProfile({
        learnerProfileId: 'lp-minor',
        nickname: 'NongA',
        isMinor: true,
        isActive: true,
        guardianConsentWithdrawnAtUtc: null,
      }),
    ]);

    button('Withdraw guardian consent')?.click();
    await settle();

    const input = document.body.querySelector<HTMLInputElement>('#withdraw-consent-confirm');
    if (input) {
      input.value = 'WITHDRAW';
      input.dispatchEvent(new Event('input'));
    }
    await settle();

    const confirm = Array.from(document.body.querySelectorAll('app-modal app-button')).find((host) =>
      host.textContent?.includes('Confirm withdrawal'),
    );
    confirm?.querySelector('button')?.click();
    await settle();

    const req = httpMock.expectOne('/api/tutoring/learner-profiles/lp-minor/withdraw-consent');
    req.flush(
      {
        title: 'Conflict',
        status: 409,
        errorCode: 'conflict',
        reason: 'tutoring.consent_withdraw_blocked',
        blockers: ['bookings', 'packages'],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(document.body.textContent).toContain('Cannot withdraw consent while obligations are open');
    expect(document.body.textContent).toContain('There are pending payment or confirmed bookings for this profile.');
    expect(document.body.textContent).toContain('There are active lesson packages for this profile.');
  });
});
