export function browserInstallabilityEnabled(env = process.env) {
  return String(env?.VERCEL_ENV || "").trim().toLowerCase() !== "production";
}
