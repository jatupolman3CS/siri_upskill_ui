import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';

import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CourseBuilderResponse } from '../../catalog/data/course-api.models';
import { BuilderEpisode, BuilderSection, CourseBuilderPage } from './course-builder-page';

const CATEGORIES: readonly CategoryTreeNode[] = [
  {
    id: 'cat-web',
    slug: 'web-development',
    nameTh: 'การพัฒนาเว็บ',
    nameEn: 'Web Development',
    iconKey: 'code',
    sortOrder: 0,
    isActive: true,
    children: [],
  },
];

const BUILDER_COURSE: CourseBuilderResponse = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'web-dev-pro',
  title: 'Web Dev Pro',
  subtitle: 'Master full stack',
  description: 'Full description',
  instructorId: '00000000-0000-0000-0000-000000000002',
  categoryId: 'cat-web',
  level: 'Beginner',
  language: 'Thai',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  price: 1990,
  comparePrice: 3990,
  currency: 'THB',
  accessDurationDays: 365,
  status: 'Draft',
  seoTitle: 'Web Dev Pro Course',
  seoDescription: 'SEO Desc',
  rowVersion: 'AAAAAAAAB9E=',
  outcomes: ['Build web apps'],
  requirements: ['Basic computer skills'],
  sections: [
    {
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Section 1: Intro',
      sortOrder: 0,
      episodes: [
        {
          id: '00000000-0000-0000-0000-000000000020',
          sectionId: '00000000-0000-0000-0000-000000000010',
          title: 'Lesson 1: Welcome',
          description: 'Desc',
          sortOrder: 0,
          isFreePreview: true,
          mediaAssetId: null,
          durationSeconds: 300,
          status: 'Draft',
        },
        {
          id: '00000000-0000-0000-0000-000000000021',
          sectionId: '00000000-0000-0000-0000-000000000010',
          title: 'Lesson 2: Setup Tools',
          description: 'Desc',
          sortOrder: 1,
          isFreePreview: false,
          mediaAssetId: null,
          durationSeconds: 450,
          status: 'Draft',
        },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000011',
      title: 'Section 2: Deep Dive',
      sortOrder: 1,
      episodes: [
        {
          id: '00000000-0000-0000-0000-000000000022',
          sectionId: '00000000-0000-0000-0000-000000000011',
          title: 'Lesson 3: Core Architecture',
          description: 'Desc',
          sortOrder: 0,
          isFreePreview: false,
          mediaAssetId: null,
          durationSeconds: 600,
          status: 'Draft',
        },
      ],
    },
  ],
};

