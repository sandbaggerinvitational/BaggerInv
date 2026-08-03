const clean = (value) => String(value ?? "").trim();

const SECTION_ICONS = [
  [/transport|shuttle|taxi|ride/i, "🚐"],
  [/airport/i, "✈️"],
  [/hotel|lodging/i, "🏨"],
  [/fuel|gas/i, "⛽"],
  [/grocery|market/i, "🛒"],
  [/pharmacy/i, "💊"],
  [/medical|hospital|urgent/i, "🏥"],
  [/emergency/i, "🚨"],
  [/practice|range/i, "⛳"],
  [/shopping|retail/i, "🛍️"],
];

export function localGuideSectionIcon(section, records = []) {
  if (/transport/i.test(clean(section)) && records.some((record) => /shuttle/i.test(clean(record?.title || record?.Title)))) return "🚌";
  return SECTION_ICONS.find(([pattern]) => pattern.test(clean(section)))?.[1] || "📍";
}

export function localGuideViewModel(records = []) {
  return records.map((record, index) => ({
    id: `${clean(record.Year)}:${clean(record.Section)}:${clean(record.Title)}:${index}`,
    year: clean(record.Year),
    section: clean(record.Section),
    title: clean(record.Title),
    description: clean(record.Description),
    address: clean(record.Address),
    phone: clean(record.Phone),
    website: clean(record.Website),
    order: Number(record["Sort Order"] || 9999),
  })).filter((record) => record.section && record.title).sort((left, right) => left.order - right.order);
}

export function localGuideGroups(records = []) {
  return records.reduce((groups, record) => {
    if (!groups.has(record.section)) groups.set(record.section, []);
    groups.get(record.section).push(record);
    return groups;
  }, new Map());
}

export function localGuideDirections(address) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(clean(address))}`;
}

export function localGuidePhone(phone) {
  return `tel:${clean(phone).replace(/[^+\d]/g, "")}`;
}
