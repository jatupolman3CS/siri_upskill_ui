import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { PagedResult } from '../../../core/http/paged-result.model';
import type { Booking } from './tutoring-learner.models';
import type {
  BookWithPackageRequest,
  Guid,
  IsoUtc,
  MyPackagesQuery,
  PackagePurchaseDetail,
  PackagePurchaseSummary,
  PurchasePackageRequest,
} from './tutoring-package-purchase.models';

const purchasePath = (purchaseId: Guid): string => `/tutoring/package-purchases/${encodeURIComponent(purchaseId)}`;

/**
 * Signed-in learner endpoints of tutor packages (P13-12 section 5.6). The caller is the owner of everything here: no user id, tutor id
 * or price is ever sent, and the server answers 404 `tutoring.package_purchase_not_found` for an id that is not the caller's (the same
 * answer as for an id that does not exist). Payment of a purchase goes through `TutoringPaymentApiService.createPackagePayment`.
 * Errors surface as `ApiError`; resolve the stable `reason` with `tutoringErrorKey()`.
 */
@Injectable({ providedIn: 'root' })
export class TutoringPackagePurchaseApiService extends ApiService {
  /**
   * Starts a purchase for one of the caller's learner profiles; the price is the server's (from the tutor's current rate) and is fixed
   * from now on. 201, or 200 with the same `PendingPayment` purchase when one is already open. `409 tutoring.too_many_pending_purchases |
   * tutoring.cannot_book_self`, `404 tutoring.package_not_found | tutoring.learner_profile_not_found`.
   */
  purchase(packageId: Guid, learnerProfileId: Guid): Observable<PackagePurchaseSummary> {
    const body: PurchasePackageRequest = { learnerProfileId };
    return this.post<PackagePurchaseSummary>(`/tutoring/packages/${encodeURIComponent(packageId)}/purchase`, body);
  }

  /** The caller's purchases (newest first as the server orders them), optionally for one or more statuses. */
  listMyPackages(query: MyPackagesQuery): Observable<PagedResult<PackagePurchaseSummary>> {
    const status = Array.isArray(query.status) ? query.status.join(',') : query.status;
    return this.get<PagedResult<PackagePurchaseSummary>>('/tutoring/packages/my', {
      status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** One purchase with its credits. `404 tutoring.package_purchase_not_found` for a missing one and for somebody else's. */
  getPurchase(purchaseId: Guid): Observable<PackagePurchaseDetail> {
    return this.get<PackagePurchaseDetail>(purchasePath(purchaseId));
  }

  /** Gives up a purchase that is still waiting for payment. `409 tutoring.package_purchase_not_cancellable` once it is paid. */
  cancelPending(purchaseId: Guid): Observable<PackagePurchaseSummary> {
    return this.post<PackagePurchaseSummary>(`${purchasePath(purchaseId)}/cancel`, {});
  }

  /**
   * Books one lesson with one credit at the chosen start. The offering, length and learner come from the purchase; the answer is the
   * `Booking`, already `Confirmed` (no payment step): 201, or 200 when the same lesson was already booked (a repeated click). `409`
   * for `tutoring.package_no_credit | package_expired | package_not_active | package_session_after_expiry | package_tutor_unavailable |
   * slot_taken | slot_unavailable`, `400 tutoring.slot_too_soon | slot_too_far | slot_not_on_grid`.
   */
  bookWithCredit(purchaseId: Guid, startsAtUtc: IsoUtc): Observable<Booking> {
    const body: BookWithPackageRequest = { startsAtUtc };
    return this.post<Booking>(`${purchasePath(purchaseId)}/bookings`, body);
  }
}
