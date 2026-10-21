import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { packageCredits } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { PackageCreditList } from './package-credit-list';

registerLocaleData(localeTh);

describe('PackageCreditList', () => {
  let fixture: ComponentFixture<PackageCreditList>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PackageCreditList], providers: [provideRouter([])] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(PackageCreditList);
    fixture.componentRef.setInput('credits', packageCredits());
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const rows = (): HTMLElement[] => Array.from(root().querySelectorAll('li'));

  it('lists every credit in order with its status as words, not colour', () => {
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain('Lesson 1');
    expect(rows()[0].textContent).toContain('Used');
    expect(rows()[1].textContent).toContain('Lesson 2');
    expect(rows()[1].textContent).toContain('Booked');
    expect(rows()[2].textContent).toContain('Lesson 3');
    expect(rows()[2].textContent).toContain('Available');
  });

  it('shows when the lesson that holds or used a credit is, in Bangkok time, with a link to it', () => {
    // 2026-10-16T11:00Z is 18:00 on Friday 16 Oct in Bangkok.
    expect(rows()[0].textContent).toContain('Fri 16 Oct, 18:00');
    expect(rows()[0].querySelector('a')?.getAttribute('href')).toBe('/my-tutoring/bookings/b-1');
    expect(rows()[1].querySelector('a')?.getAttribute('href')).toBe('/my-tutoring/bookings/b-2');
  });

  it('shows no time and no link for a credit that is still available', () => {
    expect(rows()[2].querySelector('a')).toBeNull();
    expect(rows()[2].textContent).not.toContain('Oct');
  });

  it('gives each link a name that says which lesson it is for', () => {
    expect(rows()[0].querySelector('a .sr-only')?.textContent).toContain('Lesson 1');
  });

  it('renders an empty list as nothing', () => {
    fixture.componentRef.setInput('credits', []);
    fixture.detectChanges();

    expect(rows()).toHaveLength(0);
  });
});
