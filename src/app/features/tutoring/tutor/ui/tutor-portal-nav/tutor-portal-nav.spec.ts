import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TUTORING_EN as en, TUTORING_TH as th } from '../../../testing/tutoring-i18n';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { INSTRUCTOR_NAV_LINKS } from '../../../../../layouts/instructor-layout/instructor-nav';
import { TutorPortalNav } from './tutor-portal-nav';

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

describe('Tutor Portal navigation', () => {
  it('adds one studio sidebar entry that leads to the onboarding hub and is labelled in both languages', () => {
    const entry = INSTRUCTOR_NAV_LINKS.find((link) => link.id === 'tutoring');
    expect(entry).toBeDefined();
    expect(entry?.route).toBe('/instructor/tutoring');
    // Not exact: the entry must stay highlighted on every page inside the portal.
    expect(entry?.exact).toBeFalsy();
    expect(typeof lookup(th, entry!.labelKey)).toBe('string');
    expect(typeof lookup(en, entry!.labelKey)).toBe('string');
  });

  it('lists the ten portal sections and marks the current one with aria-current', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'instructor/tutoring/profile', component: TutorPortalNav }])],
    });
    useTutoringLanguage('en');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/profile', TutorPortalNav);
    harness.detectChanges();

    const root = harness.routeNativeElement as HTMLElement;
    const links = [...root.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/instructor/tutoring',
      '/instructor/tutoring/profile',
      '/instructor/tutoring/offerings',
      '/instructor/tutoring/credentials',
      '/instructor/tutoring/kyc',
      '/instructor/tutoring/availability',
      '/instructor/tutoring/classes',
      '/instructor/tutoring/packages',
      '/instructor/tutoring/wallet',
      '/instructor/tutoring/disputes',
    ]);
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent?.trim())).toEqual(['Profile']);
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Tutoring');
  });
});
