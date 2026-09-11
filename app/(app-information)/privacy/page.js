import Link from "next/link";

export const metadata = {
  title: { absolute: "Privacy Policy | The Bagger" },
  description: "Privacy information for The Bagger, the official companion app for The Sandbagger Invitational.",
  alternates: { canonical: "https://baggerinv.com/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <article>
    <h1>Privacy Policy — The Bagger</h1>
    <p>Effective date: <time dateTime="2026-09-10">September 10, 2026</time></p>
    <section><h2>Introduction</h2>
      <p>The Bagger is the official companion application for The Sandbagger Invitational. This policy applies to The Bagger iOS app and related services operated for The Sandbagger Invitational.</p>
    </section>
    <section><h2>Information we collect</h2>
      <p>Depending on the features you use, the app and its service providers process:</p>
      <ul>
        <li><strong>Email address and user ID:</strong> information used to authenticate you and associate your account with authorized tournament access.</li>
        <li><strong>Device ID and network-derived client identifiers:</strong> information used for security and abuse prevention.</li>
        <li><strong>Gameplay content:</strong> authorized tournament and scoring activity you submit.</li>
        <li><strong>Product interaction:</strong> information about interactions with app features.</li>
        <li><strong>Performance data and other diagnostic data:</strong> technical information used to maintain reliability and investigate problems.</li>
        <li><strong>Coarse location:</strong> approximate location derived from network or IP information. The app does not request precise GPS location for this purpose.</li>
      </ul>
    </section>
    <section><h2>How information is used</h2>
      <p>We use this information for app functionality: authenticating participants, providing tournament features, linking authorized users to player and tournament information, processing authorized scoring activity, preventing abuse, maintaining reliability, and troubleshooting technical issues. We do not use it for advertising or marketing.</p>
    </section>
    <section><h2>Tracking and advertising</h2>
      <p>The Bagger does not use collected information for cross-app or cross-site advertising tracking. The app does not contain third-party advertising.</p>
    </section>
    <section><h2>Service providers</h2>
      <p>We use Supabase for authentication and backend services, Vercel for application hosting and infrastructure, Resend for authentication email delivery, and Cloudflare Turnstile for abuse and bot prevention. These providers may process the limited information necessary to provide their services.</p>
    </section>
    <section><h2>Tournament information</h2>
      <p>The app displays player and roster information, matches, schedules, leaderboards, tournament history, records, scoring information where applicable, and tournament features such as Odds, Net Skins, and Calcutta. Some displayed tournament and player information comes from existing tournament records, rather than information collected from your device.</p>
    </section>
    <section><h2>Data sharing</h2>
      <p>We do not sell personal information. Information may be processed by service providers necessary to operate the app and may be disclosed when legally required. Tournament information may be displayed to participants or on public tournament surfaces as part of the service.</p>
    </section>
    <section><h2>Data retention</h2>
      <p>Information is retained for as long as reasonably necessary to operate the service, maintain tournament records, provide security and audit functionality, comply with legal obligations, and resolve disputes.</p>
    </section>
    <section><h2>Security</h2>
      <p>We use administrative and technical safeguards, including access controls and protected connections, to help protect information. No system or method of transmission can guarantee absolute security.</p>
    </section>
    <section><h2>Children</h2>
      <p>The Bagger is intended for participants and users of The Sandbagger Invitational. It is not designed as a child-directed service.</p>
    </section>
    <section><h2>Your choices and requests</h2>
      <p>Visit our <Link href="/support">support page</Link> for privacy questions, correction requests, deletion requests where applicable, or account concerns. Some information may need to be retained for tournament records, security, or legal obligations.</p>
    </section>
    <section><h2>Policy changes</h2>
      <p>We may update this policy as the service changes. We will revise the effective date when we do.</p>
    </section>
    <section><h2>Contact</h2><p>Support and privacy assistance: <a href="https://baggerinv.com/support">baggerinv.com/support</a>.</p></section>
  </article>;
}
