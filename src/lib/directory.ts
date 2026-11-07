import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { minNoticeCutoff } from "@/lib/constants";

export type Slot = { id: string; starts_at: string; duration_min: number };

export type Mentor = {
  id: string;
  name: string;
  grad_year: number;
  degree: string;
  department: string;
  job_title: string;
  organization: string;
  city: string;
  linkedin_url: string;
  skills: string[];
  advice_areas: string[];
  bio: string;
  slots: Slot[];
};

type AlumniRow = {
  user_id: string;
  job_title: string;
  organization: string;
  city: string;
  linkedin_url: string;
  skills: string[];
  advice_areas: string[];
  bio: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
};

/** The institution's approved, visible alumni with their open slots, as the signed-in student may see them. */
export async function loadDirectory(supabase: SupabaseClient, institutionId: string): Promise<Mentor[]> {
  const { data: mems, error: mErr } = await supabase
    .from("memberships")
    .select("user_id, grad_year, degree, department")
    .eq("institution_id", institutionId)
    .eq("status", "approved");
  if (mErr) throw mErr;
  const byUser = new Map((mems ?? []).map((m) => [m.user_id as string, m as { grad_year: number; degree: string; department: string }]));
  if (!byUser.size) return [];

  const { data: rows, error } = await supabase
    .from("alumni_profiles")
    .select("user_id, job_title, organization, city, linkedin_url, skills, advice_areas, bio, profiles!inner(full_name)")
    .eq("visible", true)
    .in("user_id", [...byUser.keys()]);
  if (error) throw error;

  const alumni = (rows ?? []) as AlumniRow[];
  if (!alumni.length) return [];

  const soon = minNoticeCutoff().toISOString(); // only slots students can still book
  const { data: slotRows, error: sErr } = await supabase
    .from("slots")
    .select("id, alumni_id, starts_at, duration_min")
    .eq("is_booked", false)
    .gt("starts_at", soon)
    .in(
      "alumni_id",
      alumni.map((a) => a.user_id),
    )
    .order("starts_at");
  if (sErr) throw sErr;

  const byAlumni = new Map<string, Slot[]>();
  for (const s of (slotRows ?? []) as (Slot & { alumni_id: string })[]) {
    const list = byAlumni.get(s.alumni_id) ?? [];
    list.push({ id: s.id, starts_at: s.starts_at, duration_min: s.duration_min });
    byAlumni.set(s.alumni_id, list);
  }

  return alumni
    .map((a) => {
      const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
      const m = byUser.get(a.user_id)!;
      return {
        id: a.user_id,
        name: p?.full_name || "Alumnus",
        grad_year: m.grad_year,
        degree: m.degree,
        department: m.department,
        job_title: a.job_title,
        organization: a.organization,
        city: a.city,
        linkedin_url: a.linkedin_url,
        skills: a.skills ?? [],
        advice_areas: a.advice_areas ?? [],
        bio: a.bio ?? "",
        slots: byAlumni.get(a.user_id) ?? [],
      };
    })
    .sort((x, y) => Number(!x.slots.length) - Number(!y.slots.length) || x.name.localeCompare(y.name));
}
