import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { HTTP_TEST_PROVIDERS, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { KycAccessLogDialog } from './kyc-access-log-dialog';

const LOGS = (r: { url: string }): boolean => r.url === '/api/tutoring/admin/kyc/documents/doc-1/access-logs';

describe('KycAccessLogDialog', () => {
  let fixture: ComponentFixture<KycAccessLogDialog>;
  let httpMock: HttpTestingController;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(KycAccessLogDialog);
    fixture.componentRef.setInput('documentId', 'doc-1');
    fixture.componentRef.setInput('typeLabelKey', 'tutoring.enums.kycDocumentType.IdCard');
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  it('asks for nothing while closed', () => {
    httpMock.expectNone(LOGS);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('lists who opened the document, newest first, and who the system is', async () => {
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
    httpMock.expectOne(LOGS).flush({
      items: [
        { accessedAtUtc: '2026-10-14T05:00:00Z', accessedByUserId: '12345678-aaaa', action: 'View', ipAddress: '10.0.0.1' },
        { accessedAtUtc: '2026-10-13T05:00:00Z', accessedByUserId: null, action: 'Purge', ipAddress: null },
      ],
      totalCount: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Access log: National ID card');
    expect(text).toContain('Viewed');
    expect(text).toContain('By administrator 12345678');
    expect(text).toContain('10.0.0.1');
    expect(text).toContain('By the system');
    expect(text).toContain('File deleted');
  });

  it('says nobody has opened it yet', async () => {
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
    httpMock.expectOne(LOGS).flush({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
    await settle(fixture);
    expect(textOf(root())).toContain('Nobody has opened this document yet');
  });

  it('reports a failure and retries', async () => {
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
    httpMock.expectOne(LOGS).flush({}, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    (Array.from(root().querySelectorAll('app-button button')).find((button) => button.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle(fixture);
    httpMock.expectOne(LOGS).flush({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
  });
});
