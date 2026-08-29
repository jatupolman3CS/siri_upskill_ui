import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorArticle,
  phosphorBookOpen,
  phosphorCaretDown,
  phosphorCaretUp,
  phosphorChartBar,
  phosphorCheckCircle,
  phosphorCreditCard,
  phosphorCurrencyDollar,
  phosphorEnvelopeSimple,
  phosphorEye,
  phosphorGraduationCap,
  phosphorHeart,
  phosphorHouse,
  phosphorImage,
  phosphorKey,
  phosphorLightning,
  phosphorList,
  phosphorMegaphone,
  phosphorPencilSimple,
  phosphorPlay,
  phosphorPlusCircle,
  phosphorReceipt,
  phosphorShieldCheck,
  phosphorShoppingCart,
  phosphorSignOut,
  phosphorSparkle,
  phosphorTag,
  phosphorUser,
  phosphorUsers,
  phosphorWarning,
  phosphorX,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService, UserRole } from '../../core/auth/auth.service';
import { ToastService } from '../toast/toast.service';

export interface NavItem {
  readonly title: string;
  readonly path: string;
  readonly icon: string;
  readonly badge?: string;
  readonly description?: string;
}

export interface NavGroup {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly color: string;
  readonly items: readonly NavItem[];
}

@Component({
  selector: 'app-dev-role-switcher',
  standalone: true,
  imports: [CommonModule, NgIcon],
  templateUrl: './dev-role-switcher.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorLightning,
      phosphorShieldCheck,
      phosphorUser,
      phosphorUsers,
      phosphorGraduationCap,
      phosphorBookOpen,
      phosphorHouse,
      phosphorList,
      phosphorX,
      phosphorCheckCircle,
      phosphorXCircle,
      phosphorCaretDown,
      phosphorCaretUp,
      phosphorShoppingCart,
      phosphorHeart,
      phosphorTag,
      phosphorArticle,
      phosphorImage,
      phosphorCurrencyDollar,
      phosphorCreditCard,
      phosphorEnvelopeSimple,
      phosphorPlay,
      phosphorChartBar,
      phosphorMegaphone,
      phosphorPlusCircle,
      phosphorReceipt,
      phosphorKey,
      phosphorSignOut,
      phosphorArrowRight,
      phosphorSparkle,
      phosphorWarning,
      phosphorEye,
      phosphorPencilSimple,
    }),
  ],
})
export class DevRoleSwitcher {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Whether the full navigator drawer is opened */
  protected readonly isExpanded = signal(false);

  /** Active navigation category tab */
  protected readonly activeTab = signal<'learner' | 'instructor' | 'admin' | 'auth'>('learner');

  /** Available roles */
  protected readonly roles: readonly {
    readonly id: UserRole;
    readonly label: string;
    readonly desc: string;
    readonly color: string;
    readonly icon: string;
    readonly defaultPath: string;
  }[] = [
    {
      id: 'SuperAdmin',
      label: '👑 Super Admin',
      desc: 'ผู้ดูแลระบบสูงสุด (เข้าถึงได้ทุกส่วน)',
      color: 'bg-rose-500 text-white',
      icon: 'phosphorShieldCheck',
      defaultPath: '/admin',
    },
    {
      id: 'Admin',
      label: '🛠️ Admin',
      desc: 'ผู้ดูแลระบบ (CMS, Users, Moderation)',
      color: 'bg-amber-500 text-white',
      icon: 'phosphorUsers',
      defaultPath: '/admin',
    },
    {
      id: 'Instructor',
      label: '👨‍🏫 Instructor',
      desc: 'อาจารย์ผู้สอน (Studio, คอร์ส, รายได้)',
      color: 'bg-indigo-600 text-white',
      icon: 'phosphorBookOpen',
      defaultPath: '/instructor',
    },
    {
      id: 'Learner',
      label: '🎓 Learner',
      desc: 'ผู้เรียน (คอร์สของฉัน, ห้องเรียน, ตะกร้า)',
      color: 'bg-emerald-600 text-white',
      icon: 'phosphorGraduationCap',
      defaultPath: '/my-courses',
    },
    {
      id: 'Guest',
      label: '👤 Guest',
      desc: 'บุคคลทั่วไป (หน้าแรก, แคตตาล็อก)',
      color: 'bg-zinc-600 text-white',
      icon: 'phosphorUser',
      defaultPath: '/',
    },
  ];

