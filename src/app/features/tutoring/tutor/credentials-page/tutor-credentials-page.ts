import { ChangeDetectionStrategy, Component } from '@angular/core';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { CertificateSection } from './certificate-section/certificate-section';
import { EducationSection } from './education-section/education-section';

const PAGE_PATH = '/instructor/tutoring/credentials';

/**
 * `/instructor/tutoring/credentials` - education history and certificates shown on the public tutor profile (P13-24). Two
 * independent sections, each loading and saving by itself. Reachable before verification.
 */
@Component({
  selector: 'app-tutor-credentials-page',
  imports: [TranslatePipe, TutorPortalNav, EducationSection, CertificateSection],
  template: `
    <div class="animate-fade-in flex flex-col gap-8">
      <header class="flex flex-col gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{{ 'tutoring.tutor.credentials.heading' | translate }}</h1>
          <p class="mt-1 max-w-3xl text-[var(--color-text-muted)]">{{ 'tutoring.tutor.credentials.subheading' | translate }}</p>
        </div>
        <app-tutor-portal-nav />
      </header>

      <div class="grid gap-8 2xl:grid-cols-2 2xl:items-start">
        <app-tutor-education-section />
        <app-tutor-certificate-section />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorCredentialsPage {
  constructor() {
    trackStudioMeta('tutoring.tutor.credentials.pageTitle', 'tutoring.tutor.credentials.pageDescription', () => PAGE_PATH);
  }
}
