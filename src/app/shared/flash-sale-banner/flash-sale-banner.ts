import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowRight, phosphorLightning, phosphorTimer } from '@ng-icons/phosphor-icons/regular';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-flash-sale-banner',
  imports: [CommonModule, RouterLink, NgIcon, TranslatePipe],
  templateUrl: './flash-sale-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorLightning,
      phosphorTimer,
      phosphorArrowRight,
    }),
  ],
})
export class FlashSaleBanner implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  public readonly title = input<string | null>(null);
  public readonly subtitle = input<string | null>(null);
  public readonly targetUrl = input<string>('/courses');
  public readonly endDate = input<string | Date | null>(null);

  protected readonly remainingSeconds = signal<number>(0);
  protected readonly isExpired = computed(() => this.remainingSeconds() <= 0);

  protected readonly hours = computed(() => {
    const s = this.remainingSeconds();
    return Math.floor(s / 3600).toString().padStart(2, '0');
  });

  protected readonly minutes = computed(() => {
    const s = this.remainingSeconds();
    return Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  });

  protected readonly seconds = computed(() => {
    const s = this.remainingSeconds();
    return (s % 60).toString().padStart(2, '0');
  });

  private timerId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.calculateRemaining();
    this.timerId = setInterval(() => this.calculateRemaining(), 1000);

    this.destroyRef.onDestroy(() => {
      if (this.timerId) {
        clearInterval(this.timerId);
      }
    });
  }

  private calculateRemaining(): void {
    const endInput = this.endDate();
    let targetTime: number;

    if (endInput) {
      targetTime = new Date(endInput).getTime();
    } else {
      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      targetTime = endOfDay.getTime();
    }

    const nowTime = Date.now();
    const diffSeconds = Math.max(0, Math.floor((targetTime - nowTime) / 1000));
    this.remainingSeconds.set(diffSeconds);
  }
}
