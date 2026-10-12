import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_COOKIE_NAME, ThemeService } from './theme.service';

interface FakeMediaQuery {
  matches: boolean;
  addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
  emit: (matches: boolean) => void;
  listenerCount: () => number;
}

function stubMatchMedia(initiallyDark: boolean): FakeMediaQuery {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query: FakeMediaQuery = {
    matches: initiallyDark,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    emit: (matches) => {
      query.matches = matches;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
  vi.stubGlobal('matchMedia', () => query);
  return query;
}

function clearThemeCookie(): void {
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
}

describe('ThemeService', () => {
  beforeEach(() => {
    clearThemeCookie();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    clearThemeCookie();
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  it('defaults to "system" and resolves against the OS preference (dark)', () => {
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves "system" to light when the OS prefers light', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('restores the preference from the cookie and ignores the OS preference for explicit choices', () => {
    stubMatchMedia(true);
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`;
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('light');
    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('ignores a cookie value that is not a known preference', () => {
    stubMatchMedia(false);
    document.cookie = `${THEME_COOKIE_NAME}=purple; Path=/`;
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
  });

  it('set() applies the theme, persists it in the cookie and survives a fresh service instance', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    service.set('dark');

    expect(service.preference()).toBe('dark');
    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=dark`);

    TestBed.resetTestingModule();
    stubMatchMedia(false);
    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
  });

  it('follows OS changes while "system" is selected and stops following once an explicit theme is chosen', () => {
    const media = stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    media.emit(true);
    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.set('light');
    media.emit(true);
    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes the OS-preference listener when destroyed', () => {
    const media = stubMatchMedia(false);
    TestBed.inject(ThemeService);
    expect(media.listenerCount()).toBe(1);

    TestBed.resetTestingModule();

    expect(media.listenerCount()).toBe(0);
  });

  it('does not touch the document on the server', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const service = TestBed.inject(ThemeService);

    service.set('dark');

    expect(service.preference()).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.cookie).not.toContain(THEME_COOKIE_NAME);
  });
});
