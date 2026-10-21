import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuthApiService } from '../data/auth-api.service';
import { AccountPrivacyPage } from './account-privacy-page';

describe('AccountPrivacyPage', () => {
  let component: AccountPrivacyPage;
  let fixture: ComponentFixture<AccountPrivacyPage>;
  let mockAuthApi: Partial<AuthApiService>;
  let mockToast: Partial<ToastService>;
  let mockAuthService: Partial<AuthService>;

  beforeEach(async () => {
    mockAuthApi = {
      exportData: vi.fn().mockReturnValue(of({
        exportedAtUtc: new Date().toISOString(),
        profile: { id: '123', email: 'test@example.com', displayName: 'Test', roles: [] },
        sessions: [],
        securityAudits: [],
      })),
      anonymizeAccount: vi.fn().mockReturnValue(of({ message: 'Success' })),
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
    };

    mockAuthService = {
      clearSession: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AccountPrivacyPage],
      providers: [
        provideRouter([]),
        { provide: AuthApiService, useValue: mockAuthApi },
        { provide: ToastService, useValue: mockToast },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPrivacyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize successfully', () => {
    expect(component).toBeTruthy();
    expect(component.showDeleteModal()).toBe(false);
  });

  it('should call exportData and trigger success toast when modules is absent', () => {
    mockAuthApi.exportData = vi.fn().mockReturnValue(of({
      exportedAtUtc: new Date().toISOString(),
      profile: { id: '123', email: 'test@example.com', displayName: 'Test', roles: [] },
      sessions: [],
      securityAudits: [],
    }));
    component.exportData();
    expect(mockAuthApi.exportData).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('should call exportData and trigger success toast when modules is present (additive payload)', () => {
    mockAuthApi.exportData = vi.fn().mockReturnValue(of({
      exportedAtUtc: new Date().toISOString(),
      profile: { id: '123', email: 'test@example.com', displayName: 'Test', roles: [] },
      sessions: [],
      securityAudits: [],
      externalLogins: [{ provider: 'Google', providerEmail: 'test@gmail.com', linkedAtUtc: '2026-01-01T00:00:00Z', lastLoginAtUtc: '2026-01-02T00:00:00Z' }],
      modules: [
        { module: 'tutoring', data: { learnerProfiles: [], bookings: [] } },
      ],
    }));
    component.exportData();
    expect(mockAuthApi.exportData).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('should open and close delete modal', () => {
    component.openDeleteModal();
    expect(component.showDeleteModal()).toBe(true);

    component.closeDeleteModal();
    expect(component.showDeleteModal()).toBe(false);
  });

  it('should validate confirmation string before calling anonymizeAccount', () => {
    component.openDeleteModal();
    component.deleteConfirmation = 'WRONG';
    component.confirmDelete();

    expect(mockAuthApi.anonymizeAccount).not.toHaveBeenCalled();
    expect(component.deleteError()).toContain('DELETE');

    component.deleteConfirmation = 'DELETE';
    component.confirmDelete();
    expect(mockAuthApi.anonymizeAccount).toHaveBeenCalledWith({
      password: '',
      confirmation: 'DELETE',
    });
    expect(mockAuthService.clearSession).toHaveBeenCalled();
  });

  it('should handle 409 tutoring.erasure_blocked by displaying blockers with appropriate links', () => {
    const error = new ApiError(409, 'Conflict', 'conflict', {
      reason: 'tutoring.erasure_blocked',
      blockers: ['learner_bookings', 'tutor_sessions', 'tutor_payout_balance'],
    });
    mockAuthApi.anonymizeAccount = vi.fn().mockReturnValue(throwError(() => error));

    component.openDeleteModal();
    component.deleteConfirmation = 'DELETE';
    component.confirmDelete();

    expect(component.isDeleting()).toBe(false);
    expect(component.deleteError()).toBeNull();
    expect(component.erasureHeading()).toBeTruthy();
    expect(component.erasureBlockers().length).toBe(3);
    expect(component.erasureBlockers()[0].link).toBe('/my-tutoring');
    expect(component.erasureBlockers()[1].link).toBe('/instructor/tutoring/classes');
    expect(component.erasureBlockers()[2].link).toBe('/instructor/tutoring/wallet');
  });

  it('should handle general error during anonymizeAccount', () => {
    const error = new ApiError(500, 'Server error');
    mockAuthApi.anonymizeAccount = vi.fn().mockReturnValue(throwError(() => error));

    component.openDeleteModal();
    component.deleteConfirmation = 'DELETE';
    component.confirmDelete();

    expect(component.isDeleting()).toBe(false);
    expect(component.deleteError()).toBe('Server error');
    expect(component.erasureBlockers().length).toBe(0);
  });
});
