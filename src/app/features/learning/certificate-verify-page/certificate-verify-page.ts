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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCertificate,
  phosphorCheckCircle,
  phosphorCopy,
  phosphorDownloadSimple,
  phosphorLinkedinLogo,
  phosphorMagnifyingGlass,
  phosphorSealCheck,
  phosphorShareNetwork,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';

import { CertificateVerificationResponse } from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-certificate-verify-page',
  imports: [CommonModule, FormsModule, RouterLink, NgIcon, TranslatePipe, Spinner],
  templateUrl: './certificate-verify-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCertificate,
      phosphorCheckCircle,
      phosphorWarningCircle,
      phosphorMagnifyingGlass,
      phosphorSealCheck,
      phosphorDownloadSimple,
      phosphorShareNetwork,
      phosphorLinkedinLogo,
      phosphorCopy,
    }),
  ],
})
export class CertificateVerifyPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly learningApi = inject(LearningApiService);
  private readonly seoService = inject(SeoService);

  protected readonly searchCode = signal('');
  protected readonly isSearching = signal(false);
  protected readonly certificate = signal<CertificateVerificationResponse | null>(null);
  protected readonly isNotFound = signal(false);
  protected readonly copied = signal(false);

  protected readonly recipient = computed(() => {
    const cert = this.certificate();
    return cert?.learnerName ?? cert?.recipientName ?? 'ผู้เรียน Siri UpSkill';
  });

  protected readonly course = computed(() => {
    const cert = this.certificate();
    return cert?.courseTitle ?? 'คอร์สเรียนออนไลน์';
  });

  protected readonly serial = computed(() => {
    const cert = this.certificate();
    return cert?.serialNo ?? cert?.certificateNumber ?? '';
  });

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');
    if (code) {
      this.searchCode.set(code);
      this.verify(code);
    } else {
      this.seoService.set({
        title: 'ตรวจสอบใบประกาศนียบัตร | SIRI UpSkill',
        description: 'ระบบตรวจสอบความถูกต้องของใบประกาศนียบัตรออนไลน์ SIRI UpSkill',
        path: '/certificates/verify',
      });
    }
  }

  protected onSearch(): void {
    const code = this.searchCode().trim();
    if (code) {
      this.verify(code);
    }
  }

  protected copyLink(): void {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    }
  }

  protected shareLinkedIn(): void {
    const cert = this.certificate();
    if (!cert || typeof window === 'undefined') return;

    const issuedDate = new Date(cert.issuedAtUtc);
    const year = issuedDate.getFullYear();
    const month = issuedDate.getMonth() + 1;
    const certName = encodeURIComponent(this.course());
    const orgName = encodeURIComponent('SIRI UpSkill');
    const certUrl = encodeURIComponent(window.location.href);
    const certId = encodeURIComponent(cert.verifyCode);

    const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${certName}&organizationName=${orgName}&issueYear=${year}&issueMonth=${month}&certUrl=${certUrl}&certId=${certId}`;
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
  }

  protected downloadPdf(): void {
    const cert = this.certificate();
    if (!cert || typeof window === 'undefined') return;

    this.learningApi.downloadCertificatePdfByVerifyCode(cert.verifyCode).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Certificate-${cert.serialNo || cert.verifyCode}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        window.open(`/api/learning/certificates/verify/${encodeURIComponent(cert.verifyCode)}/download`, '_blank');
      },
    });
  }

  private verify(code: string): void {
    this.isSearching.set(true);
    this.isNotFound.set(false);
    this.certificate.set(null);

    this.seoService.set({
      title: `ตรวจสอบใบประกาศนียบัตร: ${code} | SIRI UpSkill`,
      description: 'ระบบตรวจสอบความถูกต้องของใบประกาศนียบัตรออนไลน์ SIRI UpSkill',
      path: `/certificates/verify/${code}`,
    });

    this.learningApi.verifyCertificate(code).subscribe({
      next: (res) => {
        this.certificate.set(res);
        this.isSearching.set(false);
      },
      error: () => {
        this.isNotFound.set(true);
        this.isSearching.set(false);
      },
    });
  }
}
