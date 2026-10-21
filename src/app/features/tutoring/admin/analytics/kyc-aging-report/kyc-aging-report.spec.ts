import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { kycAgingReport } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { KycAgingReport as KycAgingReportComponent } from './kyc-aging-report';

const URL = '/api/tutoring/admin/analytics/kyc-aging';

describe('KycAgingReport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS, provideRouter([])] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(): Promise<ComponentFixture<KycAgingReportComponent>> {
    const fixture = TestBed.createComponent(KycAgingReportComponent);
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<KycAgingReportComponent>, body: object = kycAgingReport()): Promise<HTMLElement> {
    httpMock.expectOne(URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for the queue once, with no parameters - it has no period', async () => {
    const fixture = await mount();

    const req = httpMock.expectOne(URL);
    expect(req.request.params.keys()).toEqual([]);
    req.flush(kycAgingReport());
    await settle(fixture);
  });

  it('shows how many checks wait for an administrator and for the tutor', async () => {
    const root = await answer(await mount());

    const tiles = Array.from(root.querySelectorAll('app-kpi-tile')).map((tile) => textOf(tile as HTMLElement));
    expect(tiles[0]).toContain('Waiting for an administrator');
    expect(tiles[0]).toContain('5');
    expect(tiles[1]).toContain('Waiting for the tutor');
    expect(tiles[1]).toContain('4');
  });

  it('shows the longest wait in hours with when it was submitted, and the typical decision time', async () => {
    const root = await answer(await mount());

    const tiles = Array.from(root.querySelectorAll('app-kpi-tile')).map((tile) => textOf(tile as HTMLElement));
    expect(tiles[2]).toContain('96 h');
    expect(tiles[2]).toContain('Submitted 10 Oct 2026 10:00');
    expect(tiles[3]).toContain('20.5 h');
    expect(tiles[3]).toContain('9 in 10 decided within 60 h');
  });

  it('writes the count of every waiting band beside its bar, worst last', async () => {
    const root = await answer(await mount());

    const bands = Array.from(root.querySelectorAll('section[aria-labelledby="kyc-bands-heading"] li')).map((li) => textOf(li as HTMLElement));
    expect(bands).toEqual(['Under 24 hours2', '24 to 48 hours1', '48 to 72 hours1', 'Over 72 hours1']);
    const widths = Array.from(root.querySelectorAll<HTMLElement>('section[aria-labelledby="kyc-bands-heading"] [aria-hidden="true"] > div')).map((bar) => bar.style.width);
    expect(widths).toEqual(['40%', '20%', '20%', '20%']);
  });

  it('colours the oldest band red', async () => {
    const root = await answer(await mount());

    const items = root.querySelectorAll('section[aria-labelledby="kyc-bands-heading"] li');
    expect(items[3].querySelector('.tone-red')).not.toBeNull();
    expect(items[0].querySelector('.tone-red')).toBeNull();
  });

  it('shows the counts by status and the decisions of the last 30 days', async () => {
    const root = await answer(await mount());

    const status = textOf(root.querySelector('section[aria-labelledby="kyc-status-heading"]') as HTMLElement);
    expect(status).toContain('Submitted3');
    expect(status).toContain('Being reviewed2');
    expect(status).toContain('Needs more information4');
    const decided = textOf(root.querySelector('section[aria-labelledby="kyc-decided-heading"]') as HTMLElement);
    expect(decided).toContain('Approved14');
    expect(decided).toContain('Rejected2');
  });

  it('links to the identity-check queue, where the work is done', async () => {
    const root = await answer(await mount());

    const link = root.querySelector('a[href="/admin/tutoring/kyc"]');
    expect(link?.textContent?.trim()).toBe('Open the identity-check queue');
  });

  it('shows no applicant, document or name - only counts', async () => {
    const root = await answer(await mount());

    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelectorAll('a')).toHaveLength(1);
  });

  it('shows a dash instead of an hour count when there is nothing to report, and says no decisions were made', async () => {
    const root = await answer(
      await mount(),
      kycAgingReport({ oldestAwaitingAdminSubmittedAtUtc: null, oldestAwaitingAdminAgeHours: null, medianHoursToDecision30d: null, p90HoursToDecision30d: null }),
    );

    const tiles = Array.from(root.querySelectorAll('app-kpi-tile')).map((tile) => textOf(tile as HTMLElement));
    expect(tiles[2]).toContain('Longest wait-');
    expect(tiles[3]).toContain('-');
    expect(tiles[3]).toContain('No decisions in the last 30 days');
    expect(tiles[3]).not.toContain('0 h');
  });

  it('says that nothing is waiting instead of showing empty bands', async () => {
    const root = await answer(
      await mount(),
      kycAgingReport({ awaitingAdmin: 0, ageBuckets: { lt24h: 0, h24to48: 0, h48to72: 0, gt72h: 0 }, oldestAwaitingAdminSubmittedAtUtc: null, oldestAwaitingAdminAgeHours: null }),
    );

    expect(textOf(root)).toContain('No identity check is waiting for an administrator.');
    expect(root.querySelector('#kyc-bands-heading')).toBeNull();
  });

  it('reports a failure in words', async () => {
    const fixture = await mount();
    httpMock.expectOne(URL).flush(problemBody(403, 'tutoring.forbidden', 'forbidden'), { status: 403, statusText: 'Forbidden' });
    await settle(fixture);

    expect(textOf(fixture.nativeElement as HTMLElement)).toContain('We could not load this report');
  });
});