  /** Master Navigation Groups */
  protected readonly navGroups: readonly NavGroup[] = [
    {
      id: 'learner',
      title: '🎓 ผู้เรียน & สาธารณะ (Learner & Public)',
      icon: 'phosphorGraduationCap',
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      items: [
        { title: 'หน้าแรก (Home)', path: '/', icon: 'phosphorHouse', description: 'Hero, คอร์สแนะนำ, เส้นทางยอดนิยม' },
        { title: 'คลังคอร์สทั้งหมด (Catalog)', path: '/courses', icon: 'phosphorBookOpen', description: 'ค้นหา กรองหมวดหมู่ ราคา และความยาก' },
        { title: 'รายละเอียดคอร์ส (Course Detail)', path: '/courses/angular-signals-mastery', icon: 'phosphorEye', description: 'หน้าดูรายละเอียด หลักสูตร และผู้สอน' },
        { title: 'เส้นทางการเรียนรู้ (Learning Paths)', path: '/learning-paths', icon: 'phosphorSparkle', description: 'หลักสูตรตามสายอาชีพ' },
        { title: 'รายละเอียด Learning Path', path: '/learning-paths/fullstack-net-angular', icon: 'phosphorSparkle', description: 'รายละเอียดเส้นทางและคอร์สต่อเนื่อง' },
        { title: 'สิ่งที่อยากได้ (Wishlist)', path: '/wishlist', icon: 'phosphorHeart', badge: 'Auth', description: 'คอร์สที่บันทึกไว้ดูภายหลัง' },
        { title: 'ตะกร้าสินค้า (Cart)', path: '/cart', icon: 'phosphorShoppingCart', description: 'รายการคอร์สที่เตรียมชำระเงิน' },
        { title: 'ชำระเงิน (Checkout)', path: '/checkout', icon: 'phosphorCreditCard', badge: 'Auth', description: 'PromptPay QR & Credit Card' },
        { title: 'สั่งซื้อสำเร็จ (Success)', path: '/checkout/success/ORD-2026-0801', icon: 'phosphorCheckCircle', badge: 'Auth', description: 'ใบเสร็จรับเงินและการเข้าถึงคอร์ส' },
        { title: 'คอร์สเรียนของฉัน (My Courses)', path: '/my-courses', icon: 'phosphorGraduationCap', badge: 'Auth', description: 'แดชบอร์ดความคืบหน้าการเรียน' },
        { title: 'ห้องเรียนวิดีโอ (Learn Room)', path: '/learn/angular-signals-mastery/ep-04', icon: 'phosphorPlay', badge: 'Auth', description: 'วิดีโอ ช็อปเตอร์ แนบไฟล์ ควิซ' },
        { title: 'ประวัติคำสั่งซื้อ (Orders)', path: '/account/orders', icon: 'phosphorReceipt', badge: 'Auth', description: 'ประวัติการซื้อ ขอใบเสร็จ/คืนเงิน' },
        { title: 'ตรวจสอบวุฒิบัตร (Verify Certificate)', path: '/certificates/verify/CERT-SIRI-2026-89412', icon: 'phosphorShieldCheck', description: 'ระบบตรวจสอบความถูกต้องของ Certificate' },
        { title: 'บทความบล็อก (Blog)', path: '/blog', icon: 'phosphorArticle', description: 'บทความไอที เทคโนโลยี และการอัปสกิล' },
        { title: 'จัดการอุปกรณ์ (Devices)', path: '/account/devices', icon: 'phosphorShieldCheck', badge: 'Auth', description: 'เซสชันที่เข้าสู่ระบบและเพิกถอน' },
        { title: 'ความเป็นส่วนตัว (Privacy)', path: '/account/privacy', icon: 'phosphorUser', badge: 'Auth', description: 'ส่งออกข้อมูล / ขอลบบัญชี' },
      ],
    },
    {
      id: 'instructor',
      title: '👨‍🏫 สตูดิโอผู้สอน (Instructor Studio)',
      icon: 'phosphorBookOpen',
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      items: [
        { title: 'แดชบอร์ดภาพรวมผู้สอน (Dashboard)', path: '/instructor', icon: 'phosphorHouse', badge: 'Studio', description: 'รายได้ นักเรียนใหม่ และสถิติรวม' },
        { title: 'คอร์สของฉัน (My Courses)', path: '/instructor/courses', icon: 'phosphorBookOpen', badge: 'Studio', description: 'จัดการคอร์สทั้งหมดที่สอน' },
        { title: 'สร้างคอร์สใหม่ (Create Course)', path: '/instructor/courses/new', icon: 'phosphorPlusCircle', badge: 'Studio', description: 'ตั้งชื่อ รายละเอียด ราคา และหมวดหมู่' },
        { title: 'เครื่องมือสร้างบทเรียน (Course Builder)', path: '/instructor/courses/c-01/builder', icon: 'phosphorPencilSimple', badge: 'Studio', description: 'อัปโหลดวิดีโอ จัดตอน สร้างควิซ แนบไฟล์' },
        { title: 'ส่งประกาศถึงผู้เรียน (Announcements)', path: '/instructor/announcements', icon: 'phosphorMegaphone', badge: 'Studio', description: 'ส่งข่าวสารและการแจ้งเตือนถึงนักเรียน' },
        { title: 'สถิติและการวิเคราะห์ (Analytics)', path: '/instructor/analytics', icon: 'phosphorChartBar', badge: 'Studio', description: 'อัตราการเรียนจบ รีวิว และคะแนน' },
        { title: 'รายได้และส่วนแบ่ง (Earnings)', path: '/instructor/earnings', icon: 'phosphorCurrencyDollar', badge: 'Studio', description: 'กราฟรายได้ ยอดเงินรอโอน และ Payout' },
        { title: 'สมัครเป็นผู้สอน (Onboarding)', path: '/instructor/onboarding', icon: 'phosphorSparkle', badge: 'Studio', description: 'ขั้นตอนยืนยันตัวตนและการเปิดร้านค้า' },
      ],
    },
    {
      id: 'admin',
      title: '👑 ระบบผู้ดูแลระบบ (Admin CMS & Ops)',
      icon: 'phosphorShieldCheck',
      color: 'text-rose-600 bg-rose-50 border-rose-200',
      items: [
        { title: 'แดชบอร์ดระบบ (Admin Dashboard)', path: '/admin', icon: 'phosphorHouse', badge: 'Admin', description: 'ภาพรวมยอดขาย ผู้เรียนใหม่ และสถานะระบบ' },
        { title: 'อนุมัติคอร์ส (Course Moderation)', path: '/admin/courses', icon: 'phosphorGraduationCap', badge: 'Admin', description: 'ตรวจสอบเนื้อหา อนุมัติ หรือปฏิเสธคอร์ส' },
        { title: 'จัดการผู้ใช้และสิทธิ์ (Users & Roles)', path: '/admin/users', icon: 'phosphorUsers', badge: 'Admin', description: 'เปลี่ยน Role, ระงับบัญชี, เชิญผู้ใช้' },
        { title: 'การตลาด & ส่วนลด (Marketing)', path: '/admin/marketing', icon: 'phosphorTag', badge: 'Admin', description: 'สร้างโค้ดส่วนลด และแคมเปญ Flash Sale' },
        { title: 'จัดการแบนเนอร์ (Banners)', path: '/admin/banners', icon: 'phosphorImage', badge: 'Admin', description: 'แบนเนอร์สไลด์หน้าแรกและลำดับแสดงผล' },
        { title: 'จัดการเมนูนำทาง (Navigation Menus)', path: '/admin/menus', icon: 'phosphorList', badge: 'Admin', description: 'ปรับแต่งโครงสร้างเมนู Header & Footer' },
        { title: 'บทความ & ข่าวสาร (CMS Posts)', path: '/admin/posts', icon: 'phosphorArticle', badge: 'Admin', description: 'เขียน แก้ไข และเผยแพร่บทความบล็อก' },
        { title: 'รอบจ่ายเงินผู้สอน (Payouts)', path: '/admin/payouts', icon: 'phosphorCurrencyDollar', badge: 'Admin', description: 'ประมวลผลการโอนเงินและคำขอคืนเงิน' },
        { title: 'รายการชำระเงิน (Payments)', path: '/admin/payments', icon: 'phosphorCreditCard', badge: 'Admin', description: 'บันทึกธุรกรรม และสถานะสลิปเงินโอน' },
        { title: 'กล่องข้อความติดต่อ (Contact Messages)', path: '/admin/contact-messages', icon: 'phosphorEnvelopeSimple', badge: 'Admin', description: 'คำถามจากผู้ใช้และข้อความจากหน้าเว็บ' },
      ],
    },
    {
      id: 'auth',
      title: '🔐 ระบบยืนยันตัวตน & นโยบาย (Auth & Legal)',
      icon: 'phosphorKey',
      color: 'text-sky-600 bg-sky-50 border-sky-200',
      items: [
        { title: 'เข้าสู่ระบบ (Login)', path: '/login', icon: 'phosphorKey', description: 'หน้าฟอร์มเข้าสู่ระบบ (พร้อมปุ่ม Quick Bypass)' },
        { title: 'สมัครสมาชิก (Register)', path: '/register', icon: 'phosphorUser', description: 'สร้างบัญชีผู้ใช้ใหม่' },
        { title: 'ยืนยันอีเมล (Confirm Email)', path: '/confirm-email', icon: 'phosphorEnvelopeSimple', description: 'ยืนยันรหัส OTP / Token ทางอีเมล' },
        { title: 'ลืมรหัสผ่าน (Forgot Password)', path: '/forgot-password', icon: 'phosphorWarning', description: 'ขอลิงก์รีเซ็ตรหัสผ่าน' },
        { title: 'ตั้งรหัสผ่านใหม่ (Reset Password)', path: '/reset-password', icon: 'phosphorKey', description: 'กำหนดรหัสผ่านใหม่' },
        { title: 'ข้อกำหนดการใช้งาน (Terms)', path: '/terms', icon: 'phosphorArticle', description: 'เงื่อนไขและข้อตกลงการให้บริการ' },
        { title: 'นโยบายความเป็นส่วนตัว (Privacy Policy)', path: '/privacy', icon: 'phosphorShieldCheck', description: 'การเก็บรักษาและการคุ้มครองข้อมูล PDPA' },
        { title: 'นโยบายการคืนเงิน (Refund Policy)', path: '/refund-policy', icon: 'phosphorReceipt', description: 'เงื่อนไขการขอรับเงินคืนภายใน 7 วัน' },
        { title: 'คำถามที่พบบ่อย (FAQ)', path: '/faq', icon: 'phosphorEye', description: 'ศูนย์ช่วยเหลือและคำตอบข้อสงสัย' },
        { title: 'ติดต่อเรา (Contact Us)', path: '/contact', icon: 'phosphorEnvelopeSimple', description: 'ฟอร์มส่งข้อความถึงทีมงาน SIRI' },
      ],
    },
  ];

  /** Active Group according to tab */
  protected readonly currentGroup = computed(() => {
    return this.navGroups.find((g) => g.id === this.activeTab()) ?? this.navGroups[0];
  });

  protected switchRole(role: UserRole, navigate = false, defaultPath = '/'): void {
    this.auth.setBypassRole(role);
    this.toast.success(`⚡ สลับบทบาทเป็น "${this.roles.find((r) => r.id === role)?.label}" เรียบร้อยแล้ว`);
    if (navigate) {
      void this.router.navigateByUrl(defaultPath);
    }
  }

  protected toggleBypass(): void {
    this.auth.toggleBypass();
    const active = this.auth.isBypassActive();
    if (active) {
      this.toast.success('⚡ เปิดโหมด Bypass Login (เข้าถึงได้ทุกหน้าโดยไม่ต้องล็อกอิน)');
    } else {
      this.toast.info('🔒 ปิดโหมด Bypass Login (เปิดใช้การตรวจสอบสิทธิ์ตามปกติ)');
    }
  }

  protected navigateTo(path: string): void {
    this.isExpanded.set(false);
    void this.router.navigateByUrl(path);
  }
}
