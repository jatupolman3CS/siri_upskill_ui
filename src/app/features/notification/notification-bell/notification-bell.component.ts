import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBell,
  phosphorCheck,
  phosphorCheckCircle,
  phosphorCircle,
  phosphorInfo,
  phosphorMegaphone,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../../core/auth/auth.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { UserNotificationResponse } from '../data/notification-api.models';
import { NotificationApiService } from '../data/notification-api.service';

@Component({
  selector: 'app-notification-bell',
  imports: [CommonModule, NgIcon, TranslatePipe],
  templateUrl: './notification-bell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorBell,
      phosphorCheck,
      phosphorCheckCircle,
      phosphorCircle,
      phosphorInfo,
      phosphorMegaphone,
    }),
  ],
})
export class NotificationBellComponent implements OnInit {
  private readonly notificationApi = inject(NotificationApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  protected readonly isOpen = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly notifications = signal<readonly UserNotificationResponse[]>([]);

  protected readonly unreadCount = computed(
    () => this.notifications().filter((n) => !n.isRead).length,
  );

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.loadNotifications();
    }
  }

  protected toggleDropdown(): void {
    const nextState = !this.isOpen();
    this.isOpen.set(nextState);
    if (nextState && this.authService.isAuthenticated()) {
      this.loadNotifications();
    }
  }

  protected closeDropdown(): void {
    this.isOpen.set(false);
  }

  protected loadNotifications(): void {
    this.isLoading.set(true);
    this.notificationApi.getMyNotifications().subscribe({
      next: (items) => {
        const list = items;
        this.notifications.set(list);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected onNotificationClick(notification: UserNotificationResponse): void {
    if (!notification.isRead) {
      this.markAsRead(notification);
    }
    if (notification.linkUrl) {
      this.isOpen.set(false);
      void this.router.navigateByUrl(notification.linkUrl);
    }
  }

  protected markAsRead(notification: UserNotificationResponse, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.notificationApi.markNotificationRead(notification.id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((item) =>
            item.id === notification.id ? { ...item, isRead: true } : item,
          ),
        );
      },
    });
  }

  protected markAllAsRead(): void {
    const unread = this.notifications().filter((n) => !n.isRead);
    if (unread.length === 0) return;

    for (const n of unread) {
      this.notificationApi.markNotificationRead(n.id).subscribe();
    }

    this.notifications.update((list) =>
      list.map((item) => ({ ...item, isRead: true })),
    );
  }

  protected formatTime(utcString: string): string {
    try {
      const date = new Date(utcString);
      return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }
}
