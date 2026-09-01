import { NextResponse } from "next/server";
import {
  generateMissingPlayerPassports,
  generatePlayerPassport,
  disablePlayerPassportActivation,
  readPlayerPassportAdminData,
  revokePlayerPassportDevices,
} from "../../../../lib/google-sheets-write.js";
import { directorTransactionError } from "../../../../lib/director-transaction-error.js";
import { withProductionGoogleAuthoringWrite } from "../../../../lib/production-google-authoring.js";
import { GOOGLE_AUTHORING_OPERATIONS } from "../../../../lib/google-workbook-mutation-intent.js";

export const dynamic = "force-dynamic";

function authorized(request) {
  const supplied = request.headers.get("x-live-admin-secret");
  // Player Passport is embedded inside the unified Admin Center. Accept the
  // same credentials that the Admin Center login accepts so an administrator
  // does not appear signed in while this panel independently rejects them.
  const allowed = [
    process.env.ADMIN_SECRET,
    process.env.GUIDE_ADMIN_SECRET,
    process.env.ODDS_ADMIN_SECRET,
    process.env.LIVE_ADMIN_SECRET,
  ].filter(Boolean);
  return Boolean(supplied) && allowed.includes(supplied);
}

export async function GET(request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  try {
    return NextResponse.json({ data: await readPlayerPassportAdminData() });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to load Player Passports." }, { status: 500 });
  }
}

export async function POST(request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  try {
    const { action, playerId, deviceId, updatedBy } = await request.json();
    if (!String(updatedBy || "").trim()) throw new Error("Updated By is required.");
    return await withProductionGoogleAuthoringWrite({
      request,
      operation: GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK,
    }, async () => {
      if (action === "generate") {
        const credential = await generatePlayerPassport(playerId, updatedBy);
        return NextResponse.json({ credential, data: await readPlayerPassportAdminData() });
      }
      if (action === "generate-missing") {
        const credentials = await generateMissingPlayerPassports(updatedBy);
        return NextResponse.json({ credentials, data: await readPlayerPassportAdminData() });
      }
      if (action === "revoke-devices") {
        await revokePlayerPassportDevices(playerId, updatedBy, deviceId);
        return NextResponse.json({ data: await readPlayerPassportAdminData() });
      }
      if (action === "disable") {
        await disablePlayerPassportActivation(playerId, updatedBy);
        return NextResponse.json({ data: await readPlayerPassportAdminData() });
      }
      throw new Error("Unknown Player Passport action.");
    });
  } catch (error) {
    return NextResponse.json({ error: directorTransactionError(error) }, { status: 400 });
  }
}
