import { redirect } from "next/navigation";
export default function AdminOddsRedirect() { redirect("/admin?tab=odds"); }
