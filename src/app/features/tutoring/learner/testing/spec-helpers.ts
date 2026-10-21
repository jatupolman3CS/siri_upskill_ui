/**
 * Shared plumbing of the learner-side specs: the HTTP providers that match `app.config.ts` (fetch + the real error interceptor)
 * and a `settle()` that lets a zoneless fixture finish an `rxResource` round (effect -> request -> flush -> render).
 */
import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';

registerLocaleData(localeTh);

export const HTTP_TEST_PROVIDERS: readonly (Provider | EnvironmentProviders)[] = [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()];

/** Runs change detection, the pending effects and one microtask turn, twice - what an `rxResource` needs to reach the DOM. */
export async function settle(target: { detectChanges(): void } | ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 2; round++) {
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

/** Like {@link buttonByText} but the visible label must equal `label` exactly (so "Withdraw" does not match "Withdraw report"). */
export function exactButton(root: HTMLElement, label: string): HTMLButtonElement | null {
  const hosts = Array.from(root.querySelectorAll('app-button'));
  return hosts.find((host) => host.textContent?.replace(/\s+/g, ' ').trim() === label)?.querySelector('button') ?? null;
}

export function textOf(root: HTMLElement): string {
  return root.textContent?.replace(/\s+/g, ' ') ?? '';
}