describe('CourseBuilderPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'instructor/courses/:id/builder', component: CourseBuilderPage },
          { path: 'instructor', component: CourseBuilderPage },
        ]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function navigate(url: string): Promise<CourseBuilderPage> {
    const component = await harness.navigateByUrl(url, CourseBuilderPage);
    await settle();
    return component;
  }

  function flushCategories(): void {
    const req = httpMock.expectOne((r) => r.url === '/api/catalog/categories');
    req.flush(CATEGORIES);
  }

  function flushBuilderCourse(course: CourseBuilderResponse = BUILDER_COURSE): void {
    const req = httpMock.expectOne((r) => r.url === `/api/catalog/instructor/courses/${course.id}/builder`);
    req.flush(course);
  }

  it('loads course builder data and populates form fields', async () => {
    await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    const titleInput = harness.routeNativeElement?.querySelector('#builderCourseTitle') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    expect(titleInput.value).toBe('Web Dev Pro');
  });

  it('handles autosave and sends rowVersion concurrency token', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    // Trigger save
    const saveButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Save Draft'),
    ) as HTMLButtonElement;
    expect(saveButton).toBeTruthy();
    saveButton.click();
    await settle();

    const saveReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000001/autosave');
    expect(saveReq.request.method).toBe('PUT');
    expect(saveReq.request.body.rowVersion).toBe('AAAAAAAAB9E=');
    expect(saveReq.request.body.title).toBe('Web Dev Pro');

    saveReq.flush({
      courseId: '00000000-0000-0000-0000-000000000001',
      rowVersion: 'AAAAAAAAB9I=',
      updatedAtUtc: '2026-08-24T12:00:00Z',
    });
    await settle();

    expect(component['rowVersion']()).toBe('AAAAAAAAB9I=');
    expect(component.saveStatus()).toBe('saved');
  });

  it('shows conflict warning on 409 status code during save', async () => {
    await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    const saveButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Save Draft'),
    ) as HTMLButtonElement;
    saveButton.click();
    await settle();

    const saveReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000001/autosave');
    saveReq.flush({ title: 'Conflict', detail: 'Stale token' }, { status: 409, statusText: 'Conflict' });
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('This course was modified elsewhere');
  });

  it('reorders sections via keyboard moveSectionUp and moveSectionDown', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    expect(component['sections']()[0].title).toBe('Section 1: Intro');
    expect(component['sections']()[1].title).toBe('Section 2: Deep Dive');

    // Move Section 1 down
    component.moveSectionDown(0);
    expect(component['sections']()[0].title).toBe('Section 2: Deep Dive');
    expect(component['sections']()[1].title).toBe('Section 1: Intro');
    expect(component.canUndo()).toBe(true);

    // Move Section 2 up
    component.moveSectionUp(1);
    expect(component['sections']()[0].title).toBe('Section 1: Intro');
    expect(component['sections']()[1].title).toBe('Section 2: Deep Dive');
  });

  it('reorders episodes via keyboard moveEpisodeUp and moveEpisodeDown', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    expect(component['sections']()[0].episodes[0].title).toBe('Lesson 1: Welcome');
    expect(component['sections']()[0].episodes[1].title).toBe('Lesson 2: Setup Tools');

    // Move episode 0 down
    component.moveEpisodeDown(0, 0);
    expect(component['sections']()[0].episodes[0].title).toBe('Lesson 2: Setup Tools');
    expect(component['sections']()[0].episodes[1].title).toBe('Lesson 1: Welcome');
    expect(component.canUndo()).toBe(true);

    // Move episode 1 up
    component.moveEpisodeUp(0, 1);
    expect(component['sections']()[0].episodes[0].title).toBe('Lesson 1: Welcome');
    expect(component['sections']()[0].episodes[1].title).toBe('Lesson 2: Setup Tools');
  });

  it('supports CDK drag and drop for sections and episodes', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    // Section drag and drop
    const mockSectionDropEvent = {
      previousIndex: 0,
      currentIndex: 1,
      item: { data: component['sections']()[0] },
      container: { data: component['sections']() },
      previousContainer: { data: component['sections']() },
      isPointerOverContainer: true,
      distance: { x: 0, y: 50 },
      dropPoint: { x: 0, y: 50 },
      event: new MouseEvent('drop'),
    } as unknown as CdkDragDrop<BuilderSection[]>;

    component.onSectionDrop(mockSectionDropEvent);
    expect(component['sections']()[0].title).toBe('Section 2: Deep Dive');
    expect(component['sections']()[1].title).toBe('Section 1: Intro');

    // Episode cross-section drag and drop
    const mockEpisodeDropEvent = {
      previousIndex: 0,
      currentIndex: 0,
      item: { data: component['sections']()[1].episodes[0] },
      container: { id: 'ep-drop-list-0', data: component['sections']()[0].episodes },
      previousContainer: { id: 'ep-drop-list-1', data: component['sections']()[1].episodes },
      isPointerOverContainer: true,
      distance: { x: 0, y: 50 },
      dropPoint: { x: 0, y: 50 },
      event: new MouseEvent('drop'),
    } as unknown as CdkDragDrop<BuilderEpisode[]>;

    component.onEpisodeDrop(mockEpisodeDropEvent, 0);
    // Transferred episode to Section 0
    expect(component['sections']()[0].episodes.length).toBe(2);
  });

  it('manages Undo and Redo history stack on curriculum mutations', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    expect(component.canUndo()).toBe(false);
    expect(component.canRedo()).toBe(false);

    // Add a new section
    component.addSection();
    expect(component['sections']().length).toBe(3);
    expect(component.canUndo()).toBe(true);
    expect(component.canRedo()).toBe(false);

    // Perform Undo
    component.undo();
    expect(component['sections']().length).toBe(2);
    expect(component.canUndo()).toBe(false);
    expect(component.canRedo()).toBe(true);

    // Perform Redo
    component.redo();
    expect(component['sections']().length).toBe(3);
    expect(component.canUndo()).toBe(true);
    expect(component.canRedo()).toBe(false);
  });

  it('triggers Undo and Redo via keyboard shortcuts Ctrl+Z and Ctrl+Y', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    component.addSection();
    expect(component['sections']().length).toBe(3);

    // Dispatch Ctrl+Z event
    const undoEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    window.dispatchEvent(undoEvent);
    await settle();

    expect(component['sections']().length).toBe(2);

    // Dispatch Ctrl+Y event
    const redoEvent = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true });
    window.dispatchEvent(redoEvent);
    await settle();

    expect(component['sections']().length).toBe(3);
  });

  it('blocks saveCourse and shows validation error when categoryId is empty', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();

    expect(component['categoryId']()).toBe('');
    component.saveCourse();
    await settle();

    expect(component.saveStatus()).toBe('error');
    expect(component['errorMessage']()).toBe('instructor.builder.validation.categoryRequired');
    httpMock.expectNone('/api/catalog/instructor/courses');
  });

  it('manages outcomes and requirements lists', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    expect(component['outcomes']()).toEqual(['Build web apps']);
    expect(component['requirements']()).toEqual(['Basic computer skills']);

    // Add outcome
    component['newOutcome'].set('Learn Angular signals');
    component.addOutcome();
    expect(component['outcomes']()).toEqual(['Build web apps', 'Learn Angular signals']);
    expect(component['newOutcome']()).toBe('');

    // Remove outcome
    component.removeOutcome(0);
    expect(component['outcomes']()).toEqual(['Learn Angular signals']);

    // Add requirement
    component['newRequirement'].set('Node.js installed');
    component.addRequirement();
    expect(component['requirements']()).toEqual(['Basic computer skills', 'Node.js installed']);

    // Remove requirement
    component.removeRequirement(0);
    expect(component['requirements']()).toEqual(['Node.js installed']);
  });

  it('creates new course and saves draft using switchMap pipeline', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();

    // Select category first
    component['categoryId'].set('cat-web');

    component.saveCourse();
    await settle();

    // 1. POST create course
    const createReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses');
    expect(createReq.request.method).toBe('POST');
    createReq.flush({
      id: '00000000-0000-0000-0000-000000000099',
      title: 'หลักสูตรใหม่',
    });
    await settle();

    // 2. GET builder
    const getBuilderReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000099/builder');
    expect(getBuilderReq.request.method).toBe('GET');
    getBuilderReq.flush({
      ...BUILDER_COURSE,
      id: '00000000-0000-0000-0000-000000000099',
      rowVersion: 'AAAAAAAACAA=',
    });
    await settle();

    // 3. PUT autosave
    const autosaveReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000099/autosave');
    expect(autosaveReq.request.method).toBe('PUT');
    expect(autosaveReq.request.body.rowVersion).toBe('AAAAAAAACAA=');
    autosaveReq.flush({
      courseId: '00000000-0000-0000-0000-000000000099',
      rowVersion: 'AAAAAAAACAE=',
      updatedAtUtc: '2026-08-25T00:00:00Z',
    });
    await settle();

    expect(component['courseId']()).toBe('00000000-0000-0000-0000-000000000099');
    expect(component['rowVersion']()).toBe('AAAAAAAACAE=');
    expect(component.saveStatus()).toBe('saved');
  });
});

