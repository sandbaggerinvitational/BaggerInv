import {redirect} from "next/navigation";
import { privatePageMetadata } from "../../../lib/seo";
export const metadata=privatePageMetadata("Odds Publishing | Sandbagger Invitational");
export default function Page(){redirect("/admin?tab=odds")}
