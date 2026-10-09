/**
 * The public contact mailboxes printed on the contact, privacy-policy and refund-policy pages — one
 * place to change them, instead of the same literals repeated across templates.
 *
 * UNVERIFIED: nothing in this repo or its docs provisions these mailboxes (the backend's
 * `Notification:Contact:SupportEmail` is deliberately empty, and the production host is not
 * `siriupskill.com` yet). The project owner must confirm that each address exists and is monitored
 * before launch, or replace them here.
 */
export const LEGAL_CONTACT_EMAILS = {
  support: 'support@siriupskill.com',
  dpo: 'dpo@siriupskill.com',
  business: 'business@siriupskill.com',
} as const;
