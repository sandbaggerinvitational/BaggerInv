export const COLUMN_PURPOSE = Object.freeze({
  WRITABLE: "Writable",
  RUNTIME: "Runtime Writable",
  FORMULA: "Formula",
  ARRAY_FORMULA: "ARRAYFORMULA",
  LOOKUP: "Lookup",
  READ_ONLY: "Derived / Read Only",
});

const { WRITABLE, RUNTIME, FORMULA, LOOKUP, READ_ONLY } = COLUMN_PURPOSE;
const columns = (purpose, names) => Object.fromEntries(names.map((name) => [name, purpose]));
const merge = (...groups) => Object.freeze(Object.assign({}, ...groups));

export const PROTECTED_COLUMN_MAP = Object.freeze({
  Tournaments: merge(
    columns(WRITABLE, ["Year", "Annual", "Annual Image", "Dates", "Destination", "Course 1", "Course 2", "Course 3", "Championship Course", "Hero Image", "Team Size", "Sandbagger of the Year", "Captain Team 1", "Captain Team 2", "Winning Captain", "Tournament Name", "Start Date", "End Date", "Location", "Format Label", "Countdown Enabled", "Mobile Hero Image", "Tie Advantage Team", "Start Time", "Time Zone", "Preview Timeline Date"]),
    columns(RUNTIME, ["Winning Team", "Runner-Up Team", "Final Score", "Tournament Status", "Current Round", "Updated At", "Updated By", "Status Mode", "Director Automation Enabled", "Auto Open Round", "Auto Set Matches Live"]),
  ),
  "Live Matches": merge(
    columns(READ_ONLY, ["Match ID"]),
    columns(WRITABLE, ["Year", "Round", "Format", "Match", "Course ID", "Tee Time", "Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"]),
    columns(FORMULA, ["Team 1 Player 1 Playing HCP", "Team 1 Player 1 Stroke", "Team 1 Player 2 Playing HCP", "Team 1 Player 2 Stroke", "Team 1 Playing HCP", "Team 1 Stroke", "Team 2 Player 1 Playing HCP", "Team 2 Player 1 Stroke", "Team 2 Player 2 Playing HCP", "Team 2 Player 2 Stroke", "Team 2 Playing HCP", "Team 2 Stroke"]),
    columns(LOOKUP, ["T1 P1 Playing HCP", "T1 P2 Playing HCP", "T2 P1 Playing HCP", "T2 P2 Playing HCP"]),
    columns(RUNTIME, ["Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner", "Team 1 Points", "Team 2 Points", "Match Status", "Notes", "Current Hole", "Team 1 Holes Won", "Team 2 Holes Won", "Holes Remaining", "Match Status Text", "Updated At", "Updated By", "Finalized At", "Finalized By", "Access Code Hash", "Access Token Hash", "Access Selector", "Access Active", "Access Expires At", "Access Version"]),
  ),
  Matches: merge(
    columns(FORMULA, ["Match ID"]),
    columns(WRITABLE, ["Year", "Round", "Format", "Match", "Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2", "Course ID", "Tee Time", "Starting Hole"]),
    columns(RUNTIME, ["Team 1 Player 1 Playing HCP", "Team 1 Player 1 Stroke", "Team 1 Player 2 Playing HCP", "Team 1 Player 2 Stroke", "Team 1 Playing HCP", "Team 1 Stroke", "Team 2 Player 1 Playing HCP", "Team 2 Player 1 Stroke", "Team 2 Player 2 Playing HCP", "Team 2 Player 2 Stroke", "Team 2 Playing HCP", "Team 2 Stroke", "Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner", "Team 1 Points", "Team 2 Points", "Match Status", "Notes", "Updated At", "Updated By", "Finalized By", "Completed At", "Finalized At", "Match Number", "Team 1 Player 1 Name", "Team 1 Player 2 Name", "Team 2 Player 1 Name", "Team 2 Player 2 Name", "Team 1 Player Names", "Team 2 Player Names", "Course", "Tee", "Final Result", "Winner"]),
    columns(READ_ONLY, ["FInalized At"]),
  ),
  "Live Hole Scores": merge(columns(RUNTIME, ["Hole Score ID", "Match ID", "Hole Number", "Stroke Index", "Format", "Team 1 Gross Scores", "Team 2 Gross Scores", "Team 1 Net Score", "Team 2 Net Score", "Hole Winner", "Revision", "Updated At", "Updated By"])),
  "Match Update Log": merge(columns(RUNTIME, ["Log ID", "Match ID", "Action", "Previous Value", "New Value", "Updated By", "Updated At"])),
  "Net Skins Result": merge(columns(RUNTIME, ["Year", "Round", "Hole", "Winner", "Winner Player ID", "Winner Player ID 2", "Skin Value", "Round Pot", "Winning Net Score", "Format", "Match"])),
  "Odds Control": merge(columns(RUNTIME, ["Year", "Current Official Phase", "Updated At"])),
  "Odds Snapshots": merge(columns(RUNTIME, ["Year", "Phase", "Published At", "Snapshot JSON"])),
  "Odds Team Results": merge(columns(RUNTIME, ["Year", "Phase", "Team", "Win Probability", "American Odds", "Expected Points"])),
  "Odds Player Results": merge(columns(RUNTIME, ["Year", "Phase", "Player ID", "Player", "Top Player Probability", "American Odds", "Expected Points", "Expected Record", "Average Finish"])),
  "Player Passport": merge(columns(RUNTIME, ["Tournament ID", "Player ID", "Invite Reference", "Activation Code Hash", "Activation Active", "Activation Expires At", "Activation Used At", "Passport Version", "Created At", "Updated At", "Updated By"])),
  "Trusted Devices": merge(columns(RUNTIME, ["Device ID", "Tournament ID", "Player ID", "Session Version", "Created At", "Last Used At", "Expires At", "Revoked At", "Device Label", "PWA Installed", "PWA Installed At", "Notifications Enabled", "Notifications Updated At", "Notification Permission", "Push Subscription", "Subscription Updated At", "Device Last Seen"])),
  "Notification Log": merge(columns(RUNTIME, ["Notification ID", "Notification Type", "Tournament ID", "Player ID", "Device ID", "Recipient", "Time Sent", "Delivery Status", "Failure", "Notification Preview Template"]), columns(READ_ONLY, ["Unnamed A"])),
  "Admin Audit Log": merge(columns(RUNTIME, ["Audit ID", "Resource", "Record ID", "Action", "Summary", "Previous Value", "New Value", "Updated By", "Updated At"])),
  Players: merge(columns(WRITABLE, ["Player ID", "First", "Last", "Display Name", "Slug", "Active", "First Year", "Last Year", "Captain Eligible", "Photo Filename", "Board of Governors", "Rookie", "Handicap Committee", "Nickname", "Bio", "Hometown", "Captain", "GHIN", "Home Club", "Career Notes", "Role"])),
  Handicaps: merge(columns(WRITABLE, ["Year", "Player ID", "Team Side", "Tournament Handicap", "Handicap Method"]), columns(READ_ONLY, ["Unnamed F"])),
  "Team Names": merge(columns(WRITABLE, ["Year", "Team Side", "Team ID", "Team Names", "Captain", "Team Logo", "Primary Color", "Secondary Color", "Motto", "Description"])),
  Courses: merge(columns(WRITABLE, ["Course ID", "Year", "Round", "Format", "Course", "City", "State", "Destination", "Tee Played", "Slope", "Rating", "Yardage", "Par", "Year Opened", "Designer", "Website", "Course Logo", "Course Profile Image", "GPS Link"])),
  Awards: merge(columns(WRITABLE, ["Year", "Award", "Winner"])),
  "Draft Settings": merge(columns(WRITABLE, ["Year", "Draft Name Override", "Draft Date", "Draft Time", "Time Zone", "Draft Location", "Draft Status Mode", "Draft Format", "Total Picks", "Team 1 ID", "Team 2 ID", "Team 1 Captain Player ID", "Team 2 Captain Player ID", "First Pick Team ID", "Notes"]), columns(RUNTIME, ["Updated At", "Updated By"])),
  "Draft Picks": merge(columns(WRITABLE, ["Year", "Pick Number", "Team ID", "Player ID", "Notes"]), columns(RUNTIME, ["Selected At", "Selected By", "Updated At", "Updated By"])),
  "Tournament Itinerary": merge(columns(WRITABLE, ["Event ID", "Tournament ID", "Event Date", "Day Label", "Start Time", "End Time", "Event Type", "Title", "Subtitle", "Location", "Details", "Round ID", "Course ID", "Display Order", "Status", "Featured"]), columns(RUNTIME, ["Updated At"])),
  "Guide Sections": merge(columns(WRITABLE, ["Section ID", "Tournament ID", "Section Name", "Section Slug", "Description", "Display Order", "Status"]), columns(RUNTIME, ["Updated At"])),
  "Rule Book": merge(columns(WRITABLE, ["Rule ID", "Tournament ID", "Category", "Subcategory", "Title", "Body", "Display Order", "Status", "Effective Year", "Important"]), columns(RUNTIME, ["Updated At"])),
  "Guide Information": merge(columns(FORMULA, ["Item ID"]), columns(WRITABLE, ["Tournament ID", "Section", "Title", "Body", "Label", "Link Text", "Link URL", "Display Order", "Status", "Sensitive"]), columns(RUNTIME, ["Updated At"])),
  "Media Library": merge(columns(WRITABLE, ["Asset ID", "Category", "Label", "Filename", "URL", "Alt Text", "Status"]), columns(RUNTIME, ["Updated At", "Updated By"])),
  "Site Settings": merge(columns(WRITABLE, ["Setting", "Value", "Description"]), columns(RUNTIME, ["Updated At", "Updated By"])),
  "Prediction Settings": merge(columns(WRITABLE, ["Setting", "Value", "Description"]), columns(RUNTIME, ["Updated At", "Updated By"])),
  "Tournament Rules": merge(columns(WRITABLE, ["Year", "Round", "Format", "Team Size", "Points Available", "Front 9 Used", "Back 9 Used", "Overall Used", "Front 9 Points", "Back 9 Points", "Overall Points"])),
  Rounds: merge(columns(WRITABLE, ["Format ID", "Name", "Team Size"])),
  "Ghost Match": merge(columns(WRITABLE, ["Match ID", "Player ID"])),
  "Course Holes": merge(columns(WRITABLE, ["Course ID", "Tee", "Hole Number", "Yardage", "Par", "Stroke Index"])),
  "Round Scorecards": merge(columns(FORMULA, ["Match ID"]), columns(WRITABLE, ["Year", "Round", "Match", "Format", "Course ID", "Player ID", "Team ID", "Hole 1", "Hole 2", "Hole 3", "Hole 4", "Hole 5", "Hole 6", "Hole 7", "Hole 8", "Hole 9", "Hole 10", "Hole 11", "Hole 12", "Hole 13", "Hole 14", "Hole 15", "Hole 16", "Hole 17", "Hole 18", "Score Type", "Source", "Notes", "Scorecard Status"])),
  "Course Scorecards": merge(columns(WRITABLE, ["Course ID", "Course Name", "Tee", "Gender", "Rating", "Slope", "Par"])),
  "Live Tournaments": merge(columns(FORMULA, ["Team 1 Score", "Team 2 Score"]), columns(READ_ONLY, ["Year", "Tournament Status", "Current Round", "Last Updated", "Live Message"])),
  "Net Skins": merge(columns(WRITABLE, ["Year", "Round", "Format", "Player ID 1", "Player ID 2", "Buy-In", "Eligible"]), columns(LOOKUP, ["Handicap"])),
  "Net Skins Results": merge(columns(READ_ONLY, ["Year", "Round", "Hole", "Winner", "Skin Value", "Net Score"])),
  "Live Round Handicaps": merge(columns(WRITABLE, ["Year", "Round", "Format", "Player", "Handicap Index", "Low Handicap Index"]), columns(FORMULA, ["Hybrid Handicap", "Course Handicap"]), columns(LOOKUP, ["Player ID", "Course ID", "Tee", "Slope", "Rating", "Par"])),
  Dining: merge(columns(WRITABLE, ["Year", "Day", "Meal", "Cuisine", "Start Time", "End Time", "Location", "Dress Code", "Reservation Required", "Notes", "Sort Order"])),
  "Important Contacts": merge(columns(WRITABLE, ["Year", "Category", "Name", "Role", "Phone", "Text Enabled", "Email", "Website", "Sort Order"])),
  "Local Guide": merge(columns(WRITABLE, ["Year", "Section", "Title", "Description", "Address", "Phone", "Website", "Sort Order"])),
  "Tournament Timeline": merge(columns(WRITABLE, ["Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type", "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes", "Sort Order", "Status Override"])),
  "Calcutta Purchases": merge(columns(WRITABLE, ["Year", "Golfer Player ID", "Purchase Price"])),
  "Calcutta Ownership": merge(columns(WRITABLE, ["Year", "Golfer Player ID", "Owner Player ID", "Ownership %"])),
  "Calcutta Point Structure": merge(columns(WRITABLE, ["Year", "Place", "Round 1 Award", "Round 2 Award", "Round 3 Award"])),
  "Calcutta Payout": merge(columns(WRITABLE, ["Year", "Place", "Round 1 Award %", "Round 2 Award %", "Round 3 Award %", "Overall Award %"])),
  "Calcutta Round Results": merge(columns(RUNTIME, ["Year", "Round", "Format", "Player ID", "Gross Score", "Net Score", "Full Course Handicap", "Place", "Calcutta Points"])),
  "Calcutta Standings": merge(columns(RUNTIME, ["Year", "Rank", "Player ID", "Purchase Price", "Round 1 Points", "Round 2 Points", "Round 3 Points", "Total Points", "Round 1 Payout %", "Round 2 Payout %", "Round 3 Payout %", "Total Payout %", "Current Payout Value", "ROI", "Updated At"])),
  "Calcutta Owner Leaderboard": merge(columns(READ_ONLY, ["Year", "Rank", "Owner Player ID", "Purchase Cost", "Current Payout Value", "Net Profit", "ROI"])),
});

