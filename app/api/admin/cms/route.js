import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  archiveCmsRecord,
  deleteCmsRecord,
  readAdminAuditLog,
  readAdminDashboard,
  readAdminStandings,
  readCmsResource,
  reorderCmsRecord,
  saveCmsRecord,
} from "../../../../lib/google-sheets-write";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = request.headers.get("x-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}

const deny = () => NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
const filtersFrom = (source) => ({ tournament: source.get("tournament") || "", year: source.get("year") || "" });

export async function GET(request) {
  if (!authorized(request)) return deny();
  const query = new URL(request.url).searchParams;
  const resource = query.get("resource");
  const filters = filtersFrom(query);
  try {
    if (resource === "dashboard") return NextResponse.json({ data: await readAdminDashboard(filters) });
    if (resource === "standings") return NextResponse.json({ data: await readAdminStandings(filters) });
    if (resource === "audit") return NextResponse.json({ data: await readAdminAuditLog(query.get("limit")) });
    return NextResponse.json({ data: await readCmsResource(resource, filters) });
  } catch (error) {
    console.error("Admin CMS load failed", { resource, filters, reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load Admin Center data." }, { status: 400 });
  }
}

export async function POST(request) {
  if (!authorized(request)) return deny();
  let body = {};
  try {
    body = await request.json();
    const { resource, action = "save", key, record, tournament, year, updatedBy, direction } = body;
    const filters = { tournament: String(tournament || ""), year: String(year || "") };
    let data;
    if (action === "save") data = await saveCmsRecord(resource, record, { key, ...filters, updatedBy });
    else if (action === "archive") data = await archiveCmsRecord(resource, key, updatedBy);
    else if (action === "delete") data = await deleteCmsRecord(resource, key, updatedBy);
    else if (action === "reorder") data = await reorderCmsRecord(resource, key, direction, filters, updatedBy);
    else throw new Error("Unknown Admin Center action.");
    for (const path of ["/", "/admin", "/players", "/live", "/history", "/champions", "/courses", "/tournament-guide"]) revalidatePath(path);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Admin CMS save failed", { resource: body.resource, action: body.action, key: body.key, reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to save Admin Center data." }, { status: 400 });
  }
}
