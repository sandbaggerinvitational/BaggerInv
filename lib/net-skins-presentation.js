const ordinal = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value || "unranked");
  const remainder = number % 100;
  if (remainder >= 11 && remainder <= 13) return `${number}th`;
  if (number % 10 === 1) return `${number}st`;
  if (number % 10 === 2) return `${number}nd`;
  if (number % 10 === 3) return `${number}rd`;
  return `${number}th`;
};

export function netSkinsCountLabel(value) {
  const count = Number(value) || 0;
  return `${count} ${count === 1 ? "skin" : "skins"}`;
}

export function netSkinsRankAccessibleLabel(value) {
  const label = String(value || "").trim();
  const tied = label.match(/^T-(\d+)$/i);
  if (tied) return `tied for ${ordinal(tied[1])}`;
  return label ? `rank ${ordinal(label)}` : "unranked";
}

export function netSkinsResultPresentation(result = {}) {
  if (result.wonSkin) return {
    state: "won",
    label: "Won Skin",
    accessibleLabel: "Won skin",
  };
  if (result.tiedLow) return {
    state: "tie",
    label: "Tied — No Skin",
    accessibleLabel: "Tied. No skin awarded",
  };
  return {
    state: "none",
    label: "No Skin",
    accessibleLabel: "No skin",
  };
}
