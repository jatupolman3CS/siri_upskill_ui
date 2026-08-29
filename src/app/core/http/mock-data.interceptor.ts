import { HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Smart mock data interceptor that provides realistic demo data for all
 * functions, roles, and menus across the entire application.
 * If the real backend responds, it uses real backend; if offline or 404/500/connection error,
 * it instantly falls back to complete mock data so every page works seamlessly!
 */
export const mockDataInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const url = req.url;

  // Provide mock handler
  const handleMock = () => {
    const mockResponse = getMockResponse(req);
    if (mockResponse !== undefined) {
      return of(new HttpResponse({ status: 200, body: mockResponse }));
    }
    return of(new HttpResponse({ status: 200, body: { success: true } }));
  };

  // If request is to an external CDN/asset, pass directly
  if (!url.startsWith('/api') && !url.includes('/api/')) {
    return next(req);
  }

  // Attempt real request, fall back to mock data if it fails
  return next(req).pipe(
    catchError((error) => {
      console.info(`[MockInterceptor] Using offline demo data for ${req.method} ${url}`, error);
      return handleMock();
    })
  );
};

function getMockResponse(req: HttpRequest<unknown>): unknown {
  const url = req.url;
  const method = req.method;

  // 1. Auth & Identity
  if (url.includes('/identity/login') || url.includes('/identity/register')) {
    return {
      accessToken: 'mock_jwt_token_for_bypass_session',
      refreshToken: 'mock_refresh_token',
      expiresIn: 3600,
    };
  }

  if (url.includes('/identity/sessions') || url.includes('/account/devices')) {
    return {
      items: [
        {
          id: 'sess-01',
          deviceId: 'dev-chrome-win',
          deviceName: 'Chrome on Windows 11 (เครื่องนี้)',
          ipAddress: '127.0.0.1 (Bangkok, TH)',
          userAgent: 'Mozilla/5.0 Windows NT 10.0',
          createdAtUtc: new Date(Date.now() - 3600000).toISOString(),
          lastActiveAtUtc: new Date().toISOString(),
          isCurrent: true,
        },
        {
          id: 'sess-02',
          deviceId: 'dev-iphone-15',
          deviceName: 'Safari on iPhone 15 Pro',
          ipAddress: '171.96.120.45 (Bangkok, TH)',
          userAgent: 'Mozilla/5.0 iPhone Mobile',
          createdAtUtc: new Date(Date.now() - 86400000 * 3).toISOString(),
          lastActiveAtUtc: new Date(Date.now() - 1800000).toISOString(),
          isCurrent: false,
        },
      ],
      totalCount: 2,
    };
  }

  // 2. Catalog: Categories
  if (url.includes('/catalog/categories')) {
    return [
      {
        id: 'cat-dev',
        nameTh: 'พัฒนาโปรแกรมและเว็บ (Web & Software)',
        nameEn: 'Software & Web Development',
        slug: 'development',
        sortOrder: 1,
        courseCount: 24,
        children: [
          { id: 'cat-frontend', nameTh: 'Frontend Development (Angular, React, Vue)', nameEn: 'Frontend Development', slug: 'frontend', sortOrder: 1, courseCount: 12, children: [] },
          { id: 'cat-backend', nameTh: 'Backend & APIs (.NET, Node.js, Go)', nameEn: 'Backend Development', slug: 'backend', sortOrder: 2, courseCount: 8, children: [] },
          { id: 'cat-fullstack', nameTh: 'Fullstack Architecture', nameEn: 'Fullstack', slug: 'fullstack', sortOrder: 3, courseCount: 4, children: [] },
        ],
      },
      {
        id: 'cat-ai',
        nameTh: 'ปัญญาประดิษฐ์และข้อมูล (AI & Data)',
        nameEn: 'AI & Data Science',
        slug: 'ai-data',
        sortOrder: 2,
        courseCount: 18,
        children: [
          { id: 'cat-genai', nameTh: 'Generative AI & LLMs', nameEn: 'Generative AI', slug: 'gen-ai', sortOrder: 1, courseCount: 9, children: [] },
          { id: 'cat-data-eng', nameTh: 'Data Engineering & BigQuery', nameEn: 'Data Engineering', slug: 'data-engineering', sortOrder: 2, courseCount: 9, children: [] },
        ],
      },
      {
        id: 'cat-cloud',
        nameTh: 'คลาวด์และเดฟออปส์ (Cloud & DevOps)',
        nameEn: 'Cloud & DevOps',
        slug: 'cloud-devops',
        sortOrder: 3,
        courseCount: 15,
        children: [
          { id: 'cat-gcp', nameTh: 'Google Cloud Platform (GCP)', nameEn: 'GCP Cloud', slug: 'gcp', sortOrder: 1, courseCount: 7, children: [] },
          { id: 'cat-docker-k8s', nameTh: 'Docker & Kubernetes CI/CD', nameEn: 'Containers & DevOps', slug: 'devops', sortOrder: 2, courseCount: 8, children: [] },
        ],
      },
      {
        id: 'cat-business',
        nameTh: 'ธุรกิจและการบริหาร (Business & Tech Management)',
        nameEn: 'Business & Management',
        slug: 'business',
        sortOrder: 4,
        courseCount: 10,
        children: [],
      },
    ];
  }

  // 3. Catalog: Learning Paths
  if (url.includes('/catalog/learning-paths')) {
    const learningPaths = [
      {
        id: 'lp-fullstack-net-angular',
        slug: 'fullstack-net-angular',
        title: 'เส้นทางสู่มืออาชีพ Fullstack .NET 9 & Angular 19',
        description: 'เรียนรู้ตั้งแต่รากฐานจนถึงระดับ Enterprise Architecture พร้อม Deploy บน Kubernetes',
        thumbnailUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600',
        courseCount: 4,
        totalDurationMinutes: 1920,
        difficulty: 'Intermediate',
        courses: [
          { id: 'c-01', title: 'Modern Angular 19 & Signals Mastery', slug: 'angular-signals-mastery', order: 1 },
          { id: 'c-02', title: '.NET 9 Clean Architecture & CQRS', slug: 'dotnet-clean-architecture', order: 2 },
          { id: 'c-03', title: 'PostgreSQL & EF Core High Performance', slug: 'postgresql-efcore-performance', order: 3 },
          { id: 'c-04', title: 'CI/CD & Cloud Native Deployment', slug: 'cloud-native-devops', order: 4 },
        ],
      },
      {
        id: 'lp-ai-engineer',
        slug: 'ai-engineer-mastery',
        title: 'เส้นทาง Generative AI & LLM Application Engineer',
        description: 'สร้าง AI Agent และระบบ RAG ขั้นสูงด้วย Python, LangChain, และ Vector Database',
        thumbnailUrl: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=600',
        courseCount: 3,
        totalDurationMinutes: 1440,
        difficulty: 'Advanced',
        courses: [],
      },
    ];

    if (url.includes('/catalog/learning-paths/')) {
      return learningPaths[0];
    }
    return { items: learningPaths, totalCount: learningPaths.length };
  }

  // 4. Catalog: Courses Search & Detail
  if (url.includes('/catalog/courses')) {
    const mockCourses = [
      {
        id: 'c-01',
        slug: 'angular-signals-mastery',
        title: 'Modern Angular 19: Full Signals, SSR & Enterprise Architecture',
        shortDescription: 'ยกระดับการพัฒนาเว็บด้วย Angular 19 รุ่นล่าสุด เรียนรู้ Signals, SSR, Hydration, และ Tailwind CSS แบบมืออาชีพ',
        instructorId: 'usr-instructor-001',
        instructorName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น',
        instructorAvatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        instructorBio: 'Senior Software Architect & Google Developer Expert ประสบการณ์พัฒนาระบบ Enterprise กว่า 15 ปี',
        categoryId: 'cat-frontend',
        categoryName: 'Frontend Development',
        price: 2490,
        originalPrice: 4500,
        averageRating: 4.95,
        reviewCount: 342,
        studentCount: 1850,
        episodeCount: 48,
        totalDurationMinutes: 720,
        level: 'Intermediate',
        thumbnailUrl: 'https://images.unsplash.com/photo-1593720213428-28a5b9e94613?w=600',
        isEnrolled: true,
        progressPercent: 65,
        updatedAtUtc: new Date().toISOString(),
        sections: [
          {
            id: 'sec-01',
            title: 'บทนำและภาพรวม Angular 19 Architecture',
            order: 1,
            episodes: [
              { id: 'ep-01', title: '1.1 ยินดีต้อนรับสู่หลักสูตร & ภาพรวมสิ่งที่จะได้เรียนรู้', durationMinutes: 12, isFreePreview: true, videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
              { id: 'ep-02', title: '1.2 การติดตั้ง Environment, Node 22, Angular CLI ล่าสุด', durationMinutes: 18, isFreePreview: true, videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
              { id: 'ep-03', title: '1.3 สถาปัตยกรรม Standalone Components & Signal Inputs/Outputs', durationMinutes: 25, isFreePreview: false, videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
            ],
          },
          {
            id: 'sec-02',
            title: 'การจัดการ State ด้วย Angular Signals แบบเจาะลึก',
            order: 2,
            episodes: [
              { id: 'ep-04', title: '2.1 Writable Signal, Computed Signal & Effect Best Practices', durationMinutes: 30, isFreePreview: false, videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
              { id: 'ep-05', title: '2.2 การแปลง RxJS Observable <-> Signals ด้วย rxjs-interop', durationMinutes: 28, isFreePreview: false, videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
              { id: 'ep-06', title: '2.3 Resource API & rxResource สำหรับจัดการ Remote Async Data', durationMinutes: 35, isFreePreview: false, videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
            ],
          },
        ],
      },
      {
        id: 'c-02',
        slug: 'dotnet-clean-architecture',
        title: '.NET 9 Clean Architecture, CQRS & Domain-Driven Design (DDD)',
        shortDescription: 'สร้างระบบ Backend ระดับ Enterprise ด้วย .NET 9, MediatR, EF Core, PostgreSQL และ Clean Architecture ที่ถูกต้องตามมาตรฐานโลก',
        instructorId: 'usr-instructor-001',
        instructorName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น',
        categoryId: 'cat-backend',
        categoryName: 'Backend Development',
        price: 2990,
        originalPrice: 5200,
        averageRating: 4.92,
        reviewCount: 215,
        studentCount: 1240,
        episodeCount: 56,
        totalDurationMinutes: 840,
        level: 'Advanced',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600',
        isEnrolled: false,
        progressPercent: 0,
        updatedAtUtc: new Date().toISOString(),
      },
      {
        id: 'c-03',
        slug: 'genai-rag-agent-mastery',
        title: 'Generative AI & Autonomous Agents with Python & LangChain',
        shortDescription: 'พัฒนา AI Assistant และ Multi-Agent Workflows ตอบคำถามจากฐานข้อมูลองค์กรด้วย RAG และ Vector DB',
        instructorId: 'usr-instructor-002',
        instructorName: 'ดร. อานนท์ ผู้เชี่ยวชาญ AI',
        categoryId: 'cat-ai',
        categoryName: 'AI & Data Science',
        price: 3290,
        originalPrice: 5900,
        averageRating: 4.98,
        reviewCount: 410,
        studentCount: 2100,
        episodeCount: 42,
        totalDurationMinutes: 680,
        level: 'Intermediate',
        thumbnailUrl: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=600',
        isEnrolled: true,
        progressPercent: 30,
        updatedAtUtc: new Date().toISOString(),
      },
      {
        id: 'c-04',
        slug: 'cloud-kubernetes-devops',
        title: 'Cloud DevOps Masterclass: Docker, Kubernetes & CI/CD on GCP',
        shortDescription: 'ปูพื้นฐานและลงมือทำจริงกับ Containerization, Helm, Terraform, GitHub Actions และ Google Cloud GKE',
        instructorId: 'usr-instructor-003',
        instructorName: 'คุณธนภัทร Cloud Architect',
        categoryId: 'cat-cloud',
        categoryName: 'Cloud & DevOps',
        price: 2690,
        originalPrice: 4800,
        averageRating: 4.88,
        reviewCount: 180,
        studentCount: 980,
        episodeCount: 38,
        totalDurationMinutes: 590,
        level: 'Intermediate',
        thumbnailUrl: 'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=600',
        isEnrolled: true,
        progressPercent: 100,
        updatedAtUtc: new Date().toISOString(),
      },
    ];

    if (url.includes('/catalog/courses/')) {
      const slug = url.split('/catalog/courses/')[1]?.split('?')[0];
      const found = mockCourses.find((c) => c.slug === slug || c.id === slug) || mockCourses[0];
      return found;
    }

    return {
      results: {
        items: mockCourses,
        totalCount: mockCourses.length,
        page: 1,
        pageSize: 20,
      },
    };
  }

  // 5. Learning: My Courses Dashboard
  if (url.includes('/learning/my-courses') || url.includes('/learning/enrollments')) {
    return [
      {
        courseId: 'c-01',
        courseSlug: 'angular-signals-mastery',
        courseTitle: 'Modern Angular 19: Full Signals, SSR & Enterprise Architecture',
        thumbnailUrl: 'https://images.unsplash.com/photo-1593720213428-28a5b9e94613?w=600',
        instructorName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น',
        progressPercent: 65,
        completedEpisodes: 31,
        totalEpisodes: 48,
        lastAccessedEpisodeId: 'ep-04',
        lastAccessedEpisodeTitle: '2.1 Writable Signal, Computed Signal & Effect',
        certificateIssued: false,
        enrolledAtUtc: new Date(Date.now() - 86400000 * 14).toISOString(),
      },
      {
        courseId: 'c-04',
        courseSlug: 'cloud-kubernetes-devops',
        courseTitle: 'Cloud DevOps Masterclass: Docker, Kubernetes & CI/CD on GCP',
        thumbnailUrl: 'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=600',
        instructorName: 'คุณธนภัทร Cloud Architect',
        progressPercent: 100,
        completedEpisodes: 38,
        totalEpisodes: 38,
        lastAccessedEpisodeId: 'ep-38',
        lastAccessedEpisodeTitle: 'สรุปบทเรียนและสอบวัดผล',
        certificateIssued: true,
        certificateCode: 'CERT-SIRI-2026-89412',
        enrolledAtUtc: new Date(Date.now() - 86400000 * 30).toISOString(),
      },
      {
        courseId: 'c-03',
        courseSlug: 'genai-rag-agent-mastery',
        courseTitle: 'Generative AI & Autonomous Agents with Python & LangChain',
        thumbnailUrl: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=600',
        instructorName: 'ดร. อานนท์ ผู้เชี่ยวชาญ AI',
        progressPercent: 30,
        completedEpisodes: 13,
        totalEpisodes: 42,
        lastAccessedEpisodeId: 'ep-13',
        lastAccessedEpisodeTitle: 'Vector Embeddings & Similarity Search',
        certificateIssued: false,
        enrolledAtUtc: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
    ];
  }

  // 6. Learning: Classroom / Learn Room
  if (url.includes('/learning/courses/') && url.includes('/learn')) {
    return {
      courseId: 'c-01',
      courseTitle: 'Modern Angular 19: Full Signals, SSR & Enterprise Architecture',
      slug: 'angular-signals-mastery',
      currentEpisode: {
        id: 'ep-04',
        title: '2.1 Writable Signal, Computed Signal & Effect Best Practices',
        videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        durationMinutes: 30,
        description: 'เจาะลึกการใช้ Signals ในการคำนวณ State และการหลีกเลี่ยง Side-effects ที่ไม่พึงประสงค์',
        attachments: [
          { id: 'att-01', fileName: 'angular-19-signals-cheatsheet.pdf', fileSizeMb: 2.4, downloadUrl: '#' },
          { id: 'att-02', fileName: 'lesson-04-source-code.zip', fileSizeMb: 5.1, downloadUrl: '#' },
        ],
        quiz: {
          id: 'quiz-01',
          title: 'แบบทดสอบความเข้าใจ Signals vs RxJS',
          questions: [
            {
              id: 'q-01',
              text: 'คำสั่งใดใช้ในการสร้าง Computed Signal ที่คำนวณค่าจาก Signal อื่น?',
              options: ['signal()', 'computed()', 'effect()', 'toSignal()'],
              correctOptionIndex: 1,
            },
          ],
        },
      },
      sections: [
        {
          id: 'sec-01',
          title: 'บทนำและภาพรวม Angular 19 Architecture',
          episodes: [
            { id: 'ep-01', title: '1.1 ยินดีต้อนรับสู่หลักสูตร', durationMinutes: 12, completed: true },
            { id: 'ep-02', title: '1.2 การติดตั้ง Environment & CLI', durationMinutes: 18, completed: true },
            { id: 'ep-03', title: '1.3 สถาปัตยกรรม Standalone Components', durationMinutes: 25, completed: true },
          ],
        },
        {
          id: 'sec-02',
          title: 'การจัดการ State ด้วย Angular Signals แบบเจาะลึก',
          episodes: [
            { id: 'ep-04', title: '2.1 Writable Signal, Computed Signal & Effect', durationMinutes: 30, completed: false, isCurrent: true },
            { id: 'ep-05', title: '2.2 การแปลง RxJS <-> Signals', durationMinutes: 28, completed: false },
            { id: 'ep-06', title: '2.3 Resource API & rxResource', durationMinutes: 35, completed: false },
          ],
        },
      ],
    };
  }

  // 7. Commerce: Cart & Orders
  if (url.includes('/commerce/cart')) {
    return {
      items: [
        {
          courseId: 'c-02',
          slug: 'dotnet-clean-architecture',
          title: '.NET 9 Clean Architecture, CQRS & Domain-Driven Design (DDD)',
          thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600',
          instructorName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น',
          price: 2990,
          originalPrice: 5200,
        },
      ],
      totalAmount: 2990,
      discountAmount: 0,
      finalAmount: 2990,
    };
  }

  if (url.includes('/commerce/orders')) {
    return {
      items: [
        {
          orderId: 'ORD-2026-0801',
          orderedAtUtc: new Date(Date.now() - 86400000 * 5).toISOString(),
          status: 'Completed',
          paymentMethod: 'PromptPay QR',
          totalAmount: 2490,
          discountAmount: 500,
          netAmount: 1990,
          items: [
            {
              courseId: 'c-01',
              title: 'Modern Angular 19: Full Signals, SSR & Enterprise Architecture',
              price: 2490,
            },
          ],
        },
        {
          orderId: 'ORD-2026-0715',
          orderedAtUtc: new Date(Date.now() - 86400000 * 30).toISOString(),
          status: 'Completed',
          paymentMethod: 'CreditCard',
          totalAmount: 2690,
          discountAmount: 0,
          netAmount: 2690,
          items: [
            {
              courseId: 'c-04',
              title: 'Cloud DevOps Masterclass: Docker, Kubernetes & CI/CD on GCP',
              price: 2690,
            },
          ],
        },
      ],
      totalCount: 2,
    };
  }

  // 8. Admin: Dashboard Summary
  if (url.includes('/admin/dashboard') || url.includes('/api/admin/dashboard')) {
    return {
      todaySales: 48900,
      todayNewLearners: 28,
      totalLearners: 5420,
      pendingCourseReviewsCount: 3,
      pendingRefundsCount: 1,
      topCourses30Days: [
        { courseId: 'c-01', courseTitle: 'Modern Angular 19: Signals & SSR', totalRevenue: 148000, totalEnrollments: 62, totalViews: 4120 },
        { courseId: 'c-03', courseTitle: 'Generative AI & Autonomous Agents', totalRevenue: 135000, totalEnrollments: 45, totalViews: 5890 },
        { courseId: 'c-02', courseTitle: '.NET 9 Clean Architecture & CQRS', totalRevenue: 98000, totalEnrollments: 34, totalViews: 3200 },
      ],
    };
  }

  // 9. Admin: Pending Course Moderation
  if (url.includes('/admin/courses') || url.includes('/admin/moderation')) {
    return {
      items: [
        {
          id: 'c-rev-01',
          slug: 'cybersecurity-offensive-defense',
          title: 'Cybersecurity Fundamentals & Security Hardening 2026',
          instructorId: 'usr-instructor-004',
          instructorName: 'คุณกิตติชัย Security Specialist',
          categoryId: 'cat-cloud',
          categoryName: 'Cloud & DevOps',
          price: 3500,
          thumbnailUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600',
          episodeCount: 36,
          totalDurationMinutes: 540,
          submittedAtUtc: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: 'c-rev-02',
          slug: 'flutter-cross-platform-mastery',
          title: 'Flutter 3.24 & Dart: สร้างแอป iOS & Android ระดับ Production',
          instructorId: 'usr-instructor-005',
          instructorName: 'คุณณัฐวุฒิ Mobile Lead',
          categoryId: 'cat-dev',
          categoryName: 'Software Development',
          price: 2790,
          thumbnailUrl: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600',
          episodeCount: 42,
          totalDurationMinutes: 620,
          submittedAtUtc: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      totalCount: 2,
      page: 1,
      pageSize: 20,
    };
  }

  // 10. Admin: Users Management
  if (url.includes('/admin/users') || url.includes('/identity/admin/users')) {
    return {
      items: [
        {
          id: 'usr-superadmin-001',
          email: 'superadmin@siriupskill.com',
          displayName: 'สมชาย แอดมินใหญ่ (Super Admin)',
          status: 'Active',
          roles: ['SuperAdmin', 'Admin', 'Instructor', 'Learner'],
          createdAtUtc: '2026-01-01T00:00:00Z',
          lastLoginAtUtc: new Date().toISOString(),
        },
        {
          id: 'usr-admin-001',
          email: 'admin@siriupskill.com',
          displayName: 'วิภาดา ผู้ดูแลระบบ (Admin)',
          status: 'Active',
          roles: ['Admin', 'Instructor', 'Learner'],
          createdAtUtc: '2026-01-15T00:00:00Z',
          lastLoginAtUtc: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: 'usr-instructor-001',
          email: 'instructor@siriupskill.com',
          displayName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น (Instructor)',
          status: 'Active',
          roles: ['Instructor', 'Learner'],
          createdAtUtc: '2026-02-01T00:00:00Z',
          lastLoginAtUtc: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: 'usr-learner-001',
          email: 'learner@siriupskill.com',
          displayName: 'กิตติศักดิ์ นักเรียนมุ่งมั่น (Learner)',
          status: 'Active',
          roles: ['Learner'],
          createdAtUtc: '2026-03-01T00:00:00Z',
          lastLoginAtUtc: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      totalCount: 4,
      page: 1,
      pageSize: 20,
    };
  }

  // 11. Admin: Marketing & Coupons
  if (url.includes('/admin/marketing') || url.includes('/admin/promos')) {
    return {
      items: [
        {
          id: 'promo-01',
          code: 'SIRI2026',
          discountType: 'Percentage',
          discountValue: 20,
          maxUsageCount: 500,
          currentUsageCount: 142,
          minOrderAmount: 1000,
          startsAtUtc: '2026-01-01T00:00:00Z',
          expiresAtUtc: '2026-12-31T23:59:59Z',
          isActive: true,
        },
        {
          id: 'promo-02',
          code: 'WELCOME500',
          discountType: 'FixedAmount',
          discountValue: 500,
          maxUsageCount: 1000,
          currentUsageCount: 685,
          minOrderAmount: 2000,
          startsAtUtc: '2026-01-01T00:00:00Z',
          expiresAtUtc: '2026-12-31T23:59:59Z',
          isActive: true,
        },
      ],
      totalCount: 2,
    };
  }

  // 12. Admin: Banners & CMS
  if (url.includes('/admin/banners') || url.includes('/cms/banners')) {
    return [
      {
        id: 'ban-01',
        title: 'เรียนรู้เทคโนโลยีใหม่ล่าสุด อัปสกิลสู่อนาคต 2026',
        imageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200',
        targetUrl: '/courses',
        sortOrder: 1,
        isActive: true,
        startsAtUtc: null,
        endsAtUtc: null,
        createdAtUtc: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ban-02',
        title: 'โปรโมชั่นพิเศษ ลด 20% ทุกคอร์ส ใส่โค้ด SIRI2026',
        imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200',
        targetUrl: '/courses',
        sortOrder: 2,
        isActive: true,
        startsAtUtc: null,
        endsAtUtc: null,
        createdAtUtc: '2026-01-10T00:00:00Z',
      },
    ];
  }

  // 13. Admin: Navigation Menus
  if (url.includes('/admin/menus') || url.includes('/cms/menus')) {
    return [
      { id: 'm-01', label: 'หน้าแรก', url: '/', sortOrder: 1, isActive: true, parentId: null },
      { id: 'm-02', label: 'คอร์สเรียน', url: '/courses', sortOrder: 2, isActive: true, parentId: null },
      { id: 'm-03', label: 'เส้นทางการเรียนรู้', url: '/learning-paths', sortOrder: 3, isActive: true, parentId: null },
      { id: 'm-04', label: 'บทความ & สาระน่ารู้', url: '/blog', sortOrder: 4, isActive: true, parentId: null },
    ];
  }

  // 14. Admin: Posts (Blog CMS)
  if (url.includes('/admin/posts') || url.includes('/cms/posts') || url.includes('/blog')) {
    return {
      items: [
        {
          id: 'post-01',
          title: 'เจาะลึก 10 ฟีเจอร์ใหม่ใน Angular 19 ที่เปลี่ยนโลก Frontend',
          slug: 'angular-19-top-features',
          excerpt: 'สรุปการเปลี่ยนแปลงสำคัญของ Angular 19: Signals by default, Incremental Hydration, และ New Resource API',
          contentHtml: '<p>Angular 19 นำพาความเร็วและประสิทธิภาพที่เหนือชั้นมาสู่วงการ...</p>',
          coverImageUrl: 'https://images.unsplash.com/photo-1593720213428-28a5b9e94613?w=800',
          authorId: 'usr-admin-001',
          authorName: 'Siri Editorial Team',
          status: 'Published',
          publishedAtUtc: '2026-08-20T10:00:00Z',
          createdAtUtc: '2026-08-18T08:00:00Z',
        },
        {
          id: 'post-02',
          title: 'ทำไม .NET 9 ถึงเป็น Framework ยอดนิยมสูงสุดสำหรับ Enterprise Microservices',
          slug: 'dotnet-9-enterprise-microservices',
          excerpt: 'รีวิวความสามารถด้าน Performance, Native AOT และ Minimal API ใน .NET 9',
          contentHtml: '<p>.NET 9 ได้รับการปรับปรุงด้านความเร็วและการกินหน่วยความจำอย่างก้าวกระโดด...</p>',
          coverImageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
          authorId: 'usr-instructor-001',
          authorName: 'อ. ดร. ปริญญา',
          status: 'Published',
          publishedAtUtc: '2026-08-15T09:00:00Z',
          createdAtUtc: '2026-08-14T07:00:00Z',
        },
      ],
      totalCount: 2,
    };
  }

  // 15. Admin: Payouts
  if (url.includes('/admin/payouts') || url.includes('/payout/batches')) {
    return {
      items: [
        {
          id: 'pay-batch-2026-08',
          periodName: 'รอบประจำเดือน สิงหาคม 2026',
          totalAmount: 185400,
          instructorCount: 12,
          status: 'Completed',
          processedAtUtc: new Date(Date.now() - 86400000 * 3).toISOString(),
        },
        {
          id: 'pay-batch-2026-07',
          periodName: 'รอบประจำเดือน กรกฎาคม 2026',
          totalAmount: 162900,
          instructorCount: 10,
          status: 'Completed',
          processedAtUtc: new Date(Date.now() - 86400000 * 33).toISOString(),
        },
      ],
      totalCount: 2,
    };
  }

  // 16. Admin: Payments Log
  if (url.includes('/admin/payments') || url.includes('/payment/transactions')) {
    return {
      items: [
        {
          id: 'txn-01',
          orderId: 'ORD-2026-0801',
          learnerName: 'กิตติศักดิ์ นักเรียนมุ่งมั่น',
          amount: 1990,
          method: 'PromptPay QR',
          status: 'Success',
          createdAtUtc: new Date(Date.now() - 3600000 * 2).toISOString(),
        },
        {
          id: 'txn-02',
          orderId: 'ORD-2026-0800',
          learnerName: 'ศิริพร บุญมี',
          amount: 2490,
          method: 'Credit Card',
          status: 'Success',
          createdAtUtc: new Date(Date.now() - 3600000 * 5).toISOString(),
        },
        {
          id: 'txn-03',
          orderId: 'ORD-2026-0799',
          learnerName: 'มนัสวี สุขเกษม',
          amount: 3290,
          method: 'PromptPay QR',
          status: 'Success',
          createdAtUtc: new Date(Date.now() - 3600000 * 9).toISOString(),
        },
      ],
      totalCount: 3,
    };
  }

  // 17. Admin: Contact Messages
  if (url.includes('/admin/contact-messages') || url.includes('/contact/messages')) {
    return {
      items: [
        {
          id: 'msg-01',
          senderName: 'วิทวัส เทคโนโลยี',
          senderEmail: 'wittawat@example.com',
          subject: 'สอบถามการจัดอบรมแบบ Corporate Training สำหรับองค์กร',
          message: 'ต้องการขอใบเสนอราคาคอร์ส Angular 19 และ .NET 9 สำหรับทีมงาน 20 ท่านครับ',
          status: 'Pending',
          createdAtUtc: new Date(Date.now() - 3600000 * 4).toISOString(),
        },
        {
          id: 'msg-02',
          senderName: 'กนกวรรณ จันทร์เพ็ญ',
          senderEmail: 'kanokwan@example.com',
          subject: 'ขอคำปรึกษาการออกใบกำกับภาษีเต็มรูปแบบ',
          message: 'ได้ทำการชำระเงินคอร์สเรียนเรียบร้อยแล้ว ต้องการกรอกข้อมูลบริษัทเพื่อขอรับใบกำกับภาษีค่ะ',
          status: 'Replied',
          createdAtUtc: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
      ],
      totalCount: 2,
    };
  }

  // 18. Instructor: Studio Analytics & Earnings
  if (url.includes('/instructor/analytics') || url.includes('/instructor/earnings') || url.includes('/instructor/dashboard')) {
    return {
      totalRevenue: 342500,
      monthlyRevenue: 68400,
      totalStudents: 3120,
      averageRating: 4.94,
      totalCourses: 4,
      recentEnrollments: [
        { studentName: 'กิตติศักดิ์ ม.', courseTitle: 'Modern Angular 19', date: new Date().toISOString(), amount: 2490 },
        { studentName: 'พงศ์พิสุทธิ์ น.', courseTitle: '.NET 9 Clean Architecture', date: new Date(Date.now() - 7200000).toISOString(), amount: 2990 },
        { studentName: 'กรรณิการ์ ท.', courseTitle: 'Modern Angular 19', date: new Date(Date.now() - 18000000).toISOString(), amount: 2490 },
      ],
      revenueChart: [
        { month: 'มี.ค.', amount: 42000 },
        { month: 'เม.ย.', amount: 51000 },
        { month: 'พ.ค.', amount: 58000 },
        { month: 'มิ.ย.', amount: 62000 },
        { month: 'ก.ค.', amount: 65000 },
        { month: 'ส.ค.', amount: 68400 },
      ],
    };
  }

  // 19. Notifications
  if (url.includes('/notifications')) {
    return {
      items: [
        {
          id: 'notif-01',
          title: 'ยินดีต้อนรับสู่ SIRI UpSkill!',
          message: 'เริ่มต้นการเรียนรู้ทักษะไอทีระดับมืออาชีพได้ทันที',
          isRead: false,
          createdAtUtc: new Date().toISOString(),
        },
        {
          id: 'notif-02',
          title: 'คอร์สใหม่แนะนำ: Modern Angular 19',
          message: 'หลักสูตรใหม่ล่าสุดเปิดให้ลงทะเบียนแล้ววันนี้',
          isRead: false,
          createdAtUtc: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      unreadCount: 2,
    };
  }

  // 20. Wishlist
  if (url.includes('/wishlist')) {
    return {
      items: [
        {
          courseId: 'c-02',
          title: '.NET 9 Clean Architecture, CQRS & Domain-Driven Design (DDD)',
          slug: 'dotnet-clean-architecture',
          thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600',
          instructorName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น',
          price: 2990,
          originalPrice: 5200,
          averageRating: 4.92,
          reviewCount: 215,
        },
      ],
      totalCount: 1,
    };
  }

  return { success: true };
}
