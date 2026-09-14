import { mobilePortraitPolicyResult } from '../../../../../lib/mobile-portrait-policy.js';
import { mobileV1ReadResponse } from '../../../../../lib/mobile-v1-route.js';

export const dynamic = 'force-dynamic';
export async function GET(request) {
  const response = await mobileV1ReadResponse(request, identity => mobilePortraitPolicyResult(identity));
  // Revocation policy is never served from a saved presentation response/ETag.
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
