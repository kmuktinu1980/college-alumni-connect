import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const PROTECTED = ["/find", "/sessions", "/availability", "/profile", "/admin", "/onboarding", "/pending", "/org", "/institutions/apply"];

/** Names (never values) of required settings that are missing or malformed. */
function configProblems(url: string | undefined, key: string | undefined) {
  const problems: string[] = [];
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.trim()) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url.trim()))
    problems.push("NEXT_PUBLIC_SUPABASE_URL should look like https://<project>.supabase.co (no quotes, no trailing path)");
  if (!key) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return problems;
}

function configErrorPage(problems: string[]) {
  const body = `<!doctype html><meta charset="utf-8"><title>Site not configured</title>
<body style="font:15px/1.55 system-ui,sans-serif;max-width:620px;margin:64px auto;padding:0 16px">
<h1 style="font-size:22px">Alumni Connect isn't configured yet</h1>
<ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul>
<p>Fix these in Vercel → Project → Settings → Environment Variables (for Production, Preview and Development), then
<b>redeploy</b>: Deployments → ⋯ → Redeploy. Variables that start with NEXT_PUBLIC_ are read when the site is built, so
adding them doesn't take effect until the next build.</p></body>`;
  return new NextResponse(body, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function middleware(request: NextRequest) {
  const url = supabaseUrl() || undefined;
  const key = supabaseAnonKey() || undefined;
  const problems = configProblems(url, key);
  if (problems.length) {
    console.error("Configuration problem:", problems.join("; "));
    return configErrorPage(problems);
  }

  // Supabase falls back to the Site URL (usually "/") when the requested
  // redirect isn't on its allow-list, so a sign-in code can arrive on any
  // page. Hand it to the callback that finishes sign-in.
  const params = request.nextUrl.searchParams;
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/auth/") && (params.has("code") || params.has("token_hash"))) {
    const to = request.nextUrl.clone();
    to.pathname = "/auth/callback";
    return NextResponse.redirect(to);
  }
  if (!path.startsWith("/auth/") && !path.startsWith("/login") && params.has("error_description")) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "?error=link";
    return NextResponse.redirect(to);
  }

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Refreshes the session cookie; also tells us whether anyone is signed in.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      to.search = "?next=" + encodeURIComponent(path + request.nextUrl.search);
      return NextResponse.redirect(to);
    }
    return response;
  } catch (e) {
    // Never take the whole site down over a session refresh; pages still check
    // sign-in themselves.
    console.error("Middleware error:", e);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
