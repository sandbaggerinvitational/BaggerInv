const clean = (value) => String(value ?? "").trim();

export function participantAuthEntryValidation(method, value) {
  const normalizedMethod = clean(method).toLowerCase();
  const input = clean(value);
  if (normalizedMethod === "phone" && input.replace(/\D/g, "").length !== 10) {
    return { field: "phone", message: "Enter a valid mobile number." };
  }
  if (normalizedMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
    return { field: "email", message: "Enter a valid email address." };
  }
  return null;
}

export function participantAuthErrorPresentation({ method, step = "entry", category, message }) {
  const normalizedMethod = clean(method).toLowerCase();
  const normalizedStep = clean(step).toLowerCase();
  const normalizedCategory = clean(category).toUpperCase();
  let field = "";
  if (normalizedStep === "code" && normalizedCategory === "INVALID_OR_EXPIRED") field = "code";
  if (normalizedStep === "entry" && normalizedMethod === "phone" && normalizedCategory === "INVALID_PHONE") field = "phone";
  if (normalizedStep === "entry" && normalizedMethod === "email" && normalizedCategory === "INVALID_EMAIL") field = "email";
  const safeMessage = clean(message);
  return { field, message: safeMessage, showErrorCard: Boolean(safeMessage) };
}

export function participantAuthFieldAttributes(field, errorField) {
  const invalid = clean(field) !== "" && clean(field) === clean(errorField);
  return {
    "aria-invalid": invalid ? "true" : undefined,
    "aria-describedby": invalid ? "auth-error" : undefined,
  };
}
