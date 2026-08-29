import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorClockCounterClockwise,
  phosphorMagnifyingGlass,
  phosphorTag,
  phosphorTrash,
  phosphorX,
} from '@ng-icons/phosphor-icons/regular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { CourseApiService } from '../data/course-api.service';
import { CourseSearchResultItem } from '../data/course-api.models';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';

const RECENT_SEARCHES_KEY = 'siri_recent_searches_v1';
const MAX_RECENT = 6;

@Component({
  selector: 'app-search-autocomplete',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe],
  templateUrl: './search-autocomplete.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorMagnifyingGlass,
      phosphorClockCounterClockwise,
      phosphorTrash,
      phosphorTag,
      phosphorArrowRight,
      phosphorX,
    }),
  ],
})
export class SearchAutocompleteComponent implements OnInit {
  private readonly courseApi = inject(CourseApiService);
  private readonly router = inject(Router);
  private readonly hostRef = inject(ElementRef);

  @Input() placeholder = 'ค้นหาคอร์สเรียน ทักษะ หรือผู้สอน...';
  @Input() initialQuery = '';
  @Output() queryChange = new EventEmitter<string>();
  @Output() searchSubmit = new EventEmitter<string>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  protected query = signal('');
  protected isOpen = signal(false);
  protected isLoading = signal(false);
  protected suggestions = signal<readonly CourseSearchResultItem[]>([]);
  protected recentSearches = signal<readonly string[]>([]);
  protected activeIndex = signal(-1);

  private readonly searchTerms = new Subject<string>();

  ngOnInit(): void {
    if (this.initialQuery) {
      this.query.set(this.initialQuery);
    }
    this.loadRecentSearches();

    this.searchTerms
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          if (!term.trim() || term.length < 2) {
            this.isLoading.set(false);
            this.suggestions.set([]);
            return [];
          }
          this.isLoading.set(true);
          return this.courseApi.searchCourses({ q: term.trim(), pageSize: 5 });
        })
      )
      .subscribe({
        next: (res) => {
          if (res?.results?.items) {
            this.suggestions.set(res.results.items);
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.suggestions.set([]);
        },
      });
  }

  protected onInput(val: string): void {
    this.query.set(val);
    this.isOpen.set(true);
    this.activeIndex.set(-1);
    this.searchTerms.next(val);
    this.queryChange.emit(val);
  }

  protected onFocus(): void {
    this.isOpen.set(true);
  }

  protected onClear(): void {
    this.query.set('');
    this.suggestions.set([]);
    this.queryChange.emit('');
    this.searchInput?.nativeElement.focus();
  }

  protected selectRecent(term: string): void {
    this.query.set(term);
    this.saveRecentSearch(term);
    this.isOpen.set(false);
    this.searchSubmit.emit(term);
    this.router.navigate(['/courses'], { queryParams: { q: term } });
  }

  protected selectCourse(course: CourseSearchResultItem): void {
    this.saveRecentSearch(course.title);
    this.isOpen.set(false);
    this.router.navigate(['/courses', course.slug]);
  }

  protected onSubmit(): void {
    const q = this.query().trim();
    if (!q) return;
    this.saveRecentSearch(q);
    this.isOpen.set(false);
    this.searchSubmit.emit(q);
    this.router.navigate(['/courses'], { queryParams: { q } });
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        this.isOpen.set(true);
      }
      return;
    }

    const totalItems = this.suggestions().length + (this.query().length < 2 ? this.recentSearches().length : 0);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update((idx) => (idx + 1 < totalItems ? idx + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((idx) => (idx - 1 >= 0 ? idx - 1 : totalItems - 1));
        break;
      case 'Enter':
        event.preventDefault();
        if (this.activeIndex() >= 0) {
          if (this.query().length < 2 && this.recentSearches().length > 0) {
            const term = this.recentSearches()[this.activeIndex()];
            if (term) this.selectRecent(term);
          } else if (this.suggestions().length > 0) {
            const course = this.suggestions()[this.activeIndex()];
            if (course) this.selectCourse(course);
          }
        } else {
          this.onSubmit();
        }
        break;
      case 'Escape':
        this.isOpen.set(false);
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.hostRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  protected removeRecent(term: string, event: MouseEvent): void {
    event.stopPropagation();
    const updated = this.recentSearches().filter((t) => t !== term);
    this.recentSearches.set(updated);
    this.saveRecentToStorage(updated);
  }

  protected clearAllRecent(event: MouseEvent): void {
    event.stopPropagation();
    this.recentSearches.set([]);
    this.saveRecentToStorage([]);
  }

  private loadRecentSearches(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const json = localStorage.getItem(RECENT_SEARCHES_KEY);
      this.recentSearches.set(json ? JSON.parse(json) : []);
    } catch {
      this.recentSearches.set([]);
    }
  }

  private saveRecentSearch(term: string): void {
    const trimmed = term.trim();
    if (!trimmed) return;
    const current = this.recentSearches().filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...current].slice(0, MAX_RECENT);
    this.recentSearches.set(updated);
    this.saveRecentToStorage(updated);
  }

  private saveRecentToStorage(list: readonly string[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
      }
    } catch {}
  }
}
