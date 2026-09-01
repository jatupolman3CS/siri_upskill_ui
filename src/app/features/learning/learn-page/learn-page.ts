import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorBookOpen,
  phosphorCertificate,
  phosphorChatCircleDots,
  phosphorCheckCircle,
  phosphorDownloadSimple,
  phosphorFileText,
  phosphorInfo,
  phosphorPaperPlaneRight,
  phosphorSealCheck,
  phosphorThumbsUp,
} from '@ng-icons/phosphor-icons/regular';

import { CurriculumSidebar } from '../curriculum-sidebar/curriculum-sidebar';
import { QuizTakingComponent } from '../quiz-taking/quiz-taking.component';
import { AssignmentSubmissionComponent } from '../assignment-submission/assignment-submission.component';
import { EpisodeAttachmentsComponent } from '../episode-attachments/episode-attachments.component';
import {
  CertificateDetailResponse,
  CourseProgressResponse,
  DiscussionItem,
  EpisodeProgressResponse,
  PlaybackSessionResponse,
} from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';
import { VideoPlayer } from '../video-player/video-player';
import { CourseDetailEpisode, CourseDetailResponse } from '../../catalog/data/course-api.models';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { DurationPipe } from '../../../core/i18n/duration.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-learn-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NgIcon,
    VideoPlayer,
    CurriculumSidebar,
    QuizTakingComponent,
    AssignmentSubmissionComponent,
    EpisodeAttachmentsComponent,
    TranslatePipe,
    DurationPipe,
    Spinner,
  ],
  templateUrl: './learn-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowLeft,
      phosphorBookOpen,
      phosphorInfo,
      phosphorChatCircleDots,
      phosphorFileText,
      phosphorThumbsUp,
      phosphorPaperPlaneRight,
      phosphorCheckCircle,
      phosphorCertificate,
      phosphorDownloadSimple,
      phosphorSealCheck,
    }),
  ],
})
export class LearnPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseApi = inject(CourseApiService);
  private readonly learningApi = inject(LearningApiService);
  private readonly seoService = inject(SeoService);
  protected readonly auth = inject(AuthService);

  protected readonly course = signal<CourseDetailResponse | null>(null);
  protected readonly courseProgress = signal<CourseProgressResponse | null>(null);
  protected readonly currentEpisodeId = signal<string | null>(null);
  protected readonly enrollmentId = signal<string | null>(null);
  protected readonly certificate = signal<CertificateDetailResponse | null>(null);
  protected readonly playbackSession = signal<PlaybackSessionResponse | null>(null);
  protected readonly episodeProgress = signal<EpisodeProgressResponse | null>(null);

  protected readonly activeTab = signal<'curriculum' | 'overview' | 'quiz' | 'assignment' | 'resources' | 'qa'>('overview');
  protected readonly discussions = signal<readonly DiscussionItem[]>([]);
  protected readonly isSubmittingQuestion = signal(false);
  protected readonly newQuestionBody = signal('');
  protected readonly upvotedDiscussionIds = signal<Set<string>>(new Set());

  protected readonly isEnrolled = computed<boolean>(() => this.enrollmentId() !== null);

  protected readonly currentEpisode = computed<CourseDetailEpisode | null>(() => {
    const c = this.course();
    const epId = this.currentEpisodeId();
    if (!c || !epId) return null;

    for (const sec of c.sections) {
      const ep = sec.episodes.find((e) => e.id === epId);
      if (ep) return ep;
    }
    return null;
  });

  protected readonly allEpisodes = computed<readonly CourseDetailEpisode[]>(() => {
    const c = this.course();
    if (!c) return [];
    return c.sections.flatMap((s) => s.episodes);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      const episodeId = params.get('episodeId');

      if (slug) {
        this.loadCourse(slug, episodeId);
      }
    });
  }

  private loadCourse(slug: string, targetEpisodeId: string | null): void {
    this.courseApi.getCourseDetail(slug).subscribe({
      next: (courseData) => {
        this.course.set(courseData);
        this.seoService.set({
          title: `ห้องเรียน: ${courseData.title} | SIRI UpSkill`,
          description: courseData.subtitle ?? courseData.description ?? '',
          path: `/learn/${slug}`,
          robots: 'noindex',
        });

        // Load enrollment ID
        this.learningApi.getMyEnrollments().subscribe({
          next: (res) => {
            const myEnroll = res.items.find((e) => e.courseId === courseData.id);
            if (myEnroll) {
              this.enrollmentId.set(myEnroll.id);
            }
          },
          error: () => {
            // Intentional no-op: enrollmentId() simply stays null, treated the same as "not enrolled".
          },
        });

        // Load progress
        this.learningApi.getCourseProgress(courseData.id).subscribe({
          next: (prog) => {
            this.courseProgress.set(prog);
            if (prog.isCompleted || prog.progressPercent >= 100) {
              this.loadCertificate(courseData.id);
            }
          },
          error: () => {
            // Intentional no-op: courseProgress() simply stays null; the progress UI degrades to 0%.
          },
        });

        // Determine active episode
        let selectedId = targetEpisodeId;
        if (!selectedId) {
          const firstEp = courseData.sections[0]?.episodes[0];
          selectedId = firstEp?.id ?? null;
        }

        if (selectedId) {
          this.selectEpisode(selectedId, false);
        }
      },
      error: () => {
        this.router.navigate(['/courses']);
      },
    });
  }

  private loadCertificate(courseId: string): void {
    this.learningApi.getCertificateByCourse(courseId).subscribe({
      next: (cert) => this.certificate.set(cert),
      error: () => {
        // Intentional no-op: certificate() simply stays null (e.g. not issued yet) — no error UI needed.
      },
    });
  }

  protected downloadCertificatePdf(): void {
    const cert = this.certificate();
    if (!cert) return;

    this.learningApi.downloadCertificatePdf(cert.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Certificate-${cert.serialNo}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        window.open(cert.verifyUrl || `/certificates/verify/${cert.verifyCode}`, '_blank');
      },
    });
  }

  protected readonly playbackError = signal<string | null>(null);
  protected readonly isLoadingPlayback = signal<boolean>(false);

  protected selectEpisode(episodeId: string, updateUrl = true): void {
    this.currentEpisodeId.set(episodeId);

    if (this.activeTab() === 'curriculum') {
      this.activeTab.set('overview');
    }

    if (updateUrl && this.course()) {
      this.router.navigate(['/learn', this.course()!.slug, episodeId]);
    }

    // Load playback session
    this.isLoadingPlayback.set(true);
    this.playbackError.set(null);
    this.learningApi.getPlaybackSession(episodeId).subscribe({
      next: (session) => {
        this.playbackSession.set(session);
        this.isLoadingPlayback.set(false);
      },
      error: () => {
        this.playbackSession.set(null);
        this.isLoadingPlayback.set(false);
        this.playbackError.set('ไม่สามารถเข้าถึงวิดีโอนี้ได้ กรุณาลงทะเบียนเรียนหรือตรวจสอบสิทธิ์การเข้าถึงของคุณ');
      },
    });

    // Load episode progress
    this.learningApi.getEpisodeProgress(episodeId).subscribe({
      next: (epProg) => this.episodeProgress.set(epProg),
      error: () => this.episodeProgress.set(null),
    });

    // Load Q&A for this episode
    this.loadDiscussions(episodeId);
  }

  private loadDiscussions(episodeId: string): void {
    this.learningApi.getDiscussions(episodeId).subscribe({
      next: (res) => this.discussions.set(res.items),
      error: () => this.discussions.set([]),
    });
  }

  protected onHeartbeat(positionSeconds: number): void {
    const epId = this.currentEpisodeId();
    if (!epId) return;

    this.learningApi.saveHeartbeatProgress(epId, positionSeconds).subscribe({
      next: (prog) => {
        this.episodeProgress.set(prog);
        // Refresh overall course progress
        if (this.course()) {
          this.learningApi.getCourseProgress(this.course()!.id).subscribe({
            next: (cp) => {
              this.courseProgress.set(cp);
              if ((cp.isCompleted || cp.progressPercent >= 100) && !this.certificate()) {
                this.loadCertificate(this.course()!.id);
              }
            },
            error: () => {
              // Intentional no-op: this is a background refresh piggybacking on a heartbeat save —
              // courseProgress() simply keeps its last known value on failure.
            },
          });
        }
      },
      error: () => {
        // Intentional no-op: heartbeat saves are periodic and non-critical — a single failed
        // save is silently dropped rather than surfaced, the next heartbeat will retry naturally.
      },
    });
  }


  protected onVideoEnded(): void {
    const epId = this.currentEpisodeId();
    const episodes = this.allEpisodes();
    if (!epId || episodes.length === 0) return;

    const currentIdx = episodes.findIndex((e) => e.id === epId);
    if (currentIdx >= 0 && currentIdx < episodes.length - 1) {
      const nextEpisode = episodes[currentIdx + 1];
      // If user is enrolled, or if the next episode is also a free preview, proceed
      if (this.isEnrolled() || nextEpisode.isFreePreview) {
        this.selectEpisode(nextEpisode.id);
      }
      // If not enrolled and next episode is locked, stay on current preview and let player show CTA
    }
  }

  protected buyCourse(): void {
    const slug = this.course()?.slug;
    if (slug) {
      this.router.navigate(['/courses', slug]);
    }
  }

  protected submitQuestion(): void {
    const body = this.newQuestionBody().trim();
    const courseId = this.course()?.id;
    const episodeId = this.currentEpisodeId();

    if (!body || !courseId) return;

    this.isSubmittingQuestion.set(true);
    this.learningApi
      .createDiscussion({
        courseId,
        episodeId,
        parentId: null,
        body,
      })
      .subscribe({
        next: (newDisc) => {
          this.discussions.update((list) => [newDisc, ...list]);
          this.newQuestionBody.set('');
          this.isSubmittingQuestion.set(false);
        },
        error: () => {
          this.isSubmittingQuestion.set(false);
        },
      });
  }

  protected upvote(discussionId: string): void {
    if (this.upvotedDiscussionIds().has(discussionId)) return;

    this.learningApi.upvoteDiscussion(discussionId).subscribe({
      next: () => {
        this.upvotedDiscussionIds.update((set) => new Set([...set, discussionId]));
        this.discussions.update((list) =>
          list.map((d) => (d.id === discussionId ? { ...d, upvoteCount: d.upvoteCount + 1 } : d))
        );
      },
      error: () => {
        // Intentional no-op: upvote is optimistic-free (state only updates via `next`) — a failed
        // request simply leaves the discussion's upvote count unchanged, safe to retry by re-clicking.
      },
    });
  }
}
