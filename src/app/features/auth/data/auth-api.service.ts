import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import {
  AnonymizeAccountRequest,
  AnonymizeAccountResponse,
  ConfirmEmailResponse,
  DataExportResponse,
  ForgotPasswordResponse,
  GoogleLoginRequest,
  ListSessionsResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  OAuthClientsResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  RevokeAllSessionsResponse,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
} from './auth-api.models';

/**
 * The one `*ApiService` for everything under `/api/identity/*` (P0-35, P7-04) — components in
 * `features/auth/*` call this, never `HttpClient` directly (frontend.md).
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService extends ApiService {
  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.post<RegisterResponse>('/identity/register', request);
  }

  confirmEmail(token: string): Observable<ConfirmEmailResponse> {
    return this.post<ConfirmEmailResponse>('/identity/confirm-email', { token });
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.post<LoginResponse>('/identity/login', request, { withCredentials: true });
  }

  /** Exchanges a Google ID token for a session; sets the same httpOnly refresh cookie as `login`. */
  googleLogin(request: GoogleLoginRequest): Observable<LoginResponse> {
    return this.post<LoginResponse>('/identity/external-login/google', request, { withCredentials: true });
  }

  getOAuthClients(): Observable<OAuthClientsResponse> {
    return this.get<OAuthClientsResponse>('/auth/oauth-clients');
  }

  refresh(): Observable<RefreshResponse> {
    return this.post<RefreshResponse>('/identity/refresh', {}, { withCredentials: true });
  }

  logout(): Observable<LogoutResponse> {
    return this.post<LogoutResponse>('/identity/logout', {}, { withCredentials: true });
  }

  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.post<ForgotPasswordResponse>('/identity/forgot-password', { email });
  }

  resetPassword(request: ResetPasswordRequest): Observable<ResetPasswordResponse> {
    return this.post<ResetPasswordResponse>('/identity/reset-password', request);
  }

  listSessions(): Observable<ListSessionsResponse> {
    return this.get<ListSessionsResponse>('/identity/sessions');
  }

  revokeSession(sessionId: string): Observable<RevokeSessionResponse> {
    return this.delete<RevokeSessionResponse>(`/identity/sessions/${sessionId}`);
  }

  revokeOtherSessions(): Observable<RevokeOtherSessionsResponse> {
    return this.post<RevokeOtherSessionsResponse>('/identity/sessions/revoke-others', {});
  }

  revokeAllSessions(): Observable<RevokeAllSessionsResponse> {
    return this.post<RevokeAllSessionsResponse>('/identity/sessions/revoke-all', {});
  }

  exportData(): Observable<DataExportResponse> {
    return this.get<DataExportResponse>('/identity/data-export');
  }

  anonymizeAccount(request: AnonymizeAccountRequest): Observable<AnonymizeAccountResponse> {
    return this.post<AnonymizeAccountResponse>('/identity/anonymize', request);
  }
}
