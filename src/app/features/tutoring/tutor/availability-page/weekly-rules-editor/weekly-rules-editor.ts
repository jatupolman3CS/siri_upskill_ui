import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorMoonStars, phosphorPlus, phosphorTrash } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { AvailabilityRule, TutorAvailability } from '../../../data/tutoring-availability.models';
import { TutoringAvailabilityApiService } from '../../../data/tutoring-availability-api.service';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import { weekdayLabelKey } from '../../../data/tutoring-labels';
import type { DayOfWeekIndex } from '../../../data/tutoring-public.models';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTimeSelect } from '../../../ui/tutor-time-select/tutor-time-select';
import {
  type DraftIssue,
  type DraftWeek,
  type DraftWindow,
  WEEK_DAYS,
  crossesMidnight,
  draftFromRules,
  emptyWeek,
  findDraftIssues,
  flattenDraft,
  minuteOfDay,
  ruleViolationKey,
  sameRules,
  timeChoices,
} from '../../tutor-availability.util';

const DEFAULT_START = '09:00';
const DEFAULT_END = '12:00';
const LAST_GRID_TIME = '23:30';
/** A new window starts where the last one ended, unless that is too late in the day to fit a useful block of lessons. */
const LATEST_FOLLOW_ON_START = 20 * 60;

/**
 * The weekly hours editor (P13-25): for each day of the week, any number of time windows in Thailand time. Built from native
 * selects and buttons - no drag interaction - so everything works from the keyboard and with a screen reader. The draft is
 * local until "Save": the whole set is replaced in one request (the server validates grid, order, overlap and counts, and names
 * the rule at fault by its position, which this component maps back to the row). A window whose end is not after its start
 * runs into the next day; the row says so.
 */
@Component({
  selector: 'app-weekly-rules-editor',
  imports: [NgIcon, TranslatePipe, Button, TutorProblem, TutorTimeSelect],
  templateUrl: './weekly-rules-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorMoonStars, phosphorPlus, phosphorTrash })],
  host: { class: 'block' },
})
export class WeeklyRulesEditor {
  private readonly api = inject(TutoringAvailabilityApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  /** The windows currently stored on the server. */
  readonly rules = input.required<readonly AvailabilityRule[]>();
  readonly maxRules = input.required<number>();
  readonly saved = output<TutorAvailability>();

  protected readonly days = WEEK_DAYS;
  protected readonly week = signal<DraftWeek>(emptyWeek());
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  /** Server `violation` per window key, from the last failed save; a window is cleared of it as soon as it is edited. */
  protected readonly serverIssues = signal<ReadonlyMap<string, string>>(new Map());
  private keyCounter = 0;

  private readonly flat = computed(() => flattenDraft(this.week()));
  protected readonly count = computed(() => this.flat().length);
  protected readonly clientIssues = computed(() => findDraftIssues(this.flat()));
  protected readonly dirty = computed(() =>
    !sameRules(
      this.flat().map((entry) => entry.rule),
      this.rules(),
    ),
  );
  protected readonly overLimit = computed(() => this.count() > this.maxRules());
  protected readonly canSave = computed(() => this.dirty() && !this.saving() && this.clientIssues().size === 0 && !this.overLimit());
  /** Times the pickers offer: the grid, plus any stored time that is off the grid so it stays selectable. */
  protected readonly choices = computed(() => timeChoices(this.flat().flatMap((entry) => [entry.rule.startLocal, entry.rule.endLocal])));

  constructor() {
    // (Re)load the draft whenever the stored set changes (first load, and after a successful save).
    effect(() => {
      const stored = this.rules();
      untracked(() => {
        this.week.set(draftFromRules(stored, () => this.newKey()));
        this.serverIssues.set(new Map());
      });
    });
  }

  private newKey(): string {
    return `w${this.keyCounter++}`;
  }

  protected dayLabelKey(day: number): string {
    return weekdayLabelKey(day as DayOfWeekIndex);
  }

  protected windows(day: number): readonly DraftWindow[] {
    return this.week()[day] ?? [];
  }

  protected crosses(window: DraftWindow): boolean {
    return crossesMidnight(window.start, window.end);
  }

  /** i18n key of the problem to show under a window (the server's word beats the page's own spotting), or `null`. */
  protected issueKey(window: DraftWindow): string | null {
    const server = this.serverIssues().get(window.key);
    if (server !== undefined) {
      return ruleViolationKey(server);
    }
    const local: DraftIssue | undefined = this.clientIssues().get(window.key);
    return local === undefined ? null : ruleViolationKey(local);
  }

  protected addWindow(day: number): void {
    const existing = this.windows(day);
    const lastEnd = existing.reduce((latest, window) => (window.end > latest ? window.end : latest), '');
    const followOn = lastEnd !== '' && minuteOfDay(lastEnd) <= LATEST_FOLLOW_ON_START;
    const start = followOn ? lastEnd : DEFAULT_START;
    const end = followOn ? this.addHours(start, 3) : DEFAULT_END;
    this.setDay(day, [...existing, { key: this.newKey(), start, end }]);
  }

  private addHours(time: string, hours: number): string {
    const minute = minuteOfDay(time) + hours * 60;
    return minute >= 24 * 60 ? LAST_GRID_TIME : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  }

  protected removeWindow(day: number, key: string): void {
    this.setDay(
      day,
      this.windows(day).filter((window) => window.key !== key),
    );
    this.clearServerIssue(key);
  }

  protected setTime(day: number, key: string, part: 'start' | 'end', value: string): void {
    this.setDay(
      day,
      this.windows(day).map((window) => (window.key === key ? { ...window, [part]: value } : window)),
    );
    this.clearServerIssue(key);
  }

  private setDay(day: number, windows: readonly DraftWindow[]): void {
    this.week.update((week) => ({ ...week, [day]: windows }));
    this.problem.set(null);
  }

  private clearServerIssue(key: string): void {
    if (this.serverIssues().has(key)) {
      this.serverIssues.update((issues) => new Map([...issues].filter(([k]) => k !== key)));
    }
  }

  protected discard(): void {
    this.week.set(draftFromRules(this.rules(), () => this.newKey()));
    this.serverIssues.set(new Map());
    this.problem.set(null);
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    const flat = this.flat();
    this.saving.set(true);
    this.problem.set(null);
    this.serverIssues.set(new Map());
    this.api.replaceRules({ rules: flat.map((entry) => entry.rule) }).subscribe({
      next: (availability) => {
        this.saving.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.availability.rules.saved'));
        this.saved.emit(availability);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const detail = tutoringProblemOf(error);
        if (tutoringReasonOf(error) === 'tutoring.availability_rule_invalid' && detail?.index !== undefined) {
          // The server names the rule by its position in the request - which is exactly `flat` - so the row can be marked.
          const target = flat[detail.index];
          if (target !== undefined) {
            this.serverIssues.set(new Map([[target.key, detail.violation ?? '']]));
          }
          this.problem.set(this.i18n.t(ruleViolationKey(detail.violation)));
          return;
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
