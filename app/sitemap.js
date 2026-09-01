import { absoluteUrl } from "../lib/seo.js";
import { PUBLIC_RECORD_SLUGS } from "../lib/public-record-routes.js";

const STATIC_ROUTES = [
  "/",
  "/live",
  "/odds-center",
  "/war-room",
    "/war-room/lineup-optimizer",
    "/war-room/team-intelligence",
  "/players",
  "/ratings",
  "/compare",
  "/records",
  "/history",
  "/champions",
  "/draft",
  "/draft/analytics",
  "/tournament-guide",
  "/board-of-governors",
  "/courses",
  "/statistics",
  "/statistics/handicaps",
  "/statistics/partnerships",
  "/statistics/rivalries",
];

function entry(path, changeFrequency = "monthly", priority = 0.6) {
  return {
    url: absoluteUrl(path),
    changeFrequency,
    priority,
  };
}

function staticEntries() {
  return [
    ...STATIC_ROUTES.map((path) =>
      entry(path, path === "/live" ? "hourly" : "weekly", path === "/" ? 1 : 0.8)
    ),
    ...PUBLIC_RECORD_SLUGS.map((slug) =>
      entry(`/records/${slug}`, "monthly", 0.6)
    ),
  ];
}

function uniqueEntries(entries) {
  return [...new Map(entries.map((item) => [item.url, item])).values()];
}

export default async function sitemap() {
  // Vercel evaluates metadata routes while building Preview deployments.
  // Preview data is intentionally isolated and must never be used to publish
  // production search metadata.
  if (process.env.VERCEL_ENV === "preview") {
    return staticEntries();
  }

  try {
    const [
      { getCourses, getPlayers, getTournaments, refreshHistoricalData },
      { getDraftYears },
    ] = await Promise.all([
      import("../lib/stats"),
      import("../lib/draft"),
    ]);
    await refreshHistoricalData();

    const players = getPlayers().map((player) =>
      entry(`/players/${player.slug}`, "monthly", 0.7)
    );
    const courses = getCourses().map((course) =>
      entry(`/courses/${encodeURIComponent(course["Course ID"])}`, "yearly", 0.5)
    );
    const tournamentRoutes = getTournaments().flatMap((tournament) => {
      const year = tournament.year;
      const routes = [entry(`/history/${year}`, "yearly", 0.7)];

      for (const team of tournament.teams || []) {
        routes.push(
          entry(
            `/history/${year}/team/${encodeURIComponent(team.side)}`,
            "yearly",
            0.5
          )
        );
      }

      for (const course of tournament.courses || []) {
        const round = Number(String(course.Round ?? "").replace(/\D/g, ""));
        if (round) {
          routes.push(entry(`/history/${year}/round/${round}`, "yearly", 0.6));
        }
      }

      if (tournament.championTeam) {
        routes.push(entry(`/champions/${year}`, "yearly", 0.7));
      }

      return routes;
    });
    const draftRoutes = (await getDraftYears()).map((year) =>
      entry(`/draft/${year}`, "yearly", 0.7)
    );

    return uniqueEntries([
      ...staticEntries(),
      ...players,
      ...courses,
      ...tournamentRoutes,
      ...draftRoutes,
    ]);
  } catch (error) {
    console.error("Dynamic sitemap data was unavailable; serving public static routes only.", error);
    return staticEntries();
  }
}
