import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { setPageMeta } from '../../../core/seo/page-meta';

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink],
  templateUrl: './privacy-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  constructor() {
    setPageMeta({
      title: 'นโยบายความเป็นส่วนตัว (PDPA) | SiriUpSkill',
      description: 'นโยบายการคุ้มครองข้อมูลส่วนบุคคลและสิทธิ์ตาม PDPA สำหรับผู้ใช้งาน SiriUpSkill',
    });
  }
}
