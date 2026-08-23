import { GET as certificationGet } from "../../api/admin/data-authority-certification/route.js";

// Browser-safe alias for the same protected, Preview-only, read-only
// certification handler. This does not add another diagnostics contract.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = certificationGet;
