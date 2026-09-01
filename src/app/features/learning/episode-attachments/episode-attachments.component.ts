import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { EpisodeAttachmentItem } from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';

@Component({
  selector: 'app-episode-attachments',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './episode-attachments.component.html',
  styleUrls: ['./episode-attachments.component.scss'],
})
export class EpisodeAttachmentsComponent {
  private readonly learningApi = inject(LearningApiService);

  readonly episodeId = input<string | null>(null);

  readonly attachments = signal<EpisodeAttachmentItem[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.episodeId();
      this.loadAttachments();
    });
  }

  loadAttachments(): void {
    const episodeId = this.episodeId();
    if (!episodeId) {
      this.attachments.set([]);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.learningApi.getEpisodeAttachments(episodeId).subscribe({
      next: (items) => {
        this.isLoading.set(false);
        this.attachments.set(items || []);
      },
      error: () => {
        this.isLoading.set(false);
        this.attachments.set([]);
      },
    });
  }

  download(att: EpisodeAttachmentItem): void {
    const episodeId = this.episodeId();
    if (!episodeId) return;

    this.learningApi.downloadEpisodeAttachment(episodeId, att.id).subscribe({
      next: (info) => {
        window.open(info.downloadUrl, '_blank');
      },
      error: (err) => {
        this.errorMessage.set(err.error?.detail || 'คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้');
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
