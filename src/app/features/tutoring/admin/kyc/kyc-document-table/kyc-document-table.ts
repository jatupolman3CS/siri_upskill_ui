import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { Guid } from '../../../data/tutoring-public.models';
import type { AdminKycDocument } from '../../data/admin-kyc.models';
import { kycDocumentStatusView } from '../../data/admin-labels';
import { AdminChip } from '../../ui/admin-chip';
import { type VerdictMap, formatBytes } from '../kyc-case.util';

export type Verdict = 'Approved' | 'Rejected';

/**
 * The documents of one KYC case (P13-26): what each is, how it was judged, when it is scheduled for deletion (PDPA retention),
 * whether the same file turned up on other tutors' accounts, and - while the case can still be decided - the reviewer's verdict
 * per pending document. Opening a file and its access log are events for the page; this component holds no state of its own.
 */
@Component({
  selector: 'app-kyc-document-table',
  imports: [TranslatePipe, BangkokDatePipe, AdminChip],
  templateUrl: './kyc-document-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycDocumentTable {
  readonly documents = input.required<readonly AdminKycDocument[]>();
  /** The case is `Submitted` / `InReview`: pending documents get verdict controls. */
  readonly decidable = input(false);
  readonly verdicts = input<VerdictMap>({});
  /** The document currently open in the viewer, if any. */
  readonly viewingId = input<Guid | null>(null);

  readonly viewDocument = output<AdminKycDocument>();
  readonly showLogs = output<AdminKycDocument>();
  readonly verdictChange = output<{ readonly documentId: Guid; readonly status: Verdict | null }>();

  protected readonly rows = computed(() =>
    this.documents().map((document) => ({
      document,
      size: formatBytes(document.sizeBytes),
      canJudge: this.decidable() && document.status === 'Pending' && !document.purged,
      verdict: this.verdicts()[document.documentId] ?? null,
    })),
  );

  protected readonly statusView = kycDocumentStatusView;
  protected readonly verdictOptions: readonly (Verdict | null)[] = [null, 'Approved', 'Rejected'];

  protected verdictKey(option: Verdict | null): string {
    return option === null ? 'tutoring.admin.kyc.verdict.undecided' : `tutoring.admin.kyc.verdict.${option}`;
  }

  protected choose(documentId: Guid, status: Verdict | null): void {
    this.verdictChange.emit({ documentId, status });
  }
}
