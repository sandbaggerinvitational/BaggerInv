export function participantAppHref(href = "") {
  const value = String(href || "").trim();
  if (!value || value.startsWith("/app/") || value === "/app") return value;
  const hashIndex = value.indexOf("#");
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const pathAndQuery = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = pathAndQuery.indexOf("?");
  const path = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
  const query = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  let participantPath = "";

  if (path === "/live") {
    if (["leaderboards", "points", "scores"].includes(params.get("view"))) {
      participantPath = "/app/leaderboards";
      params.delete("view");
    } else {
      participantPath = "/app/tournament";
    }
  } else if (path === "/odds-center" || path.startsWith("/odds-center/")) {
    participantPath = path.replace(/^\/odds-center/, "/app/odds");
  } else if (path === "/players" || path.startsWith("/players/")) {
    participantPath = path.replace(/^\/players/, "/app/players");
  } else if (path === "/history" || path.startsWith("/history/")) {
    participantPath = path.replace(/^\/history/, "/app/history");
  } else if (path === "/courses" || path.startsWith("/courses/")) {
    participantPath = path.replace(/^\/courses/, "/app/courses");
  } else if (path === "/tournament-guide" || path.startsWith("/tournament-guide/")) {
    participantPath = path.replace(/^\/tournament-guide/, "/app/guide");
  } else if (path === "/rules") {
    participantPath = "/app/guide/rules";
  } else {
    return value;
  }

  const serialized = params.toString();
  return `${participantPath}${serialized ? `?${serialized}` : ""}${hash}`;
}

export function participantDestination(pathname, search = "", playerSlug = "") {
  if (pathname === "/home") return "Home";
  if (pathname === "/my-match" || pathname.startsWith("/my-match/") || pathname === "/score" || pathname.startsWith("/score/") || pathname.startsWith("/game-center/")) return "My Match";
  if (pathname === "/app/leaderboards" || pathname.startsWith("/app/leaderboards/")) return "Leaderboards";
  if (pathname === "/app/tournament" || pathname.startsWith("/app/tournament/")) return "Tournament";
  if (pathname === "/app/odds" || pathname.startsWith("/app/odds/")) return "Leaderboards";
  if (pathname === "/me" || pathname.startsWith("/me/")) return "Player";
  if (pathname === "/app/players") return "Player";
  if (playerSlug && pathname === `/app/players/${playerSlug}`) return "Player";
  return "";
}

export function participantNavigationRoute(pathname = "") {
  const route = String(pathname || "").trim();
  if (!route || route === "/" || route.startsWith("/admin") || route.startsWith("/participant-auth") ||
    route.startsWith("/activate") || route.startsWith("/score/access")) return false;
  return [
    "/app",
    "/home",
    "/my-match",
    "/score",
    "/game-center",
    "/me",
  ].some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

export function participantAppShellRoute(pathname = "") {
  const route = String(pathname || "").trim();
  if (!route || route === "/" || route.startsWith("/admin") || route.startsWith("/participant-auth") ||
    route.startsWith("/activate") || route.startsWith("/score/access")) return false;
  return [
    "/app",
    "/home",
    "/my-match",
    "/score",
    "/game-center",
    "/me",
  ].some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

export function participantRouteContext(pathname = "", search = "") {
  const route = String(pathname || "");
  if (route === "/home") return "Home";
  if (route === "/my-match") return "My Match";
  if (route === "/score" || route.startsWith("/score/")) return "Scorecard";
  if (route.startsWith("/game-center/")) return "Game Center";
  if (route === "/app/leaderboards" || route.startsWith("/app/leaderboards/")) return "Leaderboards";
  if (route === "/app/tournament" || route.startsWith("/app/tournament/")) return "Tournament";
  if (route === "/app/odds" || route.startsWith("/app/odds/")) return "Insights";
  if (route === "/me" || route.startsWith("/me/")) return "Player";
  if (route === "/app/players") return "Players";
  if (/^\/app\/players\/[^/]+$/.test(route)) return "Career Profile";
  if (route.startsWith("/app/guide/schedule")) return "Schedule";
  if (route.startsWith("/app/guide/rules")) return "Rules";
  if (route.startsWith("/app/guide/dining")) return "Dining";
  if (route.startsWith("/app/guide/getting-around")) return "Local Guide";
  if (route.startsWith("/app/guide/contacts")) return "Contacts";
  if (route === "/app/guide") return "Tournament Guide";
  if (route === "/app/courses") return "Courses";
  if (/^\/app\/courses\/[^/]+\/holes\/[^/]+$/.test(route)) return "Course Hole";
  if (route.startsWith("/app/courses/")) return "Course";
  if (route === "/app/history") return "History";
  const historyRound = route.match(/^\/app\/history\/(\d{4})\/round\//);
  if (historyRound) return `${historyRound[1]} Round History`;
  const historyTeam = route.match(/^\/app\/history\/(\d{4})\/team\//);
  if (historyTeam) return `${historyTeam[1]} Team History`;
  const historyYear = route.match(/^\/app\/history\/(\d{4})/);
  if (historyYear) return `${historyYear[1]} History`;
  return "Tournament";
}

export function participantIdlePrefetchRoutes(pathname = "", search = "") {
  const route = String(pathname || "");
  const candidates = route === "/home"
    ? ["/my-match", "/app/tournament", "/app/leaderboards", "/me"]
    : route === "/my-match"
      ? ["/home", "/app/tournament", "/score"]
      : route === "/app/leaderboards"
        ? ["/home", "/my-match", "/app/tournament", "/me"]
        : route === "/app/tournament"
          ? ["/home", "/my-match", "/app/leaderboards", "/me"]
          : route === "/me"
            ? ["/home", "/my-match", "/app/tournament"]
            : ["/home", "/my-match", "/app/tournament"];
  return [...new Set(candidates)].filter((href) => href !== `${route}${search ? `?${search}` : ""}`);
}
