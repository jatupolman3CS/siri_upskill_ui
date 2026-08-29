import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LearningPathApiService } from '../data/learning-path-api.service';
import { LearningPathsPage } from './learning-paths-page';

describe('LearningPathsPage', () => {
  let component: LearningPathsPage;
  let fixture: ComponentFixture<LearningPathsPage>;
  let apiService: LearningPathApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LearningPathsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        LearningPathApiService,
      ],
    }).compileComponents();

    apiService = TestBed.inject(LearningPathApiService);
    vi.spyOn(apiService, 'getLearningPaths').mockReturnValue(
      of([
        {
          id: 'lp-1',
          slug: 'fullstack-dotnet-angular',
          title: 'Fullstack .NET & Angular Developer',
          description: 'เส้นทางสู่การเป็น Full-stack developer ระดับมืออาชีพ',
          sortOrder: 1,
          isActive: true,
          courseCount: 3,
          createdAtUtc: '2026-08-01T00:00:00Z',
        },
      ])
    );

    fixture = TestBed.createComponent(LearningPathsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render learning paths cards', () => {
    expect(component).toBeTruthy();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fullstack .NET & Angular Developer');
    expect(text).toContain('3 คอร์สเรียน');
  });
});
