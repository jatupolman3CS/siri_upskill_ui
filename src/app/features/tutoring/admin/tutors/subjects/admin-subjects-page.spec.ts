import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { subject } from '../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { AdminSubjectsPage } from './admin-subjects-page';

const LIST = (r: { url: string }): boolean => r.url === '/api/tutoring/admin/subjects';
const GROUP = subject();
const CHILD = subject({ subjectId: 's-1', slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentId: 'g-1', sortOrder: 20, isActive: false });
const page = (items = [GROUP, CHILD]): object => ({ items, totalCount: items.length, page: 1, pageSize: 100, totalPages: 1 });

describe('AdminSubjectsPage', () => {
  let fixture: ComponentFixture<AdminSubjectsPage>;
  let httpMock: HttpTestingController;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminSubjectsPage);
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  async function load(answer: object = page()): Promise<void> {
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('includeInactive')).toBe('true');
    request.flush(answer);
    await settle(fixture);
  }

  it('shows a busy skeleton while loading', () => {
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(LIST).flush(page());
  });

  it('lists groups and their subjects, inactive ones included and marked with text', async () => {
    await load();
    const text = textOf(root());
    expect(text).toContain('Science');
    expect(text).toContain('Group');
    expect(text).toContain('Physics');
    expect(text).toContain('Inactive');
    expect(root().querySelector('.overflow-x-auto table')).not.toBeNull();
  });

  it('is empty-state friendly: offers to add the first subject', async () => {
    await load(page([]));
    expect(textOf(root())).toContain('No subjects yet');
    expect(buttonByText(root(), 'Add subject')).not.toBeNull();
  });

  it('reports a failed load and retries', async () => {
    httpMock.expectOne(LIST).flush({}, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(textOf(root())).toContain('Could not load subjects');
    (buttonByText(root(), 'Try again') as HTMLButtonElement).click();
    await settle(fixture);
    await load();
  });

  it('opens the form to add a subject', async () => {
    await load();
    (buttonByText(root(), 'Add subject') as HTMLButtonElement).click();
    await settle(fixture);
    expect(root().querySelector('[role="dialog"]')?.textContent).toContain('Add a subject');
  });

  it('asks before switching a subject off, then sends the update with everything else unchanged', async () => {
    await load(page([GROUP, { ...CHILD, isActive: true }]));
    (Array.from(root().querySelectorAll('app-button button')).find((button) => button.textContent?.includes('Deactivate') && button.textContent.includes('Physics')) as HTMLButtonElement).click();
    await settle(fixture);
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('can no longer be chosen');
    httpMock.expectNone('/api/tutoring/admin/subjects/s-1');
    (dialog.querySelector('app-button:last-child button') as HTMLButtonElement).click();
    const request = httpMock.expectOne('/api/tutoring/admin/subjects/s-1');
    expect(request.request.body).toEqual({ nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentId: 'g-1', sortOrder: 20, isActive: false });
    request.flush({ ...CHILD, isActive: false });
    await settle(fixture);
    await load();
  });
});
