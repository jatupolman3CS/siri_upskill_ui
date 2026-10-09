/**
 * Bank short codes offered when an instructor registers a payout account. The backend stores `bankCode` as a free
 * string (required, max 20) with no allow-list of its own and writes it verbatim into the admin transfer export, so the
 * list lives here: the standard Thai bank abbreviations. Display names are i18n keys
 * (`instructor.payoutAccount.banks.<CODE>`), never part of the value sent.
 */
export const PAYOUT_BANK_CODES = [
  'BBL',
  'KBANK',
  'KTB',
  'SCB',
  'BAY',
  'TTB',
  'GSB',
  'GHB',
  'BAAC',
  'UOB',
  'CIMBT',
  'KKP',
] as const;
