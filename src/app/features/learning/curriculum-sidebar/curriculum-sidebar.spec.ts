import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TranslationService } from '../../../core/i18n/translation.service';
import { CourseDetailSection } from '../../catalog/data/course-api.models';
import { CourseProgressResponse } from '../data/learning-api.models';
import { CurriculumSidebar } from './curriculum-sidebar';

const SECTIONS: readonly CourseDetailSection[] = [
  {
    id: 'sec-1',
    title: 'Section one',
    sortOrder: 1,
    episodes: [{ id: 'ep-1', title: 'Episode one', sortOrder: 1, durationSeconds: 60, isFreePreview: true }],
  },
  {
    id: 'sec-2',
    title: 'Section two',
    sortOrder: 2,
    episodes: [{ id: 'ep-2', title: 'Episode two', sortOrder: 1, durationSeconds: 90, isFreePreview: false }],
  },
];

const PROGRESS: CourseProgressResponse = {
  courseId: 'c-1',
  progressPercent: 40,
  isCompleted: false,
  completedEpisodesCount: 1,
  totalEpisodesCount: 2,
  episodes: [],
};

describe('CurriculumSidebar a11y', () => {
  let fixture: ComponentFixture<CurriculumSidebar>;
  let root: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(CurriculumSidebar);
    fixture.componentRef.setInput('sections', SECTIONS);
    fixture.componentRef.setInput('progress', PROGRESS);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  it('exposes the progress bar as a named progressbar with its current value', () => {
    const bar = root.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toBe('Course progress');
  });

  it('announces which curriculum section is expanded and links it to its episode list', () => {
    const headers = Array.from(root.querySelectorAll('button[aria-expanded]')) as HTMLButtonElement[];
    expect(headers.map((h) => h.getAttribute('aria-expanded'))).toEqual(['true', 'false']);

    const controlsId = headers[0].getAttribute('aria-controls') ?? '';
    expect(root.querySelector(`#${controlsId}`)).not.toBeNull();
    expect(headers[1].hasAttribute('aria-controls')).toBe(false);

    headers[1].click();
    fixture.detectChanges();
    const reread = Array.from(root.querySelectorAll('button[aria-expanded]')) as HTMLButtonElement[];
    expect(reread[1].getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector(`#${reread[1].getAttribute('aria-controls')}`)).not.toBeNull();
  });
});
