import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCheckCircle,
  phosphorClockCounterClockwise,
  phosphorEnvelopeSimple,
  phosphorMagnifyingGlass,
  phosphorTag,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { ContactApiService } from '../../legal/data/contact-api.service';
import { ContactMessageItem } from '../../legal/data/contact-api.models';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Modal } from '../../../shared/modal/modal';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-admin-contact-messages-page',
  imports: [CommonModule, FormsModule, NgIcon, TranslatePipe, Modal, Spinner],
  templateUrl: './admin-contact-messages-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorEnvelopeSimple,
      phosphorCheckCircle,
      phosphorClockCounterClockwise,
      phosphorMagnifyingGlass,
      phosphorTag,
      phosphorXCircle,
    }),
  ],
})
export class AdminContactMessagesPage implements OnInit {
  private readonly contactApi = inject(ContactApiService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);

  protected readonly messages = signal<readonly ContactMessageItem[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly pageSize = 20;

  protected readonly statusFilter = signal<string>('All');
  protected readonly selectedMessage = signal<ContactMessageItem | null>(null);
  protected readonly resolveNotes = signal('');
  protected readonly isResolving = signal(false);

  constructor() {
    setPageMeta({
      title: this.translation.t('admin.contactMessages.pageTitle'),
      description: this.translation.t('admin.contactMessages.pageDescription'),
    });
  }

  ngOnInit(): void {
    this.loadMessages();
  }

  loadMessages(): void {
    this.isLoading.set(true);
    const filter = this.statusFilter();
    const status = filter === 'All' ? undefined : filter;

    this.contactApi.getAdminContactMessages(this.currentPage(), this.pageSize, status).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.messages.set(items);
        this.totalCount.set(res?.totalCount ?? items.length);
        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error(this.translation.t('admin.contactMessages.toast.loadFailed'));
        this.isLoading.set(false);
      },
    });
  }

  onFilterChange(status: string): void {
    this.statusFilter.set(status);
    this.currentPage.set(1);
    this.loadMessages();
  }

  openResolveModal(msg: ContactMessageItem): void {
    this.selectedMessage.set(msg);
    this.resolveNotes.set('');
  }

  closeModal(): void {
    this.selectedMessage.set(null);
    this.resolveNotes.set('');
  }

  submitResolve(): void {
    const msg = this.selectedMessage();
    if (!msg) return;

    this.isResolving.set(true);
    this.contactApi.resolveContactMessage(msg.id, this.resolveNotes().trim() || undefined).subscribe({
      next: () => {
        this.toast.success(this.translation.t('admin.contactMessages.toast.resolved'));
        this.isResolving.set(false);
        this.closeModal();
        this.loadMessages();
      },
      error: () => {
        this.toast.error(this.translation.t('admin.contactMessages.toast.updateFailed'));
        this.isResolving.set(false);
      },
    });
  }
}
