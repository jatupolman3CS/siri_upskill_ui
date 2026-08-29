import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { setPageMeta } from '../../../core/seo/page-meta';

interface FaqItem {
  question: string;
  answer: string;
  category: string;
}

@Component({
  selector: 'app-faq-page',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './faq-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqPage {
  readonly activeCategory = signal<string>('all');

  readonly faqs: FaqItem[] = [
    {
      category: 'general',
      question: 'SiriUpSkill คืออะไร เหมาะกับใคร?',
      answer: 'SiriUpSkill เป็นแพลตฟอร์มคอร์สเรียนออนไลน์ที่เน้นทักษะระดับมืออาชีพ ทั้งด้านวิศวกรรมซอฟต์แวร์ คลาวด์ ข้อมูล และการบริหารจัดการ ออกแบบมาสำหรับนักพัฒนาและผู้ที่ต้องการยกระดับทักษะการทำงานจริง',
    },
    {
      category: 'learning',
      question: 'สามารถเรียนซ้ำได้กี่ครั้ง มีวันหมดอายุหรือไม่?',
      answer: 'คอร์สเรียนที่คุณซื้อจะสามารถเข้าเรียนได้ตลอดชีพ (Lifetime Access) สามารถเปิดดูย้อนหลังได้ทุกที่ทุกเวลาบนทุกอุปกรณ์',
    },
    {
      category: 'learning',
      question: 'จะได้รับใบรับรอง (Certificate) อย่างไร?',
      answer: 'เมื่อคุณดูวิดีโอและทำแบบทดสอบครบ 100% ระบบจะสร้างใบรับรองดิจิทัลพร้อมรหัสตรวจสอบความถูกต้อง (Verification Code) ให้คุณโดยอัตโนมัติ',
    },
    {
      category: 'payment',
      question: 'สามารถขอใบกำกับภาษีเต็มรูปแบบได้หรือไม่?',
      answer: 'ได้แน่นอน ในขั้นตอนชำระเงิน คุณสามารถเลือก "ต้องการใบกำกับภาษี" และกรอกข้อมูลผู้เสียภาษี ระบบจะออกใบกำกับภาษีอิเล็กทรอนิกส์ให้คุณทันทีหลังชำระเงินสำเร็จ',
    },
    {
      category: 'payment',
      question: 'ช่องทางการชำระเงินมีอะไรบ้าง?',
      answer: 'เรารองรับบัตรเครดิต/เดบิต (Visa, Mastercard, JCB) และการสแกนจ่ายผ่าน Thai QR PromptPay ทุกธนาคาร',
    },
    {
      category: 'technical',
      question: 'สามารถเข้าสู่ระบบพร้อมกันหลายเครื่องได้หรือไม่?',
      answer: 'ระบบจำกัดการเข้าสู่ระบบพร้อมกันสูงสุด 3 อุปกรณ์เพื่อความปลอดภัยและป้องกันการแชร์บัญชี คุณสามารถตรวจสอบและถอดอุปกรณ์ที่ไม่ได้ใช้งานได้ที่หน้าจัดการอุปกรณ์',
    },
  ];

  constructor() {
    setPageMeta({
      title: 'คำถามที่พบบ่อย (FAQ) | SiriUpSkill',
      description: 'คำถามที่พบบ่อยเกี่ยวกับการเรียน การชำระเงิน ใบรับรอง และการใช้งานระบบ SiriUpSkill',
    });
  }

  setCategory(cat: string): void {
    this.activeCategory.set(cat);
  }

  get filteredFaqs(): FaqItem[] {
    const cat = this.activeCategory();
    if (cat === 'all') return this.faqs;
    return this.faqs.filter((f) => f.category === cat);
  }
}
