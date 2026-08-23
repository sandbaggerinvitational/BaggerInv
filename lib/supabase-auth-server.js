import { createServerClient } from "@supabase/ssr";
import { dataAuthorityFetch } from "./data-authority-request.js";

export function participantAuthServerConfiguration(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_AUTH_URL || "").trim();
  const publishableKey = String(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY || "").trim();
  return { configured: Boolean(url && publishableKey), url, publishableKey };
}
export function createParticipantAuthServerClient(cookieStore, env = process.env) {
  const config = participantAuthServerConfiguration(env);
  if (!config.configured) throw new Error("Participant Supabase Auth is not configured.");
  return createServerClient(config.url, config.publishableKey, {
    global: { fetch: dataAuthorityFetch("supabase", { adapter: "supabase-auth-server" }) },
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(items) {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot always persist refresh cookies. Route handlers can. */ }
      },
    },
  });
}

export async function verifyParticipantAuthClaims(cookieStore, env = process.env) {
  const client = createParticipantAuthServerClient(cookieStore, env);
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return { status: "inactive", claims: null, error: error?.message || "No verified Auth claims." };
  return { status: "active", claims: data.claims };
}

export async function refreshParticipantAuthSession(cookieStore, env = process.env) {
  const client = createParticipantAuthServerClient(cookieStore, env);
  const { data, error } = await client.auth.getSession();
  return error ? { status: "unavailable", session: null, error: error.message } : { status: data.session ? "active" : "inactive", session: data.session || null };
}
