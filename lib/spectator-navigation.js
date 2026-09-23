// A preference, never an identity or authorization credential.
export const FOLLOWING_PREFERENCE = 'bagger.following.v1';
export const FOLLOWING_ROUTES = Object.freeze(['today','tournament','matches','leaders','players','more','guide','schedule','courses','rules','history','records','odds']);
export function followingRoute(parts = []) {
  if (!parts.length) return { page: 'today' };
  if (!FOLLOWING_ROUTES.includes(parts[0])) return null;
  if (parts.length === 1) return { page: parts[0] };
  if (parts.length === 2 && ['players','matches'].includes(parts[0]) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(parts[1])) {
    return { page: parts[0], id: parts[1] };
  }
  return null;
}
export function entryDestination(session, preference) {
  if (session === 'participant') return '/home';
  if (session !== 'none') return 'recovery';
  return preference === 'yes' ? '/follow/today' : 'chooser';
}
export function hasParticipantCookies(items = []) {
  return items.some(({name}) => /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(name) ||
    /^(?:sbi|bagger|participant|player)[-_].*(?:session|auth|passport)/i.test(name));
}
