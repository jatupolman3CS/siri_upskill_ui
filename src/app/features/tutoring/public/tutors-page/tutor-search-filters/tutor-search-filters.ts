import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { merge } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { SelectField, SelectOption } from '../../../../../shared/select/select';
import {
  SESSION_FORMATS,
  TUTOR_CURRICULA,
  TUTOR_GENDERS,
  TUTOR_LEVELS,
  WEEKDAYS_MONDAY_FIRST,
} from '../../../data/tutor-search-query.util';
import {
  curriculumLabelKey,
  formatLabelKey,
  genderLabelKey,
  levelLabelKey,
  localizedName,
  weekdayLabelKey,
} from '../../../data/tutoring-labels';
import type {
  DayOfWeekIndex,
  PublicSubjectItem,
  SessionFormat,
  TutorCurriculum,
  TutorGender,
  TutorLevel,
  TutorSearchFacets,
  TutorSearchQuery,
} from '../../../data/tutoring-public.models';

/** Indents a child subject under its group inside a native `<select>` (which cannot nest options). */
const CHILD_INDENT = '   ';

/**
 * The filter panel of `/tutors`. It owns no data and no navigation: the page hands it the URL's current query, the facets
 * and the subject list, and gets a complete next `TutorSearchQuery` back through `filtersChange`.
 * <para>
 * Two interaction models on purpose. Selects (subject, level, curriculum, format, gender) apply the moment they change -
 * one decision, one result. The typed groups (price range, day + time window) apply on their own button, because a
 * half-typed price must not fire a request per keystroke and `day`/`from`/`to` are only valid as a set (the server answers
 * 400 for a partial set). Their problems are shown on the offending field, before anything is sent.
 * </para>
 * <para>
 * The form is fed from the URL by one `effect` with `emitEvent: false`, never the other way through that same path, so
 * pressing Back repopulates the controls without re-triggering a navigation (same rule as `CoursesPage`).
 * </para>
 */
