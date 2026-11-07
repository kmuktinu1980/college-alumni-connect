import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { NavLinks } from "@/components/NavLinks";

export async function Header() {
  const v = await getViewer();
  const p = v?.profile;

  const links: { href: string; label: string }[] = [];
  if (p?.role === "student" && v?.studentOf)
    links.push({ href: "/find", label: "Find a mentor" }, { href: "/sessions", label: "My sessions" }, { href: "/profile", label: "My profile" });
  if (p?.role === "alumni") {
    if (v?.mentorReady) links.push({ href: "/availability", label: "My availability" }, { href: "/sessions", label: "Sessions" });
    links.push({ href: "/profile", label: "My profile" });
  }
  for (const o of v?.organizes ?? []) links.push({ href: `/org/${o.slug}`, label: `Organizer · ${o.short_name || o.name}` });
  if (p?.is_admin) links.push({ href: "/admin", label: "Platform admin" });
  const roleLabel =
    p?.role === "student" && v?.studentOf
      ? `Student · ${v.studentOf.short_name || v.studentOf.name}`
      : p?.role === "alumni" ? "Alumni mentor" : null;

  return (
    <header className="border-b border-line bg-surface">
      <div className="page flex flex-wrap items-center justify-between gap-4 pb-1.5 pt-5">
        <Link href="/" className="flex min-w-0 items-center gap-3.5 text-ink no-underline">
          <span aria-hidden className="rounded-lg bg-river px-2 py-2 font-mono text-[0.8rem] font-medium leading-none tracking-wider text-river-ink">
            AC
          </span>
          <span className="grid">
            <span className="font-display text-2xl font-bold leading-tight">Alumni Connect</span>
            <span className="text-[0.88rem] text-muted">Students meet alumni from their own institution who have built what they are building.</span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          {roleLabel && <span className="pill pill-role">{roleLabel}</span>}
          {v ? (
            <form action="/auth/signout" method="post">
              <button className="btn btn-quiet btn-sm" type="submit">Sign out</button>
            </form>
          ) : (
            <Link href="/login" className="btn btn-sm">Sign in</Link>
          )}
        </div>
      </div>
      <svg className="block h-[18px] w-full text-river" viewBox="0 0 1200 18" preserveAspectRatio="none" aria-hidden>
        <path d="M0 11 C 120 3, 240 17, 360 10 S 600 3, 720 10 S 960 17, 1080 9 S 1170 6, 1200 9" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".55" />
        <path d="M0 14 C 150 8, 260 18, 420 13 S 660 7, 800 13 S 1010 18, 1200 12" fill="none" stroke="currentColor" strokeWidth="1" opacity=".3" />
      </svg>
      {links.length > 0 && <NavLinks links={links} />}
    </header>
  );
}
