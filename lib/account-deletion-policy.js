// Local deletion policy foundation. Inputs must come from canonical server
// authority, never from request-body role flags. This does not delete an account
// or certify completion; the transactional lifecycle must recheck protection.
export const ACCOUNT_DELETION_HANDOFF_COPY = Object.freeze({
  title: "Administrative handoff required",
  message: "Your deletion request is pending. Required tournament administrative access must be transferred before account deletion can be completed.",
});

export const ACCOUNT_DELETION_REVIEW_HANDOFF_COPY = Object.freeze({
  title: "Review access handoff required",
  message: "Your account deletion request has been received. This account is currently required for App Review access. Deletion will complete after review access is safely released or transferred.",
});

export function accountDeletionDisposition(authority) {
  if (!authority || authority.authenticated !== true ||
      authority.canonicalAccount !== true ||
      typeof authority.activeOwner !== "boolean" ||
      typeof authority.finalAdministrator !== "boolean") {
    throw new Error("ACCOUNT_DELETION_AUTHORITY_REQUIRED");
  }
  if (!["participant", "reviewer"].includes(authority.accountKind)) {
    throw new Error("ACCOUNT_DELETION_ACCOUNT_KIND_UNSUPPORTED");
  }
  if (authority.accountKind === "reviewer") {
    if (authority.activeOwner || authority.finalAdministrator ||
        authority.administrator !== false || authority.scoringAuthority !== false ||
        authority.competitiveMembership !== false ||
        typeof authority.soleProtectedReviewer !== "boolean") {
      throw new Error("ACCOUNT_DELETION_AUTHORITY_REQUIRED");
    }
    if (authority.soleProtectedReviewer) {
      return Object.freeze({
        status: "PENDING_REVIEW_ACCESS_HANDOFF",
        mayDeleteAuthentication: false,
        completed: false,
        ...ACCOUNT_DELETION_REVIEW_HANDOFF_COPY,
      });
    }
  }
  if (authority.activeOwner || authority.finalAdministrator) {
    return Object.freeze({
      status: "PENDING_ADMINISTRATIVE_HANDOFF",
      mayDeleteAuthentication: false,
      completed: false,
      ...ACCOUNT_DELETION_HANDOFF_COPY,
    });
  }
  return Object.freeze({
    status: "ELIGIBLE_FOR_DELETION",
    mayDeleteAuthentication: true,
    completed: false,
  });
}
