import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PayoutPolicy } from './payout-api.models';
import { PayoutPolicyStore } from './payout-policy.store';

const POLICY: PayoutPolicy = {
  revenueSharePercent: 80,
  platformSharePercent: 20,
  withholdingTaxPercent: 5,
  minimumPayoutAmount: 750,
  holdDays: 21,
};

describe('PayoutPolicyStore', () => {
  let store: PayoutPolicyStore;
  let httpMock: HttpTestingController;

  async function settle(): Promise<void> {
    TestBed.flushEffects();
    await Promise.resolve();
    TestBed.flushEffects();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PayoutPolicyStore, provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PayoutPolicyStore);
  });

  afterEach(() => httpMock.verify());

  it('GETs /api/payout/policy once and exposes no policy (only loading) until the server answers', async () => {
    await settle();
    const req = httpMock.expectOne('/api/payout/policy');
    expect(req.request.method).toBe('GET');

    expect(store.policy()).toBeUndefined();
    expect(store.isLoading()).toBe(true);
    expect(store.hasError()).toBe(false);

    req.flush(POLICY);
    await settle();

    expect(store.policy()).toEqual(POLICY);
    expect(store.isLoading()).toBe(false);
    expect(store.hasError()).toBe(false);
  });

  it('reports an error without throwing and without inventing a policy when the request fails', async () => {
    await settle();
    httpMock.expectOne('/api/payout/policy').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await settle();

    // resource.value() would throw in the error state — the store must guard it with hasValue().
    expect(() => store.policy()).not.toThrow();
    expect(store.policy()).toBeUndefined();
    expect(store.isLoading()).toBe(false);
    expect(store.hasError()).toBe(true);
  });

  it('reload() refetches and recovers from an error with the real server values', async () => {
    await settle();
    httpMock.expectOne('/api/payout/policy').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(store.hasError()).toBe(true);

    store.reload();
    await settle();
    httpMock.expectOne('/api/payout/policy').flush(POLICY);
    await settle();

    expect(store.hasError()).toBe(false);
    expect(store.policy()).toEqual(POLICY);
  });
});
