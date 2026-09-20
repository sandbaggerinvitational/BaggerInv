// Presentation only: server normalization and canonical identity remain authoritative.
export function formatUsMobile(value) {
  const input = String(value || "");
  let digits = input.replace(/\D/g, "");
  // Never truncate a foreign/overlong number or silently strip an extension.
  if (/[^\d\s()+.\-]/.test(input) || (input.trim().startsWith("+") && !input.trim().startsWith("+1"))) return input;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length > 10) return input;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
