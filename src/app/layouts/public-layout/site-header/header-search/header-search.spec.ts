import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { HeaderSearch } from './header-search';

@Component({ selector: 'app-header-search-test-page', template: '' })
class TestPage {}

describe('HeaderSearch', () => {
  let fixture: ComponentFixture<HeaderSearch>;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HeaderSearch],
      providers: [
        provideRouter([
          { path: 'courses', component: TestPage },
          { path: 'courses/:slug', component: TestPage },
          { path: '**', component: TestPage },
        ]),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HeaderSearch);
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const input = (): HTMLInputElement => root().querySelector('input') as HTMLInputElement;

  async function search(text: string): Promise<void> {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    (root().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    TestBed.tick();
    fixture.detectChanges();
  }

  it('is a labelled search landmark with a visible Search button', () => {
    expect(root().querySelector('form[role="search"]')).not.toBeNull();
    expect(input().getAttribute('aria-label')).toBe('Search courses');
    expect(root().querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Search');
  });

  it('submits the typed text to the catalog as the q query param CoursesPage reads', async () => {
    await search('  python basics ');

    expect(router.url).toBe('/courses?q=python%20basics');
  });

  it('opens the unfiltered catalog when submitted empty', async () => {
    await search('   ');

    expect(router.url).toBe('/courses');
  });

  it('mirrors the catalog q while on /courses and clears it elsewhere', async () => {
    await router.navigateByUrl('/courses?q=excel');
    TestBed.tick();
    fixture.detectChanges();
    expect(input().value).toBe('excel');

    await router.navigateByUrl('/blog');
    TestBed.tick();
    fixture.detectChanges();
    expect(input().value).toBe('');

    await router.navigateByUrl('/courses/some-course?q=excel');
    TestBed.tick();
    fixture.detectChanges();
    expect(input().value).toBe('');
  });
});
