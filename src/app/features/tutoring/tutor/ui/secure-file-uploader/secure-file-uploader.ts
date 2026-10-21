import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorLockKey, phosphorUploadSimple } from '@ng-icons/phosphor-icons/regular';
import type { Observable, Subscription } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { extensionOf } from '../../../data/tutoring-kyc-api.service';
import type { KycUploadEvent } from '../../../data/tutoring-kyc.models';
import { kycUploadErrorKey } from './kyc-upload-error';

type Stage = 'idle' | 'uploading' | 'done' | 'failed';

/** Starts the upload of one file; the file never leaves the closure of this call. Unsubscribing must abort the request. */
export type SecureUploadFn = (file: File, expiresOn: string | null) => Observable<KycUploadEvent>;

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * Upload slot for ONE sensitive document (identity card, diploma, criminal-record certificate ...). Built for files that must
 * never be shown back or leaked, so by design it:
 *
 * - never displays, stores or logs the file name or contents - there is no preview and no "selected file" label, only the
 *   slot's own title, a progress bar and the outcome;
 * - never keeps the `File` after the request has been started (it lives only in the upload closure) and clears the native
 *   input's value straight after the pick, so the browser does not hold on to the choice either;
 * - aborts the request and drops every reference when the component is destroyed (leaving the page mid-upload);
 * - checks type and size before sending, purely as a courtesy - the server re-checks the real content (magic bytes) and
 *   its answer is final.
 *
 * It does not know what the upload is for: the parent passes `upload`, and refreshes its own view on `uploaded`.
 */
@Component({
  selector: 'app-secure-file-uploader',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, InputField],
  templateUrl: './secure-file-uploader.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorLockKey, phosphorUploadSimple })],
  host: { class: 'block' },
})
export class SecureFileUploader {
  private readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Already-translated title of the slot, e.g. the document type. It is also what assistive technology hears on the button. */
  readonly title = input.required<string>();
  readonly upload = input.required<SecureUploadFn>();
  /** Extensions with their dot, as the server reports them (`.pdf`, `.jpg` ...). */
  readonly allowedExtensions = input.required<readonly string[]>();
  readonly maxBytes = input.required<number>();
  /** Offer the optional "document expires on" date (sent as `yyyy-MM-dd`). */
  readonly withExpiry = input(false);
  readonly disabled = input(false);

  /** Emitted once the server has stored the document. */
  readonly uploaded = output<void>();

  protected readonly expiry = new FormControl('', { nonNullable: true });
  protected readonly stage = signal<Stage>('idle');
  protected readonly percent = signal(0);
  private readonly errorKey = signal<string | null>(null);
  private subscription: Subscription | null = null;

  protected readonly busy = computed(() => this.stage() === 'uploading');
  protected readonly accept = computed(() => this.allowedExtensions().join(','));
  protected readonly errorText = computed(() => {
    const key = this.errorKey();
    if (key === null) {
      return null;
    }
    return this.i18n.t(key, { max: Math.floor(this.maxBytes() / BYTES_PER_MEGABYTE), types: this.allowedExtensions().join(', ') });
  });

  constructor() {
    // Disable the date field through the form control (a `[disabled]` binding next to `[formControl]` is discouraged by Angular).
    effect(() => {
      const locked = this.busy() || this.disabled();
      untracked(() => (locked ? this.expiry.disable({ emitEvent: false }) : this.expiry.enable({ emitEvent: false })));
    });
    this.destroyRef.onDestroy(() => {
      this.subscription?.unsubscribe();
      this.subscription = null;
    });
  }

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    // Drop the browser's own reference straight away; the File is only used for the checks below and the request.
    input.value = '';
    if (file === null || this.busy() || this.disabled()) {
      return;
    }

    const problem = this.precheck(file);
    if (problem !== null) {
      this.stage.set('failed');
      this.errorKey.set(problem);
      return;
    }

    this.stage.set('uploading');
    this.percent.set(0);
    this.errorKey.set(null);
    const expiresOn = this.expiry.value.trim() || null;

    this.subscription?.unsubscribe();
    this.subscription = this.upload()(file, expiresOn).subscribe({
      next: (progress) => {
        if (progress.type === 'progress') {
          this.percent.set(progress.percent);
        } else {
          this.percent.set(100);
          this.stage.set('done');
          this.expiry.reset('');
          this.uploaded.emit();
        }
      },
      error: (error: unknown) => {
        this.stage.set('failed');
        this.errorKey.set(kycUploadErrorKey(error));
      },
    });
  }

  /** Courtesy checks. The first failing one wins; `null` = looks fine. */
  private precheck(file: File): string | null {
    if (file.size === 0) {
      return 'tutoring.kyc.upload.errorEmpty';
    }
    if (file.size > this.maxBytes()) {
      return 'tutoring.kyc.upload.errorSize';
    }
    return this.allowedExtensions().includes(extensionOf(file.name)) ? null : 'tutoring.kyc.upload.errorType';
  }
}
