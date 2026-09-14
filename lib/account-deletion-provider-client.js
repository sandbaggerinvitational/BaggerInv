import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { dataAuthorityFetch } from './data-authority-request.js';
import { assertParticipantIdentityAdministrativeEnvironment } from './participant-identity-authority.js';
import { productionCutoverParticipantAuthTransport } from './production-cutover-participant-auth-server.js';

// Reuse the established Production identity transport/guards, adding a bounded
// timeout for autonomous completion. No credentials or user identity are logged.
export function createAccountDeletionProviderClient(env = process.env) {
  assertParticipantIdentityAdministrativeEnvironment(env, { operation: 'PRODUCTION_AUTH_USER_ADMIN' });
  const transport = productionCutoverParticipantAuthTransport(env);
  const authorityFetch = dataAuthorityFetch('supabase', { adapter: 'account-deletion-completion' });
  return createClient(transport.url, transport.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (url, options = {}) => authorityFetch(url, {
        ...options,
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      }),
      headers: { 'x-application-name': 'bagger-account-deletion-completion' },
    },
  });
}
