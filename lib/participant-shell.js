export function participantDestination(pathname, search = "", playerSlug = "") {
  if (pathname === "/") return "Home";
  if (pathname === "/score" || pathname.startsWith("/score/")) return "My Match";
  if (pathname === "/live" && (search.includes("view=leaderboards") || search.includes("view=points"))) return "Leaderboards";
  if (pathname === "/live" || pathname.startsWith("/live/")) return "Tournament";
  if (pathname === "/me" || pathname.startsWith("/me/")) return "Me";
  if (playerSlug && pathname === `/players/${playerSlug}`) return "Me";
  return "";
}
