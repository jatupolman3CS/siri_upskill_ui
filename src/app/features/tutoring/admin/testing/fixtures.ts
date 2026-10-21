import type { AdminDisputeDetail, AdminDisputeListItem, AdminDisputeMessage, AdminDisputeSummary } from '../data/admin-dispute.models';
import type { AdminKycCaseDetail, AdminKycCaseListItem, AdminKycDocument } from '../data/admin-kyc.models';
import type { AdminSubject, AdminTutorDetail, AdminTutorListItem } from '../data/admin-tutor.models';

/** Fixtures of the administrator tutoring specs. Plain data; each factory takes overrides. */

export function kycDocument(overrides: Partial<AdminKycDocument> = {}): AdminKycDocument {
  return {
    documentId: 'doc-1',
    type: 'IdCard',
    status: 'Pending',
    contentType: 'application/pdf',
    sizeBytes: 250_000,
    uploadedAtUtc: '2026-10-14T05:00:00Z',
    expiresAtUtc: null,
    purgeAfterUtc: null,
    purged: false,
    sameFileSeenFromOtherTutors: 0,
    ...overrides,
  };
}

export function kycCaseItem(overrides: Partial<AdminKycCaseListItem> = {}): AdminKycCaseListItem {
  return {
    caseId: 'case-1',
    tutorId: 'tutor-1',
    tutorDisplayName: 'Khun Somchai',
    attemptNo: 1,
    status: 'Submitted',
    submittedAtUtc: '2026-10-13T03:00:00Z',
    documentCount: 3,
    waitingHours: 30,
    ...overrides,
  };
}

export function kycCase(overrides: Partial<AdminKycCaseDetail> = {}): AdminKycCaseDetail {
  return {
    caseId: 'case-1',
    tutorId: 'tutor-1',
    tutorDisplayName: 'Khun Somchai',
    gender: 'Male',
    headline: 'Maths tutor',
    attemptNo: 1,
    status: 'Submitted',
    submittedAtUtc: '2026-10-13T03:00:00Z',
    decidedAtUtc: null,
    decidedByUserId: null,
    decisionNote: null,
    consentVersion: '2026-10-v1',
    consentAtUtc: '2026-10-13T02:00:00Z',
    tutorStatus: 'PendingVerification',
    requiredDocumentTypes: ['IdCard', 'Diploma'],
    documents: [
      kycDocument({ documentId: 'doc-1', type: 'IdCard' }),
      kycDocument({ documentId: 'doc-2', type: 'Diploma', contentType: 'image/png' }),
    ],
    rowVersion: 'AAAAAAAAB9E=',
    ...overrides,
  };
}

export function tutorItem(overrides: Partial<AdminTutorListItem> = {}): AdminTutorListItem {
  return {
    tutorId: 'tutor-1',
    slug: 'khun-somchai',
    displayName: 'Khun Somchai',
    status: 'Verified',
    isListed: true,
    ratingAverage: 4.67,
    ratingCount: 12,
    completedSessionsCount: 40,
    reliabilityScore: 96,
    commissionPercentOverride: null,
    verifiedAtUtc: '2026-09-01T03:00:00Z',
    statusChangedAtUtc: '2026-09-01T03:00:00Z',
    ...overrides,
  };
}

export function tutorDetail(overrides: Partial<AdminTutorDetail> = {}): AdminTutorDetail {
  return {
    tutorId: 'tutor-1',
    userId: 'user-1',
    instructorProfileId: 'instructor-1',
    slug: 'khun-somchai',
    displayName: 'Khun Somchai',
    headline: 'Maths tutor',
    bio: 'Ten years teaching maths.',
    gender: 'Male',
    yearsExperience: 10,
    status: 'Verified',
    statusReason: null,
    isListed: true,
    commissionPercentOverride: null,
    effectiveCommissionPercent: 20,
    ratingAverage: 4.67,
    ratingCount: 12,
    completedSessionsCount: 40,
    reliabilityScore: 96,
    nextAvailableAtUtc: '2026-10-16T03:00:00Z',
    verifiedAtUtc: '2026-09-01T03:00:00Z',
    statusChangedAtUtc: '2026-09-01T03:00:00Z',
    offerings: [
      {
        offeringId: 'o-1',
        subject: { subjectId: 's-1', slug: 'maths', nameTh: 'Maths TH', nameEn: 'Mathematics' },
        level: 'UpperSecondary',
        curriculum: 'Thai',
        hourlyRateOneOnOne: 500,
        groupHourlyRatePerSeat: 300,
        groupMaxSeats: 4,
        trialEnabled: false,
        trialMinutes: null,
        trialPrice: null,
        isActive: true,
      },
    ],
    educations: [{ educationId: 'e-1', institution: 'Chula', degree: 'BSc', field: 'Maths', yearFrom: 2008, yearTo: 2012, sortOrder: 1 }],
    certificates: [{ certificateId: 'c-1', title: 'Teaching licence', issuer: 'KSP', year: 2014, sortOrder: 1 }],
    ...overrides,
  };
}

