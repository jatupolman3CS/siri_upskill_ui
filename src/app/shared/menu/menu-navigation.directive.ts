import { Directive, ElementRef, inject, output } from '@angular/core';

/**
 * Keyboard behaviour for a `role="menu"` container (WAI-ARIA menu button pattern): ArrowDown/ArrowUp
 * move focus between the `menuitem*` children (wrapping), Home/End jump to the first/last, and Tab asks
 * the owner to close the menu (it never traps focus). Items are focused programmatically, so give them
 * `tabindex="-1"`. Opening, closing, Escape and outside-click stay with the owning component — this
 * directive only owns the arrow-key roving.
 */
@Directive({
  selector: '[appMenuNavigation]',
  exportAs: 'appMenuNavigation',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class MenuNavigation {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Emitted when the user tabs out of the menu; the owner should close it (focus moves on naturally). */
  readonly tabOut = output<void>();

  focusFirst(): void {
    this.items()[0]?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const items = this.items();
    if (items.length === 0) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(current <= 0 ? items.length : current) - 1]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Tab':
        this.tabOut.emit();
        break;
    }
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
  }
}
