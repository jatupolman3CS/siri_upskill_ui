import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminSubject } from '../../../data/admin-tutor.models';
import { subject } from '../../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, problemBody, settle, textOf, typeInto, useEnglish } from '../../../testing/spec-helpers';
import { SubjectFormDialog } from './subject-form-dialog';

const GROUP = subject();
const CHILD = subject({ subjectId: 's-1', slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentId: 'g-1', sortOrder: 20 });

describe('SubjectFormDialog', () => {
  let fixture: ComponentFixture<SubjectFormDialog>;
  let httpMock: HttpTestingController;
  let saved: AdminSubject[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const field = (label: string): HTMLInputElement =>
    Array.from(root().querySelectorAll<HTMLElement>('app-input')).find((host) => host.querySelector('label')?.textContent?.includes(label))?.querySelector('input') as HTMLInputElement;

  async function open(target: AdminSubject | null): Promise<void> {
    fixture.componentRef.setInput('subjects', [GROUP, CHILD]);
    fixture.componentRef.setInput('subject', target);
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SubjectFormDialog);
    saved = [];
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));
  });

  afterEach(() => httpMock.verify());

  it('asks for the slug only when creating, and says it cannot change later', async () => {
    await open(null);
    expect(textOf(root())).toContain('It cannot be changed later.');
    expect(field('Slug')).toBeTruthy();
    await open(CHILD);
    expect(root().querySelector('app-input input[autocomplete="off"]')).toBeNull();
  });

  it('creates a subject with its slug, names, group and sort order', async () => {
    await open(null);
    typeInto(field('Slug'), 'chemistry');
    typeInto(field('Thai name'), 'เคมี');
    typeInto(field('English name'), 'Chemistry');
    typeInto(field('Sort order'), '30');
    const parent = root().querySelector('select') as HTMLSelectElement;
    parent.value = 'g-1';
    parent.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(fixture);
    (buttonByText(root(), 'Save') as HTMLButtonElement).click();
    const request = httpMock.expectOne('/api/tutoring/admin/subjects');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ slug: 'chemistry', nameTh: 'เคมี', nameEn: 'Chemistry', parentId: 'g-1', sortOrder: 30 });
    request.flush({ ...CHILD, slug: 'chemistry' });
    await settle(fixture);
    expect(saved).toHaveLength(1);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('checks the slug at the field and calls nothing while it is wrong', async () => {
    await open(null);
    typeInto(field('Slug'), 'Not A Slug');
    typeInto(field('Thai name'), 'เคมี');
    typeInto(field('English name'), 'Chemistry');
    await settle(fixture);
    (buttonByText(root(), 'Save') as HTMLButtonElement).click();
    await settle(fixture);
    httpMock.expectNone('/api/tutoring/admin/subjects');
    expect(textOf(root())).toContain('Use lower-case a-z and digits joined by hyphens');
    expect(field('Slug').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the server\'s refusal of a taken slug', async () => {
    await open(null);
    typeInto(field('Slug'), 'physics');
    typeInto(field('Thai name'), 'ฟิสิกส์');
    typeInto(field('English name'), 'Physics');
    await settle(fixture);
    (buttonByText(root(), 'Save') as HTMLButtonElement).click();
    httpMock.expectOne('/api/tutoring/admin/subjects').flush(problemBody(409, 'tutoring.subject_slug_exists', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(textOf(root())).toContain('A subject with this slug already exists.');
    expect(saved).toHaveLength(0);
  });

  it('edits without a slug, starting from the current values', async () => {
    await open(CHILD);
    expect(field('Thai name').value).toBe('ฟิสิกส์');
    expect(field('English name').value).toBe('Physics');
    typeInto(field('English name'), 'Physics 2');
    await settle(fixture);
    (buttonByText(root(), 'Save') as HTMLButtonElement).click();
    const request = httpMock.expectOne('/api/tutoring/admin/subjects/s-1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ nameTh: 'ฟิสิกส์', nameEn: 'Physics 2', parentId: 'g-1', sortOrder: 20, isActive: true });
    request.flush(CHILD);
  });

  it('locks the group of a subject that has subjects under it', async () => {
    await open(GROUP);
    expect(textOf(root())).toContain('cannot move under another group');
    expect((root().querySelector('select') as HTMLSelectElement).disabled).toBe(true);
  });
});
