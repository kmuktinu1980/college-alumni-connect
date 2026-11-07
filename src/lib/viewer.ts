import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "student" | "alumni";
export type Review = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  full_name: string;
  role: Role | null;
  is_admin: boolean;
};

export type InstitutionRef = { id: string; slug: string; name: string; short_name: string };
export type Membership = InstitutionRef & { status: Review; grad_year: number; degree: string; department: string };

export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

/** The signed-in person, with what they can do: student, alumnus, organizer, platform admin. */
export async function getViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: p }, { data: orgRows }, { data: memRows }, { data: stu }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("organizers").select("institutions(id, slug, name, short_name)").eq("user_id", user.id),
    supabase
      .from("memberships")
      .select("status, grad_year, degree, department, institutions(id, slug, name, short_name)")
      .eq("user_id", user.id),
    supabase.from("student_profiles").select("institution_id, institutions(id, slug, name, short_name)").eq("user_id", user.id).maybeSingle(),
  ]);

  const profile: Profile = (p as Profile | null) ?? { id: user.id, full_name: "", role: null, is_admin: false };
  const organizes = ((orgRows ?? []) as unknown as { institutions: InstitutionRef | null }[])
    .map((r) => r.institutions)
    .filter((x): x is InstitutionRef => !!x)
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberships: Membership[] = ((memRows ?? []) as unknown as ({ institutions: InstitutionRef | null } & Omit<Membership, keyof InstitutionRef>)[])
    .filter((m) => m.institutions)
    .map((m) => ({ ...m.institutions!, status: m.status, grad_year: m.grad_year, degree: m.degree, department: m.department }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const studentOf = ((stu as unknown as { institutions: InstitutionRef | null } | null)?.institutions) ?? null;

  return {
    user,
    profile,
    supabase,
    organizes,
    memberships,
    studentOf,
    /** Alumni can mentor once at least one institution has approved them. */
    mentorReady: memberships.some((m) => m.status === "approved"),
  };
}

export function homeFor(v: Viewer) {
  const p = v.profile;
  if (p.role === "student" && v.studentOf) return "/find";
  if (p.role === "alumni") return v.mentorReady ? "/availability" : "/pending";
  if (p.is_admin) return "/admin";
  if (v.organizes.length) return `/org/${v.organizes[0].slug}`;
  return "/onboarding";
}

/** Server-page guard. Redirects anyone who shouldn't be here. */
export async function requireViewer(opts: { role?: Role; admin?: boolean } = {}) {
  const v = await getViewer();
  if (!v) redirect("/login");
  const p = v.profile;
  if (opts.admin) {
    if (!p.is_admin) redirect(homeFor(v));
    return v;
  }
  if (!p.role || (p.role === "student" && !v.studentOf)) redirect("/onboarding");
  if (p.role === "alumni" && !v.mentorReady && opts.role === "alumni") redirect("/pending");
  if (opts.role && p.role !== opts.role) redirect(homeFor(v));
  return v;
}

/** For /org/[slug] pages: the institution, if the viewer may run it. */
export async function requireOrganizer(slug: string) {
  const v = await getViewer();
  if (!v) redirect("/login");
  const { data: inst } = await v.supabase
    .from("institutions")
    .select("id, slug, name, short_name, city, country, website, student_domains, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!inst) return { v, inst: null };
  const allowed = v.profile.is_admin || v.organizes.some((o) => o.id === inst.id);
  if (!allowed) redirect(homeFor(v));
  return { v, inst };
}
