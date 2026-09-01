import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LearnerQuiz, QuizAttempt } from '../data/learning-api.models';
import { QuizTakingComponent } from './quiz-taking.component';

const MOCK_QUIZ: LearnerQuiz = {
  id: 'quiz-001',
  episodeId: 'ep-001',
  title: 'แบบทดสอบท้ายบทเรียน',
  passingScorePercent: 80,
  maxAttempts: 3,
  questions: [
    {
      id: 'q-001',
      type: 'SingleChoice',
      prompt: '1 + 1 เท่ากับเท่าไร?',
      points: 10,
      options: [
        { id: 'opt-1', text: '2' },
        { id: 'opt-2', text: '3' },
      ],
    },
  ],
};

const MOCK_ATTEMPT: QuizAttempt = {
  id: 'att-001',
  quizId: 'quiz-001',
  enrollmentId: 'enr-001',
  attemptNo: 1,
  scorePercent: 100,
  isPassed: true,
  startedAtUtc: '2026-08-27T00:00:00Z',
  submittedAtUtc: '2026-08-27T00:05:00Z',
  answers: [
    {
      id: 'ans-001',
      questionId: 'q-001',
      selectedOptionIds: ['opt-1'],
      isCorrect: true,
    },
  ],
};

describe('QuizTakingComponent', () => {
  let fixture: ComponentFixture<QuizTakingComponent>;
  let component: QuizTakingComponent;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizTakingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuizTakingComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads quiz and previous attempts on episode change', () => {
    fixture.componentRef.setInput('episodeId', 'ep-001');
    fixture.componentRef.setInput('enrollmentId', 'enr-001');
    TestBed.flushEffects();

    const quizReq = httpTesting.expectOne('/api/learning/quizzes/by-episode/ep-001');
    expect(quizReq.request.method).toBe('GET');
    quizReq.flush(MOCK_QUIZ);

    const attemptsReq = httpTesting.expectOne('/api/learning/quiz-attempts/by-quiz/quiz-001');
    expect(attemptsReq.request.method).toBe('GET');
    attemptsReq.flush([MOCK_ATTEMPT]);

    expect(component.quiz()?.id).toBe('quiz-001');
    expect(component.attempts().length).toBe(1);
    expect(component.state()).toBe('result');
  });

  it('handles starting a new attempt and selecting options', () => {
    fixture.componentRef.setInput('episodeId', 'ep-001');
    fixture.componentRef.setInput('enrollmentId', 'enr-001');
    TestBed.flushEffects();

    httpTesting.expectOne('/api/learning/quizzes/by-episode/ep-001').flush(MOCK_QUIZ);
    httpTesting.expectOne('/api/learning/quiz-attempts/by-quiz/quiz-001').flush([]);

    expect(component.state()).toBe('idle');

    component.startAttempt();

    const startReq = httpTesting.expectOne('/api/learning/quiz-attempts');
    expect(startReq.request.method).toBe('POST');
    expect(startReq.request.body).toEqual({ quizId: 'quiz-001', enrollmentId: 'enr-001' });

    startReq.flush({
      id: 'att-002',
      quizId: 'quiz-001',
      enrollmentId: 'enr-001',
      attemptNo: 1,
      scorePercent: 0,
      isPassed: false,
      startedAtUtc: '2026-08-27T00:00:00Z',
      submittedAtUtc: null,
      answers: [],
    });

    expect(component.state()).toBe('taking');

    component.selectOption(MOCK_QUIZ.questions[0], 'opt-1');
    expect(component.isOptionSelected('q-001', 'opt-1')).toBe(true);
  });
});
