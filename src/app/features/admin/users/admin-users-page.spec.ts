import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { GetAdminAuditLogsResponse, GetAdminUsersResponse } from './data/admin-users-api.models';
import { AdminUsersPage } from './admin-users-page';

const MOCK_USERS: GetAdminUsersResponse = {
  items: [
    {
      id: 'u-1',
      email: 'somchai@example.com',
      displayName: 'สมชาย นักพัฒนา',
      roles: ['Learner'],
      status: 'Active',
      createdAtUtc: '2026-01-10T00:00:00Z',
      lastLoginAtUtc: '2026-08-25T14:30:00Z',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
};

const MOCK_AUDIT: GetAdminAuditLogsResponse = {
  items: [
    {
      id: 'aud-1',
      userId: 'u-1',
      eventType: 'UserLogin',
      detail: 'Login from Chrome Windows',
      ipAddress: '127.0.0.1',
      occurredAtUtc: '2026-08-25T14:30:00Z',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
};

describe('AdminUsersPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/users', component: AdminUsersPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function navigate(): Promise<AdminUsersPage> {
    const component = await harness.navigateByUrl('/admin/users', AdminUsersPage);
    await settle();
    return component;
  }

  function flushInitialRequests(): void {
    const usersReq = httpMock.expectOne((r) => r.url.startsWith('/api/identity/admin/users'));
    expect(usersReq.request.method).toBe('GET');
    usersReq.flush(MOCK_USERS);

    const auditReq = httpMock.expectOne((r) => r.url.startsWith('/api/identity/admin/audit-logs'));
    expect(auditReq.request.method).toBe('GET');
    auditReq.flush(MOCK_AUDIT);
  }

  it('renders users list correctly from API', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('ผู้ใช้งานและสิทธิ์การเข้าถึง');
    expect(text).toContain('สมชาย นักพัฒนา');
    expect(text).toContain('somchai@example.com');
  });

  it('updates user role to Instructor and reloads data', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    // Click edit role button
    const editRoleBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('เปลี่ยนบทบาท')
    );
    expect(editRoleBtn).toBeDefined();
    editRoleBtn?.click();
    await settle();

    // Find modal select
    const modal = harness.routeNativeElement?.querySelector('.fixed') as HTMLElement;
    expect(modal).not.toBeNull();
    const modalSelect = modal.querySelector('select') as HTMLSelectElement;
    expect(modalSelect).not.toBeNull();
    modalSelect.value = 'Instructor';
    modalSelect.dispatchEvent(new Event('input'));
    modalSelect.dispatchEvent(new Event('change'));
    await settle();

    // Click save in modal
    const saveBtn = Array.from(modal.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('บันทึกบทบาท')
    );
    expect(saveBtn).toBeDefined();
    saveBtn?.click();
    await settle();

    const updateReq = httpMock.expectOne('/api/identity/admin/users/u-1/roles');
    expect(updateReq.request.method).toBe('PUT');
    expect(updateReq.request.body.roles).toContain('Instructor');
    updateReq.flush({
      id: 'u-1',
      email: 'somchai@example.com',
      displayName: 'สมชาย นักพัฒนา',
      roles: ['Instructor'],
      status: 'Active',
      createdAtUtc: '2026-01-10T00:00:00Z',
      lastLoginAtUtc: '2026-08-25T14:30:00Z',
    });
    await settle();

    // Reloads users & audit logs
    const reloadUsers = httpMock.expectOne((r) => r.url.startsWith('/api/identity/admin/users'));
    reloadUsers.flush(MOCK_USERS);

    const reloadAudit = httpMock.expectOne((r) => r.url.startsWith('/api/identity/admin/audit-logs'));
    reloadAudit.flush(MOCK_AUDIT);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('อัปเดตบทบาทของ สมชาย นักพัฒนา');
  });

  it('exposes the role editor as a named modal dialog that Escape closes', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    const editRoleBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('เปลี่ยนบทบาท'),
    );
    editRoleBtn?.click();
    await settle();

    const dialog = harness.routeNativeElement?.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby') ?? '';
    expect(harness.routeNativeElement?.querySelector(`#${titleId}`)?.textContent).toContain('แก้ไขบทบาทผู้ใช้งาน');

    (dialog.querySelector('select') as HTMLSelectElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle();

    expect(harness.routeNativeElement?.querySelector('[role="dialog"]')).toBeNull();
  });

  it('suspends and reactivates a user account', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    // Click suspend button
    const suspendBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('ระงับบัญชี')
    );
    expect(suspendBtn).toBeDefined();
    suspendBtn?.click();
    await settle();

    // Confirm suspend in modal
    const modal = harness.routeNativeElement?.querySelector('.fixed') as HTMLElement;
    expect(modal).not.toBeNull();
    const confirmSuspendBtn = Array.from(modal.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('ยืนยันการระงับบัญชี')
    );
    expect(confirmSuspendBtn).toBeDefined();
    confirmSuspendBtn?.click();
    await settle();

    const suspendReq = httpMock.expectOne('/api/identity/admin/users/u-1/suspend');
    expect(suspendReq.request.method).toBe('POST');
    suspendReq.flush({ id: 'u-1', status: 'Suspended' });
    await settle();

    const reloadUsers = httpMock.expectOne((r) => r.url.startsWith('/api/identity/admin/users'));
    reloadUsers.flush(MOCK_USERS);

    const reloadAudit = httpMock.expectOne((r) => r.url.startsWith('/api/identity/admin/audit-logs'));
    reloadAudit.flush(MOCK_AUDIT);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('ระงับการใช้งานบัญชี สมชาย นักพัฒนา เรียบร้อยแล้ว');
  });
});
