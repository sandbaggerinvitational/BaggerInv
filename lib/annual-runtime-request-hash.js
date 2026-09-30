import { createHash } from "node:crypto";

// Matches PostgreSQL jsonb::text for the exact JSON sent by annual runtime
// requests. Keep this provider-neutral: importing scoring ingress would pull
// legacy Google credential adapters into annual administration.
function keyOrder(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length - b.length || Buffer.compare(a, b);
}

function decimalToken(value) {
  const token = JSON.stringify(value);
  if (!/[eE]/.test(token)) return token;
  const [mantissa, exponent] = token.toLowerCase().split("e");
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  const decimal = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? digits + "0".repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${decimal}` : decimal;
}

function encode(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(encode).join(", ")}]`;
  if (typeof value === "object") return `{${Object.entries(value)
    .sort(([a], [b]) => keyOrder(a, b))
    .map(([key, item]) => `${JSON.stringify(key)}: ${encode(item)}`).join(", ")}}`;
  if (typeof value === "number") return decimalToken(value);
  return JSON.stringify(value);
}

export function annualRuntimeRequestJsonbText(value) {
  // Hash the JSON wire representation, including its omission of undefined
  // properties. The request builders own validation of bounded domain values.
  return encode(JSON.parse(JSON.stringify(value)));
}

export function annualRuntimeRequestHash(value) {
  return createHash("sha256").update(annualRuntimeRequestJsonbText(value)).digest("hex");
}
