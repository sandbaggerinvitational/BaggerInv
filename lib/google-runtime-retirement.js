import { recordDataAuthorityTransport } from "./data-authority-request.js";
export const GOOGLE_RUNTIME_STATUS = "RETIRED";
export function assertGoogleRuntimeRetired() {
  recordDataAuthorityTransport("google", {adapter: "retired-google-runtime", transport: "retired"});
  throw Object.assign(new Error("Google runtime delivery and live imports are retired. Use canonical tournament authority."), {
    code: "GOOGLE_RUNTIME_RETIRED", status: 410, domain: "OPTIONAL_EXPORT"});
}
