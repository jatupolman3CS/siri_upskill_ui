import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CategoryTreeNode } from '../../../../features/catalog/data/category-api.models';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CategoryAccordionItem } from './category-accordion-item';

const LEAF: CategoryTreeNode = {
  id: 'leaf',
  slug: 'web-development',
  nameTh: 'พัฒนาเว็บ',
  nameEn: 'Web Development',
  iconKey: null,
  sortOrder: 0,
  isActive: true,
  children: [],
};

const TWO_LEVEL_DEEP: CategoryTreeNode = {
  id: 'root',
  slug: 'programming-technology',
  nameTh: 'การเขียนโปรแกรมและเทคโนโลยี',
  nameEn: 'Programming & Technology',
  iconKey: 'code',
  sortOrder: 0,
  isActive: true,
  children: [
    {
      id: 'mid',
      slug: 'web',
      nameTh: 'เว็บ',
      nameEn: 'Web',
      iconKey: null,
      sortOrder: 0,
      isActive: true,
      children: [LEAF],
    },
  ],
};

@Component({
  selector: 'app-category-accordion-item-test-host',
  imports: [CategoryAccordionItem],
  template: `<app-category-accordion-item [category]="category()" (linkClick)="linkClickCount = linkClickCount + 1" />`,
})
class TestHost {
  readonly category = signal<CategoryTreeNode>(TWO_LEVEL_DEEP);
  linkClickCount = 0;
}

describe('CategoryAccordionItem', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRouter([{ path: '**', component: TestHost }])],
    });
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    TestBed.inject(TranslationService).setLocale('en');
    fixture.detectChanges();
  });

  function allLinkTexts(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('a')).map((a) => (a as HTMLAnchorElement).textContent?.trim() ?? '');
  }

  it('renders the category link but not its descendants while collapsed', () => {
    expect(allLinkTexts()).toEqual(['Programming & Technology']);
  });

  it('expanding reveals the next level only, not the whole subtree at once', () => {
    const toggle = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    expect(allLinkTexts()).toEqual(['Programming & Technology', 'Web']);
  });

  it('expanding recursively reveals a grandchild after expanding both levels', () => {
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons()[0].click();
    fixture.detectChanges();
    buttons()[1].click();
    fixture.detectChanges();

    expect(allLinkTexts()).toEqual(['Programming & Technology', 'Web', 'Web Development']);
  });

  it('a leaf category (no children) renders no toggle button at all', () => {
    host.category.set(LEAF);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('clicking any link, at any depth, bubbles one linkClick through every ancestor', () => {
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons()[0].click();
    fixture.detectChanges();
    buttons()[1].click();
    fixture.detectChanges();

    const deepestLink = Array.from(fixture.nativeElement.querySelectorAll('a')).at(-1) as HTMLAnchorElement;
    deepestLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(host.linkClickCount).toBe(1);
  });
});
