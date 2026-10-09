import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { PagedResult } from '../../../core/http/paged-result.model';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { InstructorApplicationSummary } from './data/admin-instructor-api.models';
import { AdminInstructorsPage } from './admin-instructors-page';

const PENDING_URL = '/api/catalog/admin/instructors/pending';

const SOMCHAI: InstructorApplicationSummary = {
  id: 'a1',
  userId: 'u1',
  displayName: 'Somchai Dev',
  headline: 'Senior engineer',
  bio: 'Ten years building web apps.',
  // 20:30 UTC on 30 Sep is 03:30 on 1 Oct in Bangkok — proves the Bangkok date pipe, not the viewer's zone.
  createdAtUtc: '2026-09-30T20:30:00Z',
};
const MALEE: InstructorApplicationSummary = {
  id: 'a2',
  userId: 'u2',
  displayName: 'Malee Design',
  headline: null,
  bio: 'x'.repeat(400),
  createdAtUtc: '2026-10-02T03:00:00Z',
};

function page(items: InstructorApplicationSummary[], overrides: Partial<PagedResult<InstructorApplicationSummary>> = {}): PagedResult<InstructorApplicationSummary> {
  return { items, totalCount: items.length, page: 1, pageSize: 20, totalPages: items.length > 0 ? 1 : 0, ...overrides };
}

