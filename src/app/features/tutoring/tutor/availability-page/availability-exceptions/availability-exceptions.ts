import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorTrash } from '@ng-icons/phosphor-icons/regular';
import { map, startWith } from 'rxjs';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../../shared/input/input';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { AvailabilityException } from '../../../data/tutoring-availability.models';
import { TutoringAvailabilityApiService } from '../../../data/tutoring-availability-api.service';
import { tutoringErrorKey, tutoringProblemOf } from '../../../data/tutoring-errors';
import { bangkokDateOf } from '../../../data/tutor-slots.util';
import { FieldFeedback, focusFirstInvalid } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import {
  EXCEPTION_CHOICES,
  EXCEPTION_NOTE_MAX,
  type ExceptionChoice,
  type ExceptionField,
  type ExceptionFormValue,
  exceptionChoiceOf,
  exceptionRequest,
  exceptionViolationField,
  localDateToInstant,
  needsTimes,
  timeChoices,
  validateException,
} from '../../tutor-availability.util';

/**
 * One-off changes to the weekly hours (P13-25): close a whole day or part of one (holiday, exam week), or open extra hours on
 * a day. Listed soonest first, paged; adding one is a small form whose mistakes are shown on the field; deleting one is a
 * single button (the day goes back to the weekly rule). An exception cannot cross midnight - a closure over two days is two
 * exceptions - and a day cannot be both closed and opened; the server enforces both and names the field it objects to.
 */
@Component({
  selector: 'app-availability-exceptions',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, InputField, Pagination, SelectField, Skeleton, TutorProblem],
  templateUrl: './availability-exceptions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorTrash })],
  host: { class: 'block' },
})
export class AvailabilityExceptions {
  private readonly api = inject(TutoringAvailabilityApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  /** Fires after an exception was added or removed (the "what learners see" preview refreshes on it). */
  readonly changed = output<void>();

  protected readonly page = signal(1);
  private readonly listResource = rxResource({
    params: () => this.page(),
    stream: ({ params }) => this.api.listExceptions(params),
  });
  protected readonly items = computed<readonly AvailabilityException[]>(() => (this.listResource.hasValue() ? this.listResource.value().items : []));
  protected readonly totalPages = computed(() => (this.listResource.hasValue() ? this.listResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.listResource.hasValue() ? this.listResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.listResource.isLoading() && !this.listResource.hasValue());
  protected readonly hasError = computed(() => this.listResource.status() === 'error');

  protected readonly noteMax = EXCEPTION_NOTE_MAX;
  /** Today in Bangkok: the earliest date an exception may have (the server uses the same day). */
  private readonly today = bangkokDateOf(Date.now());
  protected readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    choice: new FormControl<ExceptionChoice>('closedAllDay', { nonNullable: true }),
    start: new FormControl('', { nonNullable: true }),
    end: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });
  protected readonly raw = toSignal<ExceptionFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateException(this.raw(), this.today));
  protected readonly feedback = new FieldFeedback<ExceptionField>();
  private readonly serverRejected = signal<ReadonlySet<ExceptionField>>(new Set());
  protected readonly showTimes = computed(() => needsTimes(this.raw().choice));
  protected readonly adding = signal(false);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly problem = signal<string | null>(null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected readonly choiceOptions = computed<readonly SelectOption[]>(() =>
    EXCEPTION_CHOICES.map((choice) => ({ value: choice, label: this.i18n.t(`tutoring.tutor.availability.exceptions.choice.${choice}`) })),
  );
  protected readonly timeOptions = computed<readonly SelectOption[]>(() => timeChoices().map((time) => ({ value: time, label: time })));
  /** An exception cannot end at midnight (the server refuses an end that is not after the start, on the same day): the latest end is 23:30. */
  protected readonly endOptions = computed<readonly SelectOption[]>(() => this.timeOptions().filter((option) => option.value !== '00:00'));

  protected instantOf(item: AvailabilityException): string {
    return localDateToInstant(item.dateLocal);
  }

  protected choiceOf(item: AvailabilityException): ExceptionChoice {
    return exceptionChoiceOf(item);
  }

  protected message(field: ExceptionField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected reload(): void {
    this.listResource.reload();
  }

  protected add(): void {
    if (this.adding()) {
      return;
    }
    this.feedback.attempt();
    this.serverRejected.set(new Set());
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }

    this.adding.set(true);
    this.problem.set(null);
    this.api.addException(exceptionRequest(this.raw())).subscribe({
      next: () => {
        this.adding.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.availability.exceptions.added'));
        this.form.reset({ date: '', choice: 'closedAllDay', start: '', end: '', note: '' });
        this.feedback.reset();
        this.page.set(1);
        this.listResource.reload();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.adding.set(false);
        const field = exceptionViolationField(tutoringProblemOf(error)?.violation);
        if (field !== null) {
          this.serverRejected.set(new Set([field]));
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      },
    });
  }

  protected remove(item: AvailabilityException): void {
    if (this.deletingId() !== null) {
      return;
    }
    this.deletingId.set(item.exceptionId);
    this.problem.set(null);
    this.api.deleteException(item.exceptionId).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success(this.i18n.t('tutoring.tutor.availability.exceptions.removed'));
        // The last row of a later page just went: step back instead of showing an empty page.
        if (this.items().length === 1 && this.page() > 1) {
          this.page.update((current) => current - 1);
        } else {
          this.listResource.reload();
        }
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

}