export function subject(overrides: Partial<AdminSubject> = {}): AdminSubject {
  return { subjectId: 'g-1', slug: 'science', nameTh: 'Science TH', nameEn: 'Science', parentId: null, sortOrder: 10, isActive: true, ...overrides };
}

export function disputeSummary(overrides: Partial<AdminDisputeSummary> = {}): AdminDisputeSummary {
  return {
    open: 3,
    underReview: 2,
    overdue: 1,
    highPriority: 1,
    awaitingAdminReply: 2,
    needsFollowUp: 1,
    oldestOpenedAtUtc: '2026-10-10T03:00:00Z',
    frozenAmountTotal: 4500,
    serverTimeUtc: '2026-10-15T03:00:00Z',
    ...overrides,
  };
}

export function disputeItem(overrides: Partial<AdminDisputeListItem> = {}): AdminDisputeListItem {
  return {
    disputeId: 'd-1',
    disputeNo: 'DS-261014-AB12CD',
    bookingNo: 'BK-1',
    status: 'Open',
    category: 'NoClass',
    flow: 'Escrow',
    priority: 'Normal',
    openedByRole: 'Learner',
    tutor: { tutorId: 'tutor-1', displayName: 'Khun Somchai', slug: 'khun-somchai' },
    learnerNickname: 'Nong Mint',
    learnerIsMinor: true,
    amountAtStake: 800,
    openedAtUtc: '2026-10-14T03:00:00Z',
    lastActivityAtUtc: '2026-10-14T05:00:00Z',
    lastMessageRole: 'Learner',
    slaDueAtUtc: '2026-10-17T03:00:00Z',
    isOverdue: false,
    ageHours: 24,
    agingAlertLevel: 1,
    repeatComplaintFlag: false,
    assignedToUserId: null,
    escrowFreeze: 'Frozen',
    compensationRequired: false,
    compensationSettled: false,
    ...overrides,
  };
}

export function disputeMessage(overrides: Partial<AdminDisputeMessage> = {}): AdminDisputeMessage {
  return {
    messageId: 'm-1',
    kind: 'Message',
    authorRole: 'Learner',
    body: 'The tutor never came.',
    evidenceLinks: [],
    createdAtUtc: '2026-10-14T03:05:00Z',
    visibility: 'Parties',
    authorUserId: 'u-1',
    ...overrides,
  };
}

export function disputeDetail(overrides: Partial<AdminDisputeDetail> = {}): AdminDisputeDetail {
  return {
    ...disputeItem(),
    bookingId: 'b-1',
    sessionId: 's-1',
    description: 'The tutor never joined the room.',
    bookingStatusAtOpen: 'Completed',
    session: { startsAtUtc: '2026-10-13T03:00:00Z', endsAtUtc: '2026-10-13T04:00:00Z', subjectNameTh: 'Maths TH', subjectNameEn: 'Mathematics', format: 'OneOnOne' },
    learner: { nickname: 'Nong Mint', gradeLevel: 'Secondary2', isMinor: true },
    attendance: {
      tutorJoinedAtUtc: null,
      tutorConfirmedAtUtc: null,
      learnerJoinedAtUtc: '2026-10-13T03:01:00Z',
      tutorPresentAttestedAtUtc: null,
      learnerConfirmedAtUtc: null,
      decision: { outcome: 'Completed', decidedAtUtc: '2026-10-13T04:05:00Z', decidedBy: 'System', tutorEvidence: 'None', learnerEvidence: 'Joined' },
      joinLogs: [{ role: 'Learner', joinedAtUtc: '2026-10-13T03:01:00Z' }],
    },
    payment: { paymentId: 'p-1', method: 'PromptPay', status: 'Succeeded', amount: 800, refundReservedAmount: 0, refundedCompletedAmount: 0, succeededAtUtc: '2026-10-12T03:00:00Z' },
    refunds: [],
    priceAmount: 800,
    refundedAmount: 0,
    isPackageBooking: false,
    tutorHistory: {
      status: 'Verified',
      reliabilityScore: 96,
      ratingAverage: 4.5,
      ratingCount: 10,
      completedSessionsCount: 40,
      penalties: [],
      disputes90d: { total: 2, upheld: 1, noRefundOrRejected: 1 },
    },
    evidenceLinks: [],
    messages: [
      disputeMessage({ messageId: 'm-sys', kind: 'System', authorRole: 'System', body: 'opened', authorUserId: null }),
      disputeMessage(),
      disputeMessage({ messageId: 'm-int', authorRole: 'Admin', body: 'Check the room logs.', visibility: 'Internal' }),
    ],
    decision: null,
    hints: ['minor_learner'],
    repeatComplaintCount: 1,
    tutorSuspension: 'NotRequested',
    alreadyDecided: false,
    serverTimeUtc: '2026-10-15T03:00:00Z',
    ...overrides,
  };
}
