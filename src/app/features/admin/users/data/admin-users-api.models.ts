export type AdminUserRole = 'SuperAdmin' | 'Admin' | 'Instructor' | 'Learner';
export type AdminUserStatus = 'Active' | 'Suspended' | 'PendingVerification';

export interface AdminUserSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: AdminUserStatus;
  readonly roles: readonly string[];
  readonly createdAtUtc: string;
  readonly lastLoginAtUtc: string | null;
}

export interface GetAdminUsersResponse {
  readonly items: readonly AdminUserSummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminAuditLogSummary {
  readonly id: string;
  readonly userId: string | null;
  readonly eventType: string;
  readonly detail: string | null;
  readonly ipAddress: string | null;
  readonly occurredAtUtc: string;
}

export interface GetAdminAuditLogsResponse {
  readonly items: readonly AdminAuditLogSummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface SuspendUserRequest {
  readonly reason: string;
}

export interface UpdateUserRolesRequest {
  readonly roles: readonly string[];
}
