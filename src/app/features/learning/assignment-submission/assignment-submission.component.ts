import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import {
  AssignmentItem,
  AssignmentSubmissionItem,
} from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';

type AssignmentState = 'loading' | 'no-assignment' | 'ready' | 'error';

@Component({
  selector: 'app-assignment-submission',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './assignment-submission.component.html',
  styleUrls: ['./assignment-submission.component.scss'],
})
export class AssignmentSubmissionComponent {
  private readonly learningApi = inject(LearningApiService);

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
          this.errorMessage.set('ไม่สามารถโหลดการบ้านได้');
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
      this.errorMessage.set('กรุณาระบุลิงก์หรือที่จัดเก็บไฟล์งาน');
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
        this.successMessage.set('ส่งงานเรียบร้อยแล้ว');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.detail || 'ไม่สามารถส่งงานได้ กรุณาลองใหม่อีกครั้ง');
      },
    });
  }
}
