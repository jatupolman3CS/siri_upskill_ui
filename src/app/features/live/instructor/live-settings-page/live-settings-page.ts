import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCalendarCheck,
  phosphorCheckCircle,
  phosphorFilmStrip,
  phosphorGoogleLogo,
  phosphorInfo,
  phosphorLockKey,
  phosphorPlugs,
  phosphorPlugsConnected,
  phosphorWarning,
} from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Modal } from '../../../../shared/modal/modal';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { GoogleConnectService } from '../../data/google-connect.service';
import { LiveInstructorApiService } from '../../data/live-instructor-api.service';
import type { GoogleCallbackResult } from '../../data/live-instructor.models';
import { instructorProblemMessage, parseGoogleCallback } from '../../data/live-instructor.util';
import { recordingCardView } from '../../data/live-recording-import.util';
import { pollWhile } from '../poll-while';
import { trackStudioMeta } from '../studio-meta';

const PAGE_PATH = '/instructor/live-settings';

/**
 * An account connected before the Workspace check existed reports `Unknown`; the server resolves it (best effort) on a status
 * read. Read again a few times, then stop — a lookup that keeps failing must not turn into endless polling.
 */
const ACCOUNT_KIND_RECHECK_MS = 5_000;
const ACCOUNT_KIND_MAX_RECHECKS = 3;

type ViewState = 'notConfigured' | 'needsReconnect' | 'connected' | 'notConnected';

/**
 * `/instructor/live-settings` — the instructor's Google Calendar connection (appendix §A, FE-5). Reads the OAuth
 * callback's `?google=connected|error&reason=…`, toasts it, refetches the status and CLEARS the query from the URL so a
 * reload never replays the message.
 */
@Component({
  selector: 'app-live-settings-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Modal, Skeleton],
  templateUrl: './live-settings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCalendarCheck,
      phosphorCheckCircle,
      phosphorFilmStrip,
      phosphorGoogleLogo,
      phosphorInfo,
      phosphorLockKey,
      phosphorPlugs,
      phosphorPlugsConnected,
      phosphorWarning,
    }),
  ],
})
export class LiveSettingsPage {
  private readonly api = inject(LiveInstructorApiService);
  private readonly googleConnect = inject(GoogleConnectService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(TranslationService);

  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly statusResource = rxResource({ stream: () => this.api.getGoogleStatus() });

  protected readonly status = computed(() => (this.statusResource.hasValue() ? this.statusResource.value() : null));
  protected readonly isLoading = computed(() => this.statusResource.isLoading() && !this.statusResource.hasValue());
  protected readonly hasError = computed(() => !this.statusResource.hasValue() && this.statusResource.status() === 'error');

  protected readonly viewState = computed<ViewState | null>(() => {
    const status = this.status();
    if (!status) {
      return null;
    }
    if (!status.configured) {
      return 'notConfigured';
    }
    if (status.needsReconnect) {
      return 'needsReconnect';
    }
    return status.connected ? 'connected' : 'notConnected';
  });

  protected readonly revokedReasonText = computed(() => {
    const reason = this.status()?.revokedReason;
    return reason ? this.i18n.t(`live.google.revokedReason.${reason}`) : this.i18n.t('live.google.revokedReason.invalid_grant');
  });

  /** "Personal Google account" / "Google Workspace · example.com" / "Checking…"; `null` while not connected. */
  protected readonly accountKindText = computed(() => {
    const status = this.status();
    return status?.accountKind
      ? this.i18n.t(`live.recordingImport.accountKind.${status.accountKind}`, { domain: status.hostedDomain ?? '' })
      : null;
  });
  /** Which Recording card to show; only for a working connection (nothing can be changed until the instructor reconnects). */
  protected readonly recordingCard = computed(() => {
    const status = this.status();
    return this.viewState() === 'connected' ? recordingCardView(status?.recording ?? null, status?.accountKind ?? null) : null;
  });

  protected readonly connecting = signal(false);
  protected readonly disconnecting = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly enablingRecording = signal(false);
  private readonly kindRechecks = signal(0);

  constructor() {
    trackStudioMeta('live.google.pageTitle', 'live.google.pageDescription', () => PAGE_PATH);

    effect(() => {
      const result = parseGoogleCallback(this.queryParams());
      if (result) {
        untracked(() => this.handleCallback(result));
      }
    });

    pollWhile(
      () => this.status()?.accountKind === 'Unknown' && this.kindRechecks() < ACCOUNT_KIND_MAX_RECHECKS,
      () => {
        this.kindRechecks.update((count) => count + 1);
        this.statusResource.reload();
      },
      ACCOUNT_KIND_RECHECK_MS,
    );
  }

  /** The optional second Google consent (read Meet recordings). Redirects like the calendar connect. */
  protected enableRecording(): void {
    if (this.enablingRecording()) {
      return;
    }
    this.enablingRecording.set(true);
    // On success the window navigates to Google; the flag stays set so the button cannot be double-clicked.
    this.googleConnect.startRecordingAccess(PAGE_PATH).subscribe({
      error: (error: unknown) => {
        this.enablingRecording.set(false);
        const message = instructorProblemMessage(error);
        this.toast.error(this.i18n.t(message.key, message.params));
        // 409 = the feature was switched off / the account is not Workspace: show what the server says now.
        this.statusResource.reload();
      },
    });
  }

  protected retry(): void {
    this.statusResource.reload();
  }

  protected connect(): void {
    if (this.connecting()) {
      return;
    }
    this.connecting.set(true);
    // On success the window navigates to Google; `connecting` stays set so the button cannot be double-clicked.
    this.googleConnect.start(PAGE_PATH).subscribe({
      error: (error: unknown) => {
        this.connecting.set(false);
        const message = instructorProblemMessage(error);
        this.toast.error(this.i18n.t(message.key, message.params));
        // A 503 means the server is not configured (or lost its config) — refresh so the page shows the right state.
        this.statusResource.reload();
      },
    });
  }

  protected openDisconnect(): void {
    this.confirmOpen.set(true);
  }

  protected disconnect(): void {
    if (this.disconnecting()) {
      return;
    }
    this.disconnecting.set(true);
    this.api.disconnectGoogle().subscribe({
      next: () => {
        this.disconnecting.set(false);
        this.confirmOpen.set(false);
        this.toast.success(this.i18n.t('live.google.toast.disconnected'));
        this.statusResource.reload();
      },
      error: (error: unknown) => {
        this.disconnecting.set(false);
        const message = instructorProblemMessage(error);
        this.toast.error(this.i18n.t(message.key, message.params));
      },
    });
  }

  private handleCallback(result: GoogleCallbackResult): void {
    // Both consents come back as `?google=connected`; the marker left by `enableRecording()` tells them apart.
    const recordingConsent = this.googleConnect.consumeRecordingAccessPending();
    if (result.outcome === 'connected') {
      this.toast.success(this.i18n.t(recordingConsent ? 'live.recordingImport.toast.enabled' : 'live.google.toast.connected'));
    } else {
      this.toast.error(this.i18n.t(`live.google.callbackError.${result.reason ?? 'unknown'}`));
    }
    // A fresh page load is already fetching the status; only an in-app navigation needs an explicit refetch.
    if (!this.statusResource.isLoading()) {
      this.statusResource.reload();
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { google: null, reason: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
