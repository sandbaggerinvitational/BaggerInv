export function participantDestination(pathname, search = "", playerSlug = "") {
  if (pathname === "/" || pathname === "/home") return "Home";
  if (pathname === "/my-match" || pathname.startsWith("/my-match/") || pathname === "/score" || pathname.startsWith("/score/") || pathname.startsWith("/game-center/")) return "My Match";
  if (pathname === "/live" && (search.includes("view=leaderboards") || search.includes("view=points"))) return "Leaderboards";
  if (pathname === "/live" || pathname.startsWith("/live/")) return "Tournament";
  if (pathname === "/odds-center") return "Leaderboards";
  if (pathname === "/me" || pathname.startsWith("/me/")) return "Player";
  if (playerSlug && pathname === `/players/${playerSlug}`) return "Player";
  return "";
}

export function participantNavigationRoute(pathname = "") {
  const route = String(pathname || "").trim();
  if (!route || route === "/" || route.startsWith("/admin") || route.startsWith("/participant-auth") ||
    route.startsWith("/activate") || route.startsWith("/score/access")) return false;
  return [
    "/home",
    "/my-match",
    "/score",
    "/game-center",
    "/live",
    "/odds-center",
    "/me",
    "/players",
    "/tournament-guide",
    "/rules",
    "/courses",
    "/history",
  ].some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

export function participantAppShellRoute(pathname = "") {
  const route = String(pathname || "").trim();
  if (!route || route === "/" || route.startsWith("/admin") || route.startsWith("/participant-auth") ||
    route.startsWith("/activate") || route.startsWith("/score/access")) return false;
  if (route === "/courses") return true;
  if (/^\/courses\/[^/]+$/.test(route)) return true;
  if (route === "/history" || route === "/history/2026" || route.startsWith("/history/2026/")) return true;
  return [
    "/home",
    "/my-match",
    "/score",
    "/game-center",
    "/live",
    "/odds-center",
    "/me",
    "/tournament-guide",
    "/rules",
  ].some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

export function participantRouteContext(pathname = "", search = "") {
  const route = String(pathname || "");
  if (route === "/home") return "Home";
  if (route === "/my-match") return "My Match";
  if (route === "/score" || route.startsWith("/score/")) return "Scorecard";
  if (route.startsWith("/game-center/")) return "Game Center";
  if (route === "/live" && String(search).includes("view=leaderboards")) return "Leaderboards";
  if (route === "/live" || route.startsWith("/live/")) return "Tournament";
  if (route === "/odds-center") return "Insights";
  if (route === "/me" || route.startsWith("/me/")) return "Player";
  if (route.startsWith("/tournament-guide/schedule")) return "Schedule";
  if (route.startsWith("/tournament-guide/rules") || route === "/rules") return "Rules";
  if (route.startsWith("/tournament-guide/dining")) return "Dining";
  if (route.startsWith("/tournament-guide/getting-around")) return "Local Guide";
  if (route.startsWith("/tournament-guide/contacts")) return "Contacts";
  if (route === "/tournament-guide") return "Tournament Guide";
  if (route === "/courses") return "Courses";
  if (route.startsWith("/courses/")) return "Course";
  if (route === "/history") return "History";
  if (route.startsWith("/history/2026/round/")) return "2026 Round History";
  if (route.startsWith("/history/2026/team/")) return "2026 Team History";
  if (route.startsWith("/history/2026")) return "2026 History";
  return "Tournament";
}

export function participantIdlePrefetchRoutes(pathname = "", search = "") {
  const route = String(pathname || "");
  const candidates = route === "/home"
    ? ["/my-match", "/live", "/live?view=leaderboards", "/me"]
    : route === "/my-match"
      ? ["/home", "/live", "/score"]
      : route === "/live" && String(search).includes("view=leaderboards")
        ? ["/home", "/my-match", "/live", "/me"]
        : route === "/live"
          ? ["/home", "/my-match", "/live?view=leaderboards", "/me"]
          : route === "/me"
            ? ["/home", "/my-match", "/live"]
            : ["/home", "/my-match", "/live"];
  return [...new Set(candidates)].filter((href) => href !== `${route}${search ? `?${search}` : ""}`);
}
