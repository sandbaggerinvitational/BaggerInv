const clean = (value) => String(value ?? "").trim();

export function mergeCanonicalPlayerPresentation(player = {}, canonicalPlayers = []) {
  const canonical = canonicalPlayers.find((row) => clean(row.id) === clean(player.id)) || {};
  return {
    ...player,
    slug: clean(player.slug || canonical.slug),
    photo: clean(player.photo || canonical.photo),
  };
}
