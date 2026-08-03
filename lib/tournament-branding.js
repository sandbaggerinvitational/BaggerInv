export function formatTournamentEdition(value) {
  const edition = String(value || "").trim();
  if (!edition) return "";
  const ordinal = edition.match(/\b\d+(?:st|nd|rd|th)\b/i)?.[0];
  if (ordinal) return `${ordinal} Annual`;
  return /annual$/i.test(edition) ? edition : `${edition} Annual`;
}
