import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { isKycDisabled, tutoringAdminErrorKey } from '../data/admin-errors';
import { AdminKycApiService } from '../data/admin-kyc-api.service';
import type { AdminKycCaseDetail, AdminKycDocument } from '../data/admin-kyc.models';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { KycAccessLogDialog } from './kyc-access-log-dialog/kyc-access-log-dialog';
import { KycCaseSummary } from './kyc-case-summary/kyc-case-summary';
import { type VerdictMap, isDecidable } from './kyc-case.util';
import { KycDecisionPanel } from './kyc-decision-panel/kyc-decision-panel';
import { KycDocumentTable, type Verdict } from './kyc-document-table/kyc-document-table';
import { KycDocumentViewer } from './kyc-document-viewer/kyc-document-viewer';

/**
 * `/admin/tutoring/kyc/:caseId` - one identity-check case (P13-26): the tutor and consent facts, the documents (with the viewer
 * and the per-document access log) and the decision form. The case is the server's copy; a decision or "start review" replaces it
 * with the answer, and a stale-token / already-decided answer reloads it with a notice. The reviewer's pending verdicts live here
 * (not in the form) because the table collects them and the decision panel sends them. The file viewer is mounted only while a
 * document is open, so closing it (or leaving the page) destroys it and revokes the object URL.
 */
@Component({
  selector: 'app-admin-kyc-case-page',
  imports: [
    RouterLink,
    TranslatePipe,
    Button,
    EmptyState,
    Skeleton,
    AdminTutoringNav,
    KycAccessLogDialog,
    KycCaseSummary,
    KycDecisionPanel,
    KycDocumentTable,
    KycDocumentViewer,
  ],
  templateUrl: './admin-kyc-case-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKycCasePage {
  private readonly api = inject(AdminKycApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly caseId = computed(() => this.params().get('caseId') ?? '');

  private readonly caseResource = rxResource({
    params: () => this.caseId(),
    stream: ({ params }) => this.api.getCase(params),
  });
  protected readonly detail = linkedSignal<AdminKycCaseDetail | null>(() => (this.caseResource.hasValue() ? this.caseResource.value() : null));
  protected readonly verdicts = linkedSignal<string, VerdictMap>({ source: this.caseId, computation: () => ({}) });
  protected readonly viewing = signal<AdminKycDocument | null>(null);
  protected readonly logsFor = signal<AdminKycDocument | null>(null);
  protected readonly logsOpen = signal(false);
  protected readonly staleNotice = signal<string | null>(null);

  protected readonly isLoading = computed(() => this.caseResource.isLoading() && this.detail() === null);
  protected readonly isDisabled = computed(() => this.caseResource.status() === 'error' && isKycDisabled(this.caseResource.error()));
  protected readonly isMissing = computed(() => {
    const error = this.caseResource.error();
    return this.caseResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.caseResource.status() === 'error' && !this.isDisabled() && !this.isMissing());
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringAdminErrorKey(this.caseResource.error()) : 'tutoring.admin.common.loadErrorDescription'));
  protected readonly decidable = computed(() => {
    const current = this.detail();
    return current !== null && isDecidable(current.status);
  });

  constructor() {
    trackStudioMeta('tutoring.admin.kyc.casePageTitle', 'tutoring.admin.kyc.pageDescription', () => `/admin/tutoring/kyc/${this.caseId()}`);
  }

  protected openDocument(target: AdminKycDocument): void {
    this.viewing.set(target);
  }

  /** Closing the viewer hands focus back to the button that opened it. */
  protected closeViewer(): void {
    const closed = this.viewing();
    this.viewing.set(null);
    if (closed !== null) {
      afterNextRender(() => this.document.getElementById(`kyc-view-${closed.documentId}`)?.focus(), { injector: this.injector });
    }
  }

  protected openLogs(target: AdminKycDocument): void {
    this.logsFor.set(target);
    this.logsOpen.set(true);
  }

  protected setVerdict(change: { readonly documentId: string; readonly status: Verdict | null }): void {
    this.verdicts.update((current) => {
      const next = { ...current };
      if (change.status === null) {
        delete next[change.documentId];
      } else {
        next[change.documentId] = change.status;
      }
      return next;
    });
  }

  protected apply(updated: AdminKycCaseDetail): void {
    this.staleNotice.set(null);
    this.verdicts.set({});
    this.detail.set(updated);
  }

  protected reloadStale(message: string): void {
    this.staleNotice.set(message);
    this.verdicts.set({});
    this.viewing.set(null);
    this.caseResource.reload();
  }

  protected reload(): void {
    this.caseResource.reload();
  }
}
