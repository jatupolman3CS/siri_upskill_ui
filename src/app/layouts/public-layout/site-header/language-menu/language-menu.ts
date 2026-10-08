import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretDown, phosphorCheck, phosphorGlobe } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Locale, TranslationService } from '../../../../core/i18n/translation.service';
import { MenuNavigation } from '../../../../shared/menu/menu-navigation.directive';

/**
 * Compact language dropdown (TH / EN) for the header's top strip: a pill button showing the active
 * language code that opens a `role="menu"` of `menuitemradio` options. Same keyboard model as
 * `AccountMenu` (arrows rove, Escape closes and returns focus to the button, Tab closes, outside click
 * closes). The mobile drawer keeps its own two-button toggle — this dropdown is desktop chrome.
 */
@Component({
  selector: 'app-language-menu',
  imports: [NgIcon, TranslatePipe, MenuNavigation],
  templateUrl: './language-menu.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretDown, phosphorCheck, phosphorGlobe })],
})
export class LanguageMenu {
  protected readonly translation = inject(TranslationService);
  private readonly injector = inject(Injector);

  protected readonly open = signal(false);
  protected readonly panelId = 'app-language-menu-panel';
  protected readonly options: readonly { readonly locale: Locale; readonly labelKey: string }[] = [
    { locale: 'th', labelKey: 'nav.languageThai' },
    { locale: 'en', labelKey: 'nav.languageEnglish' },
  ];

  private readonly triggerButton = viewChild<ElementRef<HTMLButtonElement>>('triggerButton');
  private readonly menuNavigation = viewChild(MenuNavigation);

  protected toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.openMenu();
    }
  }

  protected openFromKeyboard(event: Event): void {
    event.preventDefault();
    this.openMenu();
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onEscape(): void {
    if (!this.open()) {
      return;
    }
    this.close();
    this.triggerButton()?.nativeElement.focus();
  }

  protected select(locale: Locale): void {
    this.translation.setLocale(locale);
    this.close();
    this.triggerButton()?.nativeElement.focus();
  }

  private openMenu(): void {
    this.open.set(true);
    afterNextRender(() => this.menuNavigation()?.focusFirst(), { injector: this.injector });
  }
}
