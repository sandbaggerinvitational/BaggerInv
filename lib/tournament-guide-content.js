const oneOf = (...columns) => ({ oneOf: columns });

export const TOURNAMENT_GUIDE_MODULES = {
  overview: {
    sheets: ["Guide Sections"],
    required: { "Guide Sections": ["Section ID", oneOf("Tournament ID", "Tournament Year", "Year"), "Section Slug", "Description", "Display Order", oneOf("Status", "Published")] },
    yearFilter: "Tournament ID, Tournament Year, or Year = active tournament",
    publishedFilter: "Status = Published, or Published = TRUE when Status is absent",
    runtimeQuery: "/tournament-guide",
  },
  schedule: {
    sheets: ["Tournament Itinerary"],
    required: { "Tournament Itinerary": ["Event ID", oneOf("Tournament ID", "Tournament Year", "Year"), "Event Date", "Day Label", "Start Time", "Event Type", "Title", "Display Order", oneOf("Status", "Published")] },
    yearFilter: "Tournament ID, Tournament Year, or Year = active tournament",
    publishedFilter: "Status = Published, or Published = TRUE when Status is absent",
    runtimeQuery: "/tournament-guide/schedule",
  },
  courses: {
    sheets: ["Courses"],
    required: { Courses: ["Course ID", oneOf("Tournament ID", "Year"), "Round", "Format", oneOf("Course", "Course Name"), "City", "State"] },
    yearFilter: "Tournament ID or Year = active tournament",
    publishedFilter: "Not applicable; active-year course assignments are authoritative",
    runtimeQuery: "/courses",
  },
  rules: {
    sheets: ["Rule Book", "Tournament Rules", "Rounds"],
    required: {
      "Rule Book": ["Rule ID", oneOf("Tournament ID", "Tournament Year", "Year"), "Category", "Title", "Body", "Display Order", oneOf("Status", "Published")],
      "Tournament Rules": [oneOf("Tournament ID", "Year"), "Round", "Format", "Points Available"],
      Rounds: ["Format ID", "Name", "Team Size"],
    },
    yearFilter: "Rule Book and Tournament Rules resolve against the active tournament; Rounds is the shared format catalog",
    publishedFilter: "Rule Book uses Published status; Tournament Rules and Rounds are authoritative configuration",
    runtimeQuery: "/tournament-guide/rules",
  },
  dining: { sheets: [], required: {}, yearFilter: "Pending shared source", publishedFilter: "Pending shared source", runtimeQuery: "/tournament-guide/dining" },
  gettingAround: { sheets: [], required: {}, yearFilter: "Pending shared source", publishedFilter: "Pending shared source", runtimeQuery: "/tournament-guide/getting-around" },
  contacts: { sheets: [], required: {}, yearFilter: "Pending shared source", publishedFilter: "Pending shared source", runtimeQuery: "/tournament-guide/contacts" },
};

function requirementLabel(requirement) {
  return typeof requirement === "string" ? requirement : `one of: ${requirement.oneOf.join(" | ")}`;
}

export function validateTournamentGuideHeaders(headersBySheet = {}) {
  return Object.fromEntries(Object.entries(TOURNAMENT_GUIDE_MODULES).map(([module, schema]) => {
    const sheets = Object.fromEntries(schema.sheets.map((sheet) => {
      const headers = new Set(headersBySheet[sheet] || []);
      const missing = (schema.required[sheet] || []).filter((requirement) => typeof requirement === "string"
        ? !headers.has(requirement)
        : !requirement.oneOf.some((header) => headers.has(header))
      ).map(requirementLabel);
      return [sheet, { valid: missing.length === 0, missing, headers: [...headers] }];
    }));
    return [module, { ...schema, valid: Object.values(sheets).every((sheet) => sheet.valid), sheets }];
  }));
}
