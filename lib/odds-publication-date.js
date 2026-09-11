// Publication presentation uses the 2026 tournament's Eastern timezone, not
// either the server's UTC default or the viewer's device timezone. This keeps
// the existing September 10 publication date and the immutable instant intact.
const options = { timeZone: "America/New_York" };
export function oddsPublicationDate(timestamp, includeTime = false) {
  const date = new Date(timestamp);
  if (!timestamp || !Number.isFinite(date.getTime())) return "Unavailable";
  return includeTime
    ? date.toLocaleString("en-US", options)
    : date.toLocaleDateString("en-US", options);
}
