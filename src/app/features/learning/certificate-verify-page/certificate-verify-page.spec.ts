import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { CertificateVerificationResponse } from '../data/learning-api.models';
import { CertificateVerifyPage } from './certificate-verify-page';

const VERIFY_CODE = 'CERT-ABC123';

function verification(overrides: Partial<CertificateVerificationResponse>): CertificateVerificationResponse {
  return {
    serialNo: 'SN-0001',
    verifyCode: VERIFY_CODE,
    issuedAtUtc: '2026-09-01T00:00:00Z',
    isValid: true,
    revokedAtUtc: null,
    learnerName: 'Real Learner',
    courseTitle: 'Real Course Title',
    ...overrides,
  };
}

describe('CertificateVerifyPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'certificates/verify/:code', component: CertificateVerifyPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function verifyWith(response: CertificateVerificationResponse): Promise<string> {
    await harness.navigateByUrl(`/certificates/verify/${VERIFY_CODE}`, CertificateVerifyPage);
    httpMock.expectOne(`/api/learning/certificates/verify/${VERIFY_CODE}`).flush(response);
    harness.detectChanges();
    return (harness.routeNativeElement as HTMLElement).textContent ?? '';
  }

  it('puts the code in a localized document title instead of a hardcoded Thai one', async () => {
    await verifyWith(verification({}));

    expect(TestBed.inject(Title).getTitle()).toBe('Verify Certificate: CERT-ABC123 | SIRI UpSkill');
  });

  it('shows the learner and course the server returned', async () => {
    const text = await verifyWith(verification({}));

    expect(text).toContain('Real Learner');
    expect(text).toContain('Real Course Title');
  });

  it('shows a neutral label instead of inventing a learner or course when the server cannot resolve them', async () => {
    const text = await verifyWith(verification({ learnerName: null, courseTitle: null }));

    expect(text).not.toContain('ผู้เรียน Siri UpSkill');
    expect(text).not.toContain('คอร์สเรียนออนไลน์');
    expect(text.match(/Not provided/g)?.length).toBe(2);
  });

  it('explains that the PDF is unavailable (503 certificate.public_url_not_configured) instead of opening a raw API URL', async () => {
    await verifyWith(verification({}));
    const toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);

    const button = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Download'),
    ) as HTMLButtonElement;
    button.click();
    httpMock.expectOne(`/api/learning/certificates/verify/${VERIFY_CODE}/download`).flush(
      new Blob([JSON.stringify({ title: 'Certificate public URL is not configured.', status: 503, errorCode: 'certificate.public_url_not_configured' })],
        { type: 'application/problem+json' }),
      { status: 503, statusText: 'Service Unavailable' },
    );
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    expect(toastError.mock.calls[0][0]).toBe('Certificate downloads are temporarily unavailable. Please try again later.');
    expect(openWindow).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
