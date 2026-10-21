import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

/**
 * An inline error banner that announces itself (`role="alert"`) and takes keyboard focus whenever its message appears or
 * changes, so a person who submitted a form with the keyboard lands on the explanation instead of staying on the button.
 * Content-project a retry action if there is one.
 */
@Component({
  selector: 'app-tutor-problem',
  imports: [NgIcon],
  template: `
    @if (message(); as text) {
      <div class="flex flex-wrap items-start gap-3">
        <ng-icon name="phosphorWarningCircle" aria-hidden="true" class="mt-0.5 shrink-0 text-xl text-[var(--tone-fg)]" />
        <p class="min-w-0 flex-1 break-words text-sm text-[var(--color-text)]">{{ text }}</p>
        <ng-content />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorWarningCircle })],
  host: {
    role: 'alert',
    tabindex: '-1',
    class: 'tone-red glass-card rounded-[var(--radius-lg)] border-[var(--tone-fg)]/55 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
    // A utility `display` class beats the `hidden` attribute, so visibility is a pair of classes, not `[hidden]`.
    '[class.block]': '!!message()',
    '[class.hidden]': '!message()',
  },
})
export class TutorProblem {
  /** The translated message; empty / `null` hides the banner. */
  readonly message = input<string | null>(null);
  /** Move focus to the banner when a message appears (default). Turn off for a banner that is not the result of an action. */
  readonly takeFocus = input(true);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      if (this.message() && this.takeFocus()) {
        this.host.nativeElement.focus();
      }
    });
  }
}
