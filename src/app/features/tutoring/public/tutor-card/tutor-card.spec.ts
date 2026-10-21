import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { TutorSearchItem } from '../../data/tutoring-public.models';
import { TutorCard } from './tutor-card';

const TUTOR: TutorSearchItem = {
  slug: 'nina-tutor',
  displayName: 'Nina Tutor',
  headline: 'Physics for upper secondary',
  photoUrl: '/api/tutoring/tutors/nina-tutor/photo?v=abc123',
  gender: 'Female',
  yearsExperience: 6,
  ratingAverage: 4.666,
  ratingCount: 21,
  completedSessionsCount: 140,
  subjects: [
    { slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics' },
    { slug: 'math', nameTh: 'คณิตศาสตร์', nameEn: 'Mathematics' },
  ],
  levels: ['UpperSecondary'],
  curricula: ['Thai'],
  fromHourlyRate: 450,
  hasGroup: true,
  hasTrial: true,
  hasFreeTrial: true,
  nextAvailableAtUtc: '2026-10-14T02:00:00Z',
};

describe('TutorCard', () => {
  let fixture: ComponentFixture<TutorCard>;

  function render(tutor: TutorSearchItem = TUTOR): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(TutorCard);
    fixture.componentRef.setInput('tutor', tutor);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('links the whole card to the profile through a single anchor on the name', () => {
    const el = render();
    const links = el.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/tutors/nina-tutor');
    expect(links[0].textContent?.trim()).toBe('Nina Tutor');
  });

  it('shows the headline, the server rating rounded to one decimal, experience and lessons taught', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('Physics for upper secondary');
    expect(text).toContain('4.7 (21 reviews)');
    expect(text).toContain('6 years of experience');
    expect(text).toContain('140 lessons taught');
  });

  it('hides the rating line when nobody has rated the tutor yet - no placeholder stars', () => {
    const el = render({ ...TUTOR, ratingCount: 0, ratingAverage: 0 });
    expect(el.textContent).not.toContain('reviews');
    expect(el.querySelector('ng-icon[name="phosphorStar"]')).toBeNull();
  });

  it('shows the starting hourly price exactly as the server sent it', () => {
    const el = render();
    expect(el.textContent).toContain('From');
    expect(el.textContent).toContain('฿450.00');
    expect(el.textContent).toContain('/ hour');
  });

  it('shows the free-trial and group badges only when the tutor offers them', () => {
    const withBoth = render().textContent ?? '';
    expect(withBoth).toContain('Free trial');
    expect(withBoth).toContain('Group classes');

    TestBed.resetTestingModule();
    const withNone = render({ ...TUTOR, hasFreeTrial: false, hasGroup: false }).textContent ?? '';
    expect(withNone).not.toContain('Free trial');
    expect(withNone).not.toContain('Group classes');
  });

  it('lists subjects in the active language and collapses the overflow into "+N"', () => {
    const many = [
      ...TUTOR.subjects,
      { slug: 'chem', nameTh: 'เคมี', nameEn: 'Chemistry' },
      { slug: 'bio', nameTh: 'ชีววิทยา', nameEn: 'Biology' },
      { slug: 'eng', nameTh: 'ภาษาอังกฤษ', nameEn: 'English' },
    ];
    const el = render({ ...TUTOR, subjects: many });
    const chips = Array.from(el.querySelectorAll('ul[aria-label] li')).map((li) => li.textContent?.trim());
    expect(chips).toEqual(['Physics', 'Mathematics', 'Chemistry', '+2']);
  });

  it('renders the next available time in Bangkok time and omits the line when there is none', () => {
    expect(render().textContent).toContain('Next available 14 Oct 09:00');

    TestBed.resetTestingModule();
    expect(render({ ...TUTOR, nextAvailableAtUtc: null }).textContent).not.toContain('Next available');
  });

  it('loads the photo through the API-relative path, with an empty alt because the name sits beside it', () => {
    const img = render().querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/\/api\/tutoring\/tutors\/nina-tutor\/photo\?v=abc123$/);
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('falls back to the first letter of the name when there is no photo', () => {
    const el = render({ ...TUTOR, photoUrl: null });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('N');
  });
});
