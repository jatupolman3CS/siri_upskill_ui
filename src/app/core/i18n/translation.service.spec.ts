import { TestBed } from '@angular/core/testing';

import { TranslationService } from './translation.service';

describe('TranslationService.extend', () => {
  let service: TranslationService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    service = TestBed.inject(TranslationService);
  });

  const extension = { th: { lazy: { hello: 'สวัสดี {{name}}' }, common: { loading: 'ignored' } }, en: { lazy: { hello: 'Hello {{name}}' }, common: { loading: 'ignored' } } };

  it('returns the key itself until the extension arrives', () => {
    expect(service.t('lazy.hello')).toBe('lazy.hello');
  });

  it('resolves keys of an extension in the active language, with parameters', () => {
    service.extend(extension);
    service.setLocale('en');
    expect(service.t('lazy.hello', { name: 'Mint' })).toBe('Hello Mint');
    service.setLocale('th');
    expect(service.t('lazy.hello', { name: 'Mint' })).toBe('สวัสดี Mint');
  });

  it('lets the base dictionary win for a key both define', () => {
    service.setLocale('en');
    const before = service.t('common.loading');
    service.extend(extension);
    expect(service.t('common.loading')).toBe(before);
    expect(before).not.toBe('ignored');
  });

  it('is idempotent for the same object, so a route resolver can call it on every visit', () => {
    service.extend(extension);
    service.extend(extension);
    service.setLocale('en');
    expect(service.t('lazy.hello', { name: 'A' })).toBe('Hello A');
  });

  it('keeps an unknown key visible instead of blank', () => {
    service.extend(extension);
    expect(service.t('lazy.nothing')).toBe('lazy.nothing');
  });
});
