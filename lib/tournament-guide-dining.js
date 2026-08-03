const clean = (value) => String(value ?? "").trim();

export function diningIcon(value) {
  const cuisine = clean(value).toLowerCase();
  if (/reception|cocktail/.test(cuisine)) return "🥂";
  if (/breakfast|brunch|egg/.test(cuisine)) return "🍳";
  if (/steak|chophouse/.test(cuisine)) return "🥩";
  if (/seafood|lobster|oyster/.test(cuisine)) return "🦞";
  if (/mexican|taco/.test(cuisine)) return "🌮";
  if (/italian|pasta/.test(cuisine)) return "🍝";
  if (/barbecue|bbq/.test(cuisine)) return "🍖";
  if (/bar\s*(?:&|and)\s*grill|grill/.test(cuisine)) return "🍔";
  if (/pub|brewery|bar|tavern/.test(cuisine)) return "🍺";
  if (/coffee|cafe|café/.test(cuisine)) return "☕";
  if (/dessert|bakery|cake/.test(cuisine)) return "🍰";
  if (/fine dining|generic dinner|dinner/.test(cuisine)) return "🍽️";
  return "🍽️";
}

function reservationLabel(value) {
  const reservation = clean(value).toLowerCase();
  if (["true", "yes", "y", "1", "required"].includes(reservation)) return "Reservation Required";
  if (["false", "no", "n", "0", "open seating"].includes(reservation)) return "Open Seating";
  return "";
}

export function diningViewModel(records = []) {
  return records.map((record, index) => ({
    id: `${clean(record.Year)}:${clean(record.Day)}:${clean(record.Meal)}:${index}`,
    year: clean(record.Year),
    day: clean(record.Day) || "Tournament Dining",
    meal: clean(record.Meal),
    cuisine: clean(record.Cuisine),
    icon: diningIcon(record.Cuisine),
    time: [clean(record["Start Time"]), clean(record["End Time"])].filter(Boolean).join(" – "),
    location: clean(record.Location),
    dressCode: clean(record["Dress Code"]).replace(/\bAtire\b/g, "Attire"),
    reservationLabel: reservationLabel(record["Reservations Required"]),
    notes: clean(record.Notes),
    order: Number(record["Sort Order"] || 9999),
  })).filter((meal) => meal.meal).sort((left, right) => left.order - right.order);
}

export function diningGroups(meals = []) {
  return meals.reduce((groups, meal) => {
    if (!groups.has(meal.day)) groups.set(meal.day, []);
    groups.get(meal.day).push(meal);
    return groups;
  }, new Map());
}
