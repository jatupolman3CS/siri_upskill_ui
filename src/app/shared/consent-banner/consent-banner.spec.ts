import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConsentBanner } from './consent-banner';

describe('ConsentBanner', () => {
  let component: ConsentBanner;
  let fixture: ComponentFixture<ConsentBanner>;
  const storageMap: Record<string, string> = {};

  beforeEach(async () => {
    Object.keys(storageMap).forEach((k) => delete storageMap[k]);

    const fakeLocalStorage = {
      getItem: (key: string) => storageMap[key] ?? null,
      setItem: (key: string, value: string) => {
        storageMap[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMap[key];
      },
      clear: () => {
        Object.keys(storageMap).forEach((k) => delete storageMap[k]);
      },
      length: 0,
      key: () => null,
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeLocalStorage,
      writable: true,
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [ConsentBanner],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsentBanner);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should display banner when no consent is in localStorage', () => {
    expect(component.isVisible()).toBe(true);
  });

  it('should save accept all consent and hide banner', () => {
    component.acceptAll();
    expect(component.isVisible()).toBe(false);
    const saved = localStorage.getItem('siri_pdpa_consent');
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.essential).toBe(true);
    expect(parsed.analytics).toBe(true);
    expect(parsed.marketing).toBe(true);
  });

  it('should save reject non-essential consent and hide banner', () => {
    component.rejectNonEssential();
    expect(component.isVisible()).toBe(false);
    const saved = localStorage.getItem('siri_pdpa_consent');
    const parsed = JSON.parse(saved!);
    expect(parsed.essential).toBe(true);
    expect(parsed.analytics).toBe(false);
    expect(parsed.marketing).toBe(false);
  });
});
