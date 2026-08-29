import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import {
  LearnerQuiz,
  LearnerQuizQuestion,
  QuizAttempt,
} from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';

type QuizState = 'loading' | 'no-quiz' | 'idle' | 'taking' | 'result' | 'error';

@Component({
  selector: 'app-quiz-taking',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './quiz-taking.component.html',
  styleUrls: ['./quiz-taking.component.scss'],
})
export class QuizTakingComponent implements OnChanges {
  private readonly learningApi = inject(LearningApiService);

  @Input() episodeId: string | null = null;
  @Input() enrollmentId: string | null = null;

  readonly state = signal<QuizState>('loading');
  readonly quiz = signal<LearnerQuiz | null>(null);
  readonly attempts = signal<QuizAttempt[]>([]);
  readonly currentAttempt = signal<QuizAttempt | null>(null);
  readonly selectedAnswers = signal<Record<string, string[]>>({});
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['episodeId'] || changes['enrollmentId']) {
      this.loadQuiz();
    }
  }

  loadQuiz(): void {
    if (!this.episodeId) {
      this.state.set('no-quiz');
      return;
    }

    this.state.set('loading');
    this.errorMessage.set(null);

    this.learningApi.getLearnerQuizByEpisode(this.episodeId).subscribe({
      next: (quiz) => {
        if (!quiz || !quiz.questions || quiz.questions.length === 0) {
          this.state.set('no-quiz');
          return;
        }
        this.quiz.set(quiz);
        this.loadAttempts(quiz.id);
      },
      error: (err) => {
        if (err.status === 404) {
          this.state.set('no-quiz');
        } else {
          this.state.set('error');
          this.errorMessage.set('ไม่สามารถโหลดแบบทดสอบได้');
        }
      },
    });
  }

  private loadAttempts(quizId: string): void {
    this.learningApi.getQuizAttemptsByQuiz(quizId).subscribe({
      next: (attempts) => {
        this.attempts.set(attempts);
        const lastSubmitted = attempts.filter((a) => a.submittedAtUtc).pop();
        if (lastSubmitted) {
          this.currentAttempt.set(lastSubmitted);
          this.state.set('result');
        } else {
          this.state.set('idle');
        }
      },
      error: () => {
        this.state.set('idle');
      },
    });
  }

  startAttempt(): void {
    const q = this.quiz();
    if (!q || !this.enrollmentId) return;

    this.isSubmitting.set(true);
    this.learningApi.startQuizAttempt(q.id, this.enrollmentId).subscribe({
      next: (attempt) => {
        this.isSubmitting.set(false);
        this.currentAttempt.set(attempt);
        this.selectedAnswers.set({});
        this.state.set('taking');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.detail || 'ไม่สามารถเริ่มทำแบบทดสอบได้');
      },
    });
  }

  selectOption(question: LearnerQuizQuestion, optionId: string): void {
    const current = { ...this.selectedAnswers() };
    const isSingle = question.type === 'SingleChoice' || question.type === 1;

    if (isSingle) {
      current[question.id] = [optionId];
    } else {
      const selected = current[question.id] || [];
      if (selected.includes(optionId)) {
        current[question.id] = selected.filter((id) => id !== optionId);
      } else {
        current[question.id] = [...selected, optionId];
      }
    }

    this.selectedAnswers.set(current);
  }

  isOptionSelected(questionId: string, optionId: string): boolean {
    const selected = this.selectedAnswers()[questionId] || [];
    return selected.includes(optionId);
  }

  submitAttempt(): void {
    const attempt = this.currentAttempt();
    const q = this.quiz();
    if (!attempt || !q) return;

    this.isSubmitting.set(true);
    const answersMap = this.selectedAnswers();

    // Save all answers sequentially or batch
    const saveAnswers = q.questions.map((question) => {
      const selected = answersMap[question.id] || [];
      return this.learningApi.answerQuizQuestion(attempt.id, question.id, selected);
    });

    // When all answered, submit
    Promise.all(saveAnswers.map((obs) => obs.toPromise()))
      .then(() => {
        this.learningApi.submitQuizAttempt(attempt.id).subscribe({
          next: (submittedAttempt) => {
            this.isSubmitting.set(false);
            this.currentAttempt.set(submittedAttempt);
            this.state.set('result');
            this.attempts.update((list) => [...list, submittedAttempt]);
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.errorMessage.set(err.error?.detail || 'เกิดข้อผิดพลาดในการส่งคำตอบ');
          },
        });
      })
      .catch((err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set('ไม่สามารถบันทึกคำตอบได้');
      });
  }

  canRetake(): boolean {
    const q = this.quiz();
    if (!q) return false;
    if (q.maxAttempts <= 0) return true;
    return this.attempts().length < q.maxAttempts;
  }
}
