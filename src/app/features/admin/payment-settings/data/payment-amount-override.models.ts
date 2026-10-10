/**
 * Mirrors the AdminOnly `payment-amount-override` contract of the Commerce module
 * (`/api/commerce/admin/payment-amount-override`). Field names are copied verbatim (camelCase on the wire, instants as
 * ISO-8601 UTC strings). While an override is on, every NEW PaymentIntent is charged `min(overrideAmount, order total)`
 * — the server owns that rule, the client only edits the setting and shows what the server returns.
 */

/** `GET` and `PUT` response. Before any change was ever made: `isEnabled = false` and every other field `null`. */
export interface PaymentAmountOverrideState {
  readonly isEnabled: boolean;
  readonly overrideAmount: number | null;
  readonly reason: string | null;
  readonly changedByUserId: string | null;
  readonly changedAtUtc: string | null;
}

/**
 * `PUT` body. `overrideAmount` is required even when switching the override off (send the previous or the form value) so
 * the audit entry always records which amount the switch applied to.
 */
export interface UpdatePaymentAmountOverrideRequest {
  readonly isEnabled: boolean;
  readonly overrideAmount: number;
  readonly reason: string;
}

/** One row of the append-only audit log (`GET .../history`, newest first). */
export interface PaymentAmountOverrideEntry {
  readonly id: string;
  readonly isEnabled: boolean;
  readonly overrideAmount: number;
  readonly reason: string;
  readonly changedByUserId: string;
  readonly changedAtUtc: string;
}
