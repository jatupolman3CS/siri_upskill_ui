import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CmsApiService } from '../../cms/data/cms-api.service';
import { AdminMenusPage } from './admin-menus-page';

describe('AdminMenusPage', () => {
  let component: AdminMenusPage;
  let fixture: ComponentFixture<AdminMenusPage>;
  let cmsApi: CmsApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminMenusPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        CmsApiService,
      ],
    }).compileComponents();

    cmsApi = TestBed.inject(CmsApiService);
    vi.spyOn(cmsApi, 'getAdminMenuItems').mockReturnValue(
      of([
        {
          id: 'menu-1',
          parentId: null,
          label: 'คอร์สทั้งหมด',
          url: '/courses',
          sortOrder: 1,
          isActive: true,
        },
        {
          id: 'menu-2',
          parentId: null,
          label: 'เส้นทางการเรียน',
          url: '/learning-paths',
          sortOrder: 2,
          isActive: true,
        },
      ])
    );

    fixture = TestBed.createComponent(AdminMenusPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render menu items table', () => {
    expect(component).toBeTruthy();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('คอร์สทั้งหมด');
    expect(text).toContain('/courses');
    expect(text).toContain('เส้นทางการเรียน');
    expect(text).toContain('/learning-paths');
  });
});
