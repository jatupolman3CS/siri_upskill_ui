import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import type { DeliveryFormat } from '../../data/live.models';
import { CourseFormatBadge } from './course-format-badge';
import { CourseNextSession } from './course-next-session';

describe('CourseFormatBadge', () => {
  let fixture: ComponentFixture<CourseFormatBadge>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(CourseFormatBadge);
  });

  function render(format: DeliveryFormat | undefined): string {
    fixture.componentRef.setInput('format', format);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
  }

  it('says "Live" for a live course and "Hybrid" for a hybrid one — text, not just an icon', () => {
    expect(render('Live')).toBe('Live');
    expect(render('Hybrid')).toBe('Hybrid');
  });

  it('renders nothing for on-demand or when the API sent no format', () => {
    expect(render('OnDemand')).toBe('');
    expect(render(undefined)).toBe('');
  });
});

describe('CourseNextSession', () => {
  it('shows the next start in Bangkok time, and nothing when there is none', () => {
    TestBed.configureTestingModule({});
    TestBed.inject(TranslationService).setLocale('en');
    const fixture = TestBed.createComponent(CourseNextSession);

    fixture.componentRef.setInput('startsAtUtc', '2026-10-09T03:00:00Z');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Next session: 9 Oct 10:00');

    fixture.componentRef.setInput('startsAtUtc', null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
