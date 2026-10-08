import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorBookOpen,
  phosphorBroadcast,
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

import { LiveTab } from '../../live/learner/live-tab/live-tab';
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
import { notConfiguredMessageKey } from '../../../core/http/provider-errors';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';

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
    LiveTab,
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
      phosphorBroadcast,
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
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);
  private courseLoadVersion = 0;
  private playbackLoadVersion = 0;
  private readonly lastPositions = new Map<string, number>();
  protected readonly auth = inject(AuthService);

  protected readonly course = signal<CourseDetailResponse | null>(null);
  protected readonly courseProgress = signal<CourseProgressResponse | null>(null);
  protected readonly currentEpisodeId = signal<string | null>(null);
  protected readonly enrollmentId = signal<string | null>(null);
  protected readonly certificate = signal<CertificateDetailResponse | null>(null);
  protected readonly playbackSession = signal<PlaybackSessionResponse | null>(null);
  protected readonly episodeProgress = signal<EpisodeProgressResponse | null>(null);
  protected readonly episodeProgressMap = signal<Map<string, EpisodeProgressResponse>>(new Map());

  protected readonly activeTab = signal<'curriculum' | 'overview' | 'live' | 'quiz' | 'assignment' | 'resources' | 'qa'>('overview');
  protected readonly discussions = signal<readonly DiscussionItem[]>([]);
  protected readonly isSubmittingQuestion = signal(false);
  protected readonly newQuestionBody = signal('');
  protected readonly upvotedDiscussionIds = signal<Set<string>>(new Set());

  protected readonly isEnrolled = computed<boolean>(() => this.enrollmentId() !== null);

  /** Set when the Live tab reports "no active enrollment" (404) so the tab is hidden quietly. */
  private readonly liveTabUnavailable = signal(false);

  /** The "Live" tab exists only for enrolled learners of a course that is not purely on-demand (appendix §F, FE-2). */
  protected readonly liveTabVisible = computed<boolean>(
    () =>
      this.isEnrolled() &&
      (this.course()?.deliveryFormat ?? 'OnDemand') !== 'OnDemand' &&
      !this.liveTabUnavailable(),
  );

  /** `?tab=live` deep link (e.g. from the "next session" chip on /my-courses). */
  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: null,
  });

  constructor() {
    effect(() => {
      if (this.tabParam() === 'live' && this.liveTabVisible()) {
        this.activeTab.set('live');
      }
    });
  }

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
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const slug = params.get('slug');
      const episodeId = params.get('episodeId');

      if (slug) {
        if (this.course()?.slug === slug) {
          if (episodeId && episodeId !== this.currentEpisodeId()) {
            // e.g. a "Watch replay" link from the Live tab: show the episode, not the schedule it was clicked in.
            if (this.activeTab() === 'live') this.activeTab.set('overview');
            this.selectEpisode(episodeId, false);
          }
        } else {
          this.loadCourse(slug, episodeId);
        }
      }
    });
  }

  private loadCourse(slug: string, targetEpisodeId: string | null): void {
    const version = ++this.courseLoadVersion;
    ++this.playbackLoadVersion;
    this.course.set(null);
    this.liveTabUnavailable.set(false);
    this.enrollmentId.set(null);
    this.courseProgress.set(null);
    this.certificate.set(null);
    this.currentEpisodeId.set(null);
    this.playbackSession.set(null);
    this.episodeProgress.set(null);
    this.episodeProgressMap.set(new Map());
    this.lastPositions.clear();
    this.courseApi.getCourseDetail(slug).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (courseData) => {
        if (version !== this.courseLoadVersion) return;
        this.course.set(courseData);
        this.seoService.set({
          title: this.translation.t('learn.courseSeoTitle', { title: courseData.title }),
          description: courseData.subtitle ?? courseData.description ?? '',
          path: `/learn/${slug}`,
          robots: 'noindex',
        });

        const startEpisode = () => {
          if (version !== this.courseLoadVersion) return;
          const episodes = courseData.sections.flatMap((section) => section.episodes);
          const selected = episodes.find((episode) => episode.id === targetEpisodeId)
            ?? (this.isEnrolled() ? episodes[0] : episodes.find((episode) => episode.isFreePreview) ?? episodes[0]);
          if (selected) this.selectEpisode(selected.id, false);
        };

        if (!this.auth.isAuthenticated()) {
          startEpisode();
          return;
        }

        // Restore progress before creating the player so its initial position is available.
        this.learningApi.getAllMyEnrollments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (items) => {
            if (version !== this.courseLoadVersion) return;
            const myEnroll = items.find((e) => e.courseId === courseData.id && e.status === 'Active'
              && (!e.expiresAtUtc || new Date(e.expiresAtUtc).getTime() > Date.now()));
            if (myEnroll) {
              this.enrollmentId.set(myEnroll.id);
              this.loadEnrollmentProgress(myEnroll.id, myEnroll.progressPercent, courseData.id, startEpisode);
            } else {
              startEpisode();
            }
          },
          error: startEpisode,
        });
      },
      error: () => {
        if (version === this.courseLoadVersion) this.router.navigate(['/courses']);
      },
    });
  }

  private loadEnrollmentProgress(enrollmentId: string, currentPercent: number, courseId: string, ready: () => void): void {
    this.learningApi.getEpisodeProgressList(enrollmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        if (this.enrollmentId() !== enrollmentId) return;
        const map = new Map<string, EpisodeProgressResponse>();
        for (const ep of list) {
          map.set(ep.episodeId, ep);
        }
        this.episodeProgressMap.set(map);

        const currentEpId = this.currentEpisodeId();
        if (currentEpId && map.has(currentEpId)) {
          this.episodeProgress.set(map.get(currentEpId)!);
        }

        const completedCount = list.filter((e) => e.isCompleted).length;
        const totalCount = this.allEpisodes().length;
        const percent = currentPercent ?? (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

        this.courseProgress.set({
          courseId,
          progressPercent: percent,
          isCompleted: percent >= 100,
          completedEpisodesCount: completedCount,
          totalEpisodesCount: totalCount,
          episodes: list,
        });

        if (percent >= 100) {
          this.loadCertificate(courseId);
        }
        ready();
      },
      error: () => {
        ready();
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
      error: (error: unknown) => {
        // "Certificates not available yet" is a server-side outage, not a reason to bounce to another page.
        const notConfiguredKey = notConfiguredMessageKey(error);
        if (notConfiguredKey) {
          this.toast.error(this.translation.t(notConfiguredKey));
          return;
        }
        window.open(cert.verifyUrl || `/certificates/verify/${cert.verifyCode}`, '_blank');
      },
    });
  }

  protected readonly playbackError = signal<string | null>(null);
  /** True when the failure is a server-side outage (video provider not set up), where pressing "try again" can help. */
  protected readonly playbackRetryable = signal(false);
  protected readonly isLoadingPlayback = signal<boolean>(false);

  protected retryPlayback(): void {
    const episodeId = this.currentEpisodeId();
    if (episodeId) this.selectEpisode(episodeId, false);
  }

  protected selectEpisode(episodeId: string, updateUrl = true): void {
    if (!this.allEpisodes().some((episode) => episode.id === episodeId)) return;
    const version = ++this.playbackLoadVersion;
    this.currentEpisodeId.set(episodeId);
    this.playbackSession.set(null);

    // Picking an episode from the sidebar leaves the Live tab. Programmatic selections (`updateUrl === false`, e.g. the
    // initial episode once enrollment has loaded) must not: they would otherwise undo a `?tab=live` deep link.
    if (this.activeTab() === 'curriculum' || (updateUrl && this.activeTab() === 'live')) {
      this.activeTab.set('overview');
    }

    if (updateUrl && this.course()) {
      this.router.navigate(['/learn', this.course()!.slug, episodeId]);
    }

    // Load playback session
    this.isLoadingPlayback.set(true);
    this.playbackError.set(null);
    this.playbackRetryable.set(false);
    this.learningApi.getPlaybackSession(episodeId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (session) => {
        if (version !== this.playbackLoadVersion) return;
        this.playbackSession.set(session);
        this.isLoadingPlayback.set(false);
      },
      error: (error: unknown) => {
        if (version !== this.playbackLoadVersion) return;
        this.playbackSession.set(null);
        this.isLoadingPlayback.set(false);
        // A 503 "video provider not configured" is an outage, not a missing enrollment — say so and offer a retry.
        const notConfiguredKey = notConfiguredMessageKey(error);
        this.playbackRetryable.set(notConfiguredKey !== null);
        this.playbackError.set(this.translation.t(notConfiguredKey ?? 'learn.playbackNoAccess'));
      },
    });

    // Set episode progress from cache if already loaded
    const cachedProg = this.episodeProgressMap().get(episodeId);
    this.episodeProgress.set(cachedProg ?? null);

    // Load Q&A for this episode
    this.loadDiscussions(episodeId);
  }

  private loadDiscussions(episodeId: string): void {
    this.discussions.set([]);
    if (!this.isEnrolled()) return;
    this.learningApi.getDiscussions(episodeId).subscribe({
      next: (res) => {
        if (this.currentEpisodeId() !== episodeId) return;
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.discussions.set(items);
      },
      error: () => this.discussions.set([]),
    });
  }

  protected onHeartbeat(positionSeconds: number): void {
    const epId = this.currentEpisodeId();
    const enrollId = this.enrollmentId();
    if (!epId || !enrollId) return;

    const pos = Math.floor(positionSeconds);
    this.lastPositions.set(epId, pos);
    const cached = this.episodeProgressMap().get(epId);
    this.learningApi
      .saveEpisodeProgress(enrollId, epId, {
        lastPositionSeconds: pos,
        watchedSeconds: Math.max(cached?.watchedSeconds ?? 0, pos),
        isCompleted: cached?.isCompleted ?? false,
      })
      .subscribe({
        next: (prog) => {
          if (this.enrollmentId() !== enrollId) return;
          if (this.currentEpisodeId() === epId) this.episodeProgress.set(prog);
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
      const pos = this.lastPositions.get(epId) ?? currentProg?.positionSeconds ?? 0;
      this.learningApi
        .saveEpisodeProgress(enrollId, epId, {
          lastPositionSeconds: pos,
          watchedSeconds: Math.max(currentProg?.watchedSeconds ?? 0, pos),
          isCompleted: true,
        })
        .subscribe({
          next: (prog) => {
            if (this.enrollmentId() !== enrollId) return;
            if (this.currentEpisodeId() === epId) this.episodeProgress.set(prog);
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
                next: (enrollment) => {
                  if (enrollment.progressPercent >= 100 && !this.certificate()) {
                    this.loadCertificate(enrollment.courseId);
                  }
                },
                error: () => {
                  // Intentional no-op: enrollment progress sync failure is non-fatal
                },
              });

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

  /** The Live tab got a 404 (no active enrollment): hide it quietly and fall back to the overview. */
  protected onLiveTabUnavailable(): void {
    this.liveTabUnavailable.set(true);
    if (this.activeTab() === 'live') {
      this.activeTab.set('overview');
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
