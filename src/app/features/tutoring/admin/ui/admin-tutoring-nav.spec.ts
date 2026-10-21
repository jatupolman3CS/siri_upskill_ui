import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { settle, useEnglish } from '../testing/spec-helpers';
import { AdminTutoringNav } from './admin-tutoring-nav';

describe('AdminTutoringNav', () => {
  let fixture: ComponentFixture<AdminTutoringNav>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    useEnglish();
    fixture = TestBed.createComponent(AdminTutoringNav);
    await settle(fixture);
  });

  it('links the six areas in a labelled navigation', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Tutoring sections');
    expect(Array.from(root.querySelectorAll('a')).map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Identity checks', '/admin/tutoring/kyc'],
      ['Tutors', '/admin/tutoring/tutors'],
      ['Subjects', '/admin/tutoring/subjects'],
      ['Disputes', '/admin/tutoring/disputes'],
      ['Analytics', '/admin/tutoring/analytics'],
      ['Reviews', '/admin/tutoring/reviews'],
    ]);
  });
});
