import { hashAccessCode } from "../lib/live-hole-scoring.js";

const [, , code] = process.argv;
const salt = process.env.SCORING_ACCESS_CODE_SALT;
if (!code || !salt) {
  console.error("Usage: SCORING_ACCESS_CODE_SALT=... node scripts/hash-scoring-code.mjs MATCH-CODE");
  process.exitCode = 1;
} else {
  console.log(hashAccessCode(code, salt));
}
