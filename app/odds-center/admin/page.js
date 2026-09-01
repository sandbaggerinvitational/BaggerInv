import {redirect} from "next/navigation";
import { privatePageMetadata } from "../../../lib/seo";
export const metadata=privatePageMetadata("Odds Publishing | Sandbagger Invitational");
export default function Page(){
  redirect(process.env.VERCEL_ENV === "production"
    ? "/admin/director?section=odds-side-games"
    : "/admin?tab=odds");
}
