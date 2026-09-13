import test from "node:test";
import assert from "node:assert/strict";
import { accountDeletionDisposition } from "../lib/account-deletion-policy.js";

const participant = Object.freeze({
  authenticated: true, canonicalAccount: true, accountKind: "participant",
  activeOwner: false, finalAdministrator: false,
});

test("eligible participant is never reported deleted by policy evaluation", () => {
  const result = accountDeletionDisposition(participant);
  assert.equal(result.status, "ELIGIBLE_FOR_DELETION");
  assert.equal(result.mayDeleteAuthentication, true);
  assert.equal(result.completed, false);
});

for (const protection of ["activeOwner", "finalAdministrator"]) {
  test(`${protection} preserves authentication and requires handoff`, () => {
    const input = Object.freeze({ ...participant, [protection]: true });
    const result = accountDeletionDisposition(input);
    assert.equal(result.status, "PENDING_ADMINISTRATIVE_HANDOFF");
    assert.equal(result.mayDeleteAuthentication, false);
    assert.equal(result.completed, false);
    assert.equal(result.title, "Administrative handoff required");
    assert.equal(input[protection], true);
  });
}

test("removing one protection does not bypass another", () => {
  assert.equal(accountDeletionDisposition({ ...participant, activeOwner: true, finalAdministrator: true }).mayDeleteAuthentication, false);
  assert.equal(accountDeletionDisposition({ ...participant, finalAdministrator: true }).mayDeleteAuthentication, false);
  assert.equal(accountDeletionDisposition(participant).completed, false);
});

test("unknown protection and unverified identity fail closed", () => {
  for (const field of ["authenticated", "canonicalAccount", "activeOwner", "finalAdministrator"]) {
    for (const value of [undefined, null, "false", 0]) {
      assert.throws(() => accountDeletionDisposition({ ...participant, [field]: value }), /AUTHORITY_REQUIRED/);
    }
  }
  assert.throws(() => accountDeletionDisposition({ ...participant, authenticated: false }), /AUTHORITY_REQUIRED/);
  assert.throws(() => accountDeletionDisposition({ ...participant, canonicalAccount: false }), /AUTHORITY_REQUIRED/);
});

test("unknown account kinds cannot become participant deletion by fallback", () => {
  for (const accountKind of ["observer", undefined, ""]) {
    assert.throws(() => accountDeletionDisposition({ ...participant, accountKind }), /ACCOUNT_KIND_UNSUPPORTED/);
  }
});

const reviewer = Object.freeze({ ...participant, accountKind: "reviewer",
  administrator: false, scoringAuthority: false, competitiveMembership: false,
  soleProtectedReviewer: true });

test("sole protected reviewer preserves access without declaring completion", () => {
  const result = accountDeletionDisposition(reviewer);
  assert.equal(result.status, "PENDING_REVIEW_ACCESS_HANDOFF");
  assert.equal(result.title, "Review access handoff required");
  assert.equal(result.mayDeleteAuthentication, false);
  assert.equal(result.completed, false);
});

test("released reviewer protection permits canonical completion processing", () => {
  const result = accountDeletionDisposition({ ...reviewer, soleProtectedReviewer: false });
  assert.equal(result.status, "ELIGIBLE_FOR_DELETION");
  assert.equal(result.mayDeleteAuthentication, true);
  assert.equal(result.completed, false);
});

test("reviewer cannot inherit administrative, scoring or competitive authority", () => {
  for (const field of ["administrator", "scoringAuthority", "competitiveMembership", "activeOwner", "finalAdministrator"]) {
    assert.throws(() => accountDeletionDisposition({ ...reviewer, [field]: true }), /AUTHORITY_REQUIRED/);
  }
  for (const field of ["administrator", "scoringAuthority", "competitiveMembership", "soleProtectedReviewer"]) {
    assert.throws(() => accountDeletionDisposition({ ...reviewer, [field]: undefined }), /AUTHORITY_REQUIRED/);
  }
});