const ALLOWED_WRITE_PURPOSES = new Set([WRITABLE, RUNTIME]);

export function columnPurpose(tab, field) {
  return PROTECTED_COLUMN_MAP[tab]?.[field] || null;
}

export function writableFields(tab) {
  const map = PROTECTED_COLUMN_MAP[tab];
  if (!map) throw new Error(`Workbook protection map is missing sheet '${tab}'.`);
  return Object.entries(map).filter(([, purpose]) => ALLOWED_WRITE_PURPOSES.has(purpose)).map(([field]) => field);
}

export function protectedFields(tab) {
  const map = PROTECTED_COLUMN_MAP[tab];
  if (!map) throw new Error(`Workbook protection map is missing sheet '${tab}'.`);
  return Object.entries(map).filter(([, purpose]) => !ALLOWED_WRITE_PURPOSES.has(purpose)).map(([field]) => field);
}

export function validateFieldWrite(tab, headers, updates) {
  const map = PROTECTED_COLUMN_MAP[tab];
  if (!map) throw new Error(`Workbook protection map is missing sheet '${tab}'.`);
  if (!Array.isArray(headers) || !headers.length) throw new Error(`${tab} does not have a header row.`);
  const entries = Object.entries(updates || {});
  if (!entries.length) throw new Error(`${tab} write did not include any fields.`);
  for (const [field, value] of entries) {
    if (!headers.includes(field)) throw new Error(`${tab} is missing the ${field} column. Workbook structure was not modified.`);
    const purpose = map[field];
    if (!purpose) throw new Error(`${tab}.${field} is not registered in the Protected Column Map.`);
    if (!ALLOWED_WRITE_PURPOSES.has(purpose)) throw new Error(`${tab}.${field} is ${purpose} and is read only.`);
    if (typeof value === "string" && /^\s*'=/.test(value)) throw new Error(`${tab}.${field} contains a prohibited leading apostrophe formula.`);
  }
  return entries.map(([field]) => field);
}

export function validateSheetSchema(tab, headers, requiredFields = []) {
  const map = PROTECTED_COLUMN_MAP[tab];
  if (!map) throw new Error(`Workbook protection map is missing sheet '${tab}'.`);
  const unknown = headers.filter(Boolean).filter((field) => !map[field]);
  if (unknown.length) throw new Error(`${tab} contains unclassified columns: ${unknown.join(", ")}.`);
  const missing = requiredFields.filter((field) => !headers.includes(field));
  if (missing.length) throw new Error(`${tab} is missing required columns: ${missing.join(", ")}. Workbook structure was not modified.`);
  return true;
}
