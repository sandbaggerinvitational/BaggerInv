"use client";

import { createBrowserClient } from "@supabase/ssr";

export function participantAuthPublicConfiguration(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_AUTH_URL || "").trim();
  const publishableKey = String(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY || "").trim();
  return { urlConfigured: Boolean(url), publishableKeyConfigured: Boolean(publishableKey), configured: Boolean(url && publishableKey), url, publishableKey };
}
export function createParticipantAuthBrowserClient(env = process.env) {
  const config = participantAuthPublicConfiguration(env);
  if (!config.configured) throw new Error("Participant Supabase Auth is not configured.");
  return createBrowserClient(config.url, config.publishableKey, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}
