import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';
import { ContactApiService } from '../data/contact-api.service';

@Component({
  selector: 'app-contact-page',
  imports: [FormsModule, TranslatePipe, Spinner],
  templateUrl: './contact-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPage {
  private readonly toast = inject(ToastService);
  private readonly contactApi = inject(ContactApiService);

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  name = '';
  email = '';
  subject = '';
  message = '';
  botField = ''; // Honeypot trap

  constructor() {
    setPageMeta({
      title: 'ติดต่อเรา (Contact Us) | SiriUpSkill',
      description: 'ช่องทางการติดต่อทีมงานและฝ่ายบริการลูกค้า SiriUpSkill',
    });
  }

  sendMessage(): void {
    if (!this.name.trim() || !this.email.trim() || !this.message.trim()) {
      this.toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.contactApi
      .submitContactMessage({
        name: this.name.trim(),
        email: this.email.trim(),
        subject: this.subject.trim() || 'General Inquiry',
        message: this.message.trim(),
        botField: this.botField || null,
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitted.set(true);
          this.toast.success('ข้อความของคุณถูกส่งเรียบร้อยแล้ว ทีมงานจะติดต่อกลับโดยเร็วที่สุด');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const msg = err?.error?.detail || err?.error?.message || 'เกิดข้อผิดพลาดในการส่งข้อความ กรุณาลองใหม่อีกครั้ง';
          this.errorMessage.set(msg);
          this.toast.error(msg);
        },
      });
  }
}
