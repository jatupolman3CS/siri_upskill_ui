import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { DownloadNavigator } from '../../../data/download-navigator';
import { SESSION_ID, material } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { BookingMaterialsSection } from './booking-materials-section';

const LIST = `/api/tutoring/sessions/${SESSION_ID}/materials`;

describe('BookingMaterialsSection', () => {
  let fixture: ComponentFixture<BookingMaterialsSection>;
  let httpMock: HttpTestingController;
  const assign = vi.fn();

  beforeEach(async () => {
    assign.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BookingMaterialsSection],
      providers: [...HTTP_TEST_PROVIDERS, { provide: DownloadNavigator, useValue: { go: assign } }],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookingMaterialsSection);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('says it is loading, then lists links, homework and files with their kind and title', async () => {
    expect(root().querySelector('[role="status"][aria-label="Loading the materials"]')).not.toBeNull();
    httpMock.expectOne(LIST).flush([
      material(),
      material({ id: 'm-2', kind: 'Homework', title: 'Exercise 4', url: null, bodyText: 'Do problems 1-10' }),
      material({ id: 'm-3', kind: 'File', title: 'Notes', url: null, fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 2_097_152 }),
    ]);
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('Practice sheet');
    expect(text).toContain('Do problems 1-10');
    expect(text).toContain('notes.pdf');
    expect(text).toContain('2 MB');
    expect(root().querySelectorAll('ul > li')).toHaveLength(3);
  });

  it('opens an external link in a new tab with noopener noreferrer nofollow and warns that it leaves the platform', async () => {
    httpMock.expectOne(LIST).flush([material()]);
    await settle(fixture);

    const link = root().querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://docs.example.test/sheet');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer nofollow');
    expect(textOf(root())).toContain('This link leaves the platform');
  });

  it('never links an address that is not https - it shows it as plain text', async () => {
    httpMock.expectOne(LIST).flush([material({ url: 'javascript:alert(1)' })]);
    await settle(fixture);

    expect(root().querySelector('a')).toBeNull();
    expect(textOf(root())).toContain('javascript:alert(1)');
  });

  it('renders tutor text as text, never as markup', async () => {
    httpMock.expectOne(LIST).flush([material({ kind: 'Homework', url: null, title: '<b>bold</b>', bodyText: '<img src=x onerror=alert(1)>' })]);
    await settle(fixture);

    expect(root().querySelector('img')).toBeNull();
    expect(root().querySelector('b')).toBeNull();
  });

  it('downloads a file through a short-lived signed address, used at once - the list never carries a storage URL', async () => {
    httpMock.expectOne(LIST).flush([material({ id: 'm-3', kind: 'File', title: 'Notes', url: null, fileName: 'notes.pdf', sizeBytes: 100 })]);
    await settle(fixture);
    expect(root().querySelector('a')).toBeNull();

    buttonByText(root(), 'Download')?.click();
    await settle(fixture);
    httpMock
      .expectOne(`${LIST}/m-3/download`)
      .flush({ id: 'm-3', fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 100, downloadUrl: 'https://files.example.test/signed?x=1', expiresAtUtc: 'x' });
    await settle(fixture);

    expect(assign).toHaveBeenCalledWith('https://files.example.test/signed?x=1');
  });

  it('does not follow a download address that is not https', async () => {
    httpMock.expectOne(LIST).flush([material({ id: 'm-3', kind: 'File', url: null, fileName: 'notes.pdf', sizeBytes: 100 })]);
    await settle(fixture);

    buttonByText(root(), 'Download')?.click();
    await settle(fixture);
    httpMock
      .expectOne(`${LIST}/m-3/download`)
      .flush({ id: 'm-3', fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 100, downloadUrl: 'javascript:alert(1)', expiresAtUtc: 'x' });
    await settle(fixture);

    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the server refusal of a download without losing the list', async () => {
    httpMock.expectOne(LIST).flush([material({ id: 'm-3', kind: 'File', url: null, fileName: 'notes.pdf', sizeBytes: 100 })]);
    await settle(fixture);

    buttonByText(root(), 'Download')?.click();
    await settle(fixture);
    httpMock.expectOne(`${LIST}/m-3/download`).flush({ title: 'x', status: 503, reason: 'tutoring.storage_not_configured' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    expect(textOf(root())).toContain('notes.pdf');
  });

  it('tells the learner when the tutor has shared nothing', async () => {
    httpMock.expectOne(LIST).flush([]);
    await settle(fixture);

    expect(textOf(root())).toContain('Your tutor has not shared any materials yet.');
  });

  it('shows an error with a retry', async () => {
    httpMock.expectOne(LIST).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('We could not load the materials.');
    buttonByText(root(), 'Try again')?.click();
    await settle(fixture);
    httpMock.expectOne(LIST).flush([material()]);
    await settle(fixture);

    expect(textOf(root())).toContain('Practice sheet');
  });
});
