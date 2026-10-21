/**
 * Plumbing shared by the administrator tutoring specs: the HTTP providers that match `app.config.ts` (fetch + the real error
 * interceptor, so an `ApiError` carries the server's `reason` exactly as in production), a `settle()` that lets a zoneless fixture
 * finish an `rxResource` round, and small DOM finders. The specs assert English text (`TranslationService` is switched to `en`).
 */
import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SHARED_DICTIONARY } from '../../testing/tutoring-i18n';
import adminEn from '../i18n/admin-tutoring.en.json';
import adminTh from '../i18n/admin-tutoring.th.json';

registerLocaleData(localeTh);

export const HTTP_TEST_PROVIDERS: readonly (Provider | EnvironmentProviders)[] = [
  provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
  provideHttpClientTesting(),
];

/**
 * Registers the administrator texts and the tutoring texts every audience shares - exactly the two pairs the admin route resolver loads in
 * the app - and switches the app to English for the current TestBed. Call after `configureTestingModule`.
 */
export function useEnglish(): void {
  const translation = TestBed.inject(TranslationService);
  translation.extend({ th: adminTh, en: adminEn });
  translation.extend(SHARED_DICTIONARY);
  translation.setLocale('en');
}

/** Runs change detection, the pending effects and one microtask turn, twice - what an `rxResource` needs to reach the DOM. */
export async function settle(target: { detectChanges(): void } | ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    target.detectChanges();
    TestBed.tick();
    await Promise.resolve();
  }
  target.detectChanges();
}

/** `<app-button>` hosts a native button: finds the one whose text contains `label`. */
export function buttonByText(root: HTMLElement, label: string): HTMLButtonElement | null {
  const hosts = Array.from(root.querySelectorAll('app-button'));
  return hosts.find((host) => host.textContent?.includes(label))?.querySelector('button') ?? null;
}

/** Any native button (or link) whose text contains `label`. */
export function controlByText(root: HTMLElement, label: string): HTMLElement | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>('button, a'));
  return all.find((element) => element.textContent?.replace(/\s+/g, ' ').includes(label)) ?? null;
}

export function textOf(root: HTMLElement): string {
  return root.textContent?.replace(/\s+/g, ' ') ?? '';
}

/** Sets a text field's value the way a person typing would. */
export function typeInto(field: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (field === null) {
    throw new Error('field not found');
  }
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A ProblemDetails answer as the API sends it (`reason` + `errorCode` are what the client keys on). */
export function problemBody(status: number, reason: string, errorCode: string, extras: Readonly<Record<string, unknown>> = {}): object {
  return { type: 'about:blank', title: 'x', status, traceId: 't', errorCode, reason, ...extras };
}
