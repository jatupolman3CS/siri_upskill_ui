import { DOCUMENT, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { TutorPublicProfile } from '../../data/tutoring-public.models';
import { packageOffer } from '../../testing/package-fixtures';
import { TutorProfilePage } from './tutor-profile-page';

registerLocaleData(localeTh);

/** Fires the viewport trigger of `@defer (on viewport)` immediately - jsdom has no IntersectionObserver. */
class ImmediateIntersectionObserver {
  constructor(private readonly callback: (entries: { isIntersecting: boolean; target: Element }[]) => void) {}
  observe(target: Element): void {
    // Asynchronous on purpose: Angular registers the element only after calling observe().
    queueMicrotask(() => this.callback([{ isIntersecting: true, target }]));
  }
  unobserve(): void {
    /* nothing to release */
  }
  disconnect(): void {
    /* nothing to release */
  }
}

const PROFILE: TutorPublicProfile = {
  slug: 'nina-tutor',
  displayName: 'Nina Tutor',
  headline: 'Physics for upper secondary',
  bio: 'I have taught physics for six years.\nMy lessons are practice-first.',
  photoUrl: '/api/tutoring/tutors/nina-tutor/photo?v=abc123',
  introVideo: { durationSeconds: 95, playbackPath: '/tutoring/tutors/nina-tutor/intro-video' },
  gender: 'Female',
  yearsExperience: 6,
  ratingAverage: 4.666,
  ratingCount: 21,
  completedSessionsCount: 140,
  verified: true,
  verifiedAtUtc: '2026-03-01T00:00:00Z',
  minNoticeHours: 24,
  maxAdvanceDays: 30,
  nextAvailableAtUtc: '2026-10-14T02:00:00Z',
  timezone: 'Asia/Bangkok',
  allowedDurationMinutes: [30, 60, 90, 120],
  offerings: [
    {
      offeringId: 'off-physics',
      subject: { slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics' },
      level: 'UpperSecondary',
      curriculum: 'Thai',
      hourlyRateOneOnOne: 450,
      groupHourlyRatePerSeat: 250,
      groupMaxSeats: 4,
      trial: { minutes: 30, price: 0, isFree: true },
    },
    {
      offeringId: 'off-math',
      subject: { slug: 'math', nameTh: 'คณิตศาสตร์', nameEn: 'Mathematics' },
      level: 'Primary',
      curriculum: 'EP',
      hourlyRateOneOnOne: 300,
      groupHourlyRatePerSeat: null,
      groupMaxSeats: null,
      trial: { minutes: 15, price: 99, isFree: false },
    },
  ],
  educations: [{ institution: 'Chulalongkorn University', degree: 'B.Sc.', field: 'Physics', yearFrom: 2012, yearTo: 2016 }],
  certificates: [{ title: 'Teaching licence', issuer: 'Teachers Council', year: 2018 }],
};

const PROFILE_URL = '/api/tutoring/tutors/nina-tutor';

describe('TutorProfilePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let doc: Document;
  let responseInit: ResponseInit;

  beforeEach(async () => {
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'tutors/:slug', component: TutorProfilePage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        // What the SSR host provides; the page may only ever adjust its status.
        { provide: RESPONSE_INIT, useFactory: () => (responseInit = { status: 200 }) },
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    doc = TestBed.inject(DOCUMENT);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  /** A `@defer` block resolves its (lazy) dependencies on a promise chain - give it a macrotask to finish. */
  async function settleDefer(): Promise<void> {
    await vi.waitFor(async () => {
      await settle();
      expect(root().querySelector('app-tutor-intro-video')).not.toBeNull();
    });
  }

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const jsonLd = (): Record<string, unknown>[] =>
    Array.from(doc.head.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.textContent ?? '{}') as Record<string, unknown>);

  async function open(slug: string, profile: TutorPublicProfile | null, failure?: { status: number }): Promise<void> {
    await harness.navigateByUrl(`/tutors/${slug}`, TutorProfilePage);
    await settle();
    const req = httpMock.expectOne(`/api/tutoring/tutors/${slug}`);
    if (profile) {
      req.flush(profile);
    } else {
      req.flush({ title: 'x', errorCode: 'not_found', reason: 'tutoring.tutor_not_found' }, { status: failure?.status ?? 404, statusText: 'x' });
    }
    await settle();
    await settle();
  }

  /** The booking card fetches its calendar, and the packages block the tutor's packages, in the browser right after the first render. */
  async function flushSlots(packages: readonly unknown[] = []): Promise<void> {
    httpMock
      .expectOne((req) => req.url.endsWith('/slots'))
      .flush({
        tutorSlug: 'nina-tutor',
        offeringId: 'off-physics',
        format: 'OneOnOne',
        durationMinutes: 60,
        isTrial: false,
        quote: { amount: 450, currency: 'THB', durationMinutes: 60, hourlyRate: 450, isFree: false },
        timezone: 'Asia/Bangkok',
        serverTimeUtc: '2026-10-14T03:00:00Z',
        fromUtc: '2026-10-13T17:00:00Z',
        toUtc: '2026-10-20T17:00:00Z',
        minNoticeHours: 24,
        maxAdvanceDays: 30,
        slots: [],
      });
    httpMock.expectOne((req) => req.url === '/api/tutoring/tutors/nina-tutor/packages').flush(packages);
    const reviewsReq = httpMock.match((req) => req.url.startsWith('/api/tutoring/tutors/nina-tutor/reviews'));
    if (reviewsReq.length > 0) {
      reviewsReq[0].flush({
        summary: { ratingAverage: 0, ratingCount: 0, distribution: { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 } },
        reviews: { items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 },
      });
    }
    await settle();
  }

  async function openProfile(profile: TutorPublicProfile = PROFILE): Promise<void> {
    await open('nina-tutor', profile);
    await flushSlots();
  }

  it('shows a busy skeleton while the profile loads', async () => {
    await harness.navigateByUrl('/tutors/nina-tutor', TutorProfilePage);
    await settle();
    expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
    httpMock.expectOne(PROFILE_URL).flush(PROFILE);
    await settle();
    await settle();
    await flushSlots();
  });

  describe('header', () => {
    it('shows the name, headline, verified badge and the server figures', async () => {
      await openProfile();
      const text = root().textContent ?? '';
      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Nina Tutor');
      expect(text).toContain('Physics for upper secondary');
      expect(text).toContain('Identity verified');
      expect(text).toContain('4.7 (21 reviews)');
      expect(text).toContain('6 years of experience');
      expect(text).toContain('140 lessons taught');
      expect(text).toContain('Next available 14 Oct 09:00');
    });

    it('loads the photo through the API path and describes it with the tutor name', async () => {
      await openProfile();
      const img = root().querySelector('header img');
      expect(img?.getAttribute('src')).toMatch(/\/api\/tutoring\/tutors\/nina-tutor\/photo\?v=abc123$/);
      expect(img?.getAttribute('alt')).toBe('Nina Tutor');
    });

    it('omits rating, verified badge and next-available when the server has none - nothing is invented', async () => {
      await openProfile({ ...PROFILE, ratingCount: 0, ratingAverage: 0, verified: false, nextAvailableAtUtc: null, photoUrl: null, yearsExperience: 0, completedSessionsCount: 0 });
      const header = root().querySelector('header')?.textContent ?? '';
      expect(header).not.toContain('reviews');
      expect(header).not.toContain('Identity verified');
      expect(header).not.toContain('Next available');
      expect(root().querySelector('header img')).toBeNull();
    });

    it('moves focus to the booking card from the small-screen shortcut', async () => {
      await openProfile();
      const scroll = vi.fn();
      const booking = root().querySelector<HTMLElement>('#tutor-booking')!;
      booking.scrollIntoView = scroll;
      const jump = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('See times and book'))!;

      jump.click();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(doc.activeElement).toBe(booking);
    });
  });

  describe('content', () => {
    it('keeps the bio line breaks and lists every offering with its prices exactly as sent', async () => {
      await openProfile();
      const text = root().textContent ?? '';
      expect(root().querySelector('p.whitespace-pre-line')?.textContent).toContain('\n');
      expect(text).toContain('Physics');
      expect(text).toContain('Upper secondary');
      expect(text).toContain('฿450.00');
      expect(text).toContain('฿250.00');
      expect(text).toContain('up to 4 seats');
      expect(text).toContain('30 minutes');
      expect(text).toContain('Free');
      expect(text).toContain('฿99.00');
    });

    it('lists education and certificates when present and leaves those sections out when empty', async () => {
      await openProfile();
      expect(root().textContent).toContain('B.Sc., Physics');
      expect(root().textContent).toContain('Chulalongkorn University');
      expect(root().textContent).toContain('2012 - 2016');
      expect(root().textContent).toContain('Teaching licence');
      expect(root().textContent?.replace(/\s+/g, ' ')).toContain('Teachers Council, 2018');
    });

    it('leaves education and certificates out when the tutor has none', async () => {
      await openProfile({ ...PROFILE, educations: [], certificates: [] });
      expect(root().textContent).not.toContain('Education');
      expect(root().textContent).not.toContain('Certificates and achievements');
    });

    it('says there are no reviews yet instead of showing an empty rating', async () => {
      await openProfile({ ...PROFILE, ratingCount: 0, ratingAverage: 0 });
      expect(root().textContent).toContain('No reviews yet');
    });

    it('renders the booking card with the first offering selected', async () => {
      await openProfile();
      expect(root().querySelector('app-tutor-booking-panel')).not.toBeNull();
      expect(root().textContent).toContain('Book a lesson');
    });
  });

  describe('intro video', () => {
    it('reserves a 16:9 box and mounts the player when the block scrolls into view', async () => {
      await openProfile();
      await settleDefer();
      expect(root().textContent).toContain('Intro video');
      expect(root().querySelector('app-tutor-intro-video .aspect-video')).not.toBeNull();
    });

    it('leaves the whole block out when the tutor has no intro video', async () => {
      await openProfile({ ...PROFILE, introVideo: null });
      expect(root().querySelector('app-tutor-intro-video')).toBeNull();
      expect(root().textContent).not.toContain('Intro video');
    });

    it('removes the block quietly when the video endpoint says there is nothing public to play', async () => {
      await openProfile();
      await settleDefer();
      root().querySelector<HTMLButtonElement>('app-tutor-intro-video button')!.click();
      await settle();
      httpMock.expectOne(`${PROFILE_URL}/intro-video`).flush({ title: 'x', reason: 'tutoring.intro_video_not_found' }, { status: 404, statusText: 'Not Found' });
      await settle();
      await settle();

      expect(root().querySelector('app-tutor-intro-video')).toBeNull();
      expect(root().textContent).not.toContain('Intro video');
      expect(root().querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('SEO', () => {
    it('titles the page "name - subject tutor", with a canonical that has no query and an og:image', async () => {
      await openProfile();
      expect(TestBed.inject(Title).getTitle()).toBe('Nina Tutor - Physics tutor | SIRI UpSkill');
      expect(doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${doc.location.origin}/tutors/nina-tutor`);
      expect(doc.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toMatch(/\/api\/tutoring\/tutors\/nina-tutor\/photo\?v=abc123$/);
      expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
    });

    it('emits a Person with the bio, subjects and a rating, plus a breadcrumb trail', async () => {
      await openProfile();
      const [person, breadcrumb] = jsonLd();

      expect(person['@type']).toBe('Person');
      expect(person['name']).toBe('Nina Tutor');
      expect(person['jobTitle']).toBe('Physics for upper secondary');
      expect(person['knowsAbout']).toEqual(['Physics', 'Mathematics']);
      expect(person['url']).toBe(`${doc.location.origin}/tutors/nina-tutor`);
      expect(String(person['image'])).toMatch(/^https?:\/\/.*\/photo\?v=abc123$/);
      expect(person['aggregateRating']).toEqual({ '@type': 'AggregateRating', ratingValue: 4.666, ratingCount: 21 });
      expect(breadcrumb['@type']).toBe('BreadcrumbList');
      expect((breadcrumb['itemListElement'] as { name: string }[]).map((i) => i.name)).toEqual(['Home', 'Tutors', 'Nina Tutor']);
    });

    it('omits aggregateRating when there are no reviews and never emits Review objects', async () => {
      await openProfile({ ...PROFILE, ratingCount: 0, ratingAverage: 0 });
      const [person] = jsonLd();
      expect(person['aggregateRating']).toBeUndefined();
      expect(person['review']).toBeUndefined();
    });

    it('puts nothing private in the structured data (no contact, identity, id or storage details)', async () => {
      await openProfile();
      const blob = JSON.stringify(jsonLd()).toLowerCase();
      for (const forbidden of ['email', 'telephone', 'phone', 'userid', 'tutorid', 'kyc', 'storage', 'address']) {
        expect(blob).not.toContain(forbidden);
      }
    });

    it('uses the Thai subject name in the title when the language is Thai', async () => {
      useTutoringLanguage('th');
      await openProfile();
      expect(TestBed.inject(Title).getTitle()).toBe('Nina Tutor - ติวเตอร์ฟิสิกส์ | SIRI UpSkill');
    });
  });

  describe('failures', () => {
    it('renders a plain not-found for an unknown or non-public tutor, noindexed, with a way back', async () => {
      await open('ghost', null);

      expect(root().textContent).toContain('Tutor not found');
      expect(root().querySelector('a[href="/tutors"]')).not.toBeNull();
      expect(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
      expect(doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${doc.location.origin}/tutors/ghost`);
      expect(jsonLd()).toEqual([]);
      expect(root().querySelector('app-tutor-booking-panel')).toBeNull();
    });

    it('answers a server-rendered unknown tutor with HTTP 404 instead of a soft-404 200', async () => {
      await open('ghost', null);
      expect(responseInit.status).toBe(404);
    });

    it('leaves the response status alone for a tutor that exists', async () => {
      await openProfile();
      expect(responseInit.status).toBe(200);
    });

    it('does not turn a temporary server error into a 404', async () => {
      await open('nina-tutor', null, { status: 500 });
      expect(responseInit.status).toBe(200);
    });

    it('shows an error with a retry for any other failure, and recovers on retry', async () => {
      await open('nina-tutor', null, { status: 500 });
      expect(root().textContent).toContain('Could not load this tutor profile');
      expect(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');

      Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Try again')!.click();
      await settle();
      httpMock.expectOne(PROFILE_URL).flush(PROFILE);
      await settle();
      await settle();
      await flushSlots();
      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Nina Tutor');
    });
  });

  describe('lesson packages', () => {
    const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';

    async function openWithPackages(offers: readonly unknown[]): Promise<void> {
      await open('nina-tutor', PROFILE);
      await flushSlots(offers);
    }

    it('lists the packages on sale with the figures the server sent and a way to buy each one', async () => {
      await openWithPackages([packageOffer(), packageOffer({ packageId: 'pkg-2', sessionCount: 4, discountPercent: 0, totalPrice: 1800, pricePerSession: 450, savingsAmount: 0 })]);

      const section = root().querySelector('app-tutor-packages-section')!;
      expect(section.querySelector('h2')?.textContent).toContain('Lesson packages');
      expect(section.querySelectorAll('li.flex-col').length).toBe(2);
      expect(text()).toContain('10 lessons of 60 minutes');
      expect(text()).toContain('฿4,050.00');
      expect(text()).toContain('about ฿405.00 per lesson');
      expect(text()).toContain('You save ฿450.00');
      expect(text()).toContain('Save 10%');
      expect(text()).toContain('Use all lessons within 90 days of paying');
      expect(text()).toContain('One-on-one lessons only');
      expect(text()).toContain('Lessons not used by the expiry date are not refunded.');
      const buy = Array.from(section.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href'));
      expect(buy).toEqual(['/tutors/nina-tutor/packages/pkg-1', '/tutors/nina-tutor/packages/pkg-2']);
    });

    it('shows no saving line or discount badge for a package without a discount', async () => {
      await openWithPackages([packageOffer({ discountPercent: 0, savingsAmount: 0, totalPrice: 4500, pricePerSession: 450 })]);

      expect(text()).not.toContain('You save');
      expect(text()).not.toMatch(/Save \d+%/);
    });

    it('leaves the whole block out when the tutor has no packages', async () => {
      await openWithPackages([]);

      expect(root().querySelector('#tutor-packages-heading')).toBeNull();
      expect(text()).not.toContain('Lesson packages');
    });

    it('leaves the block out - and the rest of the profile working - when the packages cannot be read', async () => {
      await open('nina-tutor', PROFILE);
      httpMock
        .expectOne((req) => req.url.endsWith('/slots'))
        .flush({ title: 'x' }, { status: 500, statusText: 'x' });
      httpMock.expectOne((req) => req.url === '/api/tutoring/tutors/nina-tutor/packages').flush({ title: 'x' }, { status: 500, statusText: 'x' });
      httpMock.expectOne((req) => req.url.startsWith('/api/tutoring/tutors/nina-tutor/reviews')).flush({
        summary: { ratingAverage: 4.8, ratingCount: 15, distribution: { star1: 0, star2: 0, star3: 1, star4: 2, star5: 12 } },
        reviews: { items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 },
      });
      await settle();
      await settle();

      expect(root().querySelector('#tutor-packages-heading')).toBeNull();
      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Nina Tutor');
    });
  });
});
