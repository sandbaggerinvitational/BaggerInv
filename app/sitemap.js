import {
  getCourses,
  getPlayers,
  getTournaments,
  refreshHistoricalData,
} from "../lib/stats";
import { getLeaderboardSlugs } from "../lib/leaderboards";
import { absoluteUrl } from "../lib/seo";

const STATIC_ROUTES = [
  "/",
  "/live",
  "/odds-center",
  "/war-room",
  "/war-room/lineup-optimizer",
  "/players",
  "/ratings",
  "/compare",
  "/records",
  "/history",
  "/champions",
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

export default async function sitemap() {
  await refreshHistoricalData();

  const players = getPlayers().map((player) =>
    entry(`/players/${player.slug}`, "monthly", 0.7)
  );
  const courses = getCourses().map((course) =>
    entry(`/courses/${encodeURIComponent(course["Course ID"])}`, "yearly", 0.5)
  );
  const leaderboards = getLeaderboardSlugs().map((slug) =>
    entry(`/records/${slug}`, "monthly", 0.6)
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

  return [
    ...STATIC_ROUTES.map((path) =>
      entry(path, path === "/live" ? "hourly" : "weekly", path === "/" ? 1 : 0.8)
    ),
    ...players,
    ...courses,
    ...leaderboards,
    ...tournamentRoutes,
  ];
}
