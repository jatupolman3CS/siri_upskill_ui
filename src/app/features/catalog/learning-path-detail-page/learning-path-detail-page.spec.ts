import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TranslationService } from '../../../core/i18n/translation.service';
import { LearningPathApiService } from '../data/learning-path-api.service';
import { LearningPathDetailPage } from './learning-path-detail-page';

describe('LearningPathDetailPage', () => {
  let component: LearningPathDetailPage;
  let fixture: ComponentFixture<LearningPathDetailPage>;
  let apiService: LearningPathApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LearningPathDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        LearningPathApiService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'slug' ? 'fullstack-dotnet-angular' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    apiService = TestBed.inject(LearningPathApiService);
    vi.spyOn(apiService, 'getLearningPathBySlug').mockReturnValue(
      of({
        id: 'lp-1',
        slug: 'fullstack-dotnet-angular',
        title: 'Fullstack .NET & Angular Developer',
        description: 'เส้นทางสู่การเป็น Full-stack developer ระดับมืออาชีพ',
        sortOrder: 1,
        isActive: true,
        courses: [
          {
            id: 'c-1',
            title: 'C# 14 & .NET 10 Web API Mastery',
            slug: 'csharp-dotnet-webapi-mastery',
            sortOrder: 1,
          },
          {
            id: 'c-2',
            title: 'Angular 22 Signals & Modern Architecture',
            slug: 'angular-22-signals-architecture',
            sortOrder: 2,
          },
        ],
        createdAtUtc: '2026-08-01T00:00:00Z',
      })
    );

    fixture = TestBed.createComponent(LearningPathDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render learning path header and curriculum roadmap', () => {
    expect(component).toBeTruthy();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fullstack .NET & Angular Developer');
    expect(text).toContain('C# 14 & .NET 10 Web API Mastery');
    expect(text).toContain('Angular 22 Signals & Modern Architecture');
  });

  it('builds JSON-LD URLs from the runtime origin, never a hardcoded domain', () => {
    const origin = document.location.origin;
    const jsonLd = document.head.querySelector('script[data-seo-json-ld]')?.textContent ?? '';
    expect(jsonLd).toContain(`${origin}/learning-paths/fullstack-dotnet-angular`);
    expect(jsonLd).toContain(`${origin}/courses/csharp-dotnet-webapi-mastery`);
    expect(jsonLd).not.toContain('siri.in.th');
  });
});

describe('LearningPathDetailPage when the path cannot be loaded', () => {
  it('shows the localized not-found heading instead of a hardcoded or server-supplied string', async () => {
    await TestBed.configureTestingModule({
      imports: [LearningPathDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'gone' } } },
        },
      ],
    }).compileComponents();
    TestBed.inject(TranslationService).setLocale('en');
    vi.spyOn(TestBed.inject(LearningPathApiService), 'getLearningPathBySlug').mockReturnValue(
      throwError(() => ({ error: { detail: 'Server wording that must not leak' } })),
    );

    const fixture = TestBed.createComponent(LearningPathDetailPage);
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h2') as HTMLElement;
    expect(heading.textContent?.trim()).toBe('Learning Path Not Found');
    expect(fixture.nativeElement.textContent).not.toContain('Server wording that must not leak');
  });
});
