import {handleSupervisorRequest} from '../../../../../lib/certification-worker-supervision.js';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export function POST(request) { return handleSupervisorRequest(request); }
