import { redirect } from "next/navigation";
import { privatePageMetadata } from "../../../lib/seo";
export const metadata = privatePageMetadata("Data Health | Sandbagger Invitational");
export default function AdminDataHealthRedirect() { redirect("/admin?tab=data-health"); }
