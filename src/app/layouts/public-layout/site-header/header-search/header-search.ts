import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorMagnifyingGlass } from '@ng-icons/phosphor-icons/regular';
import { filter, map } from 'rxjs';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

/**
 * Large rounded-pill catalog search with an inline Search button. Submitting goes to `/courses?q=…` —
 * the exact query param `CoursesPage` reads its search text from — and an empty submit just opens the
 * unfiltered catalog. While the catalog is open the field mirrors its current `q`, so it never shows a
 * stale term after back/forward navigation; anywhere else it is empty.
 */
@Component({
  selector: 'app-header-search',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe],
  templateUrl: './header-search.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorMagnifyingGlass })],
})
export class HeaderSearch {
  private readonly router = inject(Router);

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  /** The catalog's own `q` while on `/courses`, otherwise `''`. */
  private readonly catalogQuery = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.readCatalogQuery()),
    ),
    { initialValue: this.readCatalogQuery() },
  );

  constructor() {
    effect(() => this.searchControl.setValue(this.catalogQuery(), { emitEvent: false }));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const q = this.searchControl.value.trim();
    void this.router.navigate(['/courses'], { queryParams: q ? { q } : {} });
  }

  private readCatalogQuery(): string {
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments ?? [];
    const onCatalog = segments.length === 1 && segments[0]?.path === 'courses';
    return onCatalog ? (tree.queryParams['q'] ?? '') : '';
  }
}
