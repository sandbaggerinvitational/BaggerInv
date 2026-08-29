"use client";

import Link from "next/link";
import { Header, Footer } from "../components";

export default function HistoryError({ reset }) {
  return <main><Header/><div className="appError"><div className="errorCard"><span>Sandbagger Invitational</span><h1>Tournament History is temporarily unavailable.</h1><p>Please try again shortly.</p><button type="button" onClick={reset}>Try again</button><Link href="/history">Tournament History</Link></div></div><Footer/></main>;
}
