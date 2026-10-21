import { tutoringErrorKey, tutoringProblemOf } from '../../../data/tutoring-errors';

/** What was wrong with a refused identity-verification file - the `detail` of a `tutoring.kyc.file_rejected` problem (and nothing more: no offsets, no bytes). */
export type KycFileRejection = 'size' | 'type' | 'signature' | 'active_content';

const KYC_FILE_REJECTION_KEYS: Readonly<Record<KycFileRejection, string>> = {
  size: 'tutoring.kyc.upload.errorSize',
  type: 'tutoring.kyc.upload.errorType',
  signature: 'tutoring.kyc.upload.errorSignature',
  active_content: 'tutoring.kyc.upload.errorActiveContent',
};

/**
 * The category of a refused upload, or `null` when the failure is not a `tutoring.kyc.file_rejected` or names a category this client does not
 * know (a newer server). The category travels in the standard `detail` member of the problem body (P13-02): the controller promotes it from the
 * error's extension into `detail`, because an extension can not use that name - so the C# controller, not the contract's "ext key" wording, is the truth.
 */
export function kycFileRejectionOf(error: unknown): KycFileRejection | null {
  const problem = tutoringProblemOf(error);
  if (problem?.reason !== 'tutoring.kyc.file_rejected') {
    return null;
  }
  const detail = problem.detail;
  return typeof detail === 'string' && Object.hasOwn(KYC_FILE_REJECTION_KEYS, detail) ? (detail as KycFileRejection) : null;
}

/**
 * The i18n key that explains a failed identity-document upload: the specific reason when the server named one (too big, wrong type, the
 * bytes are not the type they claim, active content in the file), otherwise whatever {@link tutoringErrorKey} says. The `size` and `type`
 * texts use the `{{max}}` / `{{types}}` placeholders, which the uploader fills with the limits it was given. Lives with the uploader (a
 * tutor-portal screen) rather than in the shared error map: these texts belong to the tutor dictionary.
 */
export function kycUploadErrorKey(error: unknown): string {
  const rejection = kycFileRejectionOf(error);
  return rejection === null ? tutoringErrorKey(error) : KYC_FILE_REJECTION_KEYS[rejection];
}