@Component({
  selector: 'app-tutor-search-filters',
  imports: [ReactiveFormsModule, TranslatePipe, SelectField, InputField, Button],
  templateUrl: './tutor-search-filters.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TutorSearchFilters {
  readonly query = input.required<TutorSearchQuery>();
  readonly facets = input<TutorSearchFacets | null>(null);
  readonly subjects = input<readonly PublicSubjectItem[]>([]);
  /** Any filter active - enables the "clear all" action. */
  readonly canClear = input(false);

  readonly filtersChange = output<TutorSearchQuery>();
  readonly cleared = output<void>();

  private readonly translation = inject(TranslationService);

  protected readonly form = new FormGroup({
    subject: new FormControl('', { nonNullable: true }),
    level: new FormControl('', { nonNullable: true }),
    curriculum: new FormControl('', { nonNullable: true }),
    format: new FormControl('', { nonNullable: true }),
    gender: new FormControl('', { nonNullable: true }),
    priceMin: new FormControl('', { nonNullable: true }),
    priceMax: new FormControl('', { nonNullable: true }),
    day: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  protected readonly priceError = signal<string | null>(null);
  protected readonly timeError = signal<string | null>(null);

  protected readonly subjectOptions = computed<SelectOption[]>(() => {
    const locale = this.translation.locale();
    const all = this.subjects();
    const options: SelectOption[] = [{ value: '', label: this.translation.t('tutoring.public.search.filters.subjectAny') }];
    for (const group of all.filter((subject) => subject.parentSlug === null)) {
      options.push({ value: group.slug, label: localizedName(group, locale) });
      for (const child of all.filter((subject) => subject.parentSlug === group.slug)) {
        options.push({ value: child.slug, label: `${CHILD_INDENT}${localizedName(child, locale)}` });
      }
    }
    const active = this.query().subject;
    if (active && !options.some((option) => option.value === active)) {
      options.push({ value: active, label: active });
    }
    return options;
  });

  protected readonly levelOptions = computed(() =>
    this.enumOptions<TutorLevel>('level', TUTOR_LEVELS, levelLabelKey, (facets, value) => facets.levels.find((f) => f.level === value)?.count),
  );
  protected readonly curriculumOptions = computed(() =>
    this.enumOptions<TutorCurriculum>('curriculum', TUTOR_CURRICULA, curriculumLabelKey, (facets, value) => facets.curricula.find((f) => f.curriculum === value)?.count),
  );
  protected readonly formatOptions = computed(() =>
    this.enumOptions<SessionFormat>('format', SESSION_FORMATS, formatLabelKey, (facets, value) => facets.formats.find((f) => f.format === value)?.count),
  );
  protected readonly genderOptions = computed(() =>
    this.enumOptions<TutorGender>('gender', TUTOR_GENDERS, genderLabelKey, (facets, value) => facets.genders.find((f) => f.gender === value)?.count),
  );

  protected readonly dayOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.translation.t('tutoring.public.search.filters.dayAny') },
    ...WEEKDAYS_MONDAY_FIRST.map((day) => ({ value: String(day), label: this.translation.t(weekdayLabelKey(day)) })),
  ]);

  constructor() {
    effect(() => {
      const q = this.query();
      this.form.setValue(
        {
          subject: q.subject ?? '',
          level: q.level ?? '',
          curriculum: q.curriculum ?? '',
          format: q.format ?? '',
          gender: q.gender ?? '',
          priceMin: q.priceMin !== undefined ? String(q.priceMin) : '',
          priceMax: q.priceMax !== undefined ? String(q.priceMax) : '',
          day: q.day !== undefined ? String(q.day) : '',
          from: q.from ?? '',
          to: q.to ?? '',
        },
        { emitEvent: false },
      );
      this.priceError.set(null);
      this.timeError.set(null);
    });

    const c = this.form.controls;
    merge(c.subject.valueChanges, c.level.valueChanges, c.curriculum.valueChanges, c.format.valueChanges, c.gender.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applySelects());
  }

  /** Builds the next query: keeps q / sort and the committed price + time window, replaces the five selects. */
  private applySelects(): void {
    const v = this.form.getRawValue();
    this.filtersChange.emit(
      this.next({
        subject: v.subject || undefined,
        level: (v.level || undefined) as TutorLevel | undefined,
        curriculum: (v.curriculum || undefined) as TutorCurriculum | undefined,
        format: (v.format || undefined) as SessionFormat | undefined,
        gender: (v.gender || undefined) as TutorGender | undefined,
      }),
    );
  }

  protected applyPrice(): void {
    const { priceMin, priceMax } = this.form.getRawValue();
    const min = priceMin.trim() === '' ? undefined : Number(priceMin);
    const max = priceMax.trim() === '' ? undefined : Number(priceMax);
    const invalid = (value: number | undefined): boolean => value !== undefined && (!Number.isFinite(value) || value < 0);
    if (invalid(min) || invalid(max)) {
      this.priceError.set(this.translation.t('tutoring.public.search.filters.errors.priceInvalid'));
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      this.priceError.set(this.translation.t('tutoring.public.search.filters.errors.priceRange'));
      return;
    }
    this.priceError.set(null);
    this.filtersChange.emit(this.next({ priceMin: min, priceMax: max }));
  }

  protected applyTime(): void {
    const { day, from, to } = this.form.getRawValue();
    const filled = [day, from, to].filter((value) => value !== '').length;
    if (filled > 0 && filled < 3) {
      this.timeError.set(this.translation.t('tutoring.public.search.filters.errors.timeIncomplete'));
      return;
    }
    if (filled === 3 && from >= to) {
      this.timeError.set(this.translation.t('tutoring.public.search.filters.errors.timeRange'));
      return;
    }
    this.timeError.set(null);
    this.filtersChange.emit(
      this.next(filled === 3 ? { day: Number(day) as DayOfWeekIndex, from, to } : { day: undefined, from: undefined, to: undefined }),
    );
  }

  protected clearAll(): void {
    this.cleared.emit();
  }

  /** The current query without its page (any filter change returns to page 1), overlaid with the given changes. */
  private next(changes: Partial<TutorSearchQuery>): TutorSearchQuery {
    const current = this.query();
    return {
      q: current.q,
      sort: current.sort,
      subject: current.subject,
      level: current.level,
      curriculum: current.curriculum,
      format: current.format,
      gender: current.gender,
      priceMin: current.priceMin,
      priceMax: current.priceMax,
      day: current.day,
      from: current.from,
      to: current.to,
      ...changes,
    };
  }

  private enumOptions<T extends string>(
    name: string,
    values: readonly T[],
    labelKey: (value: T) => string,
    countOf: (facets: TutorSearchFacets, value: T) => number | undefined,
  ): SelectOption[] {
    const facets = this.facets();
    return [
      { value: '', label: this.translation.t(`tutoring.public.search.filters.${name}Any`) },
      ...values.map((value) => {
        const count = facets ? countOf(facets, value) : undefined;
        const label = this.translation.t(labelKey(value));
        return { value, label: count === undefined ? label : `${label} (${count})` };
      }),
    ];
  }
}
