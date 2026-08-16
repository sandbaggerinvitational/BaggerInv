const hasValue = (value) => value !== null && value !== undefined && value !== "";

export function historicalStrokeText(value) {
  if (!hasValue(value) || Number(value) === 0) return "";
  return `${value} stroke${Number(value) === 1 ? "" : "s"} received`;
}

export function historicalPairingPlayerRows(leftPlayers = [], rightPlayers = []) {
  const playerCount = Math.max(2, leftPlayers.length, rightPlayers.length);
  return Array.from({ length: playerCount }, (_, index) => ({
    slot: index + 1,
    left: {
      player: leftPlayers[index] || null,
      strokeText: historicalStrokeText(leftPlayers[index]?.stroke),
    },
    right: {
      player: rightPlayers[index] || null,
      strokeText: historicalStrokeText(rightPlayers[index]?.stroke),
    },
  }));
}
