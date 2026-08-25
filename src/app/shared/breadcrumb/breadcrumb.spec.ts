import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Breadcrumb, BreadcrumbItem } from './breadcrumb';

@Component({
  selector: 'app-breadcrumb-test-host',
  imports: [Breadcrumb],
  template: `<app-breadcrumb [items]="items()" />`,
})
class TestHost {
  readonly items = signal<readonly BreadcrumbItem[]>([]);
}

describe('Breadcrumb', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
  });

  it('renders every item as a link except the last, which is a non-link current-page marker', () => {
    host.items.set([{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses' }, { label: 'Python for Beginners' }]);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].textContent.trim()).toBe('Home');
    expect(links[1].textContent.trim()).toBe('Courses');

    const current = fixture.nativeElement.querySelector('[aria-current="page"]');
    expect(current?.textContent.trim()).toBe('Python for Beginners');
    expect(current?.tagName).toBe('SPAN');
  });

  it('renders the last item as plain text even when it has an href', () => {
    host.items.set([{ label: 'Only item', href: '/somewhere' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-current="page"]')?.textContent.trim()).toBe('Only item');
  });

  it('applies queryParams to a linked item via RouterLink, not appended to href itself', () => {
    host.items.set([
      { label: 'Category', href: '/courses', queryParams: { category: 'programming-technology' } },
      { label: 'Current course' },
    ]);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/courses?category=programming-technology');
  });
});
