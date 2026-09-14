// Read frozen values only. In imported/unprepared snapshots the stroke fields
// alone may contain zero placeholders; they do not establish team handicaps.
export function mobileScrambleHandicapContext(snapshot) {
  const context = snapshot?.team_configuration;
  const keys = ['team_1_playing_handicap', 'team_2_playing_handicap',
    'team_1_strokes', 'team_2_strokes'];
  const values = keys.map(key => context?.[key]);
  const valid = values.every(value =>
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value))) && values.slice(2).every(value =>
    Number.isSafeInteger(Number(value)) && Number(value) >= 0);
  return Object.fromEntries(keys.map((key, index) =>
    [key, valid ? Number(values[index]) : null]));
}
