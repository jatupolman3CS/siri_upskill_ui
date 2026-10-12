import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorFile,
  phosphorFolderOpen,
  phosphorPackage,
  phosphorTimer,
} from '@ng-icons/phosphor-icons/regular';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

import {
  AssignmentItem,
  AssignmentSubmissionItem,
} from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';

type AssignmentState = 'loading' | 'no-assignment' | 'ready' | 'error';

@Component({
  selector: 'app-assignment-submission',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon, TranslatePipe],
  templateUrl: './assignment-submission.component.html',
  styleUrls: ['./assignment-submission.component.scss'],
  providers: [provideIcons({ phosphorFile, phosphorFolderOpen, phosphorPackage, phosphorTimer })],
})
export class AssignmentSubmissionComponent {
  private readonly learningApi = inject(LearningApiService);
  private readonly translation = inject(TranslationService);

  readonly episodeId = input<string | null>(null);
  readonly enrollmentId = input<string | null>(null);

  readonly state = signal<AssignmentState>('loading');
  readonly assignment = signal<AssignmentItem | null>(null);
  readonly submission = signal<AssignmentSubmissionItem | null>(null);
  readonly storageKey = signal('');
  readonly note = signal('');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  constructor() {
    // Reload whenever either input changes — mirrors the previous ngOnChanges behavior (see
    // quiz-taking.component.ts's identical pattern and its doc comment for why).
    effect(() => {
      this.episodeId();
      this.enrollmentId();
      this.loadAssignment();
    });
  }

  loadAssignment(): void {
    const episodeId = this.episodeId();
    if (!episodeId) {
      this.state.set('no-assignment');
      return;
    }

    this.state.set('loading');
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.learningApi.getAssignmentByEpisode(episodeId).subscribe({
      next: (assignment) => {
        if (!assignment) {
          this.state.set('no-assignment');
          return;
        }
        this.assignment.set(assignment);
        this.loadSubmission(assignment.id);
      },
      error: (err) => {
        if (err.status === 404) {
          this.state.set('no-assignment');
        } else {
          this.state.set('error');
          this.errorMessage.set(this.translation.t('learn.assignment.loadFailed'));
        }
      },
    });
  }

  private loadSubmission(assignmentId: string): void {
    this.learningApi.getMyAssignmentSubmission(assignmentId).subscribe({
      next: (sub) => {
        this.submission.set(sub);
        if (sub) {
          this.storageKey.set(sub.storageKey || '');
          this.note.set(sub.note || '');
        }
        this.state.set('ready');
      },
      error: () => {
        this.submission.set(null);
        this.state.set('ready');
      },
    });
  }

  submitAssignment(): void {
    const a = this.assignment();
    const enrollmentId = this.enrollmentId();
    if (!a || !enrollmentId) return;

    if (!this.storageKey().trim()) {
      this.errorMessage.set(this.translation.t('learn.assignment.storageKeyRequired'));
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.learningApi.submitAssignment({
      assignmentId: a.id,
      enrollmentId,
      storageKey: this.storageKey().trim(),
      note: this.note().trim() || null,
    }).subscribe({
      next: (sub) => {
        this.isSubmitting.set(false);
        this.submission.set(sub);
        this.successMessage.set(this.translation.t('learn.assignment.submitSuccess'));
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.detail || this.translation.t('learn.assignment.submitFailed'));
      },
    });
  }
}
