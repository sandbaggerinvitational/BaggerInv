import { handleScheduledAccountDeletion } from '../../../../lib/account-deletion-scheduled-worker.js';
import { createAccountDeletionProviderClient } from '../../../../lib/account-deletion-provider-client.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  return handleScheduledAccountDeletion(request, {
    createAdminClient: () => createAccountDeletionProviderClient(),
  });
}
