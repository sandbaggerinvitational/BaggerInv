// The canonical V1 read is server-only. Certification publishes the shipping
// participant result fields, withholding internal provenance and raw Full-Net
// source detail. The participant presentation already projects its 18 public
// hole cells from that detail before this final privacy boundary.
const PRIVATE = new Set(['configurationFingerprint','configuration_fingerprint',
 'sourceFingerprint','source_fingerprint','authorityFingerprint','fullNetDetail',
 'participantLabels']);
export function certificationParticipantNetSkinsData(value) {
 if (Array.isArray(value)) return value.map(certificationParticipantNetSkinsData);
 if (!value || typeof value !== 'object') return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!PRIVATE.has(key))
  .map(([key,item])=>[key,certificationParticipantNetSkinsData(item)]));
}
