import { HttpRequest, provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { of, Subject, Subscription, throwError } from 'rxjs';

import { buildTestAccessToken } from '../../../core/auth/testing/test-jwt';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { AutosaveCourseCommand, CourseBuilderResponse } from '../../catalog/data/course-api.models';
import { BuilderEpisode, BuilderSection, CourseBuilderPage } from './course-builder-page';
import { MediaApiService, UploadProgressEvent } from '../../media/data/media-api.service';
import { MediaAssetResponse } from '../../media/data/media-api.models';

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
  trailerMediaAssetId: null,
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
          // Same two entries app.routes.ts has: "new" and "edit" are SEPARATE route configs, so going from one to
          // the other destroys the component instead of reusing it.
          { path: 'instructor/courses/new', component: CourseBuilderPage },
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

  it('does not fabricate curriculum rows for an empty draft', async () => {
    const component = await navigate(`/instructor/courses/${BUILDER_COURSE.id}/builder`);
    flushCategories();
    flushBuilderCourse({ ...BUILDER_COURSE, sections: [] });
    expect(component.buildAutosaveCommand().sections).toEqual([]);
  });

  it('keeps a moved episode processing until the provider returns Ready and saves its measured duration', async () => {
    const component = await navigate(`/instructor/courses/${BUILDER_COURSE.id}/builder`);
    flushCategories();
    flushBuilderCourse();
    component['activeTab'].set('curriculum');
    const asset: MediaAssetResponse = {
      id: 'media-123', provider: 'BunnyStream', providerAssetId: 'bunny-123', playbackId: null,
      status: 'Uploading', durationSeconds: null, drmEnabled: true, thumbnailUrl: null,
      uploadedByUserId: BUILDER_COURSE.instructorId, readyAtUtc: null, errorMessage: null,
      createdAtUtc: '2026-09-09T00:00:00Z',
    };
    const media = TestBed.inject(MediaApiService);
    const transfer = new Subject<UploadProgressEvent>();
    const status = new Subject<MediaAssetResponse>();
    vi.spyOn(media, 'createAsset').mockReturnValue(of(asset));
    vi.spyOn(media, 'createUploadSession').mockReturnValue(of({
      id: 'upload-123', mediaAssetId: asset.id, uploadUrl: 'https://video.bunnycdn.com/tusupload',
      status: 'Active', expiresAtUtc: '2026-09-10T00:00:00Z', createdAtUtc: asset.createdAtUtc,
    }));
    vi.spyOn(media, 'uploadVideoFile').mockReturnValue(transfer);
    const complete = vi.spyOn(media, 'completeUploadSession').mockReturnValue(of({
      id: 'upload-123', mediaAssetId: asset.id, uploadUrl: '', status: 'Completed',
      expiresAtUtc: '2026-09-10T00:00:00Z', createdAtUtc: asset.createdAtUtc,
    }));
    vi.spyOn(media, 'watchAsset').mockReturnValue(status);
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: {
      files: [new File(['video'], 'lesson.webm', { type: 'video/webm' })], value: 'lesson.webm',
    } });
    component.onEpisodeVideoSelected(0, 0, event);
    component.moveEpisodeDown(0, 0);
    transfer.next({ progress: 99, isComplete: false });
    expect(complete).not.toHaveBeenCalled();
    transfer.next({ progress: 100, isComplete: true });
    expect(complete).toHaveBeenCalledOnce();
    expect(component['sections']()[0].episodes[1].videoStatus).toBe('processing');
    expect(component.buildAutosaveCommand().sections?.[0].episodes?.[1].mediaAssetId).toBe(asset.id);
    await settle();
    expect(harness.routeNativeElement?.textContent).toContain('Upload complete. Processing video');
    status.next({ ...asset, status: 'Ready', durationSeconds: 17 });
    expect(component['sections']()[0].episodes[1].videoStatus).toBe('ready');
    expect(component.buildAutosaveCommand().sections?.[0].episodes?.[1].durationSeconds).toBe(17);
  });

  it('adopts saved curriculum IDs from the submitted order after the user reorders during a save', async () => {
    const component = await navigate(`/instructor/courses/${BUILDER_COURSE.id}/builder`);
    flushCategories();
    flushBuilderCourse();
    component.addSection();
    const tempSectionId = component['sections']()[2].id;
    component.saveCourse();
    const request = httpMock.expectOne(`/api/catalog/instructor/courses/${BUILDER_COURSE.id}/autosave`);
    component.moveSectionUp(2);
    request.flush({
      courseId: BUILDER_COURSE.id, rowVersion: 'new-version', updatedAtUtc: '2026-09-09T00:00:00Z',
      sections: [
        ...BUILDER_COURSE.sections.map((section) => ({
          id: section.id, episodes: section.episodes.map((episode) => ({ id: episode.id })),
        })),
        { id: 'saved-section', episodes: [{ id: 'saved-episode' }] },
      ],
    });
    const command = component.buildAutosaveCommand();
    expect(command.sections?.[1].id).toBe('saved-section');
    expect(command.sections?.[1].episodes?.[0].id).toBe('saved-episode');
    expect(component['sections']().some((section) => section.id === tempSectionId)).toBe(false);
    component.undo();
    expect(component.buildAutosaveCommand().sections?.[2].id).toBe('saved-section');
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

  it('starts a new course blank: no starter title, price, or curriculum in the form or the autosave payload', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();

    expect(component['courseTitle']()).toBe('');
    expect(component['coursePrice']()).toBe(0);
    expect(component['comparePrice']()).toBeNull();
    expect(component['sections']()).toEqual([]);
    const command = component.buildAutosaveCommand();
    expect(command.sections).toEqual([]);
    expect(command.comparePrice).toBeNull();
    httpMock.expectNone('/api/catalog/instructor/courses');
  });

  it('shows the empty curriculum state with an add-section action, and adds a localized section from it', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    component['activeTab'].set('curriculum');
    await settle();

    const root = harness.routeNativeElement as HTMLElement;
    expect(root.textContent).toContain('No sections yet.');
    const addButtons = () =>
      Array.from(root.querySelectorAll('button')).filter((b) => b.textContent?.includes('Add Section'));
    expect(addButtons().length).toBe(2);

    addButtons()[addButtons().length - 1].click();
    await settle();

    expect(root.textContent).not.toContain('No sections yet.');
    expect(component['sections']().length).toBe(1);
    expect(component['sections']()[0].title).toBe('Section 1');
    expect(component['sections']()[0].episodes.map((e) => e.title)).toEqual(['Lesson 1']);
  });

  it('blocks saveCourse and publishCourse with a title error when the title is empty', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();
    component['categoryId'].set('cat-web');

    component.saveCourse();
    expect(component.saveStatus()).toBe('error');
    expect(component['errorMessage']()).toBe('instructor.builder.validation.titleRequired');

    component['courseTitle'].set('   ');
    component.publishCourse();
    expect(component['errorMessage']()).toBe('instructor.builder.validation.titleRequired');
    httpMock.expectNone('/api/catalog/instructor/courses');
  });

  it('blocks saveCourse and shows validation error when categoryId is empty', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();
    component['courseTitle'].set('Typed title');

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

    // Fill the required fields the instructor would type: nothing is pre-filled
    component['courseTitle'].set('My typed title');
    component['categoryId'].set('cat-web');

    component.saveCourse();
    await settle();

    // 1. POST create course
    const createReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses');
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body.title).toBe('My typed title');
    createReq.flush({
      id: '00000000-0000-0000-0000-000000000099',
      title: 'My typed title',
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
    expect(autosaveReq.request.body.sections).toEqual([]);
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

  describe('saving a brand-new course (production route layout: /instructor/courses/new -> /:id/builder)', () => {
    const NEW_ID = '00000000-0000-0000-0000-000000000099';
    const AUTOSAVE_URL = `/api/catalog/instructor/courses/${NEW_ID}/autosave`;
    const BUILDER_URL = `/api/catalog/instructor/courses/${NEW_ID}/builder`;

    interface ApiAnswer {
      readonly body: object;
      readonly status?: number;
    }

    /**
     * Plays the API for the whole flow: answers every open request, in rounds, until the page has been quiet for two
     * rounds. Cancelled requests (the leftover of a pipe whose component was destroyed) are skipped, so a cancelled
     * save shows up as a request that never went out — exactly what the real network log showed.
     */
    async function drainApi(answer: (req: TestRequest) => ApiAnswer): Promise<HttpRequest<unknown>[]> {
      const sent: HttpRequest<unknown>[] = [];
      let quiet = 0;
      for (let round = 0; round < 15 && quiet < 2; round++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        harness.detectChanges();
        TestBed.flushEffects();
        const open = httpMock.match(() => true).filter((req) => !req.cancelled);
        quiet = open.length === 0 ? quiet + 1 : 0;
        for (const req of open) {
          sent.push(req.request);
          const { body, status } = answer(req);
          if (status) req.flush(body, { status, statusText: 'error' });
          else req.flush(body);
        }
      }
      return sent;
    }

    /** A tiny fake server: it only ever returns what a PUT autosave stored, like the real backend. */
    function fakeServer(stored: AutosaveCourseCommand[], failAutosave: () => boolean): (req: TestRequest) => ApiAnswer {
      return (req) => {
        const { method, url } = req.request;
        if (method === 'GET' && url === '/api/catalog/categories') return { body: CATEGORIES };
        if (method === 'POST' && url === '/api/catalog/instructor/courses') {
          return { body: { id: NEW_ID, title: 'My typed title' } };
        }
        if (method === 'GET' && url === BUILDER_URL) {
          const last = stored.at(-1);
          return {
            body: {
              ...BUILDER_COURSE,
              id: NEW_ID,
              title: last?.title ?? 'My typed title',
              subtitle: last?.subtitle ?? null,
              description: last?.description ?? null,
              outcomes: last?.outcomes ?? [],
              requirements: last?.requirements ?? [],
              sections: [],
              rowVersion: 'AAAAAAAACAA=',
            } satisfies CourseBuilderResponse,
          };
        }
        if (method === 'PUT' && url === AUTOSAVE_URL) {
          if (failAutosave()) return { body: { code: 'boom' }, status: 500 };
          stored.push(req.request.body as AutosaveCourseCommand);
          return { body: { courseId: NEW_ID, rowVersion: 'AAAAAAAACAE=', updatedAtUtc: '2026-08-25T00:00:00Z' } };
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      };
    }

    async function openNewCourseAndType(): Promise<CourseBuilderPage> {
      const component = await navigate('/instructor/courses/new');
      flushCategories();
      await settle();
      component['courseTitle'].set('My typed title');
      component['categoryId'].set('cat-web');
      component['courseSubtitle'].set('Typed subtitle');
      component['courseDescription'].set('Typed description');
      component['outcomes'].set(['Typed outcome']);
      component['requirements'].set(['Typed requirement']);
      return component;
    }

    const autosaves = (sent: readonly HttpRequest<unknown>[]) =>
      sent.filter((r) => r.method === 'PUT' && r.url === AUTOSAVE_URL);

    it('sends subtitle, description and the other typed fields in the follow-up PUT, then lands on the reloaded course', async () => {
      const component = await openNewCourseAndType();
      const stored: AutosaveCourseCommand[] = [];

      component.saveCourse();
      const sent = await drainApi(fakeServer(stored, () => false));

      expect(sent.filter((r) => r.method === 'POST' && r.url === '/api/catalog/instructor/courses')).toHaveLength(1);
      const puts = autosaves(sent);
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toMatchObject({
        title: 'My typed title',
        subtitle: 'Typed subtitle',
        description: 'Typed description',
        outcomes: ['Typed outcome'],
        requirements: ['Typed requirement'],
        categoryId: 'cat-web',
      });

      // The PUT must go out BEFORE the route swap: the reloaded component's GET is the last thing on the wire.
      const builderGets = sent.filter((r) => r.method === 'GET' && r.url === BUILDER_URL);
      expect(sent.indexOf(puts[0])).toBeLessThan(sent.indexOf(builderGets[builderGets.length - 1]));

      // What the instructor sees after the route swap is read back from the server and still has the typed text.
      expect(TestBed.inject(Router).url).toBe(`/instructor/courses/${NEW_ID}/builder`);
      const root = harness.routeNativeElement as HTMLElement;
      expect((root.querySelector('#builderCourseSubtitle') as HTMLInputElement).value).toBe('Typed subtitle');
      expect((root.querySelector('#builderCourseDescription') as HTMLTextAreaElement).value).toBe('Typed description');
    });

    it('stays on the form when the follow-up save fails, then a retry updates the same course instead of creating another', async () => {
      const component = await openNewCourseAndType();
      const stored: AutosaveCourseCommand[] = [];
      let failAutosave = true;
      const server = fakeServer(stored, () => failAutosave);

      component.saveCourse();
      const first = await drainApi(server);

      // Nothing was persisted, so the route must NOT swap: that would reload the blank server copy over the form.
      expect(autosaves(first)).toHaveLength(1);
      expect(component.saveStatus()).toBe('error');
      expect(TestBed.inject(Router).url).toBe('/instructor/courses/new');
      expect(component['courseSubtitle']()).toBe('Typed subtitle');
      expect(component['courseId']()).toBe(NEW_ID);

      failAutosave = false;
      component.saveCourse();
      const second = await drainApi(server);

      expect(second.filter((r) => r.method === 'POST' && r.url === '/api/catalog/instructor/courses')).toHaveLength(0);
      expect(autosaves(second)).toHaveLength(1);
      expect(stored.at(-1)).toMatchObject({ subtitle: 'Typed subtitle', description: 'Typed description' });
      expect(TestBed.inject(Router).url).toBe(`/instructor/courses/${NEW_ID}/builder`);
    });
  });

  it('formats duration correctly in MM:SS and HH:MM:SS', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();

    expect(component.formatDuration(0)).toBe('00:00');
    expect(component.formatDuration(null)).toBe('00:00');
    expect(component.formatDuration(65)).toBe('01:05');
    expect(component.formatDuration(600)).toBe('10:00');
    expect(component.formatDuration(3665)).toBe('1:01:05');
  });

  it('removes episode video and resets episode status', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse();
    await settle();

    // Set an attached media on episode
    const sections = component['sections']();
    sections[0].episodes[0].mediaAssetId = '00000000-0000-0000-0000-000000000099';
    sections[0].episodes[0].videoStatus = 'ready';

    component.removeEpisodeVideo(0, 0);
    await settle();

    httpMock.expectNone(
      '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000001/sections/00000000-0000-0000-0000-000000000010/episodes/00000000-0000-0000-0000-000000000020/media'
    );

    expect(component['sections']()[0].episodes[0].mediaAssetId).toBeNull();
    expect(component['sections']()[0].episodes[0].videoStatus).toBe('none');
    expect(component.buildAutosaveCommand().sections?.[0].episodes?.[0].mediaAssetId).toBeNull();
  });

  it('cancels active uploads when an episode or section is removed', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();
    component.addSection();
    const episode = component['sections']()[0].episodes[0];
    const cancelEpisode = vi.fn();
    component['mediaOperations'].set(episode.id, new Subscription(cancelEpisode));
    component.removeEpisode(0, 0);
    expect(cancelEpisode).toHaveBeenCalledOnce();

    component.addEpisode(0);
    const episodes = component['sections']()[0].episodes;
    const added = episodes[episodes.length - 1];
    expect(added.durationSeconds).toBe(0);
    const cancelSection = vi.fn();
    component['mediaOperations'].set(added.id, new Subscription(cancelSection));
    component.removeSection(0);
    expect(cancelSection).toHaveBeenCalledOnce();
  });

  it('blocks review while any lesson or selected trailer is not ready', async () => {
    const component = await navigate('/instructor/courses/new/builder');
    flushCategories();
    await settle();
    component['courseTitle'].set('Typed title');
    component['categoryId'].set('cat-web');
    component.publishCourse();
    expect(component['errorMessage']()).toBe('instructor.builder.validation.mediaNotReady');
    httpMock.expectNone('/api/catalog/instructor/courses');

    // An empty curriculum can never be reviewed; add the first lesson the instructor would create.
    component.addSection();
    expect(component.mediaReadyForReview()).toBe(false);

    component['sections'].update((sections) => sections.map((section) => ({
      ...section, episodes: section.episodes.map((episode) => ({ ...episode, mediaAssetId: 'asset', videoStatus: 'ready' })),
    })));
    expect(component.mediaReadyForReview()).toBe(true);
    component['trailerStatus'].set('uploading');
    expect(component.mediaReadyForReview()).toBe(false);
    component['trailerMediaAssetId'].set('trailer');
    component['trailerStatus'].set('processing');
    expect(component.mediaReadyForReview()).toBe(false);
    component['trailerStatus'].set('ready');
    expect(component.mediaReadyForReview()).toBe(true);
    component['sections'].update((sections) => sections.map((section) => ({
      ...section, episodes: section.episodes.map((episode) => ({ ...episode, videoStatus: 'failed' })),
    })));
    expect(component.mediaReadyForReview()).toBe(false);
  });

  it('manages trailer media and includes it in buildAutosaveCommand', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse();
    await settle();

    expect(component['trailerMediaAssetId']()).toBeNull();

    // Set trailer manually as if uploaded
    component['trailerMediaAssetId'].set('00000000-0000-0000-0000-000000000088');
    const command = component.buildAutosaveCommand();
    expect(command.trailerMediaAssetId).toBe('00000000-0000-0000-0000-000000000088');

    // Remove trailer
    component.removeTrailer();
    expect(component['trailerMediaAssetId']()).toBeNull();
    expect(component['trailerStatus']()).toBe('none');
    const updatedCommand = component.buildAutosaveCommand();
    expect(updatedCommand.trailerMediaAssetId).toBeNull();
  });

  describe('when the server reports the video provider is not configured (503 video.provider_not_configured)', () => {
    function fileEvent(): Event {
      const event = new Event('change');
      Object.defineProperty(event, 'target', { value: {
        files: [new File(['video'], 'lesson.webm', { type: 'video/webm' })], value: 'lesson.webm',
      } });
      return event;
    }

    function failCreateAsset(status: number, code?: string): void {
      vi.spyOn(TestBed.inject(MediaApiService), 'createAsset')
        .mockReturnValue(throwError(() => new ApiError(status, 'Server title', code)));
    }

    it('shows the plain-words outage message on the lesson, not the "check your connection" one', async () => {
      const component = await navigate(`/instructor/courses/${BUILDER_COURSE.id}/builder`);
      flushCategories();
      flushBuilderCourse();
      failCreateAsset(503, 'video.provider_not_configured');

      component.onEpisodeVideoSelected(0, 0, fileEvent());

      const episode = component['sections']()[0].episodes[0];
      expect(episode.videoStatus).toBe('failed');
      expect(episode.errorMessage).toBe('common.notConfigured.videoProvider');
    });

    it('shows the same message on the trailer', async () => {
      const component = await navigate(`/instructor/courses/${BUILDER_COURSE.id}/builder`);
      flushCategories();
      flushBuilderCourse();
      failCreateAsset(503, 'video.provider_not_configured');

      component.onTrailerSelected(fileEvent());

      expect(component['trailerStatus']()).toBe('failed');
      expect(component['trailerError']()).toBe('common.notConfigured.videoProvider');
    });

    it('keeps the generic transfer-failed message for any other failure', async () => {
      const component = await navigate(`/instructor/courses/${BUILDER_COURSE.id}/builder`);
      flushCategories();
      flushBuilderCourse();
      failCreateAsset(500);

      component.onEpisodeVideoSelected(0, 0, fileEvent());

      expect(component['sections']()[0].episodes[0].errorMessage).toBe('instructor.builder.upload.transferFailed');
    });
  });

  describe('when the public category list is empty', () => {
    afterEach(() => accessTokenStore.set(null));

    async function openWithCategories(categories: readonly CategoryTreeNode[], roles: string[]): Promise<HTMLElement> {
      accessTokenStore.set(buildTestAccessToken({ userId: 'u-1', roles }));
      await navigate('/instructor/courses/new');
      httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush(categories);
      await settle();
      httpMock.match('/api/identity/me');
      harness.detectChanges();
      return harness.routeNativeElement as HTMLElement;
    }

    it('tells an admin there are no categories and links to the admin category page', async () => {
      const page = await openWithCategories([], ['Admin']);

      expect(page.textContent).toContain('There are no categories in the system yet');
      const link = page.querySelector('a[href="/admin/categories"]');
      expect(link?.textContent).toContain('Go create a category');
      expect(page.textContent).not.toContain('ask an administrator');
    });

    it('tells an instructor to ask an administrator, without any link to the admin area', async () => {
      const page = await openWithCategories([], ['Instructor']);

      expect(page.textContent).toContain('There are no categories in the system yet');
      expect(page.textContent).toContain('Please ask an administrator to create a category first');
      expect(page.querySelector('a[href="/admin/categories"]')).toBeNull();
    });

    it('shows nothing extra when categories exist', async () => {
      const page = await openWithCategories(CATEGORIES, ['Admin']);

      expect(page.textContent).not.toContain('There are no categories in the system yet');
      expect(page.querySelector('a[href="/admin/categories"]')).toBeNull();
    });

    it('does not claim the list is empty while it is still loading', async () => {
      accessTokenStore.set(buildTestAccessToken({ userId: 'u-1', roles: ['Admin'] }));
      await navigate('/instructor/courses/new');
      const page = harness.routeNativeElement as HTMLElement;

      expect(page.textContent).not.toContain('There are no categories in the system yet');

      httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush([]);
      httpMock.match('/api/identity/me');
    });
  });
});
