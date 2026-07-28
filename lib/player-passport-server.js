import { validatePlayerPassport } from "./google-sheets-write.js";
import { verifyPlayerPassportSession } from "./player-passport.js";

export async function resolvePlayerPassportToken(token) {
  if (!token) return null;
  try {
    return await validatePlayerPassport(verifyPlayerPassportSession(token));
  } catch {
    return null;
  }
}
