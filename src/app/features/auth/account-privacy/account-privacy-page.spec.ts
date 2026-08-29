import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/auth/auth.service';
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

  it('should call exportData and trigger success toast', () => {
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
});
