import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretLeft, phosphorCaretRight, phosphorCheck, phosphorUsers } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { SlotDay, bangkokDateOfInstant, buildSlotDays } from '../../data/tutor-slots.util';
import type { TutorSlot } from '../../data/tutoring-public.models';

let nextPickerId = 0;

/**
 * Week view of bookable tutor slots (P13-21). Reusable: the booking flow (P13-22) drops the same component in.
 *
 * <b>Accessibility model - decided, not accidental.</b> One WAI-ARIA tabs pattern at every breakpoint rather than a seven
 * column grid on desktop and a different widget on mobile (two DOM copies of every slot would double the tab stops and
 * confuse screen readers):
 * <ul>
 *   <li>The seven days are a `tablist` (`role="tab"`, `aria-selected`, `aria-controls`) with a ROVING tabindex - one Tab
 *       stop for the whole strip, then Left/Right/Home/End move between days (automatic activation, wraps around).
 *       The strip doubles as the "week at a glance": each tab shows weekday, day number and how many times that day has.</li>
 *   <li>The selected day is the single `tabpanel`: a plain list of native `<button aria-pressed>` slots. Buttons (not a
 *       `role="grid"`) because slots are independent toggles with no two-dimensional navigation - they are reached with
 *       Tab, activated with Enter/Space, and announce "pressed" / "not pressed".</li>
 *   <li>Every slot has an `aria-label` carrying date, start-end and seats left; a selected slot is also marked with a check
 *       icon (state is never colour only). Targets are at least 44px and focus rings are never removed.</li>
 *   <li>A visually hidden `role="status"` region announces selection changes, day/period summaries and the "your slot was
 *       just taken" case; the week label is `aria-live="polite"`.</li>
 * </ul>
 * All times are Asia/Bangkok, rendered through the shared `bangkokDate` pipe (never an offset computed here), and the
 * component says so. It owns no data fetching: the parent supplies the slots for the window and reacts to
 * `previousWeek` / `nextWeek` / `retry`.
 */
@Component({
  selector: 'app-slot-picker',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Skeleton],
  templateUrl: './slot-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretLeft, phosphorCaretRight, phosphorCheck, phosphorUsers })],
  host: { class: 'block' },
})
export class SlotPicker {
  /** Slots of the visible window, ascending by start time (the server order). */
  readonly slots = input.required<readonly TutorSlot[]>();
  /** First Bangkok calendar day (`YYYY-MM-DD`) of the window. */
  readonly windowStartDate = input.required<string>();
  readonly dayCount = input(7);
  /** The selected slot; two-way bindable. The picker clears it when the slot disappears or leaves the window. */
  readonly selected = model<TutorSlot | null>(null);
  readonly loading = input(false);
  readonly failed = input(false);
  /** Already-translated, user-facing explanation shown with the retry action when `failed`. */
  readonly errorMessage = input<string | null>(null);
  readonly canGoPrevious = input(false);
  readonly canGoNext = input(false);

  readonly previousWeek = output<void>();
  readonly nextWeek = output<void>();
  readonly retry = output<void>();

  private readonly id = nextPickerId++;
  protected readonly panelId = `slot-picker-panel-${this.id}`;

  protected readonly dayTabs = viewChildren<ElementRef<HTMLButtonElement>>('dayTab');
  private readonly chosenDate = signal<string | null>(null);
  /** Set when a selected slot vanished from a refreshed window (taken by someone else). */
  protected readonly selectionLost = signal(false);

  protected readonly days = computed<readonly SlotDay[]>(() => buildSlotDays(this.windowStartDate(), this.dayCount(), this.slots()));
  protected readonly lastDayNoonUtc = computed(() => this.days().at(-1)?.noonUtc ?? '');
  protected readonly firstDayNoonUtc = computed(() => this.days().at(0)?.noonUtc ?? '');
  protected readonly totalSlots = computed(() => this.slots().length);
  protected readonly placeholderDays = Array.from({ length: 7 }, (_, index) => index);
  protected readonly placeholderSlots = Array.from({ length: 8 }, (_, index) => index);

  /**
   * The day whose slots are listed: the one the user chose, else the day of the already-selected slot (so a pre-selected
   * time is visible, not hidden on another day), else the first day that has any time, else the first day.
   */
  protected readonly activeDate = computed(() => {
    const days = this.days();
    const chosen = this.chosenDate();
    if (chosen !== null && days.some((day) => day.date === chosen)) {
      return chosen;
    }
    const selected = this.selected();
    const selectedDate = selected === null ? null : bangkokDateOfInstant(selected.startsAtUtc);
    if (selectedDate !== null && days.some((day) => day.date === selectedDate)) {
      return selectedDate;
    }
    return (days.find((day) => day.slots.length > 0) ?? days.at(0))?.date ?? '';
  });
  protected readonly activeDay = computed(() => this.days().find((day) => day.date === this.activeDate()));

  constructor() {
    // A refreshed window may no longer contain the selected slot. Clear it so the parent never books a stale time, and say
    // why when the cause was someone else taking it (as opposed to the user simply paging to another week).
    effect(() => {
      const selected = this.selected();
      if (selected === null || this.loading() || this.failed()) {
        return;
      }
      const stillThere = this.slots().some((slot) => slot.startsAtUtc === selected.startsAtUtc && slot.endsAtUtc === selected.endsAtUtc);
      if (stillThere) {
        return;
      }
      const selectedDate = bangkokDateOfInstant(selected.startsAtUtc);
      const insideWindow = this.days().some((day) => day.date === selectedDate);
      untracked(() => {
        this.selected.set(null);
        this.selectionLost.set(insideWindow);
      });
    });
  }

  protected tabId(date: string): string {
    return `slot-picker-tab-${this.id}-${date}`;
  }

  protected isSelected(slot: TutorSlot): boolean {
    const selected = this.selected();
    return selected !== null && selected.startsAtUtc === slot.startsAtUtc && selected.endsAtUtc === slot.endsAtUtc;
  }

  protected isGroupSlot(slot: TutorSlot): boolean {
    return slot.joinsExistingGroup || slot.seatsLeft > 1;
  }

  /** i18n key of a slot's accessible name: plain, "joins an open group" or "starts a new group". */
  protected slotLabelKey(slot: TutorSlot): string {
    if (slot.joinsExistingGroup) {
      return 'tutoring.slots.slotLabelJoinGroup';
    }
    return slot.seatsLeft > 1 ? 'tutoring.slots.slotLabelNewGroup' : 'tutoring.slots.slotLabel';
  }

  protected selectDay(date: string): void {
    this.chosenDate.set(date);
  }

  protected toggleSlot(slot: TutorSlot): void {
    this.selectionLost.set(false);
    this.selected.set(this.isSelected(slot) ? null : slot);
  }

  protected onTabKeydown(event: KeyboardEvent): void {
    const days = this.days();
    const count = days.length;
    const current = days.findIndex((day) => day.date === this.activeDate());
    if (count === 0 || current < 0) {
      return;
    }
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
        target = (current + 1) % count;
        break;
      case 'ArrowLeft':
        target = (current - 1 + count) % count;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.chosenDate.set(days[target].date);
    this.dayTabs()[target]?.nativeElement.focus();
  }
}
