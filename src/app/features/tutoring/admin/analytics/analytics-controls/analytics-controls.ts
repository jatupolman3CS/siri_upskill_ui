import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import type { AnalyticsFilters } from '../../data/admin-analytics.util';
import {
  FUNNEL_SEGMENTS,
  GRANULARITIES,
  type RangeIssue,
  type ReportTab,
  TOP_COUNTS,
  TOP_TUTOR_SORTS,
  defaultRange,
  monthIssueOf,
  monthLabel,
  monthOptions,
  parseMonth,
  rangeIssueOf,
  rangeLimitOf,
} from '../../data/admin-analytics.util';

/** What the fields hold, as the strings they keep. */
interface ControlsValue {
  readonly from: string;
  readonly to: string;
  readonly fromMonth: string;
  readonly toMonth: string;
  readonly granularity: string;
  readonly segment: string;
  readonly sort: string;
  readonly top: string;
}

/** Quick periods ending today; each is within every report's limit. */
const PRESET_DAYS: readonly number[] = [7, 30, 90];

/**
 * The controls above the reports: the period (two dates, or two months for retention) with quick presets, and the one or two options each
 * report has (group by day / week / month; all, trial or paid bookings; how to rank tutors and how many). Selects apply at once; the dates
 * apply with the "Show" button, because a date field fires a change for every digit typed. A period is checked against the report's limits
 * (the same ones the server enforces) before it is sent, and a refused period is explained next to the fields - never sent and never
 * silently changed. Nothing here is computed from report data.
 */
@Component({
  selector: 'app-analytics-controls',
  imports: [ReactiveFormsModule, TranslatePipe, Button, InputField, SelectField],
  templateUrl: './analytics-controls.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AnalyticsControls {
  readonly tab = input.required<ReportTab>();
  readonly filters = input.required<AnalyticsFilters>();
  /** Today in Thailand (`yyyy-MM-dd`): the latest day a period may end on. */
  readonly today = input.required<string>();
  /** The change to put into the address bar. Only values that passed the checks are sent. */
  readonly apply = output<Partial<AnalyticsFilters>>();

  private readonly i18n = inject(TranslationService);

  protected readonly form = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    fromMonth: new FormControl('', { nonNullable: true }),
    toMonth: new FormControl('', { nonNullable: true }),
    granularity: new FormControl('Day', { nonNullable: true }),
    segment: new FormControl('All', { nonNullable: true }),
    sort: new FormControl('Completed', { nonNullable: true }),
    top: new FormControl('20', { nonNullable: true }),
  });
  protected readonly issue = signal<RangeIssue | null>(null);
  protected readonly issueText = computed(() => {
    const found = this.issue();
    if (found === null) {
      return null;
    }
    return found.code === 'tooLong'
      ? this.i18n.t(`tutoring.admin.analytics.range.tooLong.${found.unit}`, { max: found.max })
      : this.i18n.t(`tutoring.admin.analytics.range.${found.code}`);
  });

  protected readonly usesDates = computed(() => this.tab() === 'revenue' || this.tab() === 'search' || this.tab() === 'funnel' || this.tab() === 'tutors');
  protected readonly usesMonths = computed(() => this.tab() === 'retention');
  protected readonly usesTop = computed(() => this.tab() === 'search' || this.tab() === 'tutors');
  protected readonly presets = PRESET_DAYS;

  protected readonly granularityOptions = computed<SelectOption[]>(() => GRANULARITIES.map((value) => ({ value, label: this.i18n.t(`tutoring.admin.analytics.granularity.${value}`) })));
  protected readonly segmentOptions = computed<SelectOption[]>(() => FUNNEL_SEGMENTS.map((value) => ({ value, label: this.i18n.t(`tutoring.admin.analytics.segment.${value}`) })));
  protected readonly sortOptions = computed<SelectOption[]>(() => TOP_TUTOR_SORTS.map((value) => ({ value, label: this.i18n.t(`tutoring.admin.analytics.sort.${value}`) })));
  protected readonly topOptions = computed<SelectOption[]>(() => {
    const current = Number(this.filters().top);
    const counts = TOP_COUNTS.includes(current) ? TOP_COUNTS : [...TOP_COUNTS, current].sort((a, b) => a - b);
    return counts.map((count) => ({ value: String(count), label: this.i18n.t('tutoring.admin.analytics.topOption', { count }) }));
  });
  protected readonly monthChoices = computed<SelectOption[]>(() => {
    const locale = this.i18n.locale();
    const wanted = [this.filters().fromMonth, this.filters().toMonth];
    const months = [...monthOptions(this.today())];
    for (const month of wanted) {
      if (!months.includes(month)) {
        months.push(month);
      }
    }
    return months.sort().reverse().map((month) => ({ value: month, label: monthLabel(month, locale) }));
  });

  constructor() {
    // Whatever the address bar says is what the fields show (Back, a shared link, a preset); the person's unsent edits are replaced.
    effect(() => {
      const current = this.filters();
      this.form.setValue(
        {
          from: current.from,
          to: current.to,
          fromMonth: current.fromMonth,
          toMonth: current.toMonth,
          granularity: current.granularity,
          segment: current.segment,
          sort: current.sort,
          top: String(current.top),
        },
        { emitEvent: false },
      );
      this.issue.set(null);
    });
  }

  /** Checks the fields of the open report and, when they pass, hands them to the page. */
  protected submit(): void {
    const value = this.form.getRawValue();
    const tab = this.tab();
    if (this.usesMonths()) {
      const found = monthIssueOf(parseMonth(value.fromMonth), parseMonth(value.toMonth), this.today());
      this.issue.set(found);
      if (found === null) {
        this.apply.emit({ fromMonth: value.fromMonth, toMonth: value.toMonth });
      }
      return;
    }
    if (this.usesDates()) {
      const granularity = GRANULARITIES.find((candidate) => candidate === value.granularity) ?? 'Day';
      const found = rangeIssueOf(value.from, value.to, this.today(), rangeLimitOf(tab, granularity));
      this.issue.set(found);
      if (found !== null) {
        return;
      }
    }
    this.apply.emit(this.patchFor(tab, value));
  }

  /** A quick period ending today. */
  protected usePreset(days: number): void {
    const range = defaultRange(this.today(), days);
    this.form.patchValue(range, { emitEvent: false });
    this.submit();
  }

  private patchFor(tab: ReportTab, value: ControlsValue): Partial<AnalyticsFilters> {
    const dates = this.usesDates() ? { from: value.from, to: value.to } : {};
    switch (tab) {
      case 'revenue':
        return { ...dates, granularity: GRANULARITIES.find((candidate) => candidate === value.granularity) ?? 'Day' };
      case 'funnel':
        return { ...dates, segment: FUNNEL_SEGMENTS.find((candidate) => candidate === value.segment) ?? 'All' };
      case 'tutors':
        return { ...dates, sort: TOP_TUTOR_SORTS.find((candidate) => candidate === value.sort) ?? 'Completed', top: Number(value.top) };
      case 'search':
        return { ...dates, top: Number(value.top) };
      default:
        return dates;
    }
  }
}
