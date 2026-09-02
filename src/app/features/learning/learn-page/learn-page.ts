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
  protected readonly episodeProgressMap = signal<Map<string, EpisodeProgressResponse>>(new Map());

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

        // Load enrollment ID & progress
        this.learningApi.getMyEnrollments().subscribe({
          next: (res) => {
            const items = Array.isArray(res) ? res : (res?.items ?? []);
            const myEnroll = items.find((e) => e.courseId === courseData.id);
            if (myEnroll) {
              this.enrollmentId.set(myEnroll.id);
              this.loadEnrollmentProgress(myEnroll.id, myEnroll.progressPercentage, courseData.id);
            }
          },
          error: () => {
            // Intentional no-op: enrollmentId() simply stays null, treated the same as "not enrolled".
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

  private loadEnrollmentProgress(enrollmentId: string, currentPercent: number, courseId: string): void {
    this.learningApi.getEpisodeProgressList(enrollmentId).subscribe({
      next: (episodes) => {
        const map = new Map<string, EpisodeProgressResponse>();
        for (const ep of episodes) {
          map.set(ep.episodeId, ep);
        }
        this.episodeProgressMap.set(map);

        const currentEpId = this.currentEpisodeId();
        if (currentEpId && map.has(currentEpId)) {
          this.episodeProgress.set(map.get(currentEpId)!);
        }

        const completedCount = episodes.filter((e) => e.isCompleted).length;
        const totalCount = this.allEpisodes().length;
        const percent = currentPercent ?? (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

        this.courseProgress.set({
          courseId,
          progressPercent: percent,
          isCompleted: percent >= 100,
          completedEpisodesCount: completedCount,
          totalEpisodesCount: totalCount,
          episodes,
        });

        if (percent >= 100) {
          this.loadCertificate(courseId);
        }
      },
      error: () => {
        // Intentional no-op: progress UI degrades gracefully
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

    // Set episode progress from cache if already loaded
    const cachedProg = this.episodeProgressMap().get(episodeId);
    this.episodeProgress.set(cachedProg ?? null);

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
    const enrollId = this.enrollmentId();
    if (!epId || !enrollId) return;

    const pos = Math.floor(positionSeconds);
    this.learningApi
      .saveEpisodeProgress(enrollId, epId, {
        lastPositionSeconds: pos,
        watchedSeconds: pos,
        isCompleted: false,
      })
      .subscribe({
        next: (prog) => {
          this.episodeProgress.set(prog);
          this.episodeProgressMap.update((m) => {
            const next = new Map(m);
            next.set(epId, prog);
            return next;
          });
        },
        error: () => {
          // Intentional no-op: heartbeat saves are periodic and non-critical
        },
      });
  }

  protected onVideoEnded(): void {
    const epId = this.currentEpisodeId();
    const enrollId = this.enrollmentId();
    const episodes = this.allEpisodes();
    if (!epId || episodes.length === 0) return;

    if (enrollId) {
      const currentProg = this.episodeProgress();
      const pos = currentProg?.lastPositionSeconds ?? currentProg?.positionSeconds ?? 0;
      this.learningApi
        .saveEpisodeProgress(enrollId, epId, {
          lastPositionSeconds: pos,
          watchedSeconds: pos,
          isCompleted: true,
        })
        .subscribe({
          next: (prog) => {
            this.episodeProgress.set(prog);
            this.episodeProgressMap.update((m) => {
              const next = new Map(m);
              next.set(epId, prog);
              return next;
            });

            // Recompute progress percent
            const allEps = this.allEpisodes();
            const map = this.episodeProgressMap();
            const completedCount = allEps.filter((e) => map.get(e.id)?.isCompleted).length;
            const newPercent =
              allEps.length > 0 ? Math.round((completedCount / allEps.length) * 100) : 100;

            if (this.course()) {
              this.courseProgress.set({
                courseId: this.course()!.id,
                progressPercent: newPercent,
                isCompleted: newPercent >= 100,
                completedEpisodesCount: completedCount,
                totalEpisodesCount: allEps.length,
                episodes: Array.from(map.values()),
              });

              this.learningApi.updateEnrollmentProgress(enrollId, newPercent).subscribe({
                error: () => {
                  // Intentional no-op: enrollment progress sync failure is non-fatal
                },
              });

              if (newPercent >= 100 && !this.certificate()) {
                this.loadCertificate(this.course()!.id);
              }
            }
          },
          error: () => {
            // Intentional no-op: episode progress sync failure is non-fatal
          },
        });
    }

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
