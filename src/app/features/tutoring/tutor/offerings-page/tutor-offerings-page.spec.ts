import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { PublicSubjectItem } from '../../data/tutoring-public.models';
import type { TutorOffering } from '../../data/tutoring-tutor.models';
import { pagedOf, tutorOffering } from '../testing/tutor-fixtures';
import { TutorOfferingsPage } from './tutor-offerings-page';

registerLocaleData(localeTh);

const OFFERINGS_URL = '/api/tutoring/tutor/offerings';
const SUBJECTS_URL = '/api/tutoring/subjects';

describe('TutorOfferingsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/offerings', component: TutorOfferingsPage }]),
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

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const button = (label: string): HTMLButtonElement => [...page().querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

  /** Opens the page; `catalogue` is what `GET /subjects` answers (`PublicSubjectItem`: id, slug, names, parent, order). */
  async function open(offerings: readonly TutorOffering[], catalogue: readonly PublicSubjectItem[] = []): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/offerings', TutorOfferingsPage);
    httpMock.expectOne(OFFERINGS_URL.concat('?page=1&pageSize=100')).flush(pagedOf(offerings));
    httpMock.expectOne((r) => r.url === SUBJECTS_URL).flush(pagedOf(catalogue));
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const element = page().querySelector<HTMLInputElement>(selector)!;
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choose(selector: string, value: string): Promise<void> {
    const element = page().querySelector<HTMLSelectElement>(selector)!;
    element.value = value;
    element.dispatchEvent(new Event('change'));
    await settle();
  }

  it('lists each offering with its subject, level, curriculum, status and rates', async () => {
    await open([
      tutorOffering(),
      tutorOffering({
        offeringId: 'off-2',
        subject: { subjectId: 'sub-math', slug: 'math', nameTh: 'Math (TH)', nameEn: 'Mathematics' },
        level: 'Primary',
        curriculum: 'EP',
        hourlyRateOneOnOne: 300,
        groupHourlyRatePerSeat: 200,
        groupMaxSeats: 4,
        trialEnabled: true,
        trialMinutes: 30,
        trialPrice: 0,
        isActive: false,
      }),
    ]);
    expect(text()).toContain('Physics');
    expect(text()).toContain('Upper secondary');
    expect(text()).toContain('450.00');
    expect(text()).toContain('Mathematics');
    expect(text()).toContain('Paused');
    expect(text()).toContain('Group (up to 4)');
    expect(text()).toContain('Free');
  });

  it('shows an empty state that leads to adding the first subject', async () => {
    await open([]);
    expect(text()).toContain('No subjects yet');
    expect(button('Add a subject')).toBeDefined();
  });

  it('pauses an offering by resending it unchanged with isActive false - never by deleting', async () => {
    await open([tutorOffering({ trialEnabled: true, trialMinutes: 15, trialPrice: 50 })]);
    button('Pause').click();
    const req = httpMock.expectOne(`${OFFERINGS_URL}/off-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      subjectId: 'sub-physics',
      level: 'UpperSecondary',
      curriculum: 'Thai',
      hourlyRateOneOnOne: 450,
      groupHourlyRatePerSeat: null,
      groupMaxSeats: null,
      trialEnabled: true,
      trialMinutes: 15,
      trialPrice: 50,
      isActive: false,
    });
    req.flush(tutorOffering({ isActive: false }));
    await settle();
    httpMock.expectOne(OFFERINGS_URL.concat('?page=1&pageSize=100')).flush(pagedOf([tutorOffering({ isActive: false })]));
    await settle();
    expect(text()).toContain('Paused');
    expect(text()).toContain('Resume');
  });

  const SCIENCES: PublicSubjectItem = { subjectId: 'sub-sciences', slug: 'sciences', nameTh: 'Sciences (TH)', nameEn: 'Sciences', parentSlug: null, sortOrder: 0 };
  const CHEMISTRY: PublicSubjectItem = { subjectId: 'sub-chem', slug: 'chemistry', nameTh: 'Chem (TH)', nameEn: 'Chemistry', parentSlug: 'sciences', sortOrder: 1 };
  const PHYSICS: PublicSubjectItem = { subjectId: 'sub-physics', slug: 'physics', nameTh: 'Physics (TH)', nameEn: 'Physics', parentSlug: 'sciences', sortOrder: 0 };
  const LANGUAGES: PublicSubjectItem = { subjectId: 'sub-lang', slug: 'languages', nameTh: 'Languages (TH)', nameEn: 'Languages', parentSlug: null, sortOrder: 1 };

  const subjectSelect = (): HTMLSelectElement => page().querySelector<HTMLSelectElement>('app-select[formcontrolname="subjectId"] select')!;

  it('says so, instead of showing a dead select, when the subject catalogue is empty and the tutor teaches nothing yet', async () => {
    await open([], []);
    button('Add a subject').click();
    await settle();
    expect(text()).toContain('subject list is not available right now');
    expect([...subjectSelect().options].filter((o) => !o.disabled && o.value !== '')).toHaveLength(0);
  });

  it('lists the catalogue grouped by parent - each group first, its subjects indented beneath it - and a group itself can be chosen', async () => {
    await open([], [SCIENCES, LANGUAGES, PHYSICS, CHEMISTRY]);
    button('Add a subject').click();
    await settle();
    expect(text()).not.toContain('subject list is not available right now');
    const options = [...subjectSelect().options].filter((o) => o.value !== '');
    expect(options.map((o) => [o.value, (o.textContent ?? '').trim()])).toEqual([
      ['sub-sciences', 'Sciences'],
      ['sub-physics', 'Physics'],
      ['sub-chem', 'Chemistry'],
      ['sub-lang', 'Languages'],
    ]);
    expect((options[1].textContent ?? '').includes(' ')).toBe(true);
    expect((options[0].textContent ?? '').includes(' ')).toBe(false);
    expect(options.every((o) => !o.disabled)).toBe(true);
  });

  it('keeps a retired subject of an existing offering readable but never lets a new offering pick it', async () => {
    await open([tutorOffering()], [SCIENCES, CHEMISTRY]);
    button('Add a subject').click();
    await settle();
    expect([...subjectSelect().options].find((o) => o.value === 'sub-physics')!.disabled).toBe(true);
    expect([...subjectSelect().options].find((o) => o.value === 'sub-chem')!.disabled).toBe(false);
  });

  it('adds an offering for a subject the catalogue identifies, without inventing any field', async () => {
    await open([], [CHEMISTRY]);
    button('Add a subject').click();
    await settle();

    await choose('app-select[formcontrolname="subjectId"] select', 'sub-chem');
    await type('app-input[formcontrolname="hourlyRate"] input', '500');
    page().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    const req = httpMock.expectOne(OFFERINGS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      subjectId: 'sub-chem',
      level: 'UpperSecondary',
      curriculum: 'Thai',
      hourlyRateOneOnOne: 500,
      groupHourlyRatePerSeat: null,
      groupMaxSeats: null,
      trialEnabled: false,
      trialMinutes: null,
      trialPrice: null,
      isActive: true,
    });
    req.flush(tutorOffering({ subject: { subjectId: 'sub-chem', slug: 'chemistry', nameTh: 'Chem (TH)', nameEn: 'Chemistry' } }), { status: 201, statusText: 'Created' });
    await settle();
    httpMock.expectOne(OFFERINGS_URL.concat('?page=1&pageSize=100')).flush(pagedOf([tutorOffering()]));
    await settle();
    expect(page().querySelector('form')).toBeNull();
  });

  it('refuses a group price above the one-to-one price before any request', async () => {
    await open([tutorOffering()]);
    button('Edit').click();
    await settle();
    page().querySelector<HTMLInputElement>('app-checkbox[formcontrolname="groupEnabled"] input')!.click();
    await settle();
    await type('app-input[formcontrolname="groupRate"] input', '900');
    page().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    httpMock.expectNone(`${OFFERINGS_URL}/off-1`);
    expect(text()).toContain('cannot be higher than your one-to-one price');
  });

  it('locks subject, level and curriculum when editing', async () => {
    await open([tutorOffering()]);
    button('Edit').click();
    await settle();
    expect(page().querySelector<HTMLSelectElement>('app-select[formcontrolname="subjectId"] select')!.disabled).toBe(true);
    expect(page().querySelector<HTMLSelectElement>('app-select[formcontrolname="level"] select')!.disabled).toBe(true);
    expect(text()).toContain('cannot be changed');
  });

  it('offers to open the existing paused twin when the server reports a duplicate', async () => {
    const paused = tutorOffering({ offeringId: 'off-old', isActive: false });
    await open([paused], [{ ...PHYSICS, parentSlug: null }]);
    button('Add a subject').click();
    await settle();
    await choose('app-select[formcontrolname="subjectId"] select', 'sub-physics');
    await type('app-input[formcontrolname="hourlyRate"] input', '450');
    page().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    httpMock
      .expectOne(OFFERINGS_URL)
      .flush({ status: 409, errorCode: 'conflict', reason: 'tutoring.offering_duplicate', offeringId: 'off-old' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text()).toContain('already have an offering with this subject');

    button('Open the existing offering').click();
    await settle();
    expect(text()).toContain('Edit offering');
    expect(page().querySelector<HTMLSelectElement>('app-select[formcontrolname="subjectId"] select')!.disabled).toBe(true);
  });

  it('offers a retry when the list cannot be loaded', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/offerings', TutorOfferingsPage);
    httpMock.expectOne(OFFERINGS_URL.concat('?page=1&pageSize=100')).flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne((r) => r.url === SUBJECTS_URL).flush(pagedOf([]));
    await settle();
    expect(text()).toContain('We could not load your offerings');
    button('Try again').click();
    await settle();
    httpMock.expectOne(OFFERINGS_URL.concat('?page=1&pageSize=100')).flush(pagedOf([tutorOffering()]));
    httpMock.expectOne((r) => r.url === SUBJECTS_URL).flush(pagedOf([]));
    await settle();
    expect(text()).toContain('Physics');
  });
});
