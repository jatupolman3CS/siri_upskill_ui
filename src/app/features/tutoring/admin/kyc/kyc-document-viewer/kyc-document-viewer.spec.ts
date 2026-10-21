import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { KycDocumentViewer } from './kyc-document-viewer';

const URL_PATH = '/api/tutoring/admin/kyc/documents/doc-1/content';

describe('KycDocumentViewer', () => {
  let fixture: ComponentFixture<KycDocumentViewer>;
  let httpMock: HttpTestingController;
  let created: Blob[];
  let revoked: string[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    created = [];
    revoked = [];
    // jsdom has no object URLs: record what the viewer creates and revokes.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob): string => {
        created.push(blob);
        return `blob:test/${created.length}`;
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (url: string): void => void revoked.push(url) });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(KycDocumentViewer);
    fixture.componentRef.setInput('documentId', 'doc-1');
    fixture.componentRef.setInput('typeLabelKey', 'tutoring.enums.kycDocumentType.IdCard');
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  const serve = async (type: string): Promise<void> => {
    httpMock.expectOne(URL_PATH).flush(new Blob(['bytes'], { type }));
    await settle(fixture);
  };

  it('says before and while the file is shown that this access is logged', () => {
    expect(textOf(root())).toContain('This access is logged');
    expect(root().querySelector('[role="status"]')).not.toBeNull();
    httpMock.expectOne(URL_PATH).flush(new Blob([], { type: 'image/png' }));
  });

  it('shows an image from an object URL', async () => {
    await serve('image/png');
    const image = root().querySelector('img');
    expect(image?.getAttribute('src')).toBe('blob:test/1');
    expect(created).toHaveLength(1);
  });

  it('shows a PDF in an embedded frame, with no referrer', async () => {
    await serve('application/pdf');
    const frame = root().querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('blob:test/1#toolbar=0&navpanes=0');
    expect(frame?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame?.getAttribute('title')).toBe('Identity document (PDF)');
  });

  it('renders nothing for a type it does not know', async () => {
    await serve('text/html');
    expect(root().querySelector('img, iframe, object, embed')).toBeNull();
    expect(textOf(root())).toContain('cannot be shown here');
  });

  it('revokes the object URL when the viewer is destroyed', async () => {
    await serve('image/png');
    expect(revoked).toEqual([]);
    fixture.destroy();
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('offers no download, keeps nothing in storage and never puts the id or a token in a link', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await serve('application/pdf');
    expect(root().querySelector('a[download], a[href]')).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(textOf(root()).toLowerCase()).not.toContain('download');
  });

  it('closes on the close button and on Escape', async () => {
    await serve('image/png');
    const closed: number[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(1));
    (Array.from(root().querySelectorAll('button')).find((button) => button.textContent?.includes('Close document')) as HTMLButtonElement).click();
    root().querySelector('section')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveLength(2);
  });

  it('explains a file that was deleted, and offers no retry for it', async () => {
    httpMock.expectOne(URL_PATH).flush(new Blob([JSON.stringify(problemBody(410, 'tutoring.kyc.document_purged', 'gone'))], { type: 'application/problem+json' }), { status: 410, statusText: 'Gone' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textOf(root())).toContain('deleted after its retention period');
    });
    expect(textOf(root())).not.toContain('Open again');
  });

  it('refuses to show a file whose access could not be logged, and a retry fetches (and logs) again', async () => {
    httpMock.expectOne(URL_PATH).flush(new Blob([JSON.stringify(problemBody(503, 'tutoring.kyc.log_unavailable', 'unavailable'))], { type: 'application/problem+json' }), { status: 503, statusText: 'Unavailable' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textOf(root())).toContain('not shown');
    });
    expect(created).toHaveLength(0);
    (Array.from(root().querySelectorAll('app-button button')).find((button) => button.textContent?.includes('Open again')) as HTMLButtonElement).click();
    await settle(fixture);
    await serve('image/png');
    expect(root().querySelector('img')).not.toBeNull();
  });
});
