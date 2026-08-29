export interface SubmitContactMessageRequest {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly botField?: string | null;
}

export interface SubmitContactMessageResponse {
  readonly success: boolean;
  readonly message: string;
}

export interface ContactMessageItem {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly status: 'Pending' | 'Resolved';
  readonly resolvedAtUtc: string | null;
  readonly resolvedBy: string | null;
  readonly adminNotes: string | null;
  readonly createdAtUtc: string;
}
