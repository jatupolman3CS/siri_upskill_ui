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
  phosphorChatCircleDots,
  phosphorCheckCircle,
  phosphorFileText,
  phosphorInfo,
  phosphorPaperPlaneRight,
  phosphorThumbsUp,
} from '@ng-icons/phosphor-icons/regular';

import { CurriculumSidebar } from '../curriculum-sidebar/curriculum-sidebar';
import {
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

@Component({
  selector: 'app-learn-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NgIcon,
    VideoPlayer,
    CurriculumSidebar,
    TranslatePipe,
    DurationPipe,
  ],
  templateUrl: './learn-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowLeft,
      phosphorInfo,
      phosphorChatCircleDots,
      phosphorFileText,
      phosphorThumbsUp,
      phosphorPaperPlaneRight,
      phosphorCheckCircle,
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
  protected readonly playbackSession = signal<PlaybackSessionResponse | null>(null);
  protected readonly episodeProgress = signal<EpisodeProgressResponse | null>(null);

  protected readonly activeTab = signal<'overview' | 'qa' | 'resources'>('overview');
  protected readonly discussions = signal<readonly DiscussionItem[]>([]);
  protected readonly isSubmittingQuestion = signal(false);
  protected readonly newQuestionBody = signal('');
  protected readonly upvotedDiscussionIds = signal<Set<string>>(new Set());

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

        // Load progress
        this.learningApi.getCourseProgress(courseData.id).subscribe({
          next: (prog) => this.courseProgress.set(prog),
          error: () => {},
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

  protected selectEpisode(episodeId: string, updateUrl = true): void {
    this.currentEpisodeId.set(episodeId);

    if (updateUrl && this.course()) {
      this.router.navigate(['/learn', this.course()!.slug, episodeId]);
    }

    // Load playback session
    this.learningApi.getPlaybackSession(episodeId).subscribe({
      next: (session) => this.playbackSession.set(session),
      error: () => {
        // Fallback demo mock if backend needs live bunny key
        this.playbackSession.set({
          playbackUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          expiresAtUtc: new Date(Date.now() + 3600000).toISOString(),
          watermark: {
            text: 'SIRI UpSkill DRM',
            userId: this.auth.currentUser()?.id ?? 'guest',
            email: 'learner@siriupskill.com',
            timestamp: new Date().toISOString(),
          },
        });
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
            next: (cp) => this.courseProgress.set(cp),
            error: () => {},
          });
        }
      },
      error: () => {},
    });
  }

  protected onVideoEnded(): void {
    const epId = this.currentEpisodeId();
    const episodes = this.allEpisodes();
    if (!epId || episodes.length === 0) return;

    const currentIdx = episodes.findIndex((e) => e.id === epId);
    if (currentIdx >= 0 && currentIdx < episodes.length - 1) {
      const nextEpisode = episodes[currentIdx + 1];
      this.selectEpisode(nextEpisode.id);
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
      error: () => {},
    });
  }
}
