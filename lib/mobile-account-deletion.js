import { MobileApiError } from "./mobile-api-v1.js";
import { mobileBearerTokenFromRequest, verifyMobileSupabaseAuthenticatedUser } from "./mobile-bearer-identity.js";
import { ACCOUNT_DELETION_HANDOFF_COPY, ACCOUNT_DELETION_REVIEW_HANDOFF_COPY } from "./account-deletion-policy.js";

const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const pending = new Map([
  ["PENDING_ADMINISTRATIVE_HANDOFF", ACCOUNT_DELETION_HANDOFF_COPY],
  ["PENDING_REVIEW_ACCESS_HANDOFF", ACCOUNT_DELETION_REVIEW_HANDOFF_COPY],
]);

function response(data) {
  if (!uuid(data?.requestId) || data.completed !== (data.status === "COMPLETED") ||
      !["READY", "COMPLETED", ...pending.keys()].includes(data.status)) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  return { ok: true, apiVersion: "v1", data: {
    requestId: data.requestId,
    status: data.status === "READY" ? "RETRY_REQUIRED" : data.status,
    completed: data.completed,
    ...(pending.get(data.status) || {}),
  } };
}

// Only server-verified bearer identity is used. The body cannot select an
// account, role, protection flag, or completion state.
export async function deleteMobileAccount({ request, input, env = process.env }, dependencies = {}) {
  if (!input || Object.keys(input).length !== 2 || input.confirmation !== "DELETE_ACCOUNT" || !uuid(input.requestId)) {
    throw new MobileApiError("INVALID_AUTH_REQUEST");
  }
  const token = mobileBearerTokenFromRequest(request);
  const verify = dependencies.verifyUser || verifyMobileSupabaseAuthenticatedUser;
  const actor = await verify(token, { env });
  if (actor?.status === "unavailable") throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  if (actor?.status !== "active" || !uuid(actor.authUserId)) throw new MobileApiError("INVALID_TOKEN");
  const client = dependencies.adminClient || (await import("./production-participant-auth-enrollment.js"))
    .createProductionParticipantAuthAdminClient(env);
  const initiate = async () => {
    const { data, error } = await client.rpc("initiate_account_deletion_v1", {
      target_auth_user_id: actor.authUserId, operation_id: input.requestId,
    });
    if (error) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
    response(data); // Validate before any destructive provider operation.
    return data;
  };
  const receipt = await initiate();
  if (receipt.status !== "READY") return response(receipt);
  // The migration's Auth delete trigger rechecks protection and atomically
  // cleans account links/records. FK failure leaves the Auth identity intact.
  const result = await client.auth.admin.deleteUser(actor.authUserId, false).catch(() => ({ error: true }));
  if (result.error) return response(await initiate());
  const { data, error } = await client.rpc("read_account_deletion_receipt_v1", { operation_id: receipt.requestId });
  if (error || data?.requestId !== receipt.requestId || data?.status !== "COMPLETED") {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  return response(data);
}
