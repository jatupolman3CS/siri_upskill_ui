import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignmentItem, AssignmentSubmissionItem } from '../data/learning-api.models';
import { AssignmentSubmissionComponent } from './assignment-submission.component';

const MOCK_ASSIGNMENT: AssignmentItem = {
  id: 'asn-001',
  episodeId: 'ep-001',
  title: 'การบ้าน Workshop 1',
  instructions: 'เขียนโปรแกรมสร้าง API ด้วย .NET 10',
  dueDays: 7,
  maxFileSizeMb: 25,
  allowedExtensions: '.zip,.pdf',
};

const MOCK_SUBMISSION: AssignmentSubmissionItem = {
  id: 'sub-001',
  assignmentId: 'asn-001',
  enrollmentId: 'enr-001',
  storageKey: 'submissions/workshop1.zip',
  note: 'ส่งงานตามโจทย์ครับ',
  submittedAtUtc: '2026-08-27T00:00:00Z',
  status: 'Graded',
  score: 95,
  feedback: 'ทำได้ดีมากครับ',
  gradedByUserId: 'inst-001',
  gradedAtUtc: '2026-08-27T01:00:00Z',
};

describe('AssignmentSubmissionComponent', () => {
  let fixture: ComponentFixture<AssignmentSubmissionComponent>;
  let component: AssignmentSubmissionComponent;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignmentSubmissionComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignmentSubmissionComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads assignment and previous submission on episode change', () => {
    component.episodeId = 'ep-001';
    component.enrollmentId = 'enr-001';
    component.ngOnChanges({
      episodeId: {
        currentValue: 'ep-001',
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    const asnReq = httpTesting.expectOne('/api/learning/assignments/by-episode/ep-001');
    expect(asnReq.request.method).toBe('GET');
    asnReq.flush(MOCK_ASSIGNMENT);

    const subReq = httpTesting.expectOne('/api/learning/assignment-submissions/by-assignment/asn-001');
    expect(subReq.request.method).toBe('GET');
    subReq.flush(MOCK_SUBMISSION);

    expect(component.assignment()?.id).toBe('asn-001');
    expect(component.submission()?.id).toBe('sub-001');
    expect(component.state()).toBe('ready');
  });

  it('allows submitting assignment when no previous submission exists', () => {
    component.episodeId = 'ep-001';
    component.enrollmentId = 'enr-001';
    component.ngOnChanges({
      episodeId: {
        currentValue: 'ep-001',
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    httpTesting.expectOne('/api/learning/assignments/by-episode/ep-001').flush(MOCK_ASSIGNMENT);
    httpTesting.expectOne('/api/learning/assignment-submissions/by-assignment/asn-001').flush(null);

    expect(component.submission()).toBeNull();

    component.storageKey.set('assignments/mycode.zip');
    component.note.set('ฝากตรวจด้วยครับ');
    component.submitAssignment();

    const postReq = httpTesting.expectOne('/api/learning/assignment-submissions');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({
      assignmentId: 'asn-001',
      enrollmentId: 'enr-001',
      storageKey: 'assignments/mycode.zip',
      note: 'ฝากตรวจด้วยครับ',
    });

    postReq.flush(MOCK_SUBMISSION);
    expect(component.submission()?.id).toBe('sub-001');
    expect(component.successMessage()).toBe('ส่งงานเรียบร้อยแล้ว');
  });
});
