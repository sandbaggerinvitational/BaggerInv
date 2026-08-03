const clean = (value) => String(value ?? "").trim();

export function diningViewModel(records = []) {
  return records.map((record, index) => ({
    id: `${clean(record.Year)}:${clean(record.Day)}:${clean(record.Meal)}:${index}`,
    year: clean(record.Year),
    day: clean(record.Day) || "Tournament Dining",
    meal: clean(record.Meal),
    time: [clean(record["Start Time"]), clean(record["End Time"])].filter(Boolean).join(" – "),
    location: clean(record.Location),
    dressCode: clean(record["Dress Code"]),
    reservationLabel: ["true", "yes", "y", "1", "required"].includes(clean(record["Reservations Required"]).toLowerCase())
      ? "Reservation Required"
      : "Open Seating",
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
