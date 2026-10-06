import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '../../../core/seo/page-meta';

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink],
  templateUrl: './terms-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
  constructor() {
    setPageMeta({
      title: 'ข้อกำหนดและเงื่อนไขการใช้บริการ | SiriUpSkill',
      description: 'ข้อกำหนดและเงื่อนไขการใช้บริการแพลตฟอร์มคอร์สเรียนออนไลน์ SiriUpSkill',
    });
  }
}
