import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { type UrlFilters, injectUrlFilters, parseFlag, parseOneOf, parsePage } from './url-filters';

@Component({ template: '' })
class Host {
  readonly filters: UrlFilters = injectUrlFilters();
}

describe('url filter parsers', () => {
  it('reads a page number and falls back to 1 for anything else', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage(null)).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-2')).toBe(1);
    expect(parsePage('2.5')).toBe(1);
    expect(parsePage('abc')).toBe(1);
  });

  it('switches a flag on only for true or 1', () => {
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('1')).toBe(true);
    expect(parseFlag('yes')).toBe(false);
    expect(parseFlag(null)).toBe(false);
  });

  it('lets only a known value through, so a hand-edited URL never reaches the API as an unknown enum', () => {
    expect(parseOneOf('Open', ['Open', 'Resolved'] as const)).toBe('Open');
    expect(parseOneOf('Bogus', ['Open', 'Resolved'] as const)).toBeNull();
    expect(parseOneOf(null, ['Open'] as const)).toBeNull();
  });
});

describe('injectUrlFilters', () => {
  let harness: RouterTestingHarness;
  let host: Host;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'list', component: Host }])] });
    harness = await RouterTestingHarness.create();
    host = await harness.navigateByUrl('/list?status=Open&page=2', Host);
  });

  it('reads the query string', () => {
    expect(host.filters.get('status')).toBe('Open');
    expect(host.filters.page()).toBe(2);
  });

  it('changes a filter, drops the page and keeps the rest', async () => {
    host.filters.navigate({ category: 'NoClass' });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/list?status=Open&category=NoClass');
  });

  it('removes a key set to null, false or empty', async () => {
    host.filters.navigate({ status: null, flag: false, q: '' });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/list');
  });

  it('keeps the filters and moves the page when told to', async () => {
    host.filters.navigate({ page: 3 }, { keepPage: true });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/list?status=Open&page=3');
  });
});
