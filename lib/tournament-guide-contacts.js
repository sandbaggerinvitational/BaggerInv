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
  return records.map((record, index) => {
    const phone = contactCallHref(record.Phone) ? clean(record.Phone) : "";
    const email = contactEmailHref(record.Email) ? clean(record.Email) : "";
    const website = contactWebsiteHref(record.Website) ? clean(record.Website) : "";
    return {
      id: `${clean(record.Year)}:${clean(record.Category)}:${clean(record.Name)}:${index}`,
      year: clean(record.Year),
      category: clean(record.Category),
      name: clean(record.Name),
      role: clean(record.Role),
      phone,
      textEnabled: ["true", "yes", "y", "1"].includes(clean(record["Text Enabled"]).toLowerCase()),
      email,
      website,
      order: Number(record["Sort Order"] || 9999),
    };
  }).filter((record) => record.category && record.name).sort((left, right) => left.order - right.order);
}

export function contactGroups(records = []) {
  return records.reduce((groups, record) => {
    if (!groups.has(record.category)) groups.set(record.category, []);
    groups.get(record.category).push(record);
    return groups;
  }, new Map());
}

const phoneValue = (phone) => clean(phone).replace(/[^+\d]/g, "");
const usablePhone = (phone) => phoneValue(phone).replace(/\D/g, "").length >= 3;
export const contactCallHref = (phone) => usablePhone(phone) ? `tel:${phoneValue(phone)}` : "";
export const contactTextHref = (phone) => usablePhone(phone) ? `sms:${phoneValue(phone)}` : "";
export const contactEmailHref = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email)) ? `mailto:${clean(email)}` : "";
export function contactWebsiteHref(website) {
  const value = clean(website);
  if (!value || /^(?:javascript|data|vbscript):/i.test(value)) return "";
  const normalized = /^https?:\/\//i.test(value) ? value : /^(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(value) ? `https://${value}` : "";
  if (!normalized) return "";
  try { return ["http:", "https:"].includes(new URL(normalized).protocol) ? normalized : ""; }
  catch { return ""; }
}
