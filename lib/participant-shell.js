export function participantDestination(pathname, search = "", playerSlug = "") {
  if (pathname === "/" || pathname === "/home") return "Home";
  if (pathname === "/my-match" || pathname.startsWith("/my-match/") || pathname === "/score" || pathname.startsWith("/score/")) return "My Match";
  if (pathname === "/live" && (search.includes("view=leaderboards") || search.includes("view=points"))) return "Leaderboards";
  if (pathname === "/live" || pathname.startsWith("/live/")) return "Tournament";
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
