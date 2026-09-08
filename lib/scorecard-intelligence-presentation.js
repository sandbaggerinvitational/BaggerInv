/** Presentation only: missing evidence is never a neutral/zero measurement. */
export function courseFitPresentation(fit) {
  const value = fit?.versusRecordedField;
  return {
    signal: fit?.signal || "Insufficient Data",
    confidence: fit?.confidence || "Insufficient",
    reasons: Array.isArray(fit?.reasons) ? fit.reasons.filter(reason => typeof reason === "string") : [],
    rounds: Number.isInteger(fit?.courseTeeRounds) && fit.courseTeeRounds >= 0 ? fit.courseTeeRounds : null,
    comparison: Number.isFinite(value)
      ? `${Math.abs(value).toFixed(2)} ${value < 0 ? "better" : value > 0 ? "worse" : "even"}`
      : null,
  };
}
