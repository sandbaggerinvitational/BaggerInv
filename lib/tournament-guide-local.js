const clean = (value) => String(value ?? "").trim();

export const LOCAL_GUIDE_GROUPS = Object.freeze([
  { id: "transportation", label: "Transportation", defaultOpen: true },
  { id: "airport-hotel", label: "Airport & Hotel", defaultOpen: false },
  { id: "essentials", label: "Essentials", defaultOpen: false },
  { id: "medical-emergency", label: "Medical & Emergency", defaultOpen: true },
  { id: "other", label: "Other", defaultOpen: false },
]);

const NORMALIZED_GROUPS = [
  [/transport|shuttle|taxi|ride|uber|lyft/i, "Transportation"],
  [/air\s*port|aiport|hotel|resort|lodging/i, "Airport & Hotel"],
  [/grocery|market|fuel|gas|pharmacy|shopping|retail|convenience/i, "Essentials"],
  [/medical|hospital|urgent|emergency|police|fire|ems/i, "Medical & Emergency"],
];

const SECTION_ICONS = [
  [/transport|shuttle|taxi|ride/i, "🚐"],
  [/air?port/i, "✈️"],
  [/hotel|lodging/i, "🏨"],
  [/fuel|gas/i, "⛽"],
  [/grocery|market/i, "🛒"],
  [/pharmacy/i, "💊"],
  [/medical|hospital|urgent/i, "🏥"],
  [/emergency/i, "🚨"],
  [/practice|range/i, "⛳"],
  [/shopping|retail/i, "🛍️"],
];

export function localGuideSectionIcon(section) {
  return SECTION_ICONS.find(([pattern]) => pattern.test(clean(section)))?.[1] || "📍";
}

export function normalizeLocalGuideSection(section) {
  return NORMALIZED_GROUPS.find(([pattern]) => pattern.test(clean(section)))?.[1] || "Other";
}

export function localGuideGroupDefaultOpen(section) {
  return LOCAL_GUIDE_GROUPS.find((group) => group.label === section)?.defaultOpen === true;
}

export function localGuideRecordIcon(title) {
  return /shuttle/i.test(clean(title)) ? "🚌" : "";
}

export function localGuideViewModel(records = []) {
  return records.map((record, index) => ({
    id: `${clean(record.Year)}:${clean(record.Section)}:${clean(record.Title)}:${index}`,
    year: clean(record.Year),
    section: normalizeLocalGuideSection(record.Section),
    sourceSection: clean(record.Section),
    title: clean(record.Title),
    description: clean(record.Description),
    address: clean(record.Address),
    phone: localGuidePhone(record.Phone) ? clean(record.Phone) : "",
    website: localGuideWebsite(record.Website) ? clean(record.Website) : "",
    order: Number(record["Sort Order"] || 9999),
  })).filter((record) => record.title).sort((left, right) => left.order - right.order);
}

export function localGuideGroups(records = []) {
  const grouped = records.reduce((groups, record) => {
    if (!groups.has(record.section)) groups.set(record.section, []);
    groups.get(record.section).push(record);
    return groups;
  }, new Map());
  return new Map(LOCAL_GUIDE_GROUPS.flatMap((group) => grouped.has(group.label) ? [[group.label, grouped.get(group.label)]] : []));
}

export function unknownLocalGuideSections(records = []) {
  return [...new Set(records.map((record) => clean(record.sourceSection ?? record.Section)).filter((section) => normalizeLocalGuideSection(section) === "Other"))];
}

export function localGuideDirections(address) {
  const value = clean(address);
  return value ? `https://maps.apple.com/?daddr=${encodeURIComponent(value)}` : "";
}

export function localGuidePhone(phone) {
  const value = clean(phone).replace(/[^+\d]/g, "");
  return value.replace(/\D/g, "").length >= 3 ? `tel:${value}` : "";
}

export function localGuideWebsite(website) {
  const value = clean(website);
  if (!value || /^(?:javascript|data|vbscript):/i.test(value)) return "";
  const normalized = /^https?:\/\//i.test(value) ? value : /^(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(value) ? `https://${value}` : "";
  if (!normalized) return "";
  try { return ["http:", "https:"].includes(new URL(normalized).protocol) ? normalized : ""; }
  catch { return ""; }
}
