import { getLeaderboardSlugs } from "./leaderboards.js";
import { MATCH_PROGRESSION_RECORD_SLUGS } from "./match-progression.js";
import { SCORECARD_RECORD_SLUGS } from "./scorecard-record-leaderboards.js";

export const PUBLIC_RECORD_SLUGS = Object.freeze([
  ...new Set([
    ...getLeaderboardSlugs(),
    ...SCORECARD_RECORD_SLUGS,
    ...MATCH_PROGRESSION_RECORD_SLUGS,
  ]),
]);

const PUBLIC_RECORD_SLUG_SET = new Set(PUBLIC_RECORD_SLUGS);

export function isPublicRecordSlug(value) {
  return PUBLIC_RECORD_SLUG_SET.has(String(value || "").trim());
}
