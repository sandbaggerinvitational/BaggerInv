"use client";

import Link from "next/link";

export default function TournamentGuideError({ reset }) {
  return (
    <main className="appError">
      <div className="errorCard">
        <span>Sandbagger Invitational</span>
        <h1>Tournament Guide is temporarily unavailable.</h1>
        <p>The live tournament and scoring experience is unaffected.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
        <Link href="/home">Return Home</Link>
      </div>
    </main>
  );
}
