import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { setPageMeta } from '../../../core/seo/page-meta';

@Component({
  selector: 'app-refund-policy-page',
  imports: [RouterLink],
  templateUrl: './refund-policy-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefundPolicyPage {
  constructor() {
    setPageMeta({
      title: 'นโยบายการคืนเงิน | SiriUpSkill',
      description: 'ข้อกำหนดและเงื่อนไขการขอคืนเงินคอร์สเรียนออนไลน์ SiriUpSkill',
    });
  }
}
