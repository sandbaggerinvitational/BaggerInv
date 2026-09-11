import Link from "next/link";

export const metadata = {
  title: { absolute: "Support | The Bagger" },
  description: "Support for The Bagger, the official companion app for The Sandbagger Invitational.",
  alternates: { canonical: "https://baggerinv.com/support" },
  robots: { index: true, follow: true },
};

export default function SupportPage() {
  return <article>
    <h1>Support — The Bagger</h1>
    <p>Official companion app for The Sandbagger Invitational.</p>
    <p>Need help with The Bagger? Use the information below for account access, tournament information, technical issues, or other app-related questions.</p>
    <section><h2>Sign-in help</h2>
      <p>Participant access uses approved email authentication. Use the email address approved for your tournament access. Check your inbox and junk folder for the sign-in email, and make sure the address is entered correctly.</p>
    </section>
    <section><h2>Tournament and player information</h2>
      <p>Questions about roster information, match assignments, schedules, scores, handicaps, or other tournament information can be directed to tournament support.</p>
    </section>
    <section><h2>Technical issues</h2>
      <p>When reporting a problem, include your device model, iOS version, a brief description of the issue, and the screen where it occurred.</p>
      <p><strong>Do not send one-time authentication codes, passwords, or other credentials.</strong></p>
    </section>
    <section><h2>Privacy</h2>
      <p>Read our <Link href="/privacy">Privacy Policy</Link> for information about data use, correction and deletion requests, and account or privacy concerns.</p>
    </section>
    <section><h2>Support contact</h2>
      <p>Email <a href="mailto:SandbaggerInvitational@gmail.com">SandbaggerInvitational@gmail.com</a> for app support, account concerns, or privacy, correction, and deletion requests.</p>
    </section>
  </article>;
}
