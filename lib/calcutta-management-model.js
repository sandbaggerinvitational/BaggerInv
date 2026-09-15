// Presentation arithmetic only. Canonical financial validation remains PostgreSQL.
const syntax = /^(?:0|[1-9]\d{0,89})(?:\.\d{1,90})?$/;
export function decimal(value) {
  const text = String(value ?? "").trim();
  if (!syntax.test(text))
    throw new Error("Enter a non-negative decimal value.");
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}
function scaled(value) {
  const [whole, fraction = ""] = decimal(value).split(".");
  return [BigInt(whole + fraction), fraction.length];
}
function printed(units, places) {
  const text = units.toString().padStart(places + 1, "0");
  return decimal(
    places ? `${text.slice(0, -places)}.${text.slice(-places)}` : text,
  );
}
export function sum(values) {
  const rows = values.map(scaled),
    places = Math.max(0, ...rows.map((r) => r[1]));
  return printed(
    rows.reduce((n, [v, p]) => n + v * 10n ** BigInt(places - p), 0n),
    places,
  );
}
export function multiply(a, b) {
  const [x, p] = scaled(a),
    [y, q] = scaled(b);
  return printed(x * y, p + q);
}
export const percent = (fraction) => multiply(fraction, "100");
export const fraction = (percentage) => multiply(percentage, "0.01");
export const half = (value) => multiply(value, "0.5");
export function ownershipState(owners) {
  try {
    const total = sum(owners.map((r) => r.percentage));
    const [n, p] = scaled(total),
      full = 100n * 10n ** BigInt(p);
    return {
      total,
      status: !owners.length
        ? "NOT ENTERED"
        : n === full
          ? "COMPLETE"
          : n < full
            ? "INCOMPLETE"
            : "INVALID",
      difference: printed(n < full ? full - n : n - full, p),
    };
  } catch {
    return { total: "—", status: "INVALID", difference: "—" };
  }
}
export function configurationDraft(model) {
  return model.players.map((_, i) => {
    const place = i + 1;
    const point = model.point_structure.find((r) => r.place === place);
    const payout = model.payout_structure.find((r) => r.place === place);
    return {
      place,
      points: [1, 2, 3].map((r) =>
        String(
          point?.[`round_${r}_award`] ??
            (r === 2 && place > model.players.length / 2 ? "0" : ""),
        ),
      ),
      percentages: ["round_1", "round_2", "round_3", "overall"].map((r) =>
        payout
          ? percent(payout[`${r}_fraction`])
          : r === "round_2" && place > model.players.length / 2
            ? "0"
            : "",
      ),
    };
  });
}
export function configurationPayload(rows, count) {
  if (
    !count ||
    count % 2 ||
    !Array.isArray(rows) ||
    rows.length !== count ||
    rows.some(
      (r, i) =>
        r.place !== i + 1 ||
        !Array.isArray(r.points) ||
        r.points.length !== 3 ||
        !Array.isArray(r.percentages) ||
        r.percentages.length !== 4,
    )
  )
    throw new Error(
      "Every canonical place must appear once; an even roster is required.",
    );
  const pointStructure = rows.map((r) =>
    Object.fromEntries([
      ["place", r.place],
      ...r.points.map((v, i) => [`round_${i + 1}_award`, decimal(v)]),
    ]),
  );
  const payoutStructure = rows.map((r) =>
    Object.fromEntries([
      ["place", r.place],
      ...r.percentages.map((v, i) => [
        `${["round_1", "round_2", "round_3", "overall"][i]}_fraction`,
        fraction(v),
      ]),
    ]),
  );
  if (sum(rows.flatMap((r) => r.percentages)) !== "100")
    throw new Error("Payouts must total exactly 100%.");
  if (sum(rows.flatMap((r) => r.points)) === "0")
    throw new Error("At least one point award is required.");
  if (
    rows
      .slice(count / 2)
      .some(
        (r) =>
          decimal(r.points[1]) !== "0" || decimal(r.percentages[1]) !== "0",
      )
  )
    throw new Error("Scramble awards beyond the team field must be zero.");
  return { pointStructure, payoutStructure };
}
export function auctionEntry(model, playerId) {
  return {
    playerId,
    purchasePrice: String(
      model.purchases.find((p) => p.player_id === playerId)?.purchase_price ??
        "",
    ),
    owners: model.ownership
      .filter((o) => o.player_id === playerId)
      .map((o) => ({
        buyerId: o.owner_player_id,
        percentage: percent(o.ownership_fraction),
      })),
  };
}
export function entryPayload(entry, players) {
  const ids = new Set(players.map((p) => p.player_id));
  if (!ids.has(entry.playerId))
    throw new Error("Select a current tournament golfer.");
  const purchasePrice = decimal(entry.purchasePrice);
  if (new Set(entry.owners.map((o) => o.buyerId)).size !== entry.owners.length)
    throw new Error("Each buyer may appear only once per golfer.");
  if (
    entry.owners.some(
      (o) => !ids.has(o.buyerId) || decimal(o.percentage) === "0",
    )
  )
    throw new Error("Select active roster buyers with positive ownership.");
  if (ownershipState(entry.owners).status !== "COMPLETE")
    throw new Error("Ownership must total exactly 100%.");
  return {
    playerId: entry.playerId,
    purchasePrice,
    owners: entry.owners.map((o) => ({
      buyerId: o.buyerId,
      ownershipFraction: fraction(o.percentage),
    })),
  };
}
export function mergeEntry(model, entry) {
  return {
    purchases: [
      ...model.purchases.filter((r) => r.player_id !== entry.playerId),
      { player_id: entry.playerId, purchase_price: entry.purchasePrice },
    ].sort((a, b) => a.player_id.localeCompare(b.player_id)),
    ownership: [
      ...model.ownership.filter((r) => r.player_id !== entry.playerId),
      ...entry.owners.map((o) => ({
        player_id: entry.playerId,
        owner_player_id: o.buyerId,
        ownership_fraction: o.ownershipFraction,
      })),
    ].sort(
      (a, b) =>
        a.player_id.localeCompare(b.player_id) ||
        a.owner_player_id.localeCompare(b.owner_player_id),
    ),
  };
}
export function predecessor(model) {
  return {
    expectedTournamentId: model.tournament_id,
    expectedConfigurationRevision: model.configuration_revision,
    expectedConfigurationFingerprint: model.configuration_fingerprint,
    expectedAuctionRevision: model.auction_revision,
    expectedAuctionFingerprint: model.auction_fingerprint,
    expectedPublicationRevision: model.publication_revision,
  };
}
export function canonicalEqual(a, b) {
  const normalize = (x) =>
    Array.isArray(x)
      ? x.map(normalize)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, normalize(x[k])]),
          )
        : typeof x === "number" || (typeof x === "string" && syntax.test(x))
          ? decimal(x)
          : x;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
