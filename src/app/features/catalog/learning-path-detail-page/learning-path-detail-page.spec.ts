import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
