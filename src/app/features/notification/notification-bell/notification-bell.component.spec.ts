import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { TranslationService } from '../../../core/i18n/translation.service';
import { UserNotificationResponse } from '../data/notification-api.models';
import { NotificationBellComponent } from './notification-bell.component';

const MOCK_NOTIFICATIONS: UserNotificationResponse[] = [
  {
    id: 'notif-1',
    userId: 'user-1',
    type: 'Announcement',
    title: 'New Chapter Available',
    body: 'Chapter 5 is now live!',
    linkUrl: '/learn/python-101',
    isRead: false,
    createdAtUtc: '2026-08-27T10:00:00Z',
  },
  {
    id: 'notif-2',
    userId: 'user-1',
    type: 'System',
    title: 'Order Confirmed',
    body: 'Your payment was successful.',
    linkUrl: '/account/orders',
    isRead: true,
    createdAtUtc: '2026-08-26T10:00:00Z',
  },
];

describe('NotificationBellComponent', () => {
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    accessTokenStore.set(null);
    httpMock.verify();
  });

  it('initializes and calculates unread count correctly', () => {
    authService.setAccessToken('mock-token');

    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/notifications/my');
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_NOTIFICATIONS);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component['unreadCount']()).toBe(1);
    expect(component['notifications']().length).toBe(2);

    const badge = fixture.nativeElement.querySelector('span.rounded-full');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('1');
  });

  it('toggles dropdown open and closed without auth without error', () => {
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component['isOpen']()).toBe(false);

    const button = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();

    expect(component['isOpen']()).toBe(true);

    const panel = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(panel).toBeTruthy();
  });

  it('marks notification as read when clicking mark as read', () => {
    authService.setAccessToken('mock-token');

    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/notifications/my');
    req.flush(MOCK_NOTIFICATIONS);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component['markAsRead'](MOCK_NOTIFICATIONS[0]);

    const readReq = httpMock.expectOne('/api/notifications/notif-1/read');
    expect(readReq.request.method).toBe('POST');
    readReq.flush({});
    fixture.detectChanges();

    expect(component['unreadCount']()).toBe(0);
  });
});