describe('AdminInstructorsPage', () => {
  let fixture: ComponentFixture<AdminInstructorsPage>;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let toastSuccess: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AdminInstructorsPage],
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    toastSuccess = vi.spyOn(toast, 'success');
    fixture = TestBed.createComponent(AdminInstructorsPage);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function loadPending(result = page([SOMCHAI, MALEE])): Promise<void> {
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url === PENDING_URL).flush(result);
    await settle();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const dialog = (): HTMLElement | null => root().querySelector('[role="dialog"]');

  function buttonByText(text: string, within: ParentNode = root()): HTMLButtonElement {
    const found = Array.from(within.querySelectorAll('button')).find((button) => button.textContent?.replace(/\s+/g, ' ').trim() === text);
    if (!found) {
      throw new Error(`No button "${text}"`);
    }
    return found;
  }

  function card(index: number): HTMLElement {
    return root().querySelectorAll('app-instructor-application-card')[index] as HTMLElement;
  }

  describe('list', () => {
    it('requests page 1 with the default page size and shows each application with its Bangkok-time applied date', async () => {
      fixture.detectChanges();
      const request = httpMock.expectOne((req) => req.url === PENDING_URL);
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('pageSize')).toBe('20');
      request.flush(page([SOMCHAI, MALEE]));
      await settle();

      expect(root().querySelectorAll('app-instructor-application-card')).toHaveLength(2);
      expect(card(0).textContent).toContain('Somchai Dev');
      expect(card(0).textContent).toContain('Senior engineer');
      expect(card(0).textContent).toContain('Ten years building web apps.');
      expect(card(0).textContent).toContain('Applied 1 Oct 2026 03:30');
      expect(root().textContent).toContain('2 pending');
    });

    it('tells the admin that approving grants the Instructor role', async () => {
      await loadPending();

      expect(root().textContent).toContain('Approving grants the applicant the Instructor role immediately');
    });

    it('clamps a long bio behind a real toggle button that reports aria-expanded', async () => {
      await loadPending();

      expect(card(0).querySelector('button[aria-expanded]')).toBeNull();
      const toggle = card(1).querySelector('button[aria-expanded]') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      toggle.click();
      await settle();

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.textContent).toContain('Show less');
    });

    it('shows the empty state when nothing is waiting', async () => {
      await loadPending(page([]));

      expect(root().textContent).toContain('No applications waiting for review');
      expect(root().querySelectorAll('app-instructor-application-card')).toHaveLength(0);
    });

    it('shows an error state with retry, and recovers on retry', async () => {
      fixture.detectChanges();
      httpMock.expectOne((req) => req.url === PENDING_URL).flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(root().querySelector('[role="alert"]')?.textContent).toContain('Could not load the applications');

      buttonByText('Try again').click();
      await settle();
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([SOMCHAI]));
      await settle();

      expect(root().querySelectorAll('app-instructor-application-card')).toHaveLength(1);
    });

    it('paginates: shows the pager only with more than one page and requests the chosen page', async () => {
      await loadPending(page([SOMCHAI], { totalCount: 45, totalPages: 3 }));

      const pager = root().querySelector('nav[aria-label="Pagination"]');
      expect(pager).not.toBeNull();

      buttonByTextIn(pager as HTMLElement, '2').click();
      await settle();

      const request = httpMock.expectOne((req) => req.url === PENDING_URL);
      expect(request.request.params.get('page')).toBe('2');
      request.flush(page([MALEE], { page: 2, totalCount: 45, totalPages: 3 }));
      await settle();
      expect(card(0).textContent).toContain('Malee Design');
    });

    it('hides the pager when everything fits on one page', async () => {
      await loadPending();

      expect(root().querySelector('nav[aria-label="Pagination"]')).toBeNull();
    });
  });

  function buttonByTextIn(container: HTMLElement, text: string): HTMLButtonElement {
    return buttonByText(text, container);
  }

  describe('approve', () => {
    it('asks for confirmation first — opening and cancelling sends nothing', async () => {
      await loadPending();

      buttonByText('Approve Somchai Dev', card(0)).click();
      await settle();
      expect(dialog()?.textContent).toContain('Approve "Somchai Dev" as an instructor?');
      expect(dialog()?.textContent).toContain('gets the Instructor role right away');

      buttonByText('Cancel', dialog() as HTMLElement).click();
      await settle();
      expect(dialog()).toBeNull();
      // httpMock.verify() proves no POST went out.
    });

    it('POSTs /approve on confirm, toasts, closes the dialog and refreshes the list', async () => {
      await loadPending();
      buttonByText('Approve Somchai Dev', card(0)).click();
      await settle();
      buttonByText('Approve', dialog() as HTMLElement).click();
      await settle();

      const request = httpMock.expectOne('/api/catalog/admin/instructors/a1/approve');
      expect(request.request.method).toBe('POST');
      request.flush({ id: 'a1', userId: 'u1', displayName: 'Somchai Dev', status: 'Approved', approvedAtUtc: '2026-10-03T00:00:00Z' });
      await settle();

      expect(toastSuccess).toHaveBeenCalledWith('"Somchai Dev" was approved as an instructor');
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([MALEE]));
      await settle();

      expect(dialog()).toBeNull();
      expect(root().querySelectorAll('app-instructor-application-card')).toHaveLength(1);
      expect(root().textContent).not.toContain('Somchai Dev');
    });

    it('sends only one request when confirm is clicked twice while the first is in flight', async () => {
      await loadPending();
      buttonByText('Approve Somchai Dev', card(0)).click();
      await settle();

      const confirm = buttonByText('Approve', dialog() as HTMLElement);
      confirm.click();
      await settle();
      confirm.click();
      await settle();

      httpMock.expectOne('/api/catalog/admin/instructors/a1/approve').flush({ id: 'a1', userId: 'u1', displayName: 'Somchai Dev', status: 'Approved', approvedAtUtc: null });
      await settle();
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([MALEE]));
    });

    it('explains a 409 (already decided elsewhere), keeps the dialog open and refreshes the list behind it', async () => {
      await loadPending();
      buttonByText('Approve Somchai Dev', card(0)).click();
      await settle();
      buttonByText('Approve', dialog() as HTMLElement).click();
      await settle();

      httpMock
        .expectOne('/api/catalog/admin/instructors/a1/approve')
        .flush({ title: 'Conflict', detail: 'ใบสมัครนี้ถูกดำเนินการไปแล้ว', errorCode: 'conflict' }, { status: 409, statusText: 'Conflict' });
      await settle();

      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('already been decided');
      expect(toastSuccess).not.toHaveBeenCalled();
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([MALEE]));
    });

    it('explains a 404 (application gone) and refreshes', async () => {
      await loadPending();
      buttonByText('Approve Somchai Dev', card(0)).click();
      await settle();
      buttonByText('Approve', dialog() as HTMLElement).click();
      await settle();

      httpMock.expectOne('/api/catalog/admin/instructors/a1/approve').flush({ title: 'Not Found' }, { status: 404, statusText: 'Not Found' });
      await settle();

      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('was not found');
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([MALEE]));
    });

    it('shows a generic message for an unexpected server error and does not refresh', async () => {
      await loadPending();
      buttonByText('Approve Somchai Dev', card(0)).click();
      await settle();
      buttonByText('Approve', dialog() as HTMLElement).click();
      await settle();

      httpMock.expectOne('/api/catalog/admin/instructors/a1/approve').flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('error');
    });
  });

  describe('reject', () => {
    it('confirms, then POSTs /reject with no body and toasts', async () => {
      await loadPending();
      buttonByText('Reject Malee Design', card(1)).click();
      await settle();
      expect(dialog()?.textContent).toContain('Reject the application from "Malee Design"?');
      expect(dialog()?.textContent).toContain('can submit a new application later');

      buttonByText('Reject application', dialog() as HTMLElement).click();
      await settle();

      const request = httpMock.expectOne('/api/catalog/admin/instructors/a2/reject');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toBeNull();
      request.flush({ id: 'a2', userId: 'u2', displayName: 'Malee Design', status: 'Rejected' });
      await settle();

      expect(toastSuccess).toHaveBeenCalledWith('The application from "Malee Design" was rejected');
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([SOMCHAI]));
    });

    it('steps back to the new last page when the only row of the last page was just decided', async () => {
      await loadPending(page([SOMCHAI], { totalCount: 21, totalPages: 2 }));
      // Go to page 2 (a single remaining row).
      buttonByText('2', root().querySelector('nav[aria-label="Pagination"]') as HTMLElement).click();
      await settle();
      httpMock.expectOne((req) => req.url === PENDING_URL).flush(page([MALEE], { page: 2, totalCount: 21, totalPages: 2 }));
      await settle();

      buttonByText('Reject Malee Design', card(0)).click();
      await settle();
      buttonByText('Reject application', dialog() as HTMLElement).click();
      await settle();
      httpMock.expectOne('/api/catalog/admin/instructors/a2/reject').flush({ id: 'a2', userId: 'u2', displayName: 'Malee Design', status: 'Rejected' });
      await settle();

      // Page 2 no longer exists: the reload of page 2 comes back empty, so the page asks for page 1 again.
      httpMock.expectOne((req) => req.url === PENDING_URL && req.params.get('page') === '2').flush(page([], { page: 2, totalCount: 20, totalPages: 1 }));
      await settle();
      const retry = httpMock.expectOne((req) => req.url === PENDING_URL);
      expect(retry.request.params.get('page')).toBe('1');
      retry.flush(page([SOMCHAI], { totalCount: 20, totalPages: 1 }));
      await settle();

      expect(card(0).textContent).toContain('Somchai Dev');
    });
  });
});
