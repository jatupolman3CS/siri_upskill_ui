import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorFileText, phosphorLockKey, phosphorTrash } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import { TutoringKycApiService } from '../../../data/tutoring-kyc-api.service';
import type { KycCase, KycDocument, KycDocumentType, TutorKycStatus } from '../../../data/tutoring-kyc.models';
import {
  KYC_DOCUMENT_TYPES,
  kycDocumentStatusLabelKey,
  kycDocumentStatusTone,
  kycDocumentTypeLabelKey,
  readinessBlockerKey,
} from '../../../data/tutoring-tutor-labels';
import { SecureFileUploader, type SecureUploadFn } from '../../ui/secure-file-uploader/secure-file-uploader';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/** Document types whose papers carry an expiry date worth recording (the server reminds the tutor before it passes). */
const TYPES_WITH_EXPIRY: ReadonlySet<KycDocumentType> = new Set<KycDocumentType>(['IdCard', 'CriminalRecord', 'Certificate']);

/**
 * Steps 2-3 of identity verification: upload the required papers, then send the case for review. Only a `Draft` or
 * `NeedsInfo` case is editable; once it is submitted this shows the documents read-only.
 *
 * Privacy is the design constraint: a document goes up and never comes back. The list shows what each paper is, when it was
 * sent and how the reviewers judged it - never a name, a thumbnail or a link, because the API offers none to a tutor.
 */
@Component({
  selector: 'app-kyc-documents-step',
  imports: [NgTemplateOutlet, NgIcon, BangkokDatePipe, TranslatePipe, Button, Modal, SecureFileUploader, TutorProblem],
  templateUrl: './kyc-documents-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorFileText, phosphorLockKey, phosphorTrash })],
  host: { class: 'block' },
})
export class KycDocumentsStep {
  private readonly api = inject(TutoringKycApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly kycCase = input.required<KycCase>();
  readonly status = input.required<TutorKycStatus>();
  /** A document was added / removed or the case was submitted: the owner reloads the status. */
  readonly changed = output<void>();

  protected readonly editable = computed(() => this.kycCase().status === 'Draft' || this.kycCase().status === 'NeedsInfo');
  protected readonly requiredTypes = computed(() => this.status().requiredDocumentTypes);
  protected readonly optionalTypes = computed(() => KYC_DOCUMENT_TYPES.filter((type) => !this.requiredTypes().includes(type)));
  /** Required types that still have no stored document. */
  protected readonly missingTypes = computed(() => this.requiredTypes().filter((type) => this.documentsOf(type).every((doc) => doc.purged)));
  protected readonly canSubmit = computed(() => this.editable() && this.missingTypes().length === 0);

  protected readonly submitting = signal(false);
  protected readonly problem = signal<string | null>(null);
  /** Names of the things the server said are still missing, shown beneath the generic message. */
  protected readonly problemDetails = signal<readonly string[]>([]);
  protected readonly toDelete = signal<KycDocument | null>(null);
  protected readonly deleting = signal(false);

  protected readonly typeLabelKey = kycDocumentTypeLabelKey;
  protected readonly statusLabelKey = kycDocumentStatusLabelKey;
  protected readonly statusTone = kycDocumentStatusTone;
  protected readonly withExpiry = (type: KycDocumentType): boolean => TYPES_WITH_EXPIRY.has(type);

  /** One stable upload function per type, so the uploader's `upload` input does not change on every render. */
  private readonly uploaders = new Map<KycDocumentType, SecureUploadFn>();

  protected documentsOf(type: KycDocumentType): readonly KycDocument[] {
    return this.kycCase().documents.filter((doc) => doc.type === type);
  }

  protected uploaderFor(type: KycDocumentType): SecureUploadFn {
    let upload = this.uploaders.get(type);
    if (upload === undefined) {
      upload = (file, expiresOn) => this.api.uploadDocument(this.kycCase().caseId, type, file, expiresOn);
      this.uploaders.set(type, upload);
    }
    return upload;
  }

  protected canRemove(doc: KycDocument): boolean {
    return this.editable() && doc.status !== 'Approved' && !doc.purged;
  }

  protected confirmRemove(): void {
    const doc = this.toDelete();
    if (doc === null || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteDocument(this.kycCase().caseId, doc.documentId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.success(this.i18n.t('tutoring.kyc.documents.removed'));
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.error(this.i18n.t(tutoringErrorKey(error)));
        this.changed.emit();
      },
    });
  }

  protected submit(): void {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    this.problemDetails.set([]);
    this.api.submitCase(this.kycCase().caseId).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success(this.i18n.t('tutoring.kyc.documents.submitted'));
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        this.problemDetails.set(this.detailsOf(error));
        if (tutoringReasonOf(error) === 'tutoring.concurrent_update') {
          this.changed.emit();
        }
      },
    });
  }

  /** The missing document types / profile blockers the server named, as translated labels. */
  private detailsOf(error: unknown): readonly string[] {
    const body = tutoringProblemOf(error);
    switch (tutoringReasonOf(error)) {
      case 'tutoring.kyc.documents_missing':
        return (body?.missingTypes ?? [])
          .filter((type): type is KycDocumentType => (KYC_DOCUMENT_TYPES as readonly string[]).includes(type))
          .map((type) => this.i18n.t(kycDocumentTypeLabelKey(type)));
      case 'tutoring.kyc.profile_incomplete':
        return (body?.blockers ?? []).map((code) => this.i18n.t(readinessBlockerKey(code)));
      default:
        return [];
    }
  }
}
