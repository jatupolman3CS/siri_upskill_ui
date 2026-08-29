import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, expect, it, beforeEach } from 'vitest';
import { RouteProgressBar } from './route-progress-bar';

describe('RouteProgressBar', () => {
  let fixture: ComponentFixture<RouteProgressBar>;
  let component: RouteProgressBar;
  let routerEvents$: Subject<any>;

  beforeEach(async () => {
    routerEvents$ = new Subject();
    const routerMock = {
      events: routerEvents$.asObservable(),
    };

    await TestBed.configureTestingModule({
      imports: [RouteProgressBar],
      providers: [{ provide: Router, useValue: routerMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteProgressBar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts hidden by default', () => {
    expect(component.isLoading()).toBe(false);
    expect(fixture.nativeElement.querySelector('div')).toBeNull();
  });

  it('shows progress bar on NavigationStart and hides on NavigationEnd', () => {
    routerEvents$.next(new NavigationStart(1, '/courses'));
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);
    expect(fixture.nativeElement.querySelector('div')).not.toBeNull();

    routerEvents$.next(new NavigationEnd(1, '/courses', '/courses'));
    fixture.detectChanges();
    expect(component.isLoading()).toBe(false);
    expect(fixture.nativeElement.querySelector('div')).toBeNull();
  });
});
