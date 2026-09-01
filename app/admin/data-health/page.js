import { redirect } from "next/navigation";
import { privatePageMetadata } from "../../../lib/seo";
export const metadata = privatePageMetadata("Data Health | Sandbagger Invitational");
export default function AdminDataHealthRedirect() {
  redirect(process.env.VERCEL_ENV === "production"
    ? "/admin/director?section=system-audit"
    : "/admin?tab=data-health");
}
