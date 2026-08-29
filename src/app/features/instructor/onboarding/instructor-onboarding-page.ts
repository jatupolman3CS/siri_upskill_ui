import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

export interface MyInstructorProfileDto {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly revenueSharePercent: number;
  readonly status: 'Pending' | 'Approved' | 'Rejected';
  readonly approvedAtUtc: string | null;
}

@Component({
  selector: 'app-instructor-onboarding-page',
  imports: [CommonModule, FormsModule, RouterLink, NgIcon, Spinner],
  templateUrl: './instructor-onboarding-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
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
  private readonly http = inject(HttpClient);
  private readonly payoutApi = inject(PayoutApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seoService = inject(SeoService);

  protected readonly currentStep = signal<1 | 2 | 3>(1);
  protected readonly isLoading = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly existingProfile = signal<MyInstructorProfileDto | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitSuccess = signal(false);

  // Form Fields - Step 1: Profile
  protected displayName = '';
  protected headline = '';
  protected bio = '';

  // Form Fields - Step 2: Payout Account
  protected bankName = 'ธนาคารกสิกรไทย (KBANK)';
  protected accountNumber = '';
  protected accountHolderName = '';
  protected promptPayId = '';

  // Form Fields - Step 3: Agreement
  protected agreedToTerms = false;

  readonly bankOptions = [
    'ธนาคารกสิกรไทย (KBANK)',
    'ธนาคารไทยพาณิชย์ (SCB)',
    'ธนาคารกรุงเทพ (BBL)',
    'ธนาคารกรุงไทย (KTB)',
    'ธนาคารกรุงศรีอยุธยา (BAY)',
    'ธนาคารทหารไทยธนชาต (TTB)',
  ];

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
    this.http.get<MyInstructorProfileDto>('/api/catalog/instructors/me').subscribe({
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
    } else if (this.currentStep() === 2) {
      if (!this.accountNumber.trim() || !this.accountHolderName.trim()) {
        this.submitError.set('กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน');
        return;
      }
      this.submitError.set(null);
      this.currentStep.set(3);
    }
  }

  protected prevStep(): void {
    const s = this.currentStep();
    if (s > 1) {
      this.currentStep.set((s - 1) as 1 | 2 | 3);
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

    // 1. Submit instructor profile
    this.http
      .post<MyInstructorProfileDto>('/api/catalog/instructors/apply', {
        displayName: this.displayName.trim(),
        headline: this.headline.trim() || null,
        bio: this.bio.trim(),
      })
      .subscribe({
        next: (profile) => {
          this.existingProfile.set(profile);

          // 2. Save payout account info
          this.payoutApi
            .upsertPayoutAccount({
              bankName: this.bankName,
              accountNumber: this.accountNumber.trim(),
              accountHolderName: this.accountHolderName.trim(),
              promptPayId: this.promptPayId.trim() || undefined,
            })
            .subscribe({
              next: () => {
                this.isSubmitting.set(false);
                this.submitSuccess.set(true);
              },
              error: () => {
                this.isSubmitting.set(false);
                this.submitSuccess.set(true); // Profile was submitted successfully
              },
            });
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
