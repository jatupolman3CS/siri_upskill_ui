import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CategoryTreeNode } from '../../../features/catalog/data/category-api.models';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryMegaMenu } from './category-mega-menu';

const TEST_CATEGORIES: readonly CategoryTreeNode[] = [
  {
    id: 'cat-1',
    slug: 'programming-technology',
    nameTh: 'การเขียนโปรแกรมและเทคโนโลยี',
    nameEn: 'Programming & Technology',
    iconKey: 'code',
    sortOrder: 0,
    isActive: true,
    children: [
      {
        id: 'cat-1-1',
        slug: 'web-development',
        nameTh: 'พัฒนาเว็บ',
        nameEn: 'Web Development',
        iconKey: null,
        sortOrder: 0,
        isActive: true,
        children: [],
      },
    ],
  },
  {
    id: 'cat-2',
    slug: 'finance-investment',
    nameTh: 'การเงินและการลงทุน',
    nameEn: 'Finance & Investment',
    iconKey: 'coins',
    sortOrder: 1,
    isActive: true,
    children: [],
  },
];

@Component({
  selector: 'app-category-mega-menu-test-host',
  imports: [CategoryMegaMenu],
  template: `
    <button type="button">outside trigger</button>
    <app-category-mega-menu [categories]="categories()" />
  `,
})
class TestHost {
  readonly categories = signal<readonly CategoryTreeNode[]>(TEST_CATEGORIES);
}

describe('CategoryMegaMenu', () => {
  let fixture: ComponentFixture<TestHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(TestHost);
    TestBed.inject(TranslationService).setLocale('en');
    fixture.detectChanges();
  });

  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[aria-expanded]') as HTMLButtonElement;
  }

  function panel(): HTMLElement | null {
    return fixture.nativeElement.querySelector('#app-category-mega-menu-panel');
  }

  function openPanel(): void {
    trigger().click();
    fixture.detectChanges();
  }

  it('starts closed with aria-expanded false and no panel rendered', () => {
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('opens on trigger click, setting aria-expanded true and rendering every root category', () => {
    openPanel();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const panelText = panel()?.textContent ?? '';
    expect(panelText).toContain('Programming & Technology');
    expect(panelText).toContain('Finance & Investment');
    expect(panelText).toContain('Web Development'); // the one child in this fixture
  });

  it('clicking the trigger again toggles it closed', () => {
    openPanel();
    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    openPanel();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes when a click lands outside the panel', () => {
    openPanel();
    const outsideClickCatcher = fixture.nativeElement.querySelector('.fixed.inset-0') as HTMLElement;
    outsideClickCatcher.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('does NOT close when a click lands inside the panel', () => {
    openPanel();
    panel()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
  });

  it('clicking a category link closes the panel', () => {
    openPanel();
    const link = Array.from(panel()?.querySelectorAll('a') ?? []).find(
      (a) => a.textContent?.trim() === 'Finance & Investment',
    ) as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });
});
