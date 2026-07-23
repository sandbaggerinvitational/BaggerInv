const BOOLEAN_HEADERS = new Set([
  "Active",
  "Captain Eligible",
  "Board of Governors",
  "Rookie",
  "Handicap Committee",
  "Countdown Enabled",
  "Front 9 Used",
  "Back 9 Used",
  "Overall Used",
  "Important",
  "Featured",
  "Sensitive",
]);

const SHEET_BOOLEAN_HEADERS = {
  Players: new Set(["Captain"]),
};

export function isBooleanSheetField(sheetName, header) {
  return (
    BOOLEAN_HEADERS.has(header) ||
    SHEET_BOOLEAN_HEADERS[sheetName]?.has(header) ||
    false
  );
}
