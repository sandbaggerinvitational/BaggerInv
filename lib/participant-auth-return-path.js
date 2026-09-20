// Return navigation only. Session/participant/resource authorization stays on the server.
const destinations = [
  "/home", "/my-match", "/score", "/game-center", "/live", "/me",
  "/app/tournament", "/app/leaderboards", "/app/players", "/app/guide",
  "/app/history", "/app/courses", "/app/odds", "/records",
];

export function participantAuthReturnPath(value = "") {
  const requested = String(value || "");
  // Reject scheme-relative URLs, path separators/controls hidden by encoding,
  // and dot-segment normalization rather than silently changing the target.
  if (!requested.startsWith("/") || requested.startsWith("//") ||
      /[\\\u0000-\u0020\u007f]/.test(requested)) return "/home";
  try {
    const url = new URL(requested, "https://bagger.invalid");
    const path = requested.split(/[?#]/, 1)[0];
    if (url.origin !== "https://bagger.invalid" || url.pathname !== path ||
        /%(?:2f|5c|2e|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) return "/home";
    return destinations.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
      ? requested : "/home";
  } catch { return "/home"; }
}
