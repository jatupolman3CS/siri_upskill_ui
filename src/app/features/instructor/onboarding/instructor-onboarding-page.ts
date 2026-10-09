import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorArrowRight,
  phosphorBank,
  phosphorCheckCircle,
  phosphorClock,
  phosphorFileText,
  phosphorShieldCheck,
  phosphorUser,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../../core/auth/auth.service';
import { PayoutPolicyStore } from '../../payout/data/payout-policy.store';
import { PayoutPolicyText } from '../../payout/ui/payout-policy-text/payout-policy-text';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';
import { InstructorProfileResponse } from '../data/instructor-profile-api.models';
import { InstructorProfileApiService } from '../data/instructor-profile-api.service';

@Component({
  selector: 'app-instructor-onboarding-page',
  imports: [CommonModule, FormsModule, RouterLink, NgIcon, Spinner, PayoutPolicyText, TranslatePipe],
  templateUrl: './instructor-onboarding-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // One `GET /api/payout/policy` per page load, shared by the terms box (the bank account is entered after approval, on the earnings page).
    PayoutPolicyStore,
    provideIcons({
      phosphorUser,
      phosphorBank,
      phosphorFileText,
      phosphorCheckCircle,
      phosphorArrowRight,
      phosphorArrowLeft,
      phosphorShieldCheck,
      phosphorClock,
      phosphorWarningCircle,
    }),
  ],
})
export class InstructorOnboardingPage implements OnInit {
  private readonly instructorApi = inject(InstructorProfileApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seoService = inject(SeoService);

  protected readonly currentStep = signal<1 | 2>(1);
  protected readonly isLoading = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly existingProfile = signal<InstructorProfileResponse | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitSuccess = signal(false);

  // Form Fields - Step 1: Profile
  protected displayName = '';
  protected headline = '';
  protected bio = '';

  // Form Fields - Step 2: Agreement. The bank (payout) account is deliberately NOT collected here: the payout
  // endpoint only accepts an already-approved instructor, so it is entered later on /instructor/earnings.
  protected agreedToTerms = false;

  ngOnInit(): void {
    this.seoService.set({
      title: 'สมัครเป็นผู้สอน | SIRI UpSkill Studio',
      description: 'เริ่มต้นสร้างและเผยแพร่คอร์สเรียนออนไลน์ของคุณกับ SIRI UpSkill',
      path: '/instructor/onboarding',
      robots: 'noindex',
    });

    this.checkExistingProfile();
  }

  private checkExistingProfile(): void {
    this.isLoading.set(true);
    this.instructorApi.getMyProfile().subscribe({
      next: (profile) => {
        this.existingProfile.set(profile);
        if (profile) {
          this.displayName = profile.displayName;
          this.headline = profile.headline ?? '';
          this.bio = profile.bio;
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected nextStep(): void {
    if (this.currentStep() === 1) {
      if (!this.displayName.trim() || !this.bio.trim()) {
        this.submitError.set('กรุณากรอกชื่อผู้สอนและประวัติย่อให้ครบถ้วน');
        return;
      }
      this.submitError.set(null);
      this.currentStep.set(2);
    }
  }

  protected prevStep(): void {
    if (this.currentStep() === 2) {
      this.currentStep.set(1);
      this.submitError.set(null);
    }
  }

  protected submitApplication(): void {
    if (!this.agreedToTerms) {
      this.submitError.set('กรุณายอมรับเงื่อนไขและข้อตกลงการแบ่งส่วนแบ่งรายได้');
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    this.instructorApi
      .apply({
        displayName: this.displayName.trim(),
        headline: this.headline.trim() || null,
        bio: this.bio.trim(),
      })
      .subscribe({
        next: (profile) => {
          this.existingProfile.set(profile);
          this.isSubmitting.set(false);
          this.submitSuccess.set(true);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.submitError.set(
            err?.error?.detail || err?.message || 'เกิดข้อผิดพลาดในการส่งใบสมัคร กรุณาลองใหม่อีกครั้ง'
          );
        },
      });
  }
}
