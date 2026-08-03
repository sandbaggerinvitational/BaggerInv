const clean = (value) => String(value ?? "").trim();

const CATEGORY_ICONS = [
  [/tournament/i, "🏆"],
  [/golf|course|scoring/i, "⛳"],
  [/resort|hotel|lodging/i, "🏨"],
  [/transport|shuttle/i, "🚐"],
  [/dining|restaurant|meal/i, "🍽️"],
  [/emergency|police|fire|medical/i, "🚨"],
];

export function contactCategoryIcon(category) {
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(clean(category)))?.[1] || "📇";
}

export function contactsViewModel(records = []) {
  return records.map((record, index) => ({
    id: `${clean(record.Year)}:${clean(record.Category)}:${clean(record.Name)}:${index}`,
    year: clean(record.Year),
    category: clean(record.Category),
    name: clean(record.Name),
    role: clean(record.Role),
    phone: clean(record.Phone),
    textEnabled: ["true", "yes", "y", "1"].includes(clean(record["Text Enabled"]).toLowerCase()),
    email: clean(record.Email),
    website: clean(record.Website),
    order: Number(record["Sort Order"] || 9999),
  })).filter((record) => record.category && record.name).sort((left, right) => left.order - right.order);
}

export function contactGroups(records = []) {
  return records.reduce((groups, record) => {
    if (!groups.has(record.category)) groups.set(record.category, []);
    groups.get(record.category).push(record);
    return groups;
  }, new Map());
}

const phoneValue = (phone) => clean(phone).replace(/[^+\d]/g, "");
export const contactCallHref = (phone) => `tel:${phoneValue(phone)}`;
export const contactTextHref = (phone) => `sms:${phoneValue(phone)}`;
export const contactEmailHref = (email) => `mailto:${clean(email)}`;
export function contactWebsiteHref(website) {
  const value = clean(website);
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
