import {
  certificationRequested,
  requireCertificationResourceEnvironment,
  certificationResourcePurpose,
} from "./canonical-resource-registration.js";

// A request cannot select this policy. The canonical lifecycle transaction
// separately validates the current database binding before it commits.
export function directorDerivedDeliveryPolicy(env = process.env, dependencies = {}) {
  if (!certificationRequested(env)) return "POST_COMMIT_CALLBACK";
  const registration = requireCertificationResourceEnvironment(env, dependencies);
  return certificationResourcePurpose(registration) === "PART2C_DRESS_REHEARSAL"
    ? "PRIVATE_QUEUE_ONLY"
    : "POST_COMMIT_CALLBACK";
}
