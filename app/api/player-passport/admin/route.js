import { NextResponse } from "next/server";
import {
  generateMissingPlayerPassports,
  generatePlayerPassport,
  disablePlayerPassportActivation,
  readPlayerPassportAdminData,
  revokePlayerPassportDevices,
} from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

function authorized(request) {
  const supplied = request.headers.get("x-live-admin-secret");
  return Boolean(supplied) && [process.env.ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean).includes(supplied);
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  try {
    return NextResponse.json({ data: await readPlayerPassportAdminData() });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to load Player Passports." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  try {
    const { action, playerId, deviceId, updatedBy } = await request.json();
    if (!String(updatedBy || "").trim()) throw new Error("Updated By is required.");
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
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to update Player Passport." }, { status: 400 });
  }
}
