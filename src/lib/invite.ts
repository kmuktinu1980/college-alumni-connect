/** Cookie holding an invite-link code between /join/<code> and joining the institution. */
export const INVITE_COOKIE = "ac_invite";
/** Cookie holding where to go after the sign-in link is opened. */
export const NEXT_COOKIE = "ac_next";

/** Only same-site paths, never another origin. */
export function safeNext(v: string | null | undefined) {
  const s = (v ?? "").trim();
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}
