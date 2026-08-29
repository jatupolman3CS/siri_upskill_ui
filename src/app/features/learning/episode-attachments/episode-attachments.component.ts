import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
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
export class EpisodeAttachmentsComponent implements OnChanges {
  private readonly learningApi = inject(LearningApiService);

  @Input() episodeId: string | null = null;

  readonly attachments = signal<EpisodeAttachmentItem[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['episodeId']) {
      this.loadAttachments();
    }
  }

  loadAttachments(): void {
    if (!this.episodeId) {
      this.attachments.set([]);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.learningApi.getEpisodeAttachments(this.episodeId).subscribe({
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
    if (!this.episodeId) return;

    this.learningApi.downloadEpisodeAttachment(this.episodeId, att.id).subscribe({
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
