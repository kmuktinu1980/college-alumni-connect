import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { NEXT_COOKIE, safeNext } from "@/lib/invite";

// Sign-in links land here. Two formats are supported:
//   ?code=…                     the default Supabase link (must be opened in
//                               the same browser that requested it)
//   ?token_hash=…&type=email    the email-template format recommended in the
//                               README; works in any browser or email app
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const supabase = await createClient();
  const jar = await cookies();
  // Where to go after signing in ("/" routes to the right home).
  const next = safeNext(jar.get(NEXT_COOKIE)?.value);
  const done = () => {
    const res = NextResponse.redirect(new URL(next, url.origin));
    res.cookies.delete(NEXT_COOKIE);
    return res;
  };

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return done();
    console.error("verifyOtp failed:", error.message);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return done();
    console.error("exchangeCodeForSession failed:", error.message);
    // Most common cause: the link was opened in a different browser or an
    // email app's built-in browser than the one that requested it.
    return NextResponse.redirect(new URL("/login?error=browser", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
