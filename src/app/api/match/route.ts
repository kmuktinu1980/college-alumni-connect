import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/viewer";
import { loadDirectory } from "@/lib/directory";
import { findMatches } from "@/lib/matching";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATCHES_PER_DAY } from "@/lib/constants";

export const maxDuration = 30;

const body = z.object({
  project: z.string().trim().max(200),
  summary: z.string().trim().max(2000),
  seeking: z.string().trim().max(2000),
});

export async function POST(req: Request) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  if (v.profile.role !== "student" || !v.studentOf)
    return NextResponse.json({ error: "Matching is for signed-in students." }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.project && !parsed.data.seeking))
    return NextResponse.json({ error: "Add your project or what you want advice on." }, { status: 400 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("match_requests")
    .select("id", { count: "exact", head: true })
    .eq("student_id", v.user.id)
    .gt("created_at", since);
  if ((count ?? 0) >= MATCHES_PER_DAY)
    return NextResponse.json({ error: `You've run ${MATCHES_PER_DAY} searches today. Browse the full list below, or try again tomorrow.` }, { status: 429 });

  const { data: sp } = await v.supabase
    .from("student_profiles")
    .select("department, year_of_study")
    .eq("user_id", v.user.id)
    .single();

  const mentors = await loadDirectory(v.supabase, v.studentOf.id);
  const result = await findMatches(
    { ...parsed.data, department: sp?.department, year: sp?.year_of_study, institution: v.studentOf.name },
    mentors,
  );

  await admin.from("match_requests").insert({
    student_id: v.user.id,
    query: parsed.data,
    results: result.matches,
    method: result.method,
  });

  return NextResponse.json(result);
}
