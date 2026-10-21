import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';

import type { TutorStatus } from '../../features/tutoring/data/tutoring-tutor.models';
import { errorInterceptor } from '../http/error.interceptor';
import { verifiedTutorGuard } from './verified-tutor.guard';

const PROFILE_URL = '/api/tutoring/tutor/profile';

function profileBody(status: TutorStatus): object {
  return { tutorId: 't1', status, readiness: { canSubmitForVerification: true, blockers: [] }, rowVersion: 'AAA=' };
}

describe('verifiedTutorGuard', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  function run(): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() => verifiedTutorGuard({} as never, {} as never)) as Observable<boolean | UrlTree>;
    return firstValueFrom(result);
  }

  function expectOnboarding(result: boolean | UrlTree): void {
    expect(result).not.toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/instructor/tutoring?required=verified');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  it('lets a verified tutor through', async () => {
    const result = run();
    httpMock.expectOne(PROFILE_URL).flush(profileBody('Verified'));
    expect(await result).toBe(true);
  });

  it.each(['Draft', 'PendingVerification', 'NeedsInfo', 'Rejected', 'Suspended'] as const)('sends a %s tutor to the onboarding hub', async (status) => {
    const result = run();
    httpMock.expectOne(PROFILE_URL).flush(profileBody(status));
    expectOnboarding(await result);
  });

  it('fails closed: no profile yet, a server error or an unreachable API all count as "not verified"', async () => {
    const noProfile = run();
    httpMock.expectOne(PROFILE_URL).flush({ reason: 'tutoring.tutor_profile_not_found' }, { status: 404, statusText: 'Not Found' });
    expectOnboarding(await noProfile);

    const serverError = run();
    httpMock.expectOne(PROFILE_URL).flush({}, { status: 500, statusText: 'Server Error' });
    expectOnboarding(await serverError);

    const offline = run();
    httpMock.expectOne(PROFILE_URL).error(new ProgressEvent('error'));
    expectOnboarding(await offline);
  });
});
