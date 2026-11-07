import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE } from "@/lib/invite";

// Invite links an institution shares with its alumni groups: /join/<code>.
// A valid code is kept in a cookie and used when the alumnus joins that
// institution, which approves them straight away.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toLowerCase().trim();
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { data } = /^[a-z0-9]{8,32}$/.test(code)
    ? await supabase.rpc("invite_link_info", { p_code: code })
    : { data: [] };
  const inst = (data as { slug: string }[] | null)?.[0];
  if (!inst) return NextResponse.redirect(new URL("/login?as=alumni&invite=expired", origin));

  const { data: { user } } = await supabase.auth.getUser();
  let dest = `/login?as=alumni&invite=ok&inst=${encodeURIComponent(inst.slug)}`;
  if (user) {
    const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    dest = p?.role === "alumni" ? "/profile" : "/onboarding?as=alumni";
  }
  const res = NextResponse.redirect(new URL(dest, origin));
  res.cookies.set(INVITE_COOKIE, code, {
    httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/", maxAge: 30 * 24 * 3600,
  });
  return res;
}
